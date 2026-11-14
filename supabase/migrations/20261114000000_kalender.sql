-- =====================================================================
-- Brunchies-Adventskalender: Datenbank, Sicherheitsregeln, Bilder-Speicher
--
-- Hier stehen KEINE Rätsel und KEINE Lösungen. Die trägst du im
-- Admin-Bereich der App ein (oder per private/tuerchen.sql).
--
-- Grundidee: Die Datenbank selbst entscheidet (nach Berliner Zeit),
-- wer was sehen darf. Selbst wer im Browser herumtrickst, bekommt
-- verschlossene Türchen und Lösungen nicht zu sehen.
-- =====================================================================

-- ---------- Wer ist Admin? -------------------------------------------
create table public.admins (
  user_id uuid primary key references auth.users on delete cascade
);
alter table public.admins enable row level security;
-- (keine Regeln = niemand kann die Tabelle über die App lesen oder ändern)

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- ---------- Kalender-Zeiten (Europe/Berlin) ---------------------------
-- Das Jahr steht genau hier. Für einen Kalender 2027 nur diese Zahl ändern.
create function public.door_open_at(d int) returns timestamptz
language sql stable as $$
  select make_timestamptz(2026, 12, d, 0, 0, 0, 'Europe/Berlin');
$$;

-- Türchen offen ab 0:00 an seinem Tag
create function public.door_is_open(d int) returns boolean
language sql stable as $$ select now() >= public.door_open_at(d); $$;

-- Lösung sichtbar ab 0:00 am Folgetag
create function public.door_is_revealed(d int) returns boolean
language sql stable as $$ select now() >= public.door_open_at(d + 1); $$;

-- ---------- Profile (Anzeigenamen) ------------------------------------
create table public.profiles (
  id uuid primary key default auth.uid() references auth.users on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 30),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create policy "Namen sehen alle Angemeldeten" on public.profiles
  for select to authenticated using (true);
create policy "Eigenes Profil anlegen" on public.profiles
  for insert to authenticated with check (id = auth.uid());
create policy "Eigenen Namen ändern" on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());
create policy "Admin löscht Profile" on public.profiles
  for delete to authenticated using (public.is_admin());

-- ---------- Türchen (ohne Lösungen) -----------------------------------
create table public.doors (
  day      int primary key check (day between 1 and 24),
  kind     text not null check (kind in ('emoji', 'wort', 'foto', 'zeichnen', 'rueckblick')),
  category text not null default '',  -- z. B. "Film", "Serie", "Worträtsel"
  emoji    text not null default '',
  question text not null default '',  -- Worträtsel-Frage bzw. Challenge-Aufgabe
  short    text not null default '',  -- Kurztitel für das Rückblick-Video
  seconds  int check (seconds between 3 and 600) -- nur Zeichen-Challenge
);
alter table public.doors enable row level security;

create policy "Offene Türchen sehen" on public.doors
  for select to authenticated using (public.is_admin() or public.door_is_open(day));
create policy "Admin legt Türchen an" on public.doors
  for insert to authenticated with check (public.is_admin());
create policy "Admin ändert Türchen" on public.doors
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Admin löscht Türchen" on public.doors
  for delete to authenticated using (public.is_admin());

-- ---------- Lösungen (getrennt, erst am Folgetag sichtbar) -------------
create table public.door_solutions (
  day      int primary key references public.doors on delete cascade,
  solution text   not null default '',   -- wird angezeigt, z. B. "Ein Regenschirm"
  accepted text[] not null default '{}'  -- gilt als richtig, z. B. {regenschirm, schirm}
);
alter table public.door_solutions enable row level security;

create policy "Lösung erst am Folgetag" on public.door_solutions
  for select to authenticated using (public.is_admin() or public.door_is_revealed(day));
create policy "Admin legt Lösungen an" on public.door_solutions
  for insert to authenticated with check (public.is_admin());
create policy "Admin ändert Lösungen" on public.door_solutions
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Admin löscht Lösungen" on public.door_solutions
  for delete to authenticated using (public.is_admin());

