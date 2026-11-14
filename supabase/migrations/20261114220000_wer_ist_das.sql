-- Neuer Türchen-Typ „raten“ („Wer ist das?“): Fotos werden nach und nach schärfer.
-- Man tippt den Namen ein. Je früher richtig, desto mehr Punkte (4 bis 0; scharf = 0). Nur ein Versuch pro Foto.
-- Gegen Spicken: Die Bilder (in 5 Schärfestufen) und die Lösungen liegen in Tabellen ohne
-- Lese-Rechte. Nur die Funktionen unten geben heraus, was gerade dran ist; die Zeit misst der Server.

alter table public.doors drop constraint doors_kind_check;
alter table public.doors add constraint doors_kind_check
  check (kind in ('emoji', 'wort', 'aufgabe', 'frage', 'spiel', 'raten', 'foto', 'zeichnen', 'frei', 'rueckblick'));

-- Außerdem neu: „frage“ (freie Frage): Antwort als Text, ohne Lösung und ohne richtig/falsch
-- Längere Antworten erlauben (z. B. ein Haiku): bis 300 Zeichen
alter table public.answers drop constraint answers_answer_check;
alter table public.answers add constraint answers_answer_check
  check (char_length(btrim(answer)) between 1 and 300);
create or replace function public.is_riddle(d int) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.doors where day = d and kind in ('emoji', 'wort', 'aufgabe', 'frage', 'spiel'));
$$;

-- Bilder mit Lösung. stages = 5 Bilder als data-URL, von ganz unscharf bis scharf.
create table public.raten_bilder (
  day      int  not null references public.doors(day) on delete cascade,
  nr       int  not null check (nr between 1 and 20),
  solution text not null,
  accepted text[] not null default '{}',
  stages   text[] not null check (cardinality(stages) = 5),
  primary key (day, nr)
);
alter table public.raten_bilder enable row level security;   -- keine Regeln = niemand liest direkt
grant all on public.raten_bilder to service_role;

-- Spielstand pro Person und Bild
create table public.raten_runden (
  day        int  not null references public.doors(day) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  nr         int  not null,
  started_at timestamptz not null default now(),
  tipp       text,
  correct    boolean,
  points     int,
  primary key (day, user_id, nr)
);
alter table public.raten_runden enable row level security;
create policy "Eigene Runden" on public.raten_runden for select to authenticated using (user_id = auth.uid());
grant select on public.raten_runden to authenticated;
grant all on public.raten_runden to service_role;

-- Schärfestufe 1..5 nach Sekunden seit Start (alle 4 Sekunden schärfer)
create function public.raten_stufe(started timestamptz) returns int
language sql stable as $$
  select least(5, 1 + floor(extract(epoch from (now() - started)) / 4)::int);
$$;

create function public.raten_darf(d int) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null
     and exists (select 1 from profiles where id = auth.uid())
     and exists (select 1 from doors where day = d and kind = 'raten')
     and (is_admin() or door_is_open(d));
$$;

-- Überblick: wie viele Bilder, und was habe ich schon geraten?
create function public.raten_status(d int)
returns table (anzahl int, nr int, fertig boolean, points int)
language sql stable security definer set search_path = public as $$
  select (select count(*)::int from raten_bilder b where b.day = d), r.nr, r.tipp is not null, r.points
  from (select 1) x
  left join raten_runden r on r.day = d and r.user_id = auth.uid()
  where raten_darf(d);
$$;

-- Bild n starten (oder weitermachen): gibt die aktuelle Stufe zurück
create function public.raten_start(d int, n int)
returns table (stufe int, bild text, fertig boolean)
language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  b raten_bilder;
  r raten_runden;
  s int;
begin
  if not raten_darf(d) then return; end if;
  select * into b from raten_bilder where day = d and nr = n;
  if not found then return; end if;
  insert into raten_runden (day, user_id, nr) values (d, me, n) on conflict do nothing;
  select * into r from raten_runden where day = d and user_id = me and nr = n;
  s := case when r.tipp is not null then 5 else raten_stufe(r.started_at) end;
  return query select s, b.stages[s], r.tipp is not null;
end;
$$;

-- Aktuelles Bild abholen (die App fragt jede Sekunde nach; Bild nur, wenn sich die Stufe geändert hat)
create function public.raten_bild(d int, n int, habe int)
returns table (stufe int, bild text)
language sql stable security definer set search_path = public as $$
  select s, case when s <> habe then b.stages[s] end
  from raten_runden r
  join raten_bilder b on b.day = r.day and b.nr = r.nr
  cross join lateral (select case when r.tipp is not null then 5 else raten_stufe(r.started_at) end as s) z
  where r.day = d and r.nr = n and r.user_id = auth.uid() and raten_darf(d);
$$;

-- Tipp abgeben: einmal pro Bild. Punkte = 5 - Stufe (4 bei ganz unscharf, 0 wenn das Foto scharf ist).
create function public.raten_tipp(d int, n int, t text)
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

-- Nur Admins: eigenen Spielstand zurücksetzen (zum Testen)
create function public.raten_reset(d int) returns void
language sql volatile security definer set search_path = public as $$
  delete from raten_runden where day = d and user_id = auth.uid() and is_admin();
  delete from answers where day = d and user_id = auth.uid() and is_admin();
$$;

revoke execute on function public.raten_status(int), public.raten_start(int, int), public.raten_bild(int, int, int),
  public.raten_tipp(int, int, text), public.raten_reset(int), public.raten_darf(int) from anon, public;
grant execute on function public.raten_status(int), public.raten_start(int, int), public.raten_bild(int, int, int),
  public.raten_tipp(int, int, text), public.raten_reset(int), public.raten_darf(int) to authenticated;

-- Punktestand bei „Wer ist das?“ darf nur raten_tipp schreiben, nicht die App direkt
create function public.answers_raten_guard() returns trigger
language plpgsql as $$
begin
  if current_user = 'authenticated'
     and exists (select 1 from public.doors where day = coalesce(new.day, old.day) and kind = 'raten') then
    raise exception 'Punkte bei „Wer ist das?“ werden automatisch gezählt';
  end if;
  return coalesce(new, old);
end $$;
create trigger answers_raten_guard before insert or update on public.answers
  for each row execute function public.answers_raten_guard();
