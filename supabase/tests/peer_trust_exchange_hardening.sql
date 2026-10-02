\set ON_ERROR_STOP on
begin;

create or replace function pg_temp.assert_true(ok boolean,message text)
returns void language plpgsql as $$
begin
  if not coalesce(ok,false) then raise exception 'assertion failed: %',message; end if;
end;
$$;

-- Dedicated peer-trust fixtures.
insert into auth.users(id,email) values
  ('80000000-0000-4000-8000-000000000081','peer-a@example.test'),
  ('80000000-0000-4000-8000-000000000082','peer-b@example.test'),
  ('80000000-0000-4000-8000-000000000083','outsider@example.test')
on conflict(id) do nothing;

-- auth.users on_auth_user_created already created these profile rows.
-- adult_confirmed_at is server-stamped only, so touch only the mutable fields here
-- and attest each collector through confirm_adult_status() below.
insert into public.profiles(id,display_name,email,country,city)
values
  ('80000000-0000-4000-8000-000000000081','Peer A','peer-a@example.test','India','Bengaluru'),
  ('80000000-0000-4000-8000-000000000082','Peer B','peer-b@example.test','India','Bengaluru'),
  ('80000000-0000-4000-8000-000000000083','Outsider','outsider@example.test','India','Bengaluru')
on conflict(id) do update set
  display_name=excluded.display_name,email=excluded.email,
  country=excluded.country,city=excluded.city;

set local role authenticated;
set local "request.jwt.claim.sub"='80000000-0000-4000-8000-000000000081';
select public.confirm_adult_status(
  'I confirm that I am at least 18 years old and legally able to participate in BrickCircle exchanges.',
  '2026-09-11'
);
reset role;

set local role authenticated;
set local "request.jwt.claim.sub"='80000000-0000-4000-8000-000000000082';
select public.confirm_adult_status(
  'I confirm that I am at least 18 years old and legally able to participate in BrickCircle exchanges.',
  '2026-09-11'
);
reset role;

set local role authenticated;
set local "request.jwt.claim.sub"='80000000-0000-4000-8000-000000000083';
select public.confirm_adult_status(
  'I confirm that I am at least 18 years old and legally able to participate in BrickCircle exchanges.',
  '2026-09-11'
);
reset role;

insert into public.lego_sets(set_number,name,theme) values
  ('PT1001-1','Peer Trust Set A1','Test'),
  ('PT1002-1','Peer Trust Set B1','Test'),
  ('PT1003-1','Peer Trust Set A2','Test'),
  ('PT1004-1','Peer Trust Set B2','Test'),
  ('PT1005-1','Peer Trust Set A3','Test'),
  ('PT1006-1','Peer Trust Set B3','Test')
on conflict(set_number) do nothing;

insert into public.collection_items(
  id,user_id,set_number,condition,completeness,original_box,notes,owner_photo_path,available_for_exchange
) values
  ('81000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000081','PT1001-1','Excellent',100,true,'Instructions and all accessories','80000000-0000-4000-8000-000000000081/pt-a1.jpg',true),
  ('81000000-0000-4000-8000-000000000002','80000000-0000-4000-8000-000000000082','PT1002-1','Good',98,false,'One cosmetic spare omitted','80000000-0000-4000-8000-000000000082/pt-b1.jpg',true),
  ('81000000-0000-4000-8000-000000000003','80000000-0000-4000-8000-000000000081','PT1003-1','Excellent',100,true,'Complete','80000000-0000-4000-8000-000000000081/pt-a2.jpg',false),
  ('81000000-0000-4000-8000-000000000004','80000000-0000-4000-8000-000000000082','PT1004-1','Excellent',100,true,'Complete','80000000-0000-4000-8000-000000000082/pt-b2.jpg',false),
  ('81000000-0000-4000-8000-000000000005','80000000-0000-4000-8000-000000000081','PT1005-1','Excellent',100,true,'Complete','80000000-0000-4000-8000-000000000081/pt-a3.jpg',false),
  ('81000000-0000-4000-8000-000000000006','80000000-0000-4000-8000-000000000082','PT1006-1','Excellent',100,true,'Complete','80000000-0000-4000-8000-000000000082/pt-b3.jpg',false)
