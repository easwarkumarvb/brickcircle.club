\set ON_ERROR_STOP on
begin;

create or replace function pg_temp.assert_true(ok boolean,message text)
returns void language plpgsql as $$
begin
  if not coalesce(ok,false) then raise exception 'assertion failed: %',message; end if;
end;
$$;

-- This QA-only relation mirrors the photo-angle columns used by availability
-- eligibility; production owns its full schema and RLS.
create table if not exists public.collection_item_photo_angles(
  item_id uuid not null,
  owner_id uuid not null,
  angle text not null,
  storage_path text not null
);

insert into public.lego_sets(set_number,name,theme,estimated_value) values
  ('history-a','History Set A','Icons',100),('history-b','History Set B','Icons',100),
  ('history-c','History Set C','Icons',100),('history-d','History Set D','Icons',100)
on conflict(set_number) do nothing;
insert into auth.users(id,email) values
  ('00000000-0000-4000-8000-000000000061','history-a@example.invalid'),
  ('00000000-0000-4000-8000-000000000062','history-b@example.invalid'),
  ('00000000-0000-4000-8000-000000000063','history-c@example.invalid'),
  ('00000000-0000-4000-8000-000000000064','history-d@example.invalid'),
  ('00000000-0000-4000-8000-000000000065','history-alias-a@example.invalid'),
  ('00000000-0000-4000-8000-000000000066','history-alias-b@example.invalid');
insert into public.profiles(id,display_name,country,city,adult_confirmed_at) values
  ('00000000-0000-4000-8000-000000000061','History A','India','Bengaluru',now()),
  ('00000000-0000-4000-8000-000000000062','History B','India','Bengaluru',now()),
  ('00000000-0000-4000-8000-000000000063','History C','India','Bengaluru',now()),
  ('00000000-0000-4000-8000-000000000064','History D','India','Bengaluru',now()),
  ('00000000-0000-4000-8000-000000000065','Alias A','India','Bengaluru',now()),
  ('00000000-0000-4000-8000-000000000066','Alias B','India','Bengaluru',now());
insert into public.collection_items(id,user_id,set_number,condition,completeness,owner_photo_path,available_for_exchange)
values
  ('51000000-0000-4000-8000-000000000013','00000000-0000-4000-8000-000000000061','history-a','Good',100,'51/history-a.jpg',true),
  ('51000000-0000-4000-8000-000000000014','00000000-0000-4000-8000-000000000062','history-b','Good',100,'52/history-b.jpg',true),
  ('51000000-0000-4000-8000-000000000015','00000000-0000-4000-8000-000000000063','history-c','Good',100,'53/history-c.jpg',true),
  ('51000000-0000-4000-8000-000000000016','00000000-0000-4000-8000-000000000064','history-d','Good',100,'54/history-d.jpg',true);
insert into public.collection_item_photo_angles(item_id,owner_id,angle,storage_path)
select items.id,items.user_id,angles.angle,items.user_id::text||'/'||items.set_number||'-'||angles.angle||'.jpg'
from public.collection_items items
cross join (values('side'),('rear')) angles(angle)
where items.id in (
  '51000000-0000-4000-8000-000000000013','51000000-0000-4000-8000-000000000014',
  '51000000-0000-4000-8000-000000000015','51000000-0000-4000-8000-000000000016'
);

-- A-B has one legacy-projected completion, 83 additional completed cases
-- (including one undated completion), and one handoff-confirmed active exchange.
insert into public.exchange_cases(
  id,user_a,user_b,item_a,item_b,proposer_id,recipient_id,duration_days,state,
  owner_preference_a,owner_preference_b,created_at,completed_at,handoff_at,legacy_exchange_id
)
select ('61000000-0000-4000-8000-'||pg_catalog.lpad(n::text,12,'0'))::uuid,
  '00000000-0000-4000-8000-000000000061','00000000-0000-4000-8000-000000000062',
  '51000000-0000-4000-8000-000000000013','51000000-0000-4000-8000-000000000014',
  '00000000-0000-4000-8000-000000000061','00000000-0000-4000-8000-000000000062',
  60,'COMPLETED',true,true,
  case when n=84 then '2026-03-01'::timestamptz else '2024-01-01'::timestamptz+n*interval '1 day' end,
  case when n=84 then null else '2024-01-01'::timestamptz+n*interval '1 day' end,
  case when n=84 then null else '2024-01-01'::timestamptz+n*interval '1 day' end,
  case when n=1 then '71000000-0000-4000-8000-000000000001'::uuid end
