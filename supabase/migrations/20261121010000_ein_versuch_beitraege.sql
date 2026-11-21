-- Ein Versuch auch bei Foto-, Zeichen- und Kreativ-Challenges:
-- Den eigenen Beitrag löschen (und dann neu posten) geht nicht mehr, nur die Admin kann löschen.
-- (Pro Person und Türchen gibt es ohnehin nur einen Beitrag: unique (day, user_id).)
drop policy "Beitrag löschen" on public.posts;
create policy "Beitrag löschen nur Admin" on public.posts for delete to authenticated using (public.is_admin());