on conflict(id) do nothing;

-- ---------------------------------------------------------------------------
-- Agreement snapshots: a proposal author and acceptor produce one mutually
-- accepted immutable version; meetup changes create a new accepted version.
-- ---------------------------------------------------------------------------
insert into public.exchange_cases(
  id,user_a,user_b,item_a,item_b,proposer_id,recipient_id,duration_days,opening_message,
  state,state_version,response_deadline,owner_preference_a,owner_preference_b,created_at,updated_at
) values(
  '83000000-0000-4000-8000-000000000001',
  '80000000-0000-4000-8000-000000000081','80000000-0000-4000-8000-000000000082',
  '81000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000002',
  '80000000-0000-4000-8000-000000000081','80000000-0000-4000-8000-000000000082',
  30,'Initial peer terms','PROPOSED',1,pg_catalog.now()+interval '48 hours',true,true,pg_catalog.now(),pg_catalog.now()
);
insert into public.exchange_case_item_locks(item_id,case_id,lock_kind) values
 ('81000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001','PROPOSAL_PENDING'),
 ('81000000-0000-4000-8000-000000000002','83000000-0000-4000-8000-000000000001','PROPOSAL_PENDING');
insert into public.exchange_case_conversations(case_id) values('83000000-0000-4000-8000-000000000001');

set local role authenticated;
set local "request.jwt.claim.sub"='80000000-0000-4000-8000-000000000082';
select public.exchange_case_transition(
  '83000000-0000-4000-8000-000000000001',1,'accept','pt-accept-proposal','{}'::jsonb
);
reset role;

select pg_temp.assert_true(
  (select count(*)=1 from public.exchange_case_agreement_versions where case_id='83000000-0000-4000-8000-000000000001'),
  'accepted proposal did not create exactly one agreement version'
);
select pg_temp.assert_true(
  (select accepted_by_a_at is not null and accepted_by_b_at is not null
     and proposed_by='80000000-0000-4000-8000-000000000081'
     and accepted_by='80000000-0000-4000-8000-000000000082'
   from public.exchange_case_agreement_versions
   where case_id='83000000-0000-4000-8000-000000000001' and version=1),
  'agreement version does not identify the two independent acceptances'
);
select pg_temp.assert_true(
  (select snapshot->>'duration_days'='30'
     and snapshot->'item_a'->>'set_number'='PT1001-1'
     and snapshot->'item_b'->>'set_number'='PT1002-1'
   from public.exchange_case_agreement_versions
   where case_id='83000000-0000-4000-8000-000000000001' and version=1),
  'agreement snapshot did not freeze item and duration terms'
);

set local role authenticated;
set local "request.jwt.claim.sub"='80000000-0000-4000-8000-000000000081';
do $$
declare c public.exchange_cases%rowtype;
begin
  select * into c from public.exchange_cases where id='83000000-0000-4000-8000-000000000001';
  perform public.exchange_case_transition(
    c.id,c.state_version,'propose_meetup','pt-propose-meetup',
    pg_catalog.jsonb_build_object('venue_name','Test Public Library','venue_area','Central','meetup_at',pg_catalog.now()+interval '2 days')
  );
end $$;
reset role;

set local role authenticated;
set local "request.jwt.claim.sub"='80000000-0000-4000-8000-000000000082';
do $$
declare c public.exchange_cases%rowtype;
begin
  select * into c from public.exchange_cases where id='83000000-0000-4000-8000-000000000001';
  perform public.exchange_case_transition(c.id,c.state_version,'accept_meetup','pt-accept-meetup','{}'::jsonb);
end $$;
reset role;

select pg_temp.assert_true(
  (select count(*)=2 from public.exchange_case_agreement_versions where case_id='83000000-0000-4000-8000-000000000001'),
  'accepted meetup did not create a new agreement version'
);
select pg_temp.assert_true(
  (select snapshot->'meetup'->>'venue_name'='Test Public Library'
   from public.exchange_case_agreement_versions
   where case_id='83000000-0000-4000-8000-000000000001' and version=2),
  'meetup agreement did not version the newly accepted terms'
);

