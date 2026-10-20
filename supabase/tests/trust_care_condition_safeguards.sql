-- Disposable QA regression: does not reference any real collector or mutate real rows.
-- Run against staging after applying 20261019083950. Transaction always rolls back.
begin;
create temporary table bc_trust_probe(
  id uuid, user_id uuid, owner_photo_path text, condition text,
  completeness integer, notes text, original_box boolean,
  inventory_review_status text, available_for_exchange boolean
) on commit drop;
create trigger bc_trust_guard_probe before update on bc_trust_probe
for each row execute function private.bc_guard_collection_trust_care();
insert into bc_trust_probe values(
  '00000000-0000-4000-8000-000000000199',
  '00000000-0000-4000-8000-000000000199',
  'test-owner/front.jpg','Good',95,'',false,'not_checked',false
);
do $$
begin
  begin
    update bc_trust_probe set available_for_exchange=true;
    raise exception 'FAILED: photo-incomplete item was allowed';
  exception when others then
    if sqlerrm not like 'Before making this set available%' then raise; end if;
  end;
  begin
    update bc_trust_probe set inventory_review_status='known_gaps';
    raise exception 'FAILED: gaps without disclosure were allowed';
  exception when others then
    if sqlerrm not like 'Describe the known missing pieces%' then raise; end if;
  end;
end $$;
select 'TRUST_CARE_TEMP_GUARD_PASS' as marker;
rollback;
