-- NUR ZUM TESTEN: Der Kalender tut so, als wäre November statt Dezember.
-- Türchen n öffnet am n. November. Vor dem 1. Dezember zurückstellen (Monat wieder 12)!
create or replace function public.door_open_at(d int) returns timestamptz
language sql stable as $$
  select make_timestamptz(2026, 11, d, 0, 0, 0, 'Europe/Berlin');
$$;