do $$
begin
  begin
    update public.exchange_case_agreement_versions set snapshot=snapshot||'{"tampered":true}'::jsonb
    where case_id='83000000-0000-4000-8000-000000000001' and version=1;
    raise exception 'immutable agreement update unexpectedly succeeded';
  exception when others then
    if sqlerrm='immutable agreement update unexpectedly succeeded' then raise; end if;
    if position('immutable' in pg_catalog.lower(sqlerrm))=0 then raise; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- Pre-handoff cancellation: even one unilateral handoff confirmation must not
-- trap the set. The old state action is blocked from creating HANDOFF_ISSUE;
-- the peer cancellation RPC releases both locks idempotently.
-- ---------------------------------------------------------------------------
update public.exchange_cases set state='HANDOFF_PENDING',handoff_a_at=pg_catalog.now(),
  handoff_b_at=null,handoff_at=null,state_version=state_version+1,updated_at=pg_catalog.now()
where id='83000000-0000-4000-8000-000000000001';

set local role authenticated;
set local "request.jwt.claim.sub"='80000000-0000-4000-8000-000000000081';
do $$
declare c public.exchange_cases%rowtype;
begin
  select * into c from public.exchange_cases where id='83000000-0000-4000-8000-000000000001';
  begin
    perform public.exchange_case_transition(c.id,c.state_version,'cancel','pt-old-partial-cancel',
      pg_catalog.jsonb_build_object('reason','Changed mind before mutual handoff'));
    raise exception 'legacy partial-handoff cancel created HANDOFF_ISSUE';
  exception when others then
    if sqlerrm='legacy partial-handoff cancel created HANDOFF_ISSUE' then raise; end if;
    if position('peer-managed issue' in pg_catalog.lower(sqlerrm))=0 then raise; end if;
  end;

  select * into c from public.exchange_cases where id='83000000-0000-4000-8000-000000000001';
  perform public.cancel_exchange_case_before_mutual_handoff(
    c.id,c.state_version,'Changed mind before mutual handoff','pt-peer-cancel'
  );
end $$;
reset role;

select pg_temp.assert_true(
  (select state='CANCELLED' from public.exchange_cases where id='83000000-0000-4000-8000-000000000001'),
  'peer cancellation did not close the pre-handoff case'
);
select pg_temp.assert_true(
  not exists(select 1 from public.exchange_case_item_locks where case_id='83000000-0000-4000-8000-000000000001'),
  'peer cancellation retained item locks'
);
select pg_temp.assert_true(
  (select count(*)=2 from public.collection_items
   where id in ('81000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000002')
     and available_for_exchange and not exchange_review_required),
  'peer cancellation did not restore saved availability preferences'
);

set local role authenticated;
set local "request.jwt.claim.sub"='80000000-0000-4000-8000-000000000081';
do $$
declare before_events integer; after_events integer; c public.exchange_cases%rowtype;
begin
  select count(*) into before_events from public.exchange_case_events where idempotency_key='pt-peer-cancel';
  select * into c from public.exchange_cases where id='83000000-0000-4000-8000-000000000001';
  perform public.cancel_exchange_case_before_mutual_handoff(
    c.id,c.state_version,'Changed mind before mutual handoff','pt-peer-cancel'
  );
  select count(*) into after_events from public.exchange_case_events where idempotency_key='pt-peer-cancel';
  if before_events<>after_events then raise exception 'peer cancellation retry duplicated its audit event'; end if;
end $$;
reset role;

-- Cancelled pre-handoff cases are never review-eligible.
set local role authenticated;
set local "request.jwt.claim.sub"='80000000-0000-4000-8000-000000000081';
do $$
begin
  begin
    perform public.submit_peer_exchange_review(
      '83000000-0000-4000-8000-000000000001',5,5,5,5,5,true,'No handoff occurred','pt-review-cancelled'
    );
    raise exception 'cancelled pre-handoff case unexpectedly allowed a review';
  exception when others then
    if sqlerrm='cancelled pre-handoff case unexpectedly allowed a review' then raise; end if;
    if position('verified post-handoff completed' in pg_catalog.lower(sqlerrm))=0 then raise; end if;
  end;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- Active post-handoff case for issues, support, overdue metrics and reviews.
