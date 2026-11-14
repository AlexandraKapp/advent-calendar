-- {person}-Aufgaben: Zulosung als fester Ring wie beim Wichteln.
-- Sobald das Türchen offen ist und die erste Person es öffnet, wird für alle Angemeldeten
-- auf einmal gelost: A → B → C → … → A. So kommt jede Person genau einmal vor und niemand hat sich selbst.
-- Wer sich erst danach anmeldet, bekommt die Person, die am seltensten dran ist.
-- In der Admin-Vorschau (Türchen noch zu) wird nur zum Anschauen gelost und nichts gespeichert,
-- damit der Ring erst am echten Tag mit allen Leuten entsteht.

create or replace function public.my_person(d int)
returns table (target_id uuid, name text)
language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  pick uuid;
begin
  if me is null or not exists (select 1 from profiles where id = me) then return; end if;
  if not (is_admin() or door_is_open(d)) then return; end if;
  if not exists (select 1 from doors where day = d and question like '%{person}%') then return; end if;

  -- Vorschau vor dem Tag: nur zufällig anzeigen, nichts festlegen
  if not door_is_open(d) then
    return query select p.id, p.name from profiles p where p.id <> me order by random() limit 1;
    return;
  end if;

  if not exists (select 1 from door_assignments a where a.day = d and a.user_id = me) then
    -- Nur einer auf einmal: verhindert, dass zwei gleichzeitig verschieden losen
    perform pg_advisory_xact_lock(hashtext('my_person'), d);

    if not exists (select 1 from door_assignments a where a.day = d) then
      -- Ring für alle auf einmal (braucht mindestens 2 Leute)
      insert into door_assignments (day, user_id, target_id)
      select d, r.id, coalesce(lead(r.id) over (order by r.k), first_value(r.id) over (order by r.k))
      from (select p.id, random() as k from profiles p) r
      where (select count(*) from profiles) >= 2;
    end if;

    if not exists (select 1 from door_assignments a where a.day = d and a.user_id = me) then
      -- Später angemeldet: wer am seltensten gezogen wurde, sonst Zufall
      select p.id into pick
      from profiles p
      where p.id <> me
      order by (select count(*) from door_assignments a where a.day = d and a.target_id = p.id), random()
      limit 1;
      if pick is null then return; end if;
      insert into door_assignments (day, user_id, target_id) values (d, me, pick)
      on conflict (day, user_id) do nothing;
    end if;
  end if;

  return query
    select a.target_id, p.name
    from door_assignments a join profiles p on p.id = a.target_id
    where a.day = d and a.user_id = me;
end;
$$;