from generate_series(1,84) n;
insert into public.exchange_cases(
  id,user_a,user_b,item_a,item_b,proposer_id,recipient_id,duration_days,state,
  owner_preference_a,owner_preference_b,created_at,handoff_at
) values (
  '62000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000061','00000000-0000-4000-8000-000000000062',
  '51000000-0000-4000-8000-000000000013','51000000-0000-4000-8000-000000000014',
  '00000000-0000-4000-8000-000000000061','00000000-0000-4000-8000-000000000062',
  60,'ACTIVE',true,true,'2026-02-01','2026-02-01'
);
insert into public.exchange_cases(
  id,user_a,user_b,item_a,item_b,proposer_id,recipient_id,duration_days,state,
  owner_preference_a,owner_preference_b,created_at,cancelled_at
) values (
  '62000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000061','00000000-0000-4000-8000-000000000062',
  '51000000-0000-4000-8000-000000000013','51000000-0000-4000-8000-000000000014',
  '00000000-0000-4000-8000-000000000061','00000000-0000-4000-8000-000000000062',
  60,'CANCELLED',true,true,'2026-05-01','2026-05-02'
);
insert into public.exchange_cases(
  id,user_a,user_b,item_a,item_b,proposer_id,recipient_id,duration_days,state,
  owner_preference_a,owner_preference_b,created_at
) values (
  '62000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-000000000061','00000000-0000-4000-8000-000000000063',
  '51000000-0000-4000-8000-000000000013','51000000-0000-4000-8000-000000000015',
  '00000000-0000-4000-8000-000000000061','00000000-0000-4000-8000-000000000063',
  60,'DISPUTED',true,true,'2026-05-03'
);
insert into public.exchange_cases(
  id,user_a,user_b,item_a,item_b,proposer_id,recipient_id,duration_days,state,
  owner_preference_a,owner_preference_b,created_at,cancelled_at
) values (
  '62000000-0000-4000-8000-000000000006',
  '00000000-0000-4000-8000-000000000061','00000000-0000-4000-8000-000000000064',
  '51000000-0000-4000-8000-000000000013','51000000-0000-4000-8000-000000000016',
  '00000000-0000-4000-8000-000000000061','00000000-0000-4000-8000-000000000064',
  60,'CANCELLED',true,true,'2026-05-04','2026-05-04'
);
insert into public.exchange_cases(
  id,user_a,user_b,item_a,item_b,proposer_id,recipient_id,duration_days,state,
  owner_preference_a,owner_preference_b,created_at,completed_at,handoff_at,migration_review_required
) values (
  '62000000-0000-4000-8000-000000000005',
  '00000000-0000-4000-8000-000000000061','00000000-0000-4000-8000-000000000062',
  '51000000-0000-4000-8000-000000000013','51000000-0000-4000-8000-000000000014',
  '00000000-0000-4000-8000-000000000061','00000000-0000-4000-8000-000000000062',
  60,'COMPLETED',true,true,'2026-07-01','2026-07-02','2026-07-01',true
);

insert into public.exchange_user_blocks(blocker_id,blocked_id)
values('00000000-0000-4000-8000-000000000061','00000000-0000-4000-8000-000000000064');
insert into public.wishlists(user_id,set_number) values
  ('00000000-0000-4000-8000-000000000061','history-b'),
  ('00000000-0000-4000-8000-000000000061','history-c'),
  ('00000000-0000-4000-8000-000000000061','history-d'),
  ('00000000-0000-4000-8000-000000000062','history-a'),
  ('00000000-0000-4000-8000-000000000063','history-a'),
  ('00000000-0000-4000-8000-000000000064','history-a');