-- ---------------------------------------------------------------------------
insert into public.exchange_cases(
  id,user_a,user_b,item_a,item_b,proposer_id,recipient_id,duration_days,state,state_version,
  accepted_at,accepted_by,owner_preference_a,owner_preference_b,
  handoff_a_at,handoff_b_at,handoff_at,return_due_at,created_at,updated_at
) values(
  '83000000-0000-4000-8000-000000000002',
  '80000000-0000-4000-8000-000000000081','80000000-0000-4000-8000-000000000082',
  '81000000-0000-4000-8000-000000000003','81000000-0000-4000-8000-000000000004',
  '80000000-0000-4000-8000-000000000081','80000000-0000-4000-8000-000000000082',
  30,'ACTIVE',1,pg_catalog.now()-interval '30 days','80000000-0000-4000-8000-000000000082',
  true,true,'2026-09-01T00:00:00Z','2026-09-01T00:00:00Z','2026-09-01T00:00:00Z',
  '2026-10-01T00:00:00Z',pg_catalog.now()-interval '31 days',pg_catalog.now()
);
insert into public.exchange_case_item_locks(item_id,case_id,lock_kind) values
 ('81000000-0000-4000-8000-000000000003','83000000-0000-4000-8000-000000000002','ON_EXCHANGE'),
 ('81000000-0000-4000-8000-000000000004','83000000-0000-4000-8000-000000000002','ON_EXCHANGE');
insert into public.exchange_case_conversations(case_id) values('83000000-0000-4000-8000-000000000002');

-- Existing report_issue transition cannot create a new arbitration state.
set local role authenticated;
set local "request.jwt.claim.sub"='80000000-0000-4000-8000-000000000081';
do $$
declare c public.exchange_cases%rowtype;
begin
  select * into c from public.exchange_cases where id='83000000-0000-4000-8000-000000000002';
  begin
    perform public.exchange_case_transition(
      c.id,c.state_version,'report_issue','pt-old-report-issue',
      pg_catalog.jsonb_build_object('issue_type','other','note','Should use peer issue sidecar')
    );
    raise exception 'participant transitioned a normal case to DISPUTED';
  exception when others then
    if sqlerrm='participant transitioned a normal case to DISPUTED' then raise; end if;
    if position('peer-managed issue' in pg_catalog.lower(sqlerrm))=0 then raise; end if;
  end;
end $$;
reset role;

-- Peer issue sidecar keeps state and state_version unchanged.
set local role authenticated;
set local "request.jwt.claim.sub"='80000000-0000-4000-8000-000000000081';
do $$
declare before_state text; before_version bigint; after_state text; after_version bigint; payload jsonb;
begin
  select state,state_version into before_state,before_version from public.exchange_cases
   where id='83000000-0000-4000-8000-000000000002';
  payload:=public.report_exchange_case_issue(
    '83000000-0000-4000-8000-000000000002','missing_pieces',
    'Several major pieces appear to be missing after handoff.',
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('kind','photo','ref','fixture-photo-1')),
    'pt-issue-1'
  );
  select state,state_version into after_state,after_version from public.exchange_cases
   where id='83000000-0000-4000-8000-000000000002';
  if before_state<>after_state or before_version<>after_version then
    raise exception 'peer issue reporting changed canonical state';
  end if;
end $$;
reset role;

select pg_temp.assert_true(
  exists(select 1 from public.exchange_case_issues
    where case_id='83000000-0000-4000-8000-000000000002'
      and category='missing_pieces' and status='open'),
  'peer issue was not persisted'
);

-- Outsider cannot respond.
set local role authenticated;
set local "request.jwt.claim.sub"='80000000-0000-4000-8000-000000000083';
do $$
begin
  begin
    perform public.respond_exchange_case_issue(
      (select id from public.exchange_case_issues where idempotency_key='pt-issue-1'),
      'Outsider response','[]'::jsonb,'pt-outsider-response'
    );
    raise exception 'outsider unexpectedly responded to an exchange issue';
  exception when others then
    if sqlerrm='outsider unexpectedly responded to an exchange issue' then raise; end if;
  end;
end $$;
reset role;

