-- Mitmachen nur am Tag selbst. Frühere Tage: alles ansehen (Lösung, Antworten, Galerie) und reagieren,
-- aber nichts mehr abgeben. (Rätsel-Antworten waren schon so geregelt; hier kommen Beiträge,
-- „Wer ist das?“, Zulosungen und Reaktionen dazu.)

-- Beiträge (Fotos, Zeichnungen, Text-Karten) nur am Tag selbst
drop policy "Beitrag posten" on public.posts;
create policy "Beitrag posten" on public.posts for insert to authenticated
  with check (user_id = auth.uid() and public.is_challenge(day)
    and (public.is_admin() or (public.door_is_open(day) and not public.door_is_revealed(day)))
    and path like day::text || '/' || auth.uid()::text || '/%');

drop policy "Bild hochladen" on storage.objects;
create policy "Bild hochladen" on storage.objects for insert to authenticated
  with check (bucket_id = 'posts' and (storage.foldername(name))[2] = auth.uid()::text
    and (public.is_admin() or (public.door_is_open(((storage.foldername(name))[1])::int)
                               and not public.door_is_revealed(((storage.foldername(name))[1])::int))));

-- Galerie und Zulosung früherer Tage dürfen alle sehen
drop policy "Galerie nach eigenem Beitrag" on public.posts;
create policy "Galerie nach eigenem Beitrag" on public.posts for select to authenticated
  using (user_id = auth.uid() or public.is_admin() or public.has_posted(day)
         or public.door_is_revealed(day) or public.door_is_open(24));

drop policy "Zuteilung ansehen" on public.door_assignments;
create policy "Zuteilung ansehen" on public.door_assignments for select to authenticated
  using (user_id = auth.uid() or public.is_admin() or public.has_posted(day) or public.has_answered(day)
         or public.door_is_revealed(day) or public.door_is_open(24));

-- Reagieren auf Beiträge früherer Tage auch ohne eigenen Beitrag
create or replace function public.react(d int, a uuid, p uuid, e text) returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  author uuid;
begin
  if me is null or not exists (select 1 from profiles where id = me) then raise exception 'Nicht angemeldet'; end if;
  if e not in ('lol', 'herz') or not reaction_kind_ok(d) then raise exception 'Hier gibt es keine Reaktionen'; end if;
  if p is not null then
    select user_id into author from posts where id = p and day = d;
    if author is null then raise exception 'Beitrag nicht gefunden'; end if;
    if not (is_admin() or has_posted(d) or door_is_revealed(d) or door_is_open(24)) then raise exception 'Erst selbst mitmachen'; end if;
  else
    select user_id into author from answers where day = d and user_id = a;
    if author is null then raise exception 'Antwort nicht gefunden'; end if;
    if not (is_admin() or has_answered(d) or door_is_revealed(d)) then raise exception 'Erst selbst mitmachen'; end if;
  end if;
  if author = me then raise exception 'Auf die eigene Antwort kann man nicht reagieren'; end if;

  delete from reactions r where r.day = d and r.author_id = author and r.post_id is not distinct from p
    and r.user_id = me and r.emoji = e;
  if found then return false; end if;
  insert into reactions (day, author_id, post_id, user_id, emoji) values (d, author, p, me, e);
  return true;
end $$;

-- „Wer ist das?“: an früheren Tagen nicht mehr spielen
create or replace function public.raten_start(d int, n int)
returns table (stufe int, bild text, fertig boolean)
language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  b raten_bilder;
  r raten_runden;
  s int;
begin
  if not raten_darf(d) then return; end if;
  if not is_admin() and door_is_revealed(d) then return; end if;   -- vorbei: nur noch ansehen
  select * into b from raten_bilder where day = d and nr = n;
  if not found then return; end if;
  insert into raten_runden (day, user_id, nr) values (d, me, n) on conflict do nothing;
  select * into r from raten_runden where day = d and user_id = me and nr = n;
  s := case when r.tipp is not null then 5 else raten_stufe(r.started_at) end;
  return query select s, b.stages[s], r.tipp is not null;
end;
$$;

create or replace function public.raten_tipp(d int, n int, t text)
returns table (correct boolean, points int, solution text, bild text, gesamt int)
language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  b raten_bilder;
  r raten_runden;
  ok boolean;
  pts int;
  total int;
begin
  if not raten_darf(d) then return; end if;
  if not is_admin() and door_is_revealed(d) then return; end if;
  select * into b from raten_bilder where day = d and nr = n;
  select * into r from raten_runden where day = d and user_id = me and nr = n for update;
  if b.day is null or r.day is null then return; end if;
  if r.tipp is null then
    ok := public.answer_matches(t, b.accepted || b.solution);
    pts := case when ok then 5 - raten_stufe(r.started_at) else 0 end;
    update raten_runden set tipp = left(t, 60), correct = ok, points = pts
      where day = d and user_id = me and nr = n;
    -- Gesamtpunkte als „Antwort“ speichern (für die Bestenliste), solange das Türchen nicht vorbei ist
    select coalesce(sum(x.points), 0) into total from raten_runden x where x.day = d and x.user_id = me;
    if is_admin() or not door_is_revealed(d) then
      insert into answers (day, user_id, answer) values (d, me, total::text)
      on conflict (day, user_id) do update set answer = excluded.answer, updated_at = now();
    end if;
  end if;
  select * into r from raten_runden where day = d and user_id = me and nr = n;
  select coalesce(sum(x.points), 0) into total from raten_runden x where x.day = d and x.user_id = me;
  return query select r.correct, r.points, b.solution, b.stages[5], total;
end;
$$;

-- „Wer ist das?“ früherer Tage: alle Fotos scharf mit Namen
create function public.raten_aufloesung(d int)
returns table (nr int, solution text, bild text)
language sql stable security definer set search_path = public as $$
  select b.nr, b.solution, b.stages[5] from raten_bilder b
  where b.day = d and auth.uid() is not null and (is_admin() or door_is_revealed(d))
  order by b.nr;
$$;
revoke execute on function public.raten_aufloesung(int) from anon, public;
grant execute on function public.raten_aufloesung(int) to authenticated;