set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000061';
do $$
declare summary record; first_page record; second_page_count integer;
begin
  select * into summary from public.shared_exchange_history(
    array['00000000-0000-4000-8000-000000000062','00000000-0000-4000-8000-000000000063',
      '00000000-0000-4000-8000-000000000064']::uuid[],3
  ) where peer_id='00000000-0000-4000-8000-000000000062';
  perform pg_temp.assert_true(summary.shared_count=85,'history count includes completed legacy rows and confirmed handoffs beyond the UI 80-case cap');
  perform pg_temp.assert_true(pg_catalog.jsonb_array_length(summary.recent)=3 and summary.has_more,'summary returns only a bounded recent page');
  perform pg_temp.assert_true(summary.latest_at is null,'an undated latest completed case is not assigned a fabricated completion date');
  perform pg_temp.assert_true(summary.recent->0->>'offered_set'='history-a'
    and summary.recent->0->>'requested_set'='history-b','A sees prior sets in viewer-relative order');
  perform pg_temp.assert_true((select shared_count=0 and recent='[]'::jsonb from public.shared_exchange_history(
    array['00000000-0000-4000-8000-000000000063']::uuid[],3)),'A-C disputed legacy case without handoff is not reported as an exchange');
  perform pg_temp.assert_true((select shared_count=0 and recent='[]'::jsonb from public.shared_exchange_history(
    array['00000000-0000-4000-8000-000000000064']::uuid[],3)),'a canceled-before-handoff-only pair is not reported as an exchange');
  perform pg_temp.assert_true((select count(*)=85 from public.exchange_cases c
    where ((c.user_a='00000000-0000-4000-8000-000000000061' and c.user_b='00000000-0000-4000-8000-000000000062')
        or (c.user_b='00000000-0000-4000-8000-000000000061' and c.user_a='00000000-0000-4000-8000-000000000062'))
      and not c.migration_review_required
      and (c.state='COMPLETED' or (c.handoff_at is not null and c.state in ('ACTIVE','EARLY_RETURN','RETURN_PLANNING','RETURN_INSPECTION','DISPUTED')))),
    'legacy-projected case is represented once and cancelled, proposal, and migration-review rows are excluded');

  create temporary table page_rows on commit drop as
    select * from public.shared_exchange_history_page('00000000-0000-4000-8000-000000000062',null,null,50);
  select * into first_page from page_rows order by sort_at asc,case_id asc limit 1;
  perform pg_temp.assert_true((select count(*)=50 and bool_and(has_more) from page_rows),'first explicit history page is bounded and advertises older rows');
  insert into page_rows
    select * from public.shared_exchange_history_page('00000000-0000-4000-8000-000000000062',first_page.sort_at,first_page.case_id,50);
  select pg_catalog.count(*) into second_page_count from page_rows;
  perform pg_temp.assert_true(second_page_count=85 and (select count(distinct case_id)=85 from page_rows),
    'cursor pagination reaches every shared record without duplicates');
  perform pg_temp.assert_true(not (select has_more from page_rows order by sort_at asc,case_id asc limit 1),
    'the final page reports completion');

end $$;

set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000062';
select pg_temp.assert_true((select recent->0->>'offered_set'='history-b'
  and recent->0->>'requested_set'='history-a' from public.shared_exchange_history(
    array['00000000-0000-4000-8000-000000000061']::uuid[],3)),'B receives correctly reversed shared set ownership');
reset role;

set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000064';
select pg_temp.assert_true((select shared_count=0 and recent='[]'::jsonb from public.shared_exchange_history(
  array['00000000-0000-4000-8000-000000000062']::uuid[],3)),'C or other nonparticipants cannot see A-B history or global totals');
reset role;

set local role authenticated;
set local "request.jwt.claim.sub"='';
do $$
begin
  begin
    perform public.shared_exchange_history(array['00000000-0000-4000-8000-000000000062']::uuid[],3);
    raise exception 'unauthenticated history RPC unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