-- Counterparty response succeeds.
set local role authenticated;
set local "request.jwt.claim.sub"='80000000-0000-4000-8000-000000000082';
select public.respond_exchange_case_issue(
  (select id from public.exchange_case_issues where idempotency_key='pt-issue-1'),
  'I found the missing bag and can return it.','[]'::jsonb,'pt-issue-response-1'
);
reset role;

-- Resolution requires both peers to acknowledge.
set local role authenticated;
set local "request.jwt.claim.sub"='80000000-0000-4000-8000-000000000081';
select public.set_exchange_case_issue_status(
  (select id from public.exchange_case_issues where idempotency_key='pt-issue-1'),
  'resolve','pt-issue-resolve-a'
);
reset role;
select pg_temp.assert_true(
  (select status='open' from public.exchange_case_issues where idempotency_key='pt-issue-1'),
  'one-sided resolution incorrectly resolved the issue'
);

set local role authenticated;
set local "request.jwt.claim.sub"='80000000-0000-4000-8000-000000000082';
select public.set_exchange_case_issue_status(
  (select id from public.exchange_case_issues where idempotency_key='pt-issue-1'),
  'resolve','pt-issue-resolve-b'
);
reset role;
select pg_temp.assert_true(
  (select status='resolved' and resolved_at is not null from public.exchange_case_issues where idempotency_key='pt-issue-1'),
  'mutual issue resolution was not recorded'
);

-- A second issue can remain unresolved even after the exchange closes.
set local role authenticated;
set local "request.jwt.claim.sub"='80000000-0000-4000-8000-000000000081';
select public.report_exchange_case_issue(
  '83000000-0000-4000-8000-000000000002','communication_problem',
  'Return coordination is still unresolved.','[]'::jsonb,'pt-issue-2'
);
reset role;
set local role authenticated;
set local "request.jwt.claim.sub"='80000000-0000-4000-8000-000000000082';
select public.set_exchange_case_issue_status(
  (select id from public.exchange_case_issues where idempotency_key='pt-issue-2'),
  'unresolved','pt-issue-unresolved'
);
reset role;

-- Support is out-of-band: state and version are unchanged.
set local role authenticated;
set local "request.jwt.claim.sub"='80000000-0000-4000-8000-000000000081';
do $$
declare before_state text; after_state text; before_version bigint; after_version bigint;
begin
  select state,state_version into before_state,before_version from public.exchange_cases
   where id='83000000-0000-4000-8000-000000000002';
  perform public.request_exchange_case_support(
    '83000000-0000-4000-8000-000000000002','technical',
    'Please help us understand a case-screen technical error.','pt-support-1'
  );
  select state,state_version into after_state,after_version from public.exchange_cases
   where id='83000000-0000-4000-8000-000000000002';
  if before_state<>after_state or before_version<>after_version then
    raise exception 'support request mutated canonical exchange state';
  end if;
end $$;
reset role;

-- Overdue days derive objectively from return_due_at and the supplied clock.
set local role authenticated;
set local "request.jwt.claim.sub"='80000000-0000-4000-8000-000000000081';
select pg_temp.assert_true(
  public.exchange_case_overdue_days(
    '83000000-0000-4000-8000-000000000002','2026-10-03T01:00:00Z'
  )=3,
  'overdue day calculation is not derived from the agreed due timestamp'
);
reset role;

-- Close without deleting or forcing resolution of the sidecar issue.
update public.exchange_cases set
  state='COMPLETED',completed_at='2026-10-03T01:00:00Z',
  return_confirmed_a_at='2026-10-03T01:00:00Z',
  return_confirmed_b_at='2026-10-03T01:00:00Z',
  state_version=state_version+1,updated_at=pg_catalog.now()
where id='83000000-0000-4000-8000-000000000002';

select pg_temp.assert_true(
  (select status='unresolved' from public.exchange_case_issues where idempotency_key='pt-issue-2'),
  'closing the exchange destroyed or adjudicated an unresolved peer issue'
);

