-- Lösung sofort: Wer geantwortet hat, sieht direkt die Lösung (und die Antworten der anderen).
-- Dafür gilt: ein Versuch. Antworten lassen sich danach nicht mehr ändern oder löschen
-- (außer beim Mini-Spiel, dort zählt der Bestwert und man darf bis Mitternacht weiterspielen).

drop policy "Lösung erst am Folgetag" on public.door_solutions;
create policy "Lösung nach eigener Antwort" on public.door_solutions
  for select to authenticated
  using (public.is_admin() or public.door_is_revealed(day) or public.has_answered(day));

create function public.is_spiel(d int) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.doors where day = d and kind = 'spiel');
$$;

drop policy "Antwort bis Mitternacht ändern" on public.answers;
create policy "Nur das Mini-Spiel darf den Bestwert ändern" on public.answers
  for update to authenticated
  using (public.is_admin() or (user_id = auth.uid() and public.is_spiel(day) and public.door_is_open(day) and not public.door_is_revealed(day)))
  with check (public.is_admin() or (user_id = auth.uid() and public.is_spiel(day) and public.door_is_open(day) and not public.door_is_revealed(day)));

drop policy "Antwort löschen" on public.answers;
create policy "Antwort löschen nur Admin" on public.answers
  for delete to authenticated using (public.is_admin());

-- Gesamtwertung: Rätsel und Platzierungen zählen jetzt sofort
create or replace function public.scoreboard()
returns table (user_id uuid, name text, punkte int, raetsel int, spiele int, mitmachen int, reaktionen int, is_me boolean)
language sql stable security definer set search_path = public as $$
  with
  richtig as (
    select a.user_id, 2 * count(*) as p
    from answers a join doors d on d.day = a.day join door_solutions s on s.day = a.day
    where d.kind in ('emoji', 'wort')
      and coalesce(a.override, answer_matches(a.answer, case when cardinality(s.accepted) > 0 then s.accepted else array[s.solution] end))
    group by a.user_id
  ),
  werte as (
    select a.user_id, a.day,
      case when d.kind = 'schaetzen' then abs(zahl_aus(a.answer) - zahl_aus(s.accepted[1]))
           else -zahl_aus(a.answer) end as w
    from answers a join doors d on d.day = a.day left join door_solutions s on s.day = a.day
    where d.kind in ('schaetzen', 'raten', 'spiel')
      and (d.kind = 'schaetzen' or zahl_aus(a.answer) > 0)
  ),
  plaetze as (
    select user_id, rank() over (partition by day order by w) as platz from werte where w is not null
  ),
  spiele as (
    select user_id, sum(4 - platz)::int as p from plaetze where platz <= 3 group by user_id
  ),
  mit as (
    select user_id, count(*) as p from (
      select a.user_id, a.day from answers a join doors d on d.day = a.day where d.kind in ('aufgabe', 'frage', 'meme')
      union
      select o.user_id, o.day from posts o join doors d on d.day = o.day where d.kind in ('foto', 'zeichnen', 'frei')
    ) x group by user_id
  ),
  reak as (
    select author_id as user_id, count(*) as p from reactions group by author_id
  )
  select pr.id, pr.name,
    (coalesce(r.p, 0) + coalesce(sp.p, 0) + coalesce(m.p, 0) + coalesce(rk.p, 0))::int,
    coalesce(r.p, 0)::int, coalesce(sp.p, 0)::int, coalesce(m.p, 0)::int, coalesce(rk.p, 0)::int,
    pr.id = auth.uid()
  from profiles pr
  left join richtig r on r.user_id = pr.id
  left join spiele sp on sp.user_id = pr.id
  left join mit m on m.user_id = pr.id
  left join reak rk on rk.user_id = pr.id
  where auth.uid() is not null and exists (select 1 from profiles where id = auth.uid())
  order by 3 desc, pr.name;
$$;