select pg_temp.assert_true(not has_function_privilege('anon','public.shared_exchange_history(uuid[],integer)','EXECUTE')
  and has_function_privilege('authenticated','public.shared_exchange_history(uuid[],integer)','EXECUTE')
  and not has_function_privilege('anon','public.shared_exchange_history_page(uuid,timestamptz,uuid,integer)','EXECUTE'),
  'participant history RPC execution is restricted to authenticated users');

set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000061';
do $$
begin
  begin
    perform public.shared_exchange_history(pg_catalog.array_fill(auth.uid(),array[51]),3);
    raise exception 'oversized peer batch unexpectedly succeeded';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.shared_exchange_history_page(
      '00000000-0000-4000-8000-000000000062',null,null,51
    );
    raise exception 'oversized history page unexpectedly succeeded';
  exception when invalid_parameter_value then null;
  end;
end $$;
reset role;

-- Initial eligibility remains reciprocal and a prior completion permits a
-- repeat match; a block excludes D despite matching sets and location.
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000061';
select pg_temp.assert_true(exists(select 1 from public.find_matches('00000000-0000-4000-8000-000000000061')
  where match_user='00000000-0000-4000-8000-000000000062' and offered_item='51000000-0000-4000-8000-000000000013'),
  'prior completed exchanges do not suppress a valid same-item repeat match');
select pg_temp.assert_true(not exists(select 1 from public.find_matches('00000000-0000-4000-8000-000000000061')
  where match_user='00000000-0000-4000-8000-000000000064'),'blocked matching collector remains excluded');
reset role;

do $$
declare inserted_count integer;
begin
  select count(*) into inserted_count from public.notifications where kind='reciprocal_match';
  perform pg_temp.assert_true(inserted_count=4,'both directed recipients receive first eligible A-B and A-C notifications; blocked D receives none');
  perform pg_temp.assert_true((select count(*)=2 from public.notifications
    where kind='reciprocal_match' and metadata->>'shared_exchange_count'='0'
      and title='You have a new local BrickCircle match'),'first-time discovery remains clearly labeled');
  perform pg_temp.assert_true((select count(*)=2 from public.notifications
    where kind='reciprocal_match' and metadata->>'shared_exchange_count'='85'
      and title='A past exchange is a match again'),'repeat-aware copy is sent to both A-B participants');
  perform pg_temp.assert_true(public.queue_new_reciprocal_match_notifications('00000000-0000-4000-8000-000000000061')=0
    and public.queue_new_reciprocal_match_notifications('00000000-0000-4000-8000-000000000062')=0,
    'refreshing either participant is idempotent');
end $$;

-- A later A-C completion changes the item watermark and allows A-B to be
-- notified again without time-based or availability-toggle event IDs.
insert into public.exchange_cases(
  id,user_a,user_b,item_a,item_b,proposer_id,recipient_id,duration_days,state,
  owner_preference_a,owner_preference_b,created_at,completed_at,handoff_at
) values (
  '62000000-0000-4000-8000-000000000004',
  '00000000-0000-4000-8000-000000000061','00000000-0000-4000-8000-000000000063',
  '51000000-0000-4000-8000-000000000013','51000000-0000-4000-8000-000000000015',
  '00000000-0000-4000-8000-000000000061','00000000-0000-4000-8000-000000000063',
  60,'COMPLETED',true,true,'2026-06-01','2026-06-02','2026-06-01'
);
do $$
begin
  perform public.queue_new_reciprocal_match_notifications('00000000-0000-4000-8000-000000000061');
  perform pg_temp.assert_true((select count(*)=6 from public.notifications
    where kind='reciprocal_match' and title='A past exchange is a match again'),
    'new completion with a third peer refreshes both A-B recipients and both A-C recipients');
  perform pg_temp.assert_true((select count(*)=4 from public.notifications
    where kind='reciprocal_match' and metadata->>'shared_exchange_count'='85'
      and metadata->>'latest_shared_exchange_id'='61000000-0000-4000-8000-000000000084'),
    'both A-B rediscovery events retain exact pair-only shared-history metadata after A-C completion');
  perform pg_temp.assert_true((select count(*)=2 from public.notifications
    where kind='reciprocal_match' and metadata->>'shared_exchange_count'='1'
      and metadata->>'latest_shared_exchange_id'='62000000-0000-4000-8000-000000000004'),
    'A-C receives only its own shared case metadata, with no third-party watermark identifiers');
  update public.collection_items set available_for_exchange=false
    where id='51000000-0000-4000-8000-000000000013';
  update public.collection_items set available_for_exchange=true
    where id='51000000-0000-4000-8000-000000000013';
  perform public.queue_new_reciprocal_match_notifications('00000000-0000-4000-8000-000000000061');
  perform pg_temp.assert_true((select count(*)=6 from public.notifications
    where kind='reciprocal_match' and title='A past exchange is a match again'),
    'availability toggles and retries without a new completion do not spam notifications');