-- ---------------------------------------------------------------------------
-- Reviews: authenticated clients cannot read/write the underlying table,
-- first review stays blind, second review reveals both, duplicates/outsiders fail.
-- ---------------------------------------------------------------------------
select pg_temp.assert_true(
  not has_table_privilege('authenticated','public.exchange_case_reviews','SELECT')
  and not has_table_privilege('authenticated','public.exchange_case_reviews','INSERT')
  and not has_table_privilege('authenticated','public.exchange_case_reviews','UPDATE')
  and not has_table_privilege('authenticated','public.exchange_case_reviews','DELETE'),
  'browser role can bypass the double-blind review RPC boundary'
);

set local role authenticated;
set local "request.jwt.claim.sub"='80000000-0000-4000-8000-000000000081';
select public.submit_peer_exchange_review(
  '83000000-0000-4000-8000-000000000002',5,4,5,5,5,true,
  'Accurate set; return coordination took longer than expected.','pt-review-a'
);
select pg_temp.assert_true(
  (select count(*)=0 from public.get_peer_exchange_reviews('83000000-0000-4000-8000-000000000002')),
  'first review leaked before the double-blind reveal condition'
);
reset role;

set local role authenticated;
set local "request.jwt.claim.sub"='80000000-0000-4000-8000-000000000083';
do $$
begin
  begin
    perform public.submit_peer_exchange_review(
      '83000000-0000-4000-8000-000000000002',5,5,5,5,5,true,'Outsider','pt-review-outsider'
    );
    raise exception 'outsider unexpectedly submitted a review';
  exception when others then
    if sqlerrm='outsider unexpectedly submitted a review' then raise; end if;
  end;
end $$;
reset role;

set local role authenticated;
set local "request.jwt.claim.sub"='80000000-0000-4000-8000-000000000082';
select public.submit_peer_exchange_review(
  '83000000-0000-4000-8000-000000000002',4,3,5,4,5,true,
  'The issue was handled directly between us.','pt-review-b'
);
select pg_temp.assert_true(
  (select count(*)=2 from public.get_peer_exchange_reviews('83000000-0000-4000-8000-000000000002')),
  'both reviews were not revealed after both peers submitted'
);
reset role;

set local role authenticated;
set local "request.jwt.claim.sub"='80000000-0000-4000-8000-000000000081';
do $$
begin
  begin
    perform public.submit_peer_exchange_review(
      '83000000-0000-4000-8000-000000000002',1,1,1,1,1,false,
      'Retaliatory duplicate should be blocked.','pt-review-a-duplicate'
    );
    raise exception 'duplicate reviewer unexpectedly replaced or added a review';
  exception when others then
    if sqlerrm='duplicate reviewer unexpectedly replaced or added a review' then raise; end if;
    if position('already reviewed' in pg_catalog.lower(sqlerrm))=0 then raise; end if;
  end;
end $$;
reset role;

-- A single old review is revealed after its 14-day deadline.
insert into public.exchange_cases(
  id,user_a,user_b,item_a,item_b,proposer_id,recipient_id,duration_days,state,state_version,
  accepted_at,accepted_by,owner_preference_a,owner_preference_b,
  handoff_a_at,handoff_b_at,handoff_at,return_due_at,return_confirmed_a_at,return_confirmed_b_at,
  completed_at,created_at,updated_at
) values(
  '83000000-0000-4000-8000-000000000003',
  '80000000-0000-4000-8000-000000000081','80000000-0000-4000-8000-000000000082',
  '81000000-0000-4000-8000-000000000005','81000000-0000-4000-8000-000000000006',
  '80000000-0000-4000-8000-000000000081','80000000-0000-4000-8000-000000000082',
  30,'COMPLETED',1,'2026-08-01T00:00:00Z','80000000-0000-4000-8000-000000000082',
  false,false,'2026-08-02T00:00:00Z','2026-08-02T00:00:00Z','2026-08-02T00:00:00Z',
  '2026-09-01T00:00:00Z','2026-08-31T12:00:00Z','2026-08-31T12:00:00Z',
  '2026-08-31T12:00:00Z','2026-08-01T00:00:00Z','2026-08-31T12:00:00Z'
);
insert into public.exchange_case_reviews(
  case_id,reviewer_id,reviewee_id,overall_rating,return_reliability,set_accuracy,
  communication,condition_accuracy,would_exchange_again,comment,reveal_after,idempotency_key,created_at
) values(
  '83000000-0000-4000-8000-000000000003',
  '80000000-0000-4000-8000-000000000081','80000000-0000-4000-8000-000000000082',
  5,5,5,5,5,true,'Old single review now past reveal deadline.',
  pg_catalog.now()-interval '1 second','pt-review-old-single',pg_catalog.now()-interval '15 days'
);

