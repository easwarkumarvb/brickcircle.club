\set ON_ERROR_STOP on
\if :{?expect_denied}
\else
\set expect_denied false
\endif
begin;
create function public.qa_photo_orphan_assert(ok boolean,detail text) returns void language plpgsql security invoker as $$ begin if ok is distinct from true then raise exception 'Orphan cleanup permission: %',detail; end if; end $$;
grant execute on function public.qa_photo_orphan_assert(boolean,text) to authenticated,anon;
\ir fixtures.sql
-- Three objects that no collection or supplemental metadata row references: an
-- unused candidate in this owner's folder, a matched collector's orphan and an
-- unmatched outsider's orphan.
insert into storage.objects(bucket_id,name) values
('collection-photos','00000000-0000-4000-8000-000000000801/orphan-candidate.jpg'),
('collection-photos','00000000-0000-4000-8000-000000000802/matched-foreign-orphan.jpg'),
('collection-photos','00000000-0000-4000-8000-000000000803/unmatched-foreign-orphan.jpg'),
('foreign-bucket','00000000-0000-4000-8000-000000000801/other-bucket.jpg');
set local role authenticated;
-- Check foreign and anonymous denial while the owner's candidate still exists.
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000803';
with removed as (delete from storage.objects where name='00000000-0000-4000-8000-000000000801/orphan-candidate.jpg' returning id) select count(*) as outsider_candidate_deleted from removed \gset
set local role anon;
set local "request.jwt.claim.sub"='';
select count(*)=0 as anon_objects_unseen from storage.objects \gset
with removed as (delete from storage.objects where name='00000000-0000-4000-8000-000000000801/orphan-candidate.jpg' returning id) select count(*) as anon_candidate_deleted from removed \gset
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000801';
select count(*)=0 as own_foreign_bucket_unseen from storage.objects where bucket_id='foreign-bucket' \gset
with removed as (delete from storage.objects where bucket_id='foreign-bucket' returning id) select count(*) as own_foreign_bucket_deleted from removed \gset
-- Non-owners still require visible collection metadata for these objects.
select count(*)=0 as matched_foreign_unseen from storage.objects where name='00000000-0000-4000-8000-000000000802/matched-foreign-orphan.jpg' \gset
select count(*)=0 as unmatched_foreign_unseen from storage.objects where name='00000000-0000-4000-8000-000000000803/unmatched-foreign-orphan.jpg' \gset
-- DELETE ... WHERE name ... RETURNING reads relation columns, so the row must
-- pass both the SELECT and the DELETE policy of the requesting role.
select count(*)=1 as owner_candidate_visible from storage.objects where name='00000000-0000-4000-8000-000000000801/orphan-candidate.jpg' \gset
with removed as (delete from storage.objects where name='00000000-0000-4000-8000-000000000801/orphan-candidate.jpg' returning id) select count(*) as owner_candidate_deleted from removed \gset
with removed as (delete from storage.objects where name='00000000-0000-4000-8000-000000000802/matched-foreign-orphan.jpg' returning id) select count(*) as matched_foreign_deleted from removed \gset
with removed as (delete from storage.objects where name='00000000-0000-4000-8000-000000000803/unmatched-foreign-orphan.jpg' returning id) select count(*) as unmatched_foreign_deleted from removed \gset
-- Table owner view: only this owner's own candidate may have disappeared.
reset role;
select public.qa_photo_orphan_assert(:'own_foreign_bucket_unseen'::boolean and :'own_foreign_bucket_deleted'::integer=0 and (select count(*)=1 from storage.objects where bucket_id='foreign-bucket'),'owner namespace does not cross buckets');
select count(*)=1 as owner_candidate_present from storage.objects where name='00000000-0000-4000-8000-000000000801/orphan-candidate.jpg' \gset
select count(*)=1 as matched_foreign_present from storage.objects where name='00000000-0000-4000-8000-000000000802/matched-foreign-orphan.jpg' \gset
select count(*)=1 as unmatched_foreign_present from storage.objects where name='00000000-0000-4000-8000-000000000803/unmatched-foreign-orphan.jpg' \gset
select public.qa_photo_orphan_assert(:'matched_foreign_unseen'::boolean and :'unmatched_foreign_unseen'::boolean,'foreign orphans need visible collection metadata');
select public.qa_photo_orphan_assert(:'matched_foreign_deleted'::integer=0 and :'unmatched_foreign_deleted'::integer=0,'foreign orphan deletes denied');
select public.qa_photo_orphan_assert(:'outsider_candidate_deleted'::integer=0,'unmatched collector cannot delete another owner object');
select public.qa_photo_orphan_assert(:'anon_objects_unseen'::boolean and :'anon_candidate_deleted'::integer=0,'anonymous orphan delete denied');
select public.qa_photo_orphan_assert(:'matched_foreign_present'::boolean and :'unmatched_foreign_present'::boolean,'foreign object rows retained');
\if :expect_denied
-- Before the owner-self read branch: metadata-only SELECT hides the owner's own
-- unreferenced object, so the guarded DELETE matches zero rows and keeps it.
select public.qa_photo_orphan_assert(not :'owner_candidate_visible'::boolean and :'owner_candidate_deleted'::integer=0 and :'owner_candidate_present'::boolean,'owner orphan stays invisible and undeleted without the owner-self read branch');
\echo 'PHOTO_STORAGE_ORPHAN_CLEANUP_GAP_CONFIRMED'
\else
-- After the owner-self read branch: the owner removes exactly their own unlinked
-- object while every foreign object survives.
select public.qa_photo_orphan_assert(:'owner_candidate_visible'::boolean and :'owner_candidate_deleted'::integer=1 and not :'owner_candidate_present'::boolean,'owner deletes own unlinked object');
\echo 'PHOTO_STORAGE_ORPHAN_CLEANUP_PASS'
\endif
rollback;
