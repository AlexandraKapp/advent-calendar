-- Admin: „Alles zurücksetzen“ nach dem Testen.
-- Löscht Antworten, Beiträge, Zulosungen und Spielstände. Türchen, Lösungen, Fotos und Leute bleiben.
-- reset_at merkt sich den Zeitpunkt; die App vergisst damit auch, welche Flaschen schon geknallt haben.

create table public.app_settings (
  id       int primary key default 1 check (id = 1),
  reset_at timestamptz not null default now()
);
insert into public.app_settings (id) values (1);
alter table public.app_settings enable row level security;
create policy "Einstellungen lesen" on public.app_settings for select to authenticated using (true);
grant select on public.app_settings to authenticated;
grant all on public.app_settings to service_role;

create function public.admin_reset() returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Nur für Admins'; end if;
  delete from raten_runden where true;
  delete from door_assignments where true;
  delete from posts where true;
  delete from answers where true;
  update app_settings set reset_at = now() where id = 1;
end $$;
revoke execute on function public.admin_reset() from anon, public;
grant execute on function public.admin_reset() to authenticated;

-- Damit der Reset auch Dateien ohne Beitrag (Reste von Tests) findet und löscht
create policy "Admin sieht alle Bilder"
  on storage.objects for select to authenticated
  using (bucket_id = 'posts' and public.is_admin());
