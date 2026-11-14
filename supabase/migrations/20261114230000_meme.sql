-- Neuer Türchen-Typ „meme“ („Caption this“): Zu einem Foto schreibt jede*r eine Bildunterschrift.
-- Antwort = Text, ohne Lösung. Das Foto liegt im geschützten Speicher „tuerchen“ als <tag>.jpg
-- und ist erst abrufbar, wenn das Türchen offen ist (Admins jederzeit).
alter table public.doors drop constraint doors_kind_check;
alter table public.doors add constraint doors_kind_check
  check (kind in ('emoji', 'wort', 'aufgabe', 'frage', 'meme', 'spiel', 'raten', 'foto', 'zeichnen', 'frei', 'rueckblick'));

create or replace function public.is_riddle(d int) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.doors where day = d and kind in ('emoji', 'wort', 'aufgabe', 'frage', 'meme', 'spiel'));
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tuerchen', 'tuerchen', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "Türchen-Bild ansehen, wenn offen"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'tuerchen'
    and name ~ '^[0-9]{1,2}\.(jpg|png|webp)$'
    and (public.is_admin() or public.door_is_open(split_part(name, '.', 1)::int))
  );