-- ---------- Antworten auf Rätsel --------------------------------------
create table public.answers (
  day        int  not null references public.doors on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles on delete cascade,
  answer     text not null check (char_length(btrim(answer)) between 1 and 120),
  override   boolean,  -- nur Admin: von Hand richtig (true) / falsch (false)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (day, user_id)
);
alter table public.answers enable row level security;

create function public.has_answered(d int) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.answers where day = d and user_id = auth.uid());
$$;

create function public.is_riddle(d int) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.doors where day = d and kind in ('emoji', 'wort'));
$$;

create policy "Antworten sehen nach eigener Antwort" on public.answers
  for select to authenticated using (
    user_id = auth.uid() or public.is_admin()
    or public.has_answered(day) or public.door_is_revealed(day)
  );
create policy "Antworten bis Mitternacht abgeben" on public.answers
  for insert to authenticated with check (
    user_id = auth.uid() and public.is_riddle(day)
    and (public.is_admin() or (public.door_is_open(day) and not public.door_is_revealed(day)))
  );
create policy "Antwort bis Mitternacht ändern" on public.answers
  for update to authenticated
  using (public.is_admin() or (user_id = auth.uid() and public.door_is_open(day) and not public.door_is_revealed(day)))
  with check (public.is_admin() or (user_id = auth.uid() and public.door_is_open(day) and not public.door_is_revealed(day)));
create policy "Antwort löschen" on public.answers
  for delete to authenticated using (
    public.is_admin() or (user_id = auth.uid() and not public.door_is_revealed(day))
  );

-- Schutz: Nur der Admin darf "override" setzen; Tag/Person bleiben fest.
create function public.answers_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if not public.is_admin() then new.override := null; end if;
    new.created_at := now(); new.updated_at := now();
  else
    new.day := old.day; new.user_id := old.user_id; new.created_at := old.created_at;
    if not public.is_admin() then new.override := old.override; end if;
    if new.answer is distinct from old.answer then new.updated_at := now(); end if;
  end if;
  return new;
end $$;
create trigger answers_guard before insert or update on public.answers
  for each row execute function public.answers_guard();

-- ---------- Richtig oder falsch? --------------------------------------
-- Groß/klein, Leerzeichen, Satzzeichen egal; ä=ae, ö=oe, ü=ue, ß=ss.
create function public.norm_answer(t text) returns text
language sql immutable as $$
  select regexp_replace(
    lower(replace(replace(replace(replace(replace(replace(replace(coalesce(t, ''),
      'Ä', 'ae'), 'Ö', 'oe'), 'Ü', 'ue'), 'ä', 'ae'), 'ö', 'oe'), 'ü', 'ue'), 'ß', 'ss')),
    '[^a-z0-9]', '', 'g');
$$;

-- Kurze Begriffe (< 4 Zeichen) müssen genau passen, längere dürfen
-- irgendwo in der Antwort vorkommen ("ein regenschirm" passt zu "schirm").
create function public.answer_matches(ans text, acc text[]) returns boolean
language sql immutable as $$
  select coalesce(bool_or(
    case when length(public.norm_answer(k)) < 4
      then public.norm_answer(ans) = public.norm_answer(k)
      else position(public.norm_answer(k) in public.norm_answer(ans)) > 0
    end), false)
  from unnest(acc) as k
  where public.norm_answer(k) <> '' and public.norm_answer(ans) <> '';
$$;

-- Alle sichtbaren Antworten eines Türchens. Läuft mit den Rechten der
-- angemeldeten Person: "correct" ist leer, solange die Lösung geheim ist.
create function public.get_answers(d int)
returns table (user_id uuid, name text, answer text, is_me boolean, correct boolean, override boolean, updated_at timestamptz)
language sql stable security invoker set search_path = public as $$
  select a.user_id, p.name, a.answer, a.user_id = auth.uid(),
         case when s.day is null then null
              else coalesce(a.override, public.answer_matches(a.answer,
                     case when cardinality(s.accepted) > 0 then s.accepted else array[s.solution] end))
         end,
         a.override, a.updated_at
  from public.answers a
  join public.profiles p on p.id = a.user_id
  left join public.door_solutions s on s.day = a.day
  where a.day = d
  order by a.created_at;
