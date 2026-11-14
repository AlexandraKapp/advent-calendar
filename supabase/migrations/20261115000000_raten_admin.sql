-- „Wer ist das?“ im Admin-Bereich: Fotos ansehen, Namen ändern, Fotos austauschen/hinzufügen/löschen.
-- Alles nur für Admins. Die 5 Schärfestufen rechnet der Browser des Admins aus.

create function public.raten_admin_list(d int)
returns table (nr int, solution text, accepted text[], bild text)
language sql stable security definer set search_path = public as $$
  select b.nr, b.solution, b.accepted, b.stages[5]
  from raten_bilder b where b.day = d and is_admin() order by b.nr;
$$;

-- n = null: neues Foto hinten anhängen. stages = null: nur Namen ändern.
create function public.raten_admin_save(d int, n int, sol text, acc text[], st text[])
returns int
language plpgsql volatile security definer set search_path = public as $$
declare k int;
begin
  if not is_admin() then raise exception 'Nur für Admins'; end if;
  if coalesce(btrim(sol), '') = '' then raise exception 'Name fehlt'; end if;
  if st is not null and cardinality(st) <> 5 then raise exception 'Es braucht 5 Bildstufen'; end if;
  if n is null then
    if st is null then raise exception 'Foto fehlt'; end if;
    select coalesce(max(nr), 0) + 1 into k from raten_bilder where day = d;
    insert into raten_bilder (day, nr, solution, accepted, stages) values (d, k, btrim(sol), coalesce(acc, '{}'), st);
    return k;
  end if;
  update raten_bilder set solution = btrim(sol), accepted = coalesce(acc, '{}'), stages = coalesce(st, stages)
    where day = d and nr = n;
  if not found then raise exception 'Foto % gibt es nicht', n; end if;
  return n;
end $$;

-- Foto löschen; die Fotos dahinter rücken auf (auch bereits gespielte Runden)
create function public.raten_admin_delete(d int, n int) returns void
language plpgsql volatile security definer set search_path = public as $$
declare i int; m int;
begin
  if not is_admin() then raise exception 'Nur für Admins'; end if;
  delete from raten_runden where day = d and nr = n;
  delete from raten_bilder where day = d and nr = n;
  select coalesce(max(nr), 0) into m from raten_bilder where day = d;
  for i in n + 1 .. m loop
    update raten_bilder set nr = i - 1 where day = d and nr = i;
    update raten_runden set nr = i - 1 where day = d and nr = i;
  end loop;
end $$;

revoke execute on function public.raten_admin_list(int), public.raten_admin_save(int, int, text, text[], text[]),
  public.raten_admin_delete(int, int) from anon, public;
grant execute on function public.raten_admin_list(int), public.raten_admin_save(int, int, text, text[], text[]),
  public.raten_admin_delete(int, int) to authenticated;
