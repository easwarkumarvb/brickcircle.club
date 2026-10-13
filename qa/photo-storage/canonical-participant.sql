\set ON_ERROR_STOP on
begin;
create function public.qa_photo_canonical_assert(ok boolean) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'Canonical participant counterpart photo unavailable; inspect permission evidence'; end if; end $$;
\ir fixtures.sql
-- Remove legacy links for this diagnostic: only real newly-created canonical case may authorize.
delete from public.exchange_requests;
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000801';
select count(*)=1 as before_matched_photo from storage.objects where name='00000000-0000-4000-8000-000000000802/b.jpg' \gset
select public.create_exchange_case('81000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000002',30,'Synthetic photo permission fixture','photo-permission-proposal')->'case'->>'id' as case_id \gset
select count(*)=1 as proposed_photo from storage.objects where name='00000000-0000-4000-8000-000000000802/b.jpg' \gset
select count(*) as proposed_matches from public.find_matches(auth.uid()) \gset
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000802';
select public.exchange_case_transition(:'case_id',1,'accept','photo-permission-accept','{}'::jsonb)->'case'->>'state' as accepted_state \gset
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000801';
select count(*)=1 as accepted_photo from storage.objects where name='00000000-0000-4000-8000-000000000802/b.jpg' \gset
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000803';
select count(*)=0 as outsider_denied from storage.objects \gset
reset role;
select jsonb_build_object('matched_before_proposal',:'before_matched_photo'::boolean,'proposed_counterpart_photo',:'proposed_photo'::boolean,'proposed_match_count',:'proposed_matches'::integer,'accepted_state',:'accepted_state','accepted_counterpart_photo',:'accepted_photo'::boolean,'outsider_denied',:'outsider_denied'::boolean,'legacy_request_count',(select count(*) from public.exchange_requests),'legacy_exchange_count',(select count(*) from public.exchanges)) as canonical_photo_permission_evidence;
-- This acceptance assertion intentionally detects an actual canonical access gap.
-- Never weaken it or alter production policies merely to make QA green.
select public.qa_photo_canonical_assert(:'before_matched_photo'::boolean and :'proposed_photo'::boolean and :'accepted_photo'::boolean and :'outsider_denied'::boolean and :'accepted_state'='ACCEPTED');
rollback;
\echo 'PHOTO_STORAGE_CANONICAL_PARTICIPANT_PASS'