$$;

-- ---------- Challenge-Beiträge (Fotos & Zeichnungen) -----------------
create table public.posts (
  id         uuid primary key default gen_random_uuid(),
  day        int  not null references public.doors on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles on delete cascade,
  path       text not null unique,  -- Dateipfad im Speicher "posts"
  created_at timestamptz not null default now(),
  unique (day, user_id)
);
alter table public.posts enable row level security;

create function public.has_posted(d int) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.posts where day = d and user_id = auth.uid());
$$;

create function public.is_challenge(d int) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.doors where day = d and kind in ('foto', 'zeichnen'));
$$;

create policy "Galerie nach eigenem Beitrag" on public.posts
  for select to authenticated using (
    user_id = auth.uid() or public.is_admin()
    or public.has_posted(day)
    or public.door_is_open(24)   -- am 24. sehen alle alles (Rückblick)
  );
create policy "Beitrag posten" on public.posts
  for insert to authenticated with check (
    user_id = auth.uid() and public.is_challenge(day)
    and (public.is_admin() or public.door_is_open(day))
    and path like day::text || '/' || auth.uid()::text || '/%'
  );
create policy "Beitrag löschen" on public.posts
  for delete to authenticated using (user_id = auth.uid() or public.is_admin());

-- ---------- Übersicht fürs Kalender-Raster ----------------------------
-- Verrät nur: Typ (für das kleine Symbol), offen?, aufgelöst?, erledigt?,
-- wie viele schon mitgemacht haben. Keine Inhalte, keine Lösungen.
create function public.door_overview()
returns table (day int, kind text, is_open boolean, is_revealed boolean, done boolean, count int)
language sql stable security definer set search_path = public as $$
  select d.day, d.kind, public.door_is_open(d.day), public.door_is_revealed(d.day),
    exists (select 1 from public.answers a where a.day = d.day and a.user_id = auth.uid())
      or exists (select 1 from public.posts p where p.day = d.day and p.user_id = auth.uid()),
    (select count(*)::int from public.answers a where a.day = d.day)
      + (select count(*)::int from public.posts p where p.day = d.day)
  from public.doors d
  where auth.uid() is not null
  order by d.day;
$$;

revoke execute on function public.door_overview() from anon;
revoke execute on function public.get_answers(int) from anon;

-- ---------- Bilder-Speicher -------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('posts', 'posts', false, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Pfad-Schema: <tag>/<user-id>/<zufall>.jpg
create policy "Bild hochladen" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'posts'
    and (storage.foldername(name))[2] = auth.uid()::text
    and (public.is_admin() or public.door_is_open(((storage.foldername(name))[1])::int))
  );
create policy "Bild ansehen wie die Galerie" on storage.objects
  for select to authenticated using (
    bucket_id = 'posts'
    and (owner_id = auth.uid()::text
         or exists (select 1 from public.posts p where p.path = storage.objects.name))
  );
create policy "Bild löschen" on storage.objects
  for delete to authenticated using (
    bucket_id = 'posts' and (owner_id = auth.uid()::text or public.is_admin())
  );

-- ---------- Zugriffsrechte -------------------------------------------
-- Neue Supabase-Projekte geben neue Tabellen nicht mehr automatisch frei.
-- Grundsätzlich dürfen Angemeldete zugreifen; WAS sie sehen und ändern
-- dürfen, bestimmen die Regeln (policies) oben. "anon" (nicht angemeldet)
-- bekommt gar nichts. Die Tabelle "admins" bleibt komplett gesperrt.
revoke all on public.profiles, public.doors, public.door_solutions, public.answers, public.posts, public.admins from anon;
grant select, insert, update, delete on public.profiles, public.doors, public.door_solutions, public.answers, public.posts to authenticated;
revoke all on public.admins from authenticated;
grant usage on schema public to authenticated;
grant execute on all functions in schema public to authenticated;
grant all on public.profiles, public.doors, public.door_solutions, public.answers, public.posts, public.admins to service_role;
