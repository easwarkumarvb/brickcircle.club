\set ON_ERROR_STOP on
\if :{?expect_exposure}
\else
\set expect_exposure false
\endif
begin;
create function public.qa_photo_reference_assert(ok boolean) returns void language plpgsql security invoker as $$ begin if ok is distinct from true then raise exception 'Forged photo reference evidence does not match the expected contract'; end if; end $$;
grant execute on function public.qa_photo_reference_assert(boolean) to authenticated,anon;
\ir fixtures.sql
-- Match the actual hosted item UUID default before exercising column grants.
alter table public.collection_items alter column id set default extensions.gen_random_uuid();
-- Exercise the current browser's real column-level insert/update grants too.
\ir ../../supabase/migrations/20260930160000_retire_legacy_exchangeability_trigger.sql
insert into public.lego_sets(set_number,name,theme,estimated_value) values('photo-attacker-insert','Attacker insert','Icons',100),('photo-attacker-update','Attacker update','Icons',100);
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000803';
select count(*)=0 as initial_object_denied from storage.objects where name='00000000-0000-4000-8000-000000000802/hidden.jpg' \gset
select count(*)=0 as victim_row_denied from public.collection_items where id='81000000-0000-4000-8000-000000000003' \gset
-- Knowing an object path must not confer access by linking it to an owned row.
insert into public.collection_items(user_id,set_number,condition,completeness,owner_photo_path)
values(auth.uid(),'photo-attacker-insert','Good',100,'00000000-0000-4000-8000-000000000802/hidden.jpg');
select count(*)=1 as insert_reference_stored from public.collection_items where user_id=auth.uid() and set_number='photo-attacker-insert' and owner_photo_path='00000000-0000-4000-8000-000000000802/hidden.jpg' \gset
select count(*)=1 as forged_insert_object_visible from storage.objects where name='00000000-0000-4000-8000-000000000802/hidden.jpg' \gset
delete from public.collection_items where user_id=auth.uid() and set_number='photo-attacker-insert';
select count(*)=0 as access_removed_with_reference from storage.objects where name='00000000-0000-4000-8000-000000000802/hidden.jpg' \gset
insert into public.collection_items(user_id,set_number,condition,completeness,owner_photo_path)
values(auth.uid(),'photo-attacker-update','Good',100,'00000000-0000-4000-8000-000000000803/own.jpg');
update public.collection_items set owner_photo_path='00000000-0000-4000-8000-000000000802/hidden.jpg' where user_id=auth.uid() and set_number='photo-attacker-update';
select count(*)=1 as update_reference_stored from public.collection_items where user_id=auth.uid() and set_number='photo-attacker-update' and owner_photo_path='00000000-0000-4000-8000-000000000802/hidden.jpg' \gset
select count(*)=1 as forged_update_object_visible from storage.objects where name='00000000-0000-4000-8000-000000000802/hidden.jpg' \gset
select count(*)=0 as victim_row_still_denied from public.collection_items where id='81000000-0000-4000-8000-000000000003' \gset
set local role anon;
set local "request.jwt.claim.sub"='';
select count(*)=0 as anon_denied from storage.objects \gset
reset role;
select jsonb_build_object('initial_object_denied',:'initial_object_denied'::boolean,'victim_row_denied',:'victim_row_denied'::boolean,'insert_reference_stored',:'insert_reference_stored'::boolean,'forged_insert_object_visible',:'forged_insert_object_visible'::boolean,'access_removed_with_reference',:'access_removed_with_reference'::boolean,'update_reference_stored',:'update_reference_stored'::boolean,'forged_update_object_visible',:'forged_update_object_visible'::boolean,'victim_row_still_denied',:'victim_row_still_denied'::boolean,'anon_denied',:'anon_denied'::boolean) as forged_reference_permission_evidence;
select public.qa_photo_reference_assert(:'initial_object_denied'::boolean and :'victim_row_denied'::boolean and :'insert_reference_stored'::boolean and :'access_removed_with_reference'::boolean and :'update_reference_stored'::boolean and :'victim_row_still_denied'::boolean and :'anon_denied'::boolean);
\if :expect_exposure
select public.qa_photo_reference_assert(:'forged_insert_object_visible'::boolean and :'forged_update_object_visible'::boolean);
\echo 'PHOTO_STORAGE_FORGED_REFERENCE_GAP_CONFIRMED'
\else
select public.qa_photo_reference_assert(not :'forged_insert_object_visible'::boolean and not :'forged_update_object_visible'::boolean);
\echo 'PHOTO_STORAGE_FORGED_REFERENCE_DENIED'
\endif
rollback;