end $$;

delete from public.exchange_user_blocks
where blocker_id='00000000-0000-4000-8000-000000000061'
  and blocked_id='00000000-0000-4000-8000-000000000064';
insert into public.exchange_case_item_locks(item_id,lock_kind)
values('51000000-0000-4000-8000-000000000016','PROPOSAL_PENDING');
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000061';
select pg_temp.assert_true(not exists(select 1 from public.find_matches('00000000-0000-4000-8000-000000000061')
  where match_user='00000000-0000-4000-8000-000000000064'),'canonical item lock excludes a reciprocal match');
reset role;
delete from public.exchange_case_item_locks where item_id='51000000-0000-4000-8000-000000000016';
update public.profiles set city='Mumbai' where id='00000000-0000-4000-8000-000000000064';
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000061';
select pg_temp.assert_true(not exists(select 1 from public.find_matches('00000000-0000-4000-8000-000000000061')
  where match_user='00000000-0000-4000-8000-000000000064'),'different normalized cities exclude a reciprocal match');
reset role;
update public.profiles set city='Bengaluru' where id='00000000-0000-4000-8000-000000000064';
insert into public.exchange_user_blocks(blocker_id,blocked_id)
values('00000000-0000-4000-8000-000000000061','00000000-0000-4000-8000-000000000064');

-- Canonical product aliases remain valid match identities for both directions.
insert into public.lego_sets(set_number,name,theme,estimated_value) values
  ('21309-1','Apollo Saturn V','Ideas',120),('92176-1','NASA Apollo Saturn V','Ideas',120);
insert into public.collection_items(id,user_id,set_number,condition,completeness,owner_photo_path,available_for_exchange)
values
  ('51000000-0000-4000-8000-000000000055','00000000-0000-4000-8000-000000000065','21309-1','Good',100,'55/21309-front.jpg',true),
  ('51000000-0000-4000-8000-000000000056','00000000-0000-4000-8000-000000000066','92176-1','Good',100,'56/92176-front.jpg',true);
insert into public.collection_item_photo_angles(item_id,owner_id,angle,storage_path)
select items.id,items.user_id,angles.angle,items.user_id::text||'/'||items.set_number||'-'||angles.angle||'.jpg'
from public.collection_items items
cross join (values('side'),('rear')) angles(angle)
where items.id in (
  '51000000-0000-4000-8000-000000000055','51000000-0000-4000-8000-000000000056'
);
insert into public.wishlists(user_id,set_number) values
  ('00000000-0000-4000-8000-000000000065','92176'),
  ('00000000-0000-4000-8000-000000000066','21309-1');
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000065';
select pg_temp.assert_true(exists(select 1 from public.find_matches('00000000-0000-4000-8000-000000000065')
  where match_user='00000000-0000-4000-8000-000000000066'
    and offered_item='51000000-0000-4000-8000-000000000055'
    and requested_item='51000000-0000-4000-8000-000000000056'),
  'canonical first-release and reissue aliases match without changing the finder result shape');
reset role;
select pg_temp.assert_true((select count(*)=2 from public.notifications
  where kind='reciprocal_match' and user_id in (
    '00000000-0000-4000-8000-000000000065','00000000-0000-4000-8000-000000000066')),
  'alias match discovery queues one notification for each participant');

rollback;
