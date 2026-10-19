-- Read access to ORIGINAL handoff photo bytes for the two participants only.
-- Owner edits after exchange completion must not erase short-term peer evidence.
-- Complements 20261019091952; does not broaden anonymous access.
begin;
create or replace function private.bc_handoff_photo_readable_by_peer(p_path text,p_peer uuid)
returns boolean language sql stable security definer set search_path=''
as $$
  select p_peer is not null and exists (
    select 1
    from public.exchange_case_handoff_baselines h
    join public.exchange_cases c on c.id=h.case_id
    where p_peer in (c.user_a,c.user_b)
      and (c.completed_at is null or c.completed_at > pg_catalog.now()-interval '90 days')
      and p_path in (
        h.snapshot #>> '{item_a,photos,front}',
        h.snapshot #>> '{item_a,photos,side}',
        h.snapshot #>> '{item_a,photos,rear}',
        h.snapshot #>> '{item_b,photos,front}',
        h.snapshot #>> '{item_b,photos,side}',
        h.snapshot #>> '{item_b,photos,rear}'
      )
  )
$$;
revoke all on function private.bc_handoff_photo_readable_by_peer(text,uuid) from public,anon,authenticated;
grant execute on function private.bc_handoff_photo_readable_by_peer(text,uuid) to authenticated;
drop policy if exists "handoff participants read original photo evidence" on storage.objects;
create policy "handoff participants read original photo evidence"
on storage.objects as permissive for select to authenticated
using (bucket_id='collection-photos' and
       private.bc_handoff_photo_readable_by_peer(name,(select auth.uid())));
comment on function private.bc_handoff_photo_readable_by_peer(text,uuid)
is 'Boolean-only internal predicate: permit handoff peers to retrieve original owner photo evidence while active and for 90 days after completion; third parties and anon excluded.';
commit;