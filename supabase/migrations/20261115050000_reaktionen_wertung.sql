-- Reaktionen (😂 / ❤️) auf Antworten und Beiträge ohne richtig/falsch, und eine Gesamtwertung.
--
-- Reaktionen: jede Person kann jede fremde Antwort bzw. jeden fremden Beitrag einmal mit 😂 und
-- einmal mit ❤️ markieren. Jede Reaktion = 1 Punkt für die Person, von der die Antwort ist.
-- Geschrieben wird nur über react(); die Person, die den Punkt bekommt, ermittelt der Server.
--
-- Gesamtwertung (scoreboard): Rätsel richtig 2 · Schätzfrage / Wer ist das? / Mini-Spiel Platz 1–3: 3/2/1 ·
-- Challenge mitgemacht 1 · jede bekommene Reaktion 1.
-- Rätsel und Platzierungen zählen erst, wenn die Lösung raus ist (Folgetag), damit niemand
-- über den Punktestand herausfindet, ob seine Antwort stimmt.

create table public.reactions (
  id         bigint generated always as identity primary key,
  day        int  not null references public.doors(day) on delete cascade,
  author_id  uuid not null references public.profiles(id) on delete cascade,
  post_id    uuid references public.posts(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  emoji      text not null check (emoji in ('lol', 'herz')),
  created_at timestamptz not null default now(),
  check (user_id <> author_id)
);
-- Reaktionen auf Beiträge verschwinden mit dem Beitrag (post_id), auf Antworten per Trigger unten

create unique index reactions_eine_pro_art on public.reactions
  (day, author_id, coalesce(post_id, '00000000-0000-0000-0000-000000000000'::uuid), user_id, emoji);
alter table public.reactions enable row level security;   -- keine Regeln: nur über die Funktionen unten
grant all on public.reactions to service_role;

-- Antworten ohne richtig/falsch: Reaktionen verschwinden mit der Antwort
create function public.reactions_cleanup() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from reactions where day = old.day and author_id = old.user_id and post_id is null;
  return old;
end $$;
create trigger answers_reactions_cleanup after delete on public.answers
  for each row execute function public.reactions_cleanup();

create function public.reaction_kind_ok(d int) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from doors where day = d and kind in ('aufgabe', 'frage', 'meme', 'foto', 'zeichnen', 'frei'));
$$;

-- Reaktion an/aus. Für eine Antwort: p = null, a = Person. Für einen Beitrag: p = Beitrag.
create function public.react(d int, a uuid, p uuid, e text) returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  author uuid;
begin
  if me is null or not exists (select 1 from profiles where id = me) then raise exception 'Nicht angemeldet'; end if;
  if e not in ('lol', 'herz') or not reaction_kind_ok(d) then raise exception 'Hier gibt es keine Reaktionen'; end if;
  if p is not null then
    select user_id into author from posts where id = p and day = d;
    if author is null then raise exception 'Beitrag nicht gefunden'; end if;
    if not (is_admin() or has_posted(d) or door_is_open(24)) then raise exception 'Erst selbst mitmachen'; end if;
  else
    select user_id into author from answers where day = d and user_id = a;
    if author is null then raise exception 'Antwort nicht gefunden'; end if;
    if not (is_admin() or has_answered(d) or door_is_revealed(d)) then raise exception 'Erst selbst mitmachen'; end if;
  end if;
  if author = me then raise exception 'Auf die eigene Antwort kann man nicht reagieren'; end if;

  delete from reactions r where r.day = d and r.author_id = author and r.post_id is not distinct from p
    and r.user_id = me and r.emoji = e;
  if found then return false; end if;
  insert into reactions (day, author_id, post_id, user_id, emoji) values (d, author, p, me, e);
  return true;
end $$;

-- Reaktionen eines Türchens (nur Anzahl + ob ich reagiert habe)
create function public.get_reactions(d int)
returns table (author_id uuid, post_id uuid, emoji text, anzahl int, mine boolean)
language sql stable security definer set search_path = public as $$
  select r.author_id, r.post_id, r.emoji, count(*)::int, bool_or(r.user_id = auth.uid())
  from reactions r
  where r.day = d and auth.uid() is not null and (is_admin() or door_is_open(d))
  group by r.author_id, r.post_id, r.emoji;
$$;

-- Zahl aus einer Antwort lesen („ca. 4,5 Flaschen“ → 4.5)
create function public.zahl_aus(t text) returns numeric
language sql immutable as $$
  select ((regexp_match(replace(replace(coalesce(t, ''), ' ', ''), ',', '.'), '-?[0-9]+(?:\.[0-9]+)?'))[1])::numeric;
$$;

create function public.scoreboard()
returns table (user_id uuid, name text, punkte int, raetsel int, spiele int, mitmachen int, reaktionen int, is_me boolean)
language sql stable security definer set search_path = public as $$
  with
  richtig as (   -- Rätsel richtig: 2 Punkte, erst nach der Auflösung
    select a.user_id, 2 * count(*) as p
    from answers a join doors d on d.day = a.day join door_solutions s on s.day = a.day
    where d.kind in ('emoji', 'wort') and door_is_revealed(a.day)
      and coalesce(a.override, answer_matches(a.answer, case when cardinality(s.accepted) > 0 then s.accepted else array[s.solution] end))
    group by a.user_id
  ),
  werte as (     -- Wert je Antwort für Ranglisten (kleiner = besser)
    select a.user_id, a.day,
      case when d.kind = 'schaetzen' then abs(zahl_aus(a.answer) - zahl_aus(s.accepted[1]))
           else -zahl_aus(a.answer) end as w
    from answers a join doors d on d.day = a.day left join door_solutions s on s.day = a.day
    where d.kind in ('schaetzen', 'raten', 'spiel') and door_is_revealed(a.day)
      and (d.kind = 'schaetzen' or zahl_aus(a.answer) > 0)   -- 0 Punkte im Spiel = kein Platz
  ),
  plaetze as (
    select user_id, rank() over (partition by day order by w) as platz
    from werte where w is not null
  ),
  spiele as (
    select user_id, sum(4 - platz)::int as p from plaetze where platz <= 3 group by user_id
  ),
  mit as (       -- Challenge mitgemacht: 1 Punkt pro Türchen
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

revoke execute on function public.react(int, uuid, uuid, text), public.get_reactions(int), public.scoreboard() from anon, public;
grant execute on function public.react(int, uuid, uuid, text), public.get_reactions(int), public.scoreboard() to authenticated;
