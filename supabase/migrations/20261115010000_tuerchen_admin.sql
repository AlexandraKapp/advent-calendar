-- Admins dürfen die Fotos der „Caption this“-Türchen im Admin-Bereich austauschen
create policy "Türchen-Bild hochladen (Admin)"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'tuerchen' and name ~ '^[0-9]{1,2}\.jpg$' and public.is_admin());
create policy "Türchen-Bild ersetzen (Admin)"
  on storage.objects for update to authenticated
  using (bucket_id = 'tuerchen' and public.is_admin())
  with check (bucket_id = 'tuerchen' and name ~ '^[0-9]{1,2}\.jpg$' and public.is_admin());
