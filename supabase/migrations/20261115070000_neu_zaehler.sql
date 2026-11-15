-- „Neu“-Zahl an den Flaschen (wie ungelesene Nachrichten):
-- Für jede Person und jedes Türchen merkt sich die Datenbank, wann es zuletzt angeschaut wurde.
-- Gezählt wird, was seitdem dazukam: Antworten und Beiträge der anderen sowie Reaktionen
-- auf die eigenen Sachen. Nur bei Türchen, bei denen man selbst mitgemacht hat (vorher sieht man ja nichts).

create table public.door_seen (
  user_id uuid not null references public.profiles(id) on delete cascade,
  day     int  not null references public.doors(day) on delete cascade,
  seen_at timestamptz not null default now(),
  primary key (user_id, day)
);
alter table public.door_seen enable row level security;   -- nur über die Funktionen unten
grant all on public.door_seen to service_role;

create function public.mark_seen(d int) returns void
language sql volatile security definer set search_path = public as $$
  insert into door_seen (user_id, day, seen_at)
  select auth.uid(), d, now()
  where exists (select 1 from profiles where id = auth.uid()) and exists (select 1 from doors where day = d)
  on conflict (user_id, day) do update set seen_at = excluded.seen_at;
$$;

create function public.unseen_counts()
returns table (day int, neu int)
language sql stable security definer set search_path = public as $$
  with me as (select auth.uid() as id),
  dabei as (   -- Türchen, bei denen ich mitgemacht habe, und seit wann ich nichts mehr angeschaut habe
    select x.day, coalesce(s.seen_at, x.seit) as seit
    from (
      select a.day, min(a.created_at) as seit from answers a, me where a.user_id = me.id group by a.day
      union all
      select p.day, min(p.created_at) from posts p, me where p.user_id = me.id group by p.day
    ) x
    left join door_seen s on s.day = x.day and s.user_id = (select id from me)
  ),
  dabei1 as (select day, max(seit) as seit from dabei group by day),
  neu as (
    select a.day from answers a join dabei1 d on d.day = a.day, me
      where a.user_id <> me.id and a.created_at > d.seit
    union all
    select p.day from posts p join dabei1 d on d.day = p.day, me
      where p.user_id <> me.id and p.created_at > d.seit
    union all
    select r.day from reactions r join dabei1 d on d.day = r.day, me
      where r.author_id = me.id and r.created_at > d.seit
  )
  select day, count(*)::int from neu where (select id from me) is not null group by day;
$$;

revoke execute on function public.mark_seen(int), public.unseen_counts() from anon, public;
grant execute on function public.mark_seen(int), public.unseen_counts() to authenticated;

-- Reset im Admin-Bereich löscht jetzt auch, was angeschaut wurde
create or replace function public.admin_reset() returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Nur für Admins'; end if;
  delete from raten_runden where true;
  delete from door_assignments where true;
  delete from door_seen where true;
  delete from posts where true;
  delete from answers where true;
  update app_settings set reset_at = now() where id = 1;
end $$;
