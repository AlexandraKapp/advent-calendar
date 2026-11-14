-- Persönliche Aufgaben: Steht in der Aufgabe {person}, bekommt jede Person beim Öffnen
-- jemand anderen aus der Gruppe zugelost (wie beim Wichteln, nie sich selbst).
-- Die Zuteilung bleibt danach fest.

create table public.door_assignments (
  day        int  not null references public.doors(day) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  target_id  uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (day, user_id),
  check (user_id <> target_id)
);
alter table public.door_assignments enable row level security;

-- Sehen: die eigene Zuteilung; fremde erst, wenn man selbst gepostet hat (wie die Galerie)
create policy "Zuteilung ansehen" on public.door_assignments
  for select to authenticated using (
    user_id = auth.uid() or public.is_admin() or public.has_posted(day) or public.has_answered(day)
    or public.door_is_open(24)
  );
-- Schreiben nur über die Funktion my_person (keine Insert/Update/Delete-Regeln)

grant select on public.door_assignments to authenticated;
grant all on public.door_assignments to service_role;

create function public.my_person(d int)
returns table (target_id uuid, name text)
language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  pick uuid;
begin
  if me is null or not exists (select 1 from profiles where id = me) then return; end if;
  if not (is_admin() or door_is_open(d)) then return; end if;
  if not exists (select 1 from doors where day = d and question like '%{person}%') then return; end if;

  if not exists (select 1 from door_assignments a where a.day = d and a.user_id = me) then
    -- Wer heute am seltensten gezogen wurde, kommt zuerst dran; sonst Zufall
    select p.id into pick
    from profiles p
    where p.id <> me
    order by (select count(*) from door_assignments a where a.day = d and a.target_id = p.id), random()
    limit 1;
    if pick is null then return; end if; -- noch niemand anderes angemeldet
    insert into door_assignments (day, user_id, target_id) values (d, me, pick)
    on conflict (day, user_id) do nothing;
  end if;

  return query
    select a.target_id, p.name
    from door_assignments a join profiles p on p.id = a.target_id
    where a.day = d and a.user_id = me;
end;
$$;

revoke execute on function public.my_person(int) from anon, public;
grant execute on function public.my_person(int) to authenticated;

-- Neue Türchen-Typen, die wie Rätsel eine Antwort speichern, aber ohne Lösung:
--   „aufgabe“ (Emoji-Challenge): Antwort sind 3 Emojis
--   „spiel“   (Mini-Spiel): Antwort ist der beste Punktestand
alter table public.doors drop constraint doors_kind_check;
alter table public.doors add constraint doors_kind_check
  check (kind in ('emoji', 'wort', 'aufgabe', 'spiel', 'foto', 'zeichnen', 'rueckblick'));

create or replace function public.is_riddle(d int) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.doors where day = d and kind in ('emoji', 'wort', 'aufgabe', 'spiel'));
$$;
