-- Reaktionen mit beliebigem Emoji statt nur 😂 / ❤️. Jede Reaktion = 1 Punkt für die Person.
-- Pro Person und Antwort höchstens 3 verschiedene Emojis (sonst könnte man Punkte verschenken).

create function public.is_reaction_emoji(e text) returns boolean
language sql immutable as $$
  -- kurz, und keine Buchstaben, Ziffern, Leerzeichen oder HTML-Zeichen
  select e is not null and char_length(e) between 1 and 16 and e !~ '[[:alnum:][:space:]<>"''&]';
$$;

alter table public.reactions drop constraint reactions_emoji_check;
update public.reactions set emoji = case emoji when 'lol' then '😂' when 'herz' then '❤️' else emoji end;
alter table public.reactions add constraint reactions_emoji_check check (public.is_reaction_emoji(emoji));

create or replace function public.react(d int, a uuid, p uuid, e text) returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  author uuid;
begin
  if me is null or not exists (select 1 from profiles where id = me) then raise exception 'Nicht angemeldet'; end if;
  if not reaction_kind_ok(d) then raise exception 'Hier gibt es keine Reaktionen'; end if;
  if not public.is_reaction_emoji(e) then raise exception 'Bitte ein Emoji'; end if;
  if p is not null then
    select user_id into author from posts where id = p and day = d;
    if author is null then raise exception 'Beitrag nicht gefunden'; end if;
    if not (is_admin() or has_posted(d) or door_is_revealed(d) or door_is_open(24)) then raise exception 'Erst selbst mitmachen'; end if;
  else
    select user_id into author from answers where day = d and user_id = a;
    if author is null then raise exception 'Antwort nicht gefunden'; end if;
    if not (is_admin() or has_answered(d) or door_is_revealed(d)) then raise exception 'Erst selbst mitmachen'; end if;
  end if;
  if author = me then raise exception 'Auf die eigene Antwort kann man nicht reagieren'; end if;

  delete from reactions r where r.day = d and r.author_id = author and r.post_id is not distinct from p
    and r.user_id = me and r.emoji = e;
  if found then return false; end if;
  -- höchstens 3 verschiedene Emojis pro Person und Antwort
  if (select count(*) from reactions r where r.day = d and r.author_id = author and r.post_id is not distinct from p and r.user_id = me) >= 3 then
    raise exception 'Höchstens 3 Reaktionen pro Antwort';
  end if;
  insert into reactions (day, author_id, post_id, user_id, emoji) values (d, author, p, me, e);
  return true;
end $$;
