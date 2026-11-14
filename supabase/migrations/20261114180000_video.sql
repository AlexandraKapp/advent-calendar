-- Tür 24: Video im geschützten Speicher „videos“.
-- Angemeldete sehen es ab dem 24. Dezember, Admins jederzeit.
-- Hochladen geht nur mit dem Supabase-Zugang (CLI/Dashboard), nicht aus der App.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('videos', 'videos', false, 52428800, array['video/mp4'])
on conflict (id) do nothing;

create policy "Video ansehen ab dem 24."
  on storage.objects for select to authenticated
  using (bucket_id = 'videos' and (public.is_admin() or public.door_is_open(24)));
