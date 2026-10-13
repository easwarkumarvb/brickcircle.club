\set ON_ERROR_STOP on
\if :{?expect_missing}
\else
\set expect_missing false
\endif
begin;
create function public.qa_photo_canonical_assert(ok boolean) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'Canonical photo permission evidence does not match the expected contract'; end if; end $$;
\ir fixtures.sql
-- No legacy rows may accidentally authorize a newly created canonical case.
delete from public.exchange_requests;
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000801';
select count(*)=1 as before_matched_photo from storage.objects where name='00000000-0000-4000-8000-000000000802/b.jpg' \gset
select public.create_exchange_case('81000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000002',30,'Synthetic photo permission fixture','photo-permission-proposal')->'case'->>'id' as case_id \gset
select count(*)=1 as proposed_photo from storage.objects where name='00000000-0000-4000-8000-000000000802/b.jpg' \gset
select count(*) as proposed_matches from public.find_matches(auth.uid()) \gset
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000802';
select count(*)=1 as peer_proposed_photo from storage.objects where name='00000000-0000-4000-8000-000000000801/a.jpg' \gset
select public.exchange_case_transition(:'case_id',1,'accept','photo-permission-accept','{}'::jsonb)->'case'->>'state' as accepted_state \gset
select count(*)=1 as peer_accepted_photo from storage.objects where name='00000000-0000-4000-8000-000000000801/a.jpg' \gset
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000801';
select count(*)=1 as accepted_photo from storage.objects where name='00000000-0000-4000-8000-000000000802/b.jpg' \gset
select count(*)=0 as unrelated_hidden_denied from storage.objects where name like '%hidden.jpg' \gset
with changed as(update storage.objects set name=name where name like '%b.jpg' returning id) select count(*)=0 as foreign_update_denied from changed \gset
with removed as(delete from storage.objects where name like '%b.jpg' returning id) select count(*)=0 as foreign_delete_denied from removed \gset
select public.exchange_case_transition(:'case_id',2,'cancel','photo-permission-cancel','{}'::jsonb)->'case'->>'state' as cancelled_state \gset
-- Remove restored reciprocal matching so archived access can only come from the case.
reset role;
delete from public.wishlists;
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000801';
select count(*)=1 as archived_photo from storage.objects where name='00000000-0000-4000-8000-000000000802/b.jpg' \gset
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000803';
select count(*)=0 as outsider_denied from storage.objects \gset
select count(*)=0 as outsider_case_denied from public.exchange_cases where id=:'case_id' \gset
set local role anon;
set local "request.jwt.claim.sub"='';
select count(*)=0 as anon_denied from storage.objects \gset
reset role;
select jsonb_build_object('matched_before_proposal',:'before_matched_photo'::boolean,'proposed_counterpart_photo',:'proposed_photo'::boolean,'peer_proposed_counterpart_photo',:'peer_proposed_photo'::boolean,'proposed_match_count',:'proposed_matches'::integer,'accepted_state',:'accepted_state','accepted_counterpart_photo',:'accepted_photo'::boolean,'peer_accepted_counterpart_photo',:'peer_accepted_photo'::boolean,'cancelled_state',:'cancelled_state','archived_counterpart_photo',:'archived_photo'::boolean,'unrelated_hidden_denied',:'unrelated_hidden_denied'::boolean,'foreign_update_denied',:'foreign_update_denied'::boolean,'foreign_delete_denied',:'foreign_delete_denied'::boolean,'outsider_denied',:'outsider_denied'::boolean,'outsider_case_denied',:'outsider_case_denied'::boolean,'anon_denied',:'anon_denied'::boolean,'legacy_request_count',(select count(*) from public.exchange_requests),'legacy_exchange_count',(select count(*) from public.exchanges)) as canonical_photo_permission_evidence;
select public.qa_photo_canonical_assert(:'before_matched_photo'::boolean and :'proposed_matches'::integer=0 and :'accepted_state'='ACCEPTED' and :'cancelled_state'='CANCELLED' and :'unrelated_hidden_denied'::boolean and :'foreign_update_denied'::boolean and :'foreign_delete_denied'::boolean and :'outsider_denied'::boolean and :'outsider_case_denied'::boolean and :'anon_denied'::boolean and not exists(select 1 from public.exchange_requests) and not exists(select 1 from public.exchanges));
\if :expect_missing
-- Strict reproduction: fail if ANY expected denial disappears or other setup broke.
select public.qa_photo_canonical_assert(not :'proposed_photo'::boolean and not :'peer_proposed_photo'::boolean and not :'accepted_photo'::boolean and not :'peer_accepted_photo'::boolean and not :'archived_photo'::boolean);
\echo 'PHOTO_STORAGE_BASELINE_GAP_CONFIRMED'
\else
select public.qa_photo_canonical_assert(:'proposed_photo'::boolean and :'peer_proposed_photo'::boolean and :'accepted_photo'::boolean and :'peer_accepted_photo'::boolean and :'archived_photo'::boolean);
\echo 'PHOTO_STORAGE_CANONICAL_PARTICIPANT_PASS'
\endif
rollback;
