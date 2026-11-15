-- Neuer Türchen-Typ „schaetzen“ (Schätzfrage): Man tippt eine Zahl.
-- Am Folgetag kommt die Lösung, und wer am nächsten dran ist, steht oben.
-- In door_solutions steht in „solution“ der Text für die Auflösung und in accepted[1] die richtige Zahl.
-- Beides ist erst am Folgetag lesbar (wie bei allen Rätseln).

alter table public.doors drop constraint doors_kind_check;
alter table public.doors add constraint doors_kind_check
  check (kind in ('emoji', 'wort', 'aufgabe', 'frage', 'meme', 'schaetzen', 'spiel', 'raten', 'foto', 'zeichnen', 'frei', 'rueckblick'));

create or replace function public.is_riddle(d int) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.doors where day = d and kind in ('emoji', 'wort', 'aufgabe', 'frage', 'meme', 'schaetzen', 'spiel'));
$$;
