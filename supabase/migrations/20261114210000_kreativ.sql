-- Neuer Türchen-Typ „frei“ (Kreativ-Challenge): Man postet wahlweise ein Foto, eine Zeichnung
-- oder einen Text (der als Bild-Karte gespeichert wird). Funktioniert sonst wie eine Foto-Challenge.
alter table public.doors drop constraint doors_kind_check;
alter table public.doors add constraint doors_kind_check
  check (kind in ('emoji', 'wort', 'aufgabe', 'spiel', 'foto', 'zeichnen', 'frei', 'rueckblick'));

create or replace function public.is_challenge(d int) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.doors where day = d and kind in ('foto', 'zeichnen', 'frei'));
$$;
