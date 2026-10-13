-- Canonical cases reserve physical items and remove them from reciprocal matching.
-- Preserve participant inspection of their exact case items, including case history.
-- Storage reads already inherit collection_items RLS; no Storage write grant changes.
begin;
drop policy if exists "canonical participants read case collection items" on public.collection_items;
create policy "canonical participants read case collection items"
on public.collection_items for select to authenticated
using (
  exists (
    select 1
    from public.exchange_cases c
    where (select auth.uid()) in (c.user_a,c.user_b)
      and collection_items.id in (c.item_a,c.item_b)
  )
);
commit;
