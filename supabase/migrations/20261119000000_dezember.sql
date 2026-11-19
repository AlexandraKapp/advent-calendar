-- Testmodus vorbei: Der Kalender läuft wieder im Dezember. Türchen n öffnet am n. Dezember (Berliner Zeit).
create or replace function public.door_open_at(d int) returns timestamptz
language sql stable as $$
  select make_timestamptz(2026, 12, d, 0, 0, 0, 'Europe/Berlin');
$$;