set local role authenticated;
set local "request.jwt.claim.sub"='80000000-0000-4000-8000-000000000081';
select pg_temp.assert_true(
  (select count(*)=1 from public.get_peer_exchange_reviews('83000000-0000-4000-8000-000000000003')),
  'single review did not reveal after the 14-day deadline'
);
reset role;

-- ---------------------------------------------------------------------------
-- Reputation is derived from verified objective data and only revealed reviews.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claim.sub"='80000000-0000-4000-8000-000000000081';
do $$
declare summary jsonb;
begin
  summary:=public.exchange_peer_reputation_summary('80000000-0000-4000-8000-000000000082');
  if (summary->>'completed_exchanges')::integer<>2 then raise exception 'reputation omitted completed exchanges'; end if;
  if (summary->>'return_tracked_exchanges')::integer<>2 then raise exception 'reputation omitted tracked returns'; end if;
  if (summary->>'on_time_returns')::integer<>1 then raise exception 'reputation on-time return count is incorrect'; end if;
  if (summary->>'unresolved_issue_count')::integer<>1 then raise exception 'reputation unresolved issue count is incorrect'; end if;
  if (summary->>'unique_counterparties')::integer<>1 then raise exception 'reputation unique counterparty count is incorrect'; end if;
  if (summary->>'revealed_review_count')::integer<>2 then raise exception 'reputation included hidden or omitted revealed reviews'; end if;
  if (summary->>'would_exchange_again_percentage')::numeric<>100.0 then raise exception 'reputation would-exchange-again percentage is incorrect'; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- Legacy compatibility and privilege boundaries.
-- ---------------------------------------------------------------------------
insert into public.exchange_cases(
  id,user_a,user_b,item_a,item_b,proposer_id,recipient_id,duration_days,state,state_version,
  owner_preference_a,owner_preference_b,issue_type,issue_note,created_at,updated_at
) values(
  '83000000-0000-4000-8000-000000000004',
  '80000000-0000-4000-8000-000000000081','80000000-0000-4000-8000-000000000082',
  '81000000-0000-4000-8000-000000000005','81000000-0000-4000-8000-000000000006',
  '80000000-0000-4000-8000-000000000081','80000000-0000-4000-8000-000000000082',
  30,'DISPUTED',1,false,false,'legacy_fixture','Legacy compatibility fixture',pg_catalog.now(),pg_catalog.now()
);

set local role authenticated;
set local "request.jwt.claim.sub"='80000000-0000-4000-8000-000000000081';
select pg_temp.assert_true(
  exists(select 1 from public.exchange_cases where id='83000000-0000-4000-8000-000000000004' and state='DISPUTED'),
  'legacy DISPUTED row became unreadable'
);
reset role;

select pg_temp.assert_true(
  not has_function_privilege('authenticated','public.resolve_exchange_case(uuid,bigint,text,text,text)','EXECUTE'),
  'authenticated/admin browser role can still arbitrate a disputed exchange'
);
select pg_temp.assert_true(
  has_function_privilege('service_role','public.resolve_exchange_case(uuid,bigint,text,text,text)','EXECUTE'),
  'legacy platform-integrity repair path was accidentally removed from service role'
);
select pg_temp.assert_true(
  has_function_privilege('authenticated','public.cancel_exchange_case_before_mutual_handoff(uuid,bigint,text,text)','EXECUTE')
  and has_function_privilege('authenticated','public.report_exchange_case_issue(uuid,text,text,jsonb,text)','EXECUTE')
  and has_function_privilege('authenticated','public.request_exchange_case_support(uuid,text,text,text)','EXECUTE')
  and has_function_privilege('authenticated','public.submit_peer_exchange_review(uuid,integer,integer,integer,integer,integer,boolean,text,text)','EXECUTE'),
  'peer trust RPC grants are incomplete'
);

rollback;
