-- Überraschung: Den Typ eines Türchens (Rätsel, Foto, Zeichnen, Video …) erfährt man erst,
-- wenn es offen ist. Admins sehen ihn immer.
create or replace function public.door_overview()
returns table (day int, kind text, is_open boolean, is_revealed boolean, done boolean, count int)
language sql stable security definer set search_path = public as $$
  select d.day,
    case when public.is_admin() or public.door_is_open(d.day) then d.kind end,
    public.door_is_open(d.day), public.door_is_revealed(d.day),
    exists (select 1 from public.answers a where a.day = d.day and a.user_id = auth.uid())
      or exists (select 1 from public.posts p where p.day = d.day and p.user_id = auth.uid()),
    (select count(*)::int from public.answers a where a.day = d.day)
      + (select count(*)::int from public.posts p where p.day = d.day)
  from public.doors d
  where auth.uid() is not null
  order by d.day;
$$;
