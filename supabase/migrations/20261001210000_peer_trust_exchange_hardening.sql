-- BrickCircle peer-trust exchange hardening.
-- Forward-only additive migration. Normal exchanges remain peer-managed:
-- mutual agreement before handoff; issues/reputation after handoff; support is out-of-band.
-- Legacy DISPUTED/HANDOFF_ISSUE rows remain readable for compatibility.

create table if not exists public.exchange_case_agreement_versions (
  id uuid primary key default extensions.gen_random_uuid(),
  case_id uuid not null references public.exchange_cases(id) on delete restrict,
  version integer not null check (version > 0),
  agreement_kind text not null check (agreement_kind in ('proposal','meetup','return_meetup','legacy_backfill')),
  snapshot jsonb not null check (pg_catalog.jsonb_typeof(snapshot)='object'),
  proposed_by uuid not null references auth.users(id) on delete restrict,
  accepted_by uuid not null references auth.users(id) on delete restrict,
  proposed_at timestamptz not null,
  accepted_at timestamptz not null,
  accepted_by_a_at timestamptz not null,
  accepted_by_b_at timestamptz not null,
  created_at timestamptz not null default pg_catalog.now(),
  unique(case_id,version),
  constraint exchange_case_agreement_versions_distinct_parties check (proposed_by<>accepted_by)
);

create index if not exists exchange_case_agreement_versions_case_version_idx
  on public.exchange_case_agreement_versions(case_id,version desc);

create table if not exists public.exchange_case_issues (
  id uuid primary key default extensions.gen_random_uuid(),
  case_id uuid not null references public.exchange_cases(id) on delete restrict,
  reported_by uuid not null references auth.users(id) on delete restrict,
  subject_user_id uuid not null references auth.users(id) on delete restrict,
  category text not null check (category in (
    'missing_pieces','major_component_missing','unexpected_damage',
    'materially_different_condition','wrong_set_or_accessory','return_overdue',
    'communication_problem','other'
  )),
  description text not null check (pg_catalog.length(pg_catalog.btrim(description)) between 1 and 4000),
  evidence jsonb not null default '[]'::jsonb
    check (pg_catalog.jsonb_typeof(evidence) in ('array','object')),
  status text not null default 'open' check (status in ('open','resolved','unresolved')),
  resolution_ack_reporter_at timestamptz,
  resolution_ack_counterparty_at timestamptz,
  resolved_at timestamptz,
  unresolved_at timestamptz,
  idempotency_key text not null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint exchange_case_issues_distinct_subject check (reported_by<>subject_user_id),
  unique(reported_by,idempotency_key)
);

create index if not exists exchange_case_issues_case_created_idx
  on public.exchange_case_issues(case_id,created_at,id);
create index if not exists exchange_case_issues_subject_status_idx
  on public.exchange_case_issues(subject_user_id,status);

create table if not exists public.exchange_case_issue_responses (
  id uuid primary key default extensions.gen_random_uuid(),
  issue_id uuid not null references public.exchange_case_issues(id) on delete restrict,
  responder_id uuid not null references auth.users(id) on delete restrict,
  body text not null check (pg_catalog.length(pg_catalog.btrim(body)) between 1 and 4000),
  evidence jsonb not null default '[]'::jsonb
    check (pg_catalog.jsonb_typeof(evidence) in ('array','object')),
  idempotency_key text not null,
  created_at timestamptz not null default pg_catalog.now(),
  unique(responder_id,idempotency_key)
);

create index if not exists exchange_case_issue_responses_issue_created_idx
  on public.exchange_case_issue_responses(issue_id,created_at,id);

create table if not exists public.exchange_case_support_requests (
  id uuid primary key default extensions.gen_random_uuid(),
  case_id uuid not null references public.exchange_cases(id) on delete restrict,
  requested_by uuid not null references auth.users(id) on delete restrict,
  category text not null default 'other' check (category in ('technical','safety','account','other')),
  note text not null check (pg_catalog.length(pg_catalog.btrim(note)) between 1 and 4000),
  case_state_at_request text not null,
  case_state_version_at_request bigint not null,
  idempotency_key text not null,
  created_at timestamptz not null default pg_catalog.now(),
  closed_at timestamptz,
  unique(requested_by,idempotency_key)
);

create index if not exists exchange_case_support_requests_case_created_idx
  on public.exchange_case_support_requests(case_id,created_at,id);

create table if not exists public.exchange_case_reviews (
  id uuid primary key default extensions.gen_random_uuid(),
  case_id uuid not null references public.exchange_cases(id) on delete restrict,
  reviewer_id uuid not null references auth.users(id) on delete restrict,
  reviewee_id uuid not null references auth.users(id) on delete restrict,
  overall_rating integer not null check (overall_rating between 1 and 5),
  return_reliability integer not null check (return_reliability between 1 and 5),
  set_accuracy integer not null check (set_accuracy between 1 and 5),
  communication integer not null check (communication between 1 and 5),
  condition_accuracy integer not null check (condition_accuracy between 1 and 5),
  would_exchange_again boolean not null,
  comment text check (comment is null or pg_catalog.length(comment)<=2000),
  reveal_after timestamptz not null,
  idempotency_key text not null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint exchange_case_reviews_distinct_users check (reviewer_id<>reviewee_id),
  unique(case_id,reviewer_id),
  unique(reviewer_id,idempotency_key)
);

create index if not exists exchange_case_reviews_reviewee_created_idx
  on public.exchange_case_reviews(reviewee_id,created_at desc);

alter table public.exchange_case_agreement_versions enable row level security;
alter table public.exchange_case_issues enable row level security;
alter table public.exchange_case_issue_responses enable row level security;
alter table public.exchange_case_support_requests enable row level security;
alter table public.exchange_case_reviews enable row level security;

revoke all on public.exchange_case_agreement_versions,
  public.exchange_case_issues,public.exchange_case_issue_responses,
  public.exchange_case_support_requests,public.exchange_case_reviews
  from public,anon,authenticated;

grant select on public.exchange_case_agreement_versions,
  public.exchange_case_issues,public.exchange_case_issue_responses,
  public.exchange_case_support_requests to authenticated;

grant all on public.exchange_case_agreement_versions,
  public.exchange_case_issues,public.exchange_case_issue_responses,
  public.exchange_case_support_requests,public.exchange_case_reviews to service_role;

drop policy if exists "peer participants read agreement versions" on public.exchange_case_agreement_versions;
create policy "peer participants read agreement versions"
on public.exchange_case_agreement_versions for select to authenticated
using (exists(
  select 1 from public.exchange_cases c
  where c.id=case_id and (select auth.uid()) in (c.user_a,c.user_b)
));

drop policy if exists "peer participants read issues" on public.exchange_case_issues;
create policy "peer participants read issues"
on public.exchange_case_issues for select to authenticated
using (exists(
  select 1 from public.exchange_cases c
  where c.id=case_id and (select auth.uid()) in (c.user_a,c.user_b)
));

drop policy if exists "peer participants read issue responses" on public.exchange_case_issue_responses;
create policy "peer participants read issue responses"
on public.exchange_case_issue_responses for select to authenticated
using (exists(
  select 1 from public.exchange_case_issues i
  join public.exchange_cases c on c.id=i.case_id
  where i.id=issue_id and (select auth.uid()) in (c.user_a,c.user_b)
));

drop policy if exists "peer participants read support requests" on public.exchange_case_support_requests;
create policy "peer participants read support requests"
on public.exchange_case_support_requests for select to authenticated
using (exists(
  select 1 from public.exchange_cases c
  where c.id=case_id and (select auth.uid()) in (c.user_a,c.user_b)
));

-- Agreement rows are append-only. They are written only by the server-owned trigger.
create or replace function private.bc_peer_agreement_immutable()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  raise exception 'Exchange agreement versions are immutable';
end;
$$;

drop trigger if exists bc_peer_agreement_immutable_guard on public.exchange_case_agreement_versions;
create trigger bc_peer_agreement_immutable_guard
before update or delete on public.exchange_case_agreement_versions
for each row execute function private.bc_peer_agreement_immutable();

-- Backfill already-accepted canonical cases before enabling the capture trigger.
insert into public.exchange_case_agreement_versions(
  case_id,version,agreement_kind,snapshot,proposed_by,accepted_by,
  proposed_at,accepted_at,accepted_by_a_at,accepted_by_b_at
)
select
  c.id,1,'legacy_backfill',
  pg_catalog.jsonb_build_object(
    'agreement_kind','legacy_backfill',
    'backfilled',true,
    'snapshot_source','current_records_at_peer_trust_migration',
    'item_a',pg_catalog.jsonb_build_object(
      'id',c.item_a,'set_number',ia.set_number,'condition',ia.condition,
      'completeness',ia.completeness,'original_box',ia.original_box,'notes',ia.notes
    ),
    'item_b',pg_catalog.jsonb_build_object(
      'id',c.item_b,'set_number',ib.set_number,'condition',ib.condition,
      'completeness',ib.completeness,'original_box',ib.original_box,'notes',ib.notes
    ),
    'duration_days',c.duration_days,
    'return_due_rule','handoff_at_plus_duration_days',
    'meetup',pg_catalog.jsonb_build_object(
      'venue_name',c.meetup_venue_name,'venue_area',c.meetup_venue_area,'meetup_at',c.meetup_at
    )
  ),
  case when coalesce(c.accepted_by,c.recipient_id)=c.user_a then c.user_b else c.user_a end,
  coalesce(c.accepted_by,c.recipient_id),
  coalesce(c.accepted_at,c.created_at),
  coalesce(c.accepted_at,c.created_at),
  coalesce(c.accepted_at,c.created_at),
  coalesce(c.accepted_at,c.created_at)
from public.exchange_cases c
join public.collection_items ia on ia.id=c.item_a
join public.collection_items ib on ib.id=c.item_b
where c.accepted_at is not null
  and coalesce(c.accepted_by,c.recipient_id) in (c.user_a,c.user_b)
  and not exists(
    select 1 from public.exchange_case_agreement_versions v where v.case_id=c.id
  );

create or replace function private.bc_capture_peer_agreement_version()
returns trigger language plpgsql security definer set search_path=''
as $$
declare
  agreement_kind text;
  proposal_author uuid;
  acceptor uuid;
  proposal_time timestamptz;
  accept_time timestamptz;
  a_time timestamptz;
  b_time timestamptz;
  next_version integer;
  base_snapshot jsonb;
  next_snapshot jsonb;
  ia public.collection_items%rowtype;
  ib public.collection_items%rowtype;
begin
  if old.state='PROPOSED' and new.state='ACCEPTED' then
    agreement_kind:='proposal';
    proposal_author:=old.proposer_id;
    acceptor:=new.accepted_by;
    proposal_time:=old.updated_at;
    accept_time:=coalesce(new.accepted_at,new.updated_at);
    select * into ia from public.collection_items where id=new.item_a;
    select * into ib from public.collection_items where id=new.item_b;
    next_snapshot:=pg_catalog.jsonb_build_object(
      'agreement_kind','proposal',
      'item_a',pg_catalog.jsonb_build_object(
        'id',new.item_a,'set_number',ia.set_number,'condition',ia.condition,
        'completeness',ia.completeness,'original_box',ia.original_box,'notes',ia.notes
      ),
      'item_b',pg_catalog.jsonb_build_object(
        'id',new.item_b,'set_number',ib.set_number,'condition',ib.condition,
        'completeness',ib.completeness,'original_box',ib.original_box,'notes',ib.notes
      ),
      'duration_days',new.duration_days,
      'return_due_rule','handoff_at_plus_duration_days',
      'opening_message',new.opening_message
    );
  elsif old.state='MEETUP_PLANNING' and new.state='MEETUP_CONFIRMED' then
    agreement_kind:='meetup';
    proposal_author:=old.meetup_proposed_by;
    acceptor:=new.meetup_accepted_by;
    proposal_time:=old.updated_at;
    accept_time:=new.updated_at;
    select v.snapshot into base_snapshot
      from public.exchange_case_agreement_versions v
      where v.case_id=new.id order by v.version desc limit 1;
    if base_snapshot is null then raise exception 'Accepted proposal agreement is missing'; end if;
    next_snapshot:=base_snapshot || pg_catalog.jsonb_build_object(
      'agreement_kind','meetup',
      'meetup',pg_catalog.jsonb_build_object(
        'venue_name',new.meetup_venue_name,'venue_area',new.meetup_venue_area,'meetup_at',new.meetup_at
      )
    );
  elsif old.state='RETURN_PLANNING' and new.state='RETURN_INSPECTION' then
    agreement_kind:='return_meetup';
    proposal_author:=old.return_proposed_by;
    acceptor:=new.return_accepted_by;
    proposal_time:=old.updated_at;
    accept_time:=new.updated_at;
    select v.snapshot into base_snapshot
      from public.exchange_case_agreement_versions v
      where v.case_id=new.id order by v.version desc limit 1;
    if base_snapshot is null then raise exception 'Accepted exchange agreement is missing'; end if;
    next_snapshot:=base_snapshot || pg_catalog.jsonb_build_object(
      'agreement_kind','return_meetup',
      'return_meetup',pg_catalog.jsonb_build_object(
        'venue_name',new.return_venue_name,'venue_area',new.return_venue_area,'meetup_at',new.return_meetup_at
      )
    );
  else
    return new;
  end if;

  if proposal_author is null or acceptor is null
     or proposal_author=acceptor
     or proposal_author not in (new.user_a,new.user_b)
     or acceptor not in (new.user_a,new.user_b) then
    raise exception 'Both exchange participants must accept identical agreement terms';
  end if;

  a_time:=case when proposal_author=new.user_a then proposal_time else accept_time end;
  b_time:=case when proposal_author=new.user_b then proposal_time else accept_time end;

  select coalesce(pg_catalog.max(v.version),0)+1 into next_version
  from public.exchange_case_agreement_versions v where v.case_id=new.id;

  insert into public.exchange_case_agreement_versions(
    case_id,version,agreement_kind,snapshot,proposed_by,accepted_by,
    proposed_at,accepted_at,accepted_by_a_at,accepted_by_b_at
  ) values(
    new.id,next_version,agreement_kind,next_snapshot,proposal_author,acceptor,
    proposal_time,accept_time,a_time,b_time
  );
  return new;
end;
$$;

drop trigger if exists bc_capture_peer_agreement_version on public.exchange_cases;
create trigger bc_capture_peer_agreement_version
after update of state on public.exchange_cases
for each row execute function private.bc_capture_peer_agreement_version();

-- Legacy dispute states remain readable, but authenticated peer actions cannot create new ones.
create or replace function private.bc_guard_no_new_peer_dispute_state()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if old.state not in ('DISPUTED','HANDOFF_ISSUE')
     and new.state in ('DISPUTED','HANDOFF_ISSUE')
     and auth.uid() is not null then
    raise exception 'Use peer-managed issue reporting; exchange state is not an arbitration decision';
  end if;
  return new;
end;
$$;

drop trigger if exists bc_guard_no_new_peer_dispute_state on public.exchange_cases;
create trigger bc_guard_no_new_peer_dispute_state
before update of state on public.exchange_cases
for each row execute function private.bc_guard_no_new_peer_dispute_state();

-- Either participant can abandon the exchange until both handoff confirmations exist.
create or replace function public.cancel_exchange_case_before_mutual_handoff(
  p_case_id uuid,p_expected_version bigint,p_reason text,p_idempotency_key text
)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  me uuid:=auth.uid();
  c public.exchange_cases%rowtype;
  prior public.exchange_case_events%rowtype;
  before_state text;
  clean_key text:=nullif(pg_catalog.btrim(p_idempotency_key),'');
  clean_reason text:=coalesce(nullif(pg_catalog.btrim(p_reason),''),'Peer cancellation before mutual handoff');
  event_id uuid;
  other_user uuid;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if clean_key is null then raise exception 'An idempotency key is required'; end if;

  select * into prior from public.exchange_case_events where idempotency_key=clean_key;
  if found then
    if prior.case_id<>p_case_id or prior.actor_user_id<>me
       or prior.event_type<>'peer_cancel_before_mutual_handoff' then
      raise exception 'Idempotency key belongs to another exchange action';
    end if;
    return private.bc_case_snapshot(p_case_id,true);
  end if;

  select * into c from public.exchange_cases where id=p_case_id for update;
  if not found or me not in (c.user_a,c.user_b) then raise exception 'Exchange case unavailable'; end if;
  if c.migration_review_required then raise exception 'This legacy case requires platform-integrity reconciliation'; end if;
  if p_expected_version is null or p_expected_version<>c.state_version then
    raise exception 'This exchange changed. Refresh and try again.';
  end if;
  if c.handoff_at is not null or (c.handoff_a_at is not null and c.handoff_b_at is not null) then
    raise exception 'Both physical handoffs are already confirmed; arrange a return instead';
  end if;
  if c.state not in ('PROPOSED','ACCEPTED','MEETUP_PLANNING','MEETUP_CONFIRMED','INSPECTION','HANDOFF_PENDING') then
    raise exception 'This exchange can no longer be cancelled before mutual handoff';
  end if;

  before_state:=c.state;
  other_user:=private.bc_case_other_user(c,me);
  update public.exchange_cases set
    state='CANCELLED',cancelled_at=pg_catalog.now(),cancelled_reason=clean_reason,
    state_version=state_version+1,updated_at=pg_catalog.now()
  where id=c.id returning * into c;

  perform private.bc_restore_case_preferences(c);
  update public.exchange_case_conversations
    set archived_at=pg_catalog.now() where case_id=c.id and archived_at is null;

  insert into public.exchange_case_events(
    case_id,event_type,previous_state,resulting_state,actor_user_id,state_version,idempotency_key,metadata
  ) values(
    c.id,'peer_cancel_before_mutual_handoff',before_state,'CANCELLED',me,c.state_version,clean_key,
    pg_catalog.jsonb_build_object(
      'reason',clean_reason,
      'partial_handoff_a_at',c.handoff_a_at,
      'partial_handoff_b_at',c.handoff_b_at
    )
  ) returning id into event_id;

  perform private.bc_case_notify(c,event_id,other_user,'exchange_cancelled','Exchange cancelled',
    'The exchange was cancelled before mutual handoff. The set holds were released.',me);
  return private.bc_case_snapshot(c.id,false);
end;
$$;

create or replace function public.report_exchange_case_issue(
  p_case_id uuid,p_category text,p_description text,p_evidence jsonb,p_idempotency_key text
)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  me uuid:=auth.uid(); c public.exchange_cases%rowtype; created_issue public.exchange_case_issues%rowtype;
  clean_key text:=nullif(pg_catalog.btrim(p_idempotency_key),'');
  clean_category text:=pg_catalog.lower(pg_catalog.btrim(p_category));
  clean_description text:=nullif(pg_catalog.btrim(p_description),'');
  other_user uuid; event_id uuid;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if clean_key is null then raise exception 'An idempotency key is required'; end if;
  select * into created_issue from public.exchange_case_issues where reported_by=me and idempotency_key=clean_key;
  if found then
    if created_issue.case_id<>p_case_id then raise exception 'Idempotency key belongs to another issue'; end if;
    return pg_catalog.jsonb_build_object('ok',true,'idempotent',true,'issue',pg_catalog.to_jsonb(created_issue));
  end if;
  if clean_category not in (
    'missing_pieces','major_component_missing','unexpected_damage','materially_different_condition',
    'wrong_set_or_accessory','return_overdue','communication_problem','other'
  ) then raise exception 'Choose a supported issue category'; end if;
  if clean_description is null then raise exception 'Describe the issue'; end if;

  select * into c from public.exchange_cases where id=p_case_id for share;
  if not found or me not in (c.user_a,c.user_b) then raise exception 'Exchange case unavailable'; end if;
  if c.handoff_at is null then
    raise exception 'Before mutual physical handoff, cancel the exchange instead of opening an issue';
  end if;
  other_user:=private.bc_case_other_user(c,me);

  insert into public.exchange_case_issues(
    case_id,reported_by,subject_user_id,category,description,evidence,idempotency_key
  ) values(
    c.id,me,other_user,clean_category,clean_description,coalesce(p_evidence,'[]'::jsonb),clean_key
  ) returning * into created_issue;

  insert into public.exchange_case_events(
    case_id,event_type,previous_state,resulting_state,actor_user_id,state_version,idempotency_key,metadata
  ) values(
    c.id,'peer_issue_reported',c.state,c.state,me,c.state_version,clean_key,
    pg_catalog.jsonb_build_object('issue_id',created_issue.id,'category',clean_category)
  ) returning id into event_id;

  perform private.bc_case_notify(c,event_id,other_user,'exchange_issue_reported','Exchange issue reported',
    'The other collector recorded an issue. Use the case conversation and issue record to work it out together.',me);
  return pg_catalog.jsonb_build_object('ok',true,'idempotent',false,'issue',pg_catalog.to_jsonb(created_issue));
end;
$$;

create or replace function public.respond_exchange_case_issue(
  p_issue_id uuid,p_body text,p_evidence jsonb,p_idempotency_key text
)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  me uuid:=auth.uid(); i public.exchange_case_issues%rowtype; c public.exchange_cases%rowtype;
  created_response public.exchange_case_issue_responses%rowtype;
  clean_key text:=nullif(pg_catalog.btrim(p_idempotency_key),'');
  clean_body text:=nullif(pg_catalog.btrim(p_body),''); event_id uuid; other_user uuid;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if clean_key is null then raise exception 'An idempotency key is required'; end if;
  select * into created_response from public.exchange_case_issue_responses where responder_id=me and idempotency_key=clean_key;
  if found then
    if created_response.issue_id<>p_issue_id then raise exception 'Idempotency key belongs to another issue response'; end if;
    return pg_catalog.jsonb_build_object('ok',true,'idempotent',true,'response',pg_catalog.to_jsonb(created_response));
  end if;
  if clean_body is null then raise exception 'A response cannot be blank'; end if;

  select * into i from public.exchange_case_issues where id=p_issue_id for share;
  if not found then raise exception 'Issue unavailable'; end if;
  select * into c from public.exchange_cases where id=i.case_id for share;
  if me not in (c.user_a,c.user_b) then raise exception 'Issue unavailable'; end if;
  if i.status='resolved' then raise exception 'This issue is already resolved'; end if;

  insert into public.exchange_case_issue_responses(issue_id,responder_id,body,evidence,idempotency_key)
  values(i.id,me,clean_body,coalesce(p_evidence,'[]'::jsonb),clean_key)
  returning * into created_response;

  other_user:=private.bc_case_other_user(c,me);
  insert into public.exchange_case_events(
    case_id,event_type,previous_state,resulting_state,actor_user_id,state_version,idempotency_key,metadata
  ) values(c.id,'peer_issue_response',c.state,c.state,me,c.state_version,clean_key,
    pg_catalog.jsonb_build_object('issue_id',i.id,'response_id',created_response.id))
  returning id into event_id;

  perform private.bc_case_notify(c,event_id,other_user,'exchange_issue_response','New issue response',
    'The other collector responded to an exchange issue.',me);
  return pg_catalog.jsonb_build_object('ok',true,'idempotent',false,'response',pg_catalog.to_jsonb(created_response));
end;
$$;

create or replace function public.set_exchange_case_issue_status(
  p_issue_id uuid,p_action text,p_idempotency_key text
)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  me uuid:=auth.uid(); i public.exchange_case_issues%rowtype; c public.exchange_cases%rowtype;
  clean_action text:=pg_catalog.lower(pg_catalog.btrim(p_action));
  clean_key text:=nullif(pg_catalog.btrim(p_idempotency_key),'');
  prior public.exchange_case_events%rowtype; event_id uuid;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if clean_key is null then raise exception 'An idempotency key is required'; end if;
  if clean_action not in ('resolve','unresolved') then raise exception 'Choose resolve or unresolved'; end if;

  select * into prior from public.exchange_case_events where idempotency_key=clean_key;
  if found then
    select * into i from public.exchange_case_issues where id=p_issue_id;
    if prior.case_id<>i.case_id or prior.actor_user_id<>me or prior.event_type<>'peer_issue_status' then
      raise exception 'Idempotency key belongs to another exchange action';
    end if;
    return pg_catalog.jsonb_build_object('ok',true,'idempotent',true,'issue',pg_catalog.to_jsonb(i));
  end if;

  select * into i from public.exchange_case_issues where id=p_issue_id for update;
  if not found then raise exception 'Issue unavailable'; end if;
  select * into c from public.exchange_cases where id=i.case_id for share;
  if me not in (c.user_a,c.user_b) then raise exception 'Issue unavailable'; end if;

  if clean_action='unresolved' then
    update public.exchange_case_issues set status='unresolved',unresolved_at=pg_catalog.now(),
      resolved_at=null,updated_at=pg_catalog.now()
    where id=i.id returning * into i;
  else
    update public.exchange_case_issues set
      resolution_ack_reporter_at=case when me=reported_by then coalesce(resolution_ack_reporter_at,pg_catalog.now()) else resolution_ack_reporter_at end,
      resolution_ack_counterparty_at=case when me<>reported_by then coalesce(resolution_ack_counterparty_at,pg_catalog.now()) else resolution_ack_counterparty_at end,
      status=case
        when (case when me=reported_by then pg_catalog.now() else resolution_ack_reporter_at end) is not null
         and (case when me<>reported_by then pg_catalog.now() else resolution_ack_counterparty_at end) is not null
        then 'resolved' else 'open' end,
      resolved_at=case
        when (case when me=reported_by then pg_catalog.now() else resolution_ack_reporter_at end) is not null
         and (case when me<>reported_by then pg_catalog.now() else resolution_ack_counterparty_at end) is not null
        then pg_catalog.now() else null end,
      unresolved_at=null,updated_at=pg_catalog.now()
    where id=i.id returning * into i;
  end if;

  insert into public.exchange_case_events(
    case_id,event_type,previous_state,resulting_state,actor_user_id,state_version,idempotency_key,metadata
  ) values(c.id,'peer_issue_status',c.state,c.state,me,c.state_version,clean_key,
    pg_catalog.jsonb_build_object('issue_id',i.id,'action',clean_action,'issue_status',i.status))
  returning id into event_id;

  return pg_catalog.jsonb_build_object('ok',true,'idempotent',false,'issue',pg_catalog.to_jsonb(i));
end;
$$;

create or replace function public.request_exchange_case_support(
  p_case_id uuid,p_category text,p_note text,p_idempotency_key text
)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  me uuid:=auth.uid(); c public.exchange_cases%rowtype;
  req public.exchange_case_support_requests%rowtype;
  clean_key text:=nullif(pg_catalog.btrim(p_idempotency_key),'');
  clean_category text:=pg_catalog.lower(pg_catalog.btrim(coalesce(p_category,'other')));
  clean_note text:=nullif(pg_catalog.btrim(p_note),''); event_id uuid;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if clean_key is null then raise exception 'An idempotency key is required'; end if;
  select * into req from public.exchange_case_support_requests where requested_by=me and idempotency_key=clean_key;
  if found then
    if req.case_id<>p_case_id then raise exception 'Idempotency key belongs to another support request'; end if;
    return pg_catalog.jsonb_build_object('ok',true,'idempotent',true,'support_request',pg_catalog.to_jsonb(req));
  end if;
  if clean_category not in ('technical','safety','account','other') then raise exception 'Choose a supported support category'; end if;
  if clean_note is null then raise exception 'Describe what help you need'; end if;

  select * into c from public.exchange_cases where id=p_case_id for share;
  if not found or me not in (c.user_a,c.user_b) then raise exception 'Exchange case unavailable'; end if;

  insert into public.exchange_case_support_requests(
    case_id,requested_by,category,note,case_state_at_request,case_state_version_at_request,idempotency_key
  ) values(c.id,me,clean_category,clean_note,c.state,c.state_version,clean_key)
  returning * into req;

  insert into public.exchange_case_events(
    case_id,event_type,previous_state,resulting_state,actor_user_id,state_version,idempotency_key,metadata
  ) values(c.id,'support_requested_out_of_band',c.state,c.state,me,c.state_version,clean_key,
    pg_catalog.jsonb_build_object('support_request_id',req.id,'category',clean_category))
  returning id into event_id;

  return pg_catalog.jsonb_build_object(
    'ok',true,'idempotent',false,'support_request',pg_catalog.to_jsonb(req),
    'exchange_state_unchanged',true
  );
end;
$$;

create or replace function public.exchange_case_overdue_days(
  p_case_id uuid,p_as_of timestamptz default pg_catalog.now()
)
returns integer language plpgsql stable security definer set search_path=''
as $$
declare
  me uuid:=auth.uid(); c public.exchange_cases%rowtype; effective_at timestamptz; seconds_late numeric;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  select * into c from public.exchange_cases where id=p_case_id;
  if not found or me not in (c.user_a,c.user_b) then raise exception 'Exchange case unavailable'; end if;
  if c.return_due_at is null then return 0; end if;
  if c.return_confirmed_a_at is not null and c.return_confirmed_b_at is not null then
    effective_at:=greatest(c.return_confirmed_a_at,c.return_confirmed_b_at);
  elsif c.completed_at is not null then
    effective_at:=c.completed_at;
  else
    effective_at:=coalesce(p_as_of,pg_catalog.now());
  end if;
  seconds_late:=extract(epoch from (effective_at-c.return_due_at));
  if seconds_late<=0 then return 0; end if;
  return pg_catalog.ceil(seconds_late/86400.0)::integer;
end;
$$;

create or replace function public.submit_peer_exchange_review(
  p_case_id uuid,p_overall_rating integer,p_return_reliability integer,
  p_set_accuracy integer,p_communication integer,p_condition_accuracy integer,
  p_would_exchange_again boolean,p_comment text,p_idempotency_key text
)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  me uuid:=auth.uid(); c public.exchange_cases%rowtype; other_user uuid;
  r public.exchange_case_reviews%rowtype; first_reveal timestamptz;
  clean_key text:=nullif(pg_catalog.btrim(p_idempotency_key),''); event_id uuid; reveal_ready boolean;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if clean_key is null then raise exception 'An idempotency key is required'; end if;
  if p_overall_rating not between 1 and 5 or p_return_reliability not between 1 and 5
     or p_set_accuracy not between 1 and 5 or p_communication not between 1 and 5
     or p_condition_accuracy not between 1 and 5 then
    raise exception 'All ratings must be between 1 and 5';
  end if;
  select * into r from public.exchange_case_reviews where reviewer_id=me and idempotency_key=clean_key;
  if found then
    if r.case_id<>p_case_id then raise exception 'Idempotency key belongs to another review'; end if;
    return pg_catalog.jsonb_build_object('ok',true,'idempotent',true,'review',pg_catalog.to_jsonb(r));
  end if;

  select * into c from public.exchange_cases where id=p_case_id for share;
  if not found or me not in (c.user_a,c.user_b) then raise exception 'Exchange case unavailable'; end if;
  if c.state<>'COMPLETED' or c.handoff_at is null then
    raise exception 'Reviews require a verified post-handoff completed exchange';
  end if;
  other_user:=private.bc_case_other_user(c,me);

  select pg_catalog.min(existing.reveal_after) into first_reveal
  from public.exchange_case_reviews existing where existing.case_id=c.id;
  first_reveal:=coalesce(first_reveal,pg_catalog.now()+interval '14 days');

  insert into public.exchange_case_reviews(
    case_id,reviewer_id,reviewee_id,overall_rating,return_reliability,set_accuracy,
    communication,condition_accuracy,would_exchange_again,comment,reveal_after,idempotency_key
  ) values(
    c.id,me,other_user,p_overall_rating,p_return_reliability,p_set_accuracy,
    p_communication,p_condition_accuracy,p_would_exchange_again,
    nullif(pg_catalog.btrim(p_comment),''),first_reveal,clean_key
  ) returning * into r;

  insert into public.exchange_case_events(
    case_id,event_type,previous_state,resulting_state,actor_user_id,state_version,idempotency_key,metadata
  ) values(c.id,'peer_review_submitted',c.state,c.state,me,c.state_version,clean_key,
    pg_catalog.jsonb_build_object('review_id',r.id))
  returning id into event_id;

  select ((select pg_catalog.count(*) from public.exchange_case_reviews x where x.case_id=c.id)>=2
          or pg_catalog.now()>=first_reveal) into reveal_ready;

  return pg_catalog.jsonb_build_object(
    'ok',true,'idempotent',false,'review',pg_catalog.to_jsonb(r),'counterparty_reviews_revealed',reveal_ready
  );
exception when unique_violation then
  raise exception 'You already reviewed this exchange';
end;
$$;

create or replace function public.get_peer_exchange_reviews(p_case_id uuid)
returns table(
  id uuid,case_id uuid,reviewer_id uuid,reviewee_id uuid,overall_rating integer,
  return_reliability integer,set_accuracy integer,communication integer,
  condition_accuracy integer,would_exchange_again boolean,comment text,created_at timestamptz
)
language plpgsql stable security definer set search_path=''
as $$
declare
  me uuid:=auth.uid(); c public.exchange_cases%rowtype; review_count integer; first_reveal timestamptz;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  select * into c from public.exchange_cases where public.exchange_cases.id=p_case_id;
  if not found or me not in (c.user_a,c.user_b) then raise exception 'Exchange case unavailable'; end if;

  select pg_catalog.count(*),pg_catalog.min(r.reveal_after)
    into review_count,first_reveal
    from public.exchange_case_reviews r where r.case_id=p_case_id;

  if review_count<2 and (first_reveal is null or pg_catalog.now()<first_reveal) then
    return;
  end if;

  return query
  select r.id,r.case_id,r.reviewer_id,r.reviewee_id,r.overall_rating,
    r.return_reliability,r.set_accuracy,r.communication,r.condition_accuracy,
    r.would_exchange_again,r.comment,r.created_at
  from public.exchange_case_reviews r where r.case_id=p_case_id order by r.created_at,r.id;
end;
$$;

create or replace function public.exchange_peer_reputation_summary(p_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare
  me uuid:=auth.uid();
  completed_count integer:=0;
  tracked_returns integer:=0;
  on_time_returns integer:=0;
  unique_counterparties integer:=0;
  unresolved_issues integer:=0;
  revealed_reviews integer:=0;
  avg_rating numeric;
  exchange_again_pct numeric;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if not exists(select 1 from public.profiles p where p.id=p_user_id) then raise exception 'Collector unavailable'; end if;

  select
    pg_catalog.count(*)::integer,
    pg_catalog.count(*) filter (where c.return_due_at is not null)::integer,
    pg_catalog.count(*) filter (
      where c.return_due_at is not null
        and coalesce(greatest(c.return_confirmed_a_at,c.return_confirmed_b_at),c.completed_at)<=c.return_due_at
    )::integer,
    pg_catalog.count(distinct case when c.user_a=p_user_id then c.user_b else c.user_a end)::integer
  into completed_count,tracked_returns,on_time_returns,unique_counterparties
  from public.exchange_cases c
  where c.state='COMPLETED' and p_user_id in (c.user_a,c.user_b);

  select pg_catalog.count(*)::integer into unresolved_issues
  from public.exchange_case_issues i
  where i.subject_user_id=p_user_id and i.status<>'resolved';

  select
    pg_catalog.count(*)::integer,
    pg_catalog.round(pg_catalog.avg(r.overall_rating)::numeric,2),
    pg_catalog.round(
      (100.0*pg_catalog.count(*) filter (where r.would_exchange_again))
      / nullif(pg_catalog.count(*),0),1
    )
  into revealed_reviews,avg_rating,exchange_again_pct
  from public.exchange_case_reviews r
  where r.reviewee_id=p_user_id
    and (
      pg_catalog.now()>=r.reveal_after
      or exists(
        select 1 from public.exchange_case_reviews counterpart
        where counterpart.case_id=r.case_id and counterpart.reviewer_id<>r.reviewer_id
      )
    );

  return pg_catalog.jsonb_build_object(
    'user_id',p_user_id,
    'completed_exchanges',completed_count,
    'return_tracked_exchanges',tracked_returns,
    'on_time_returns',on_time_returns,
    'on_time_return_percentage',case when tracked_returns=0 then null
      else pg_catalog.round((100.0*on_time_returns/tracked_returns)::numeric,1) end,
    'unresolved_issue_count',unresolved_issues,
    'unique_counterparties',unique_counterparties,
    'revealed_review_count',revealed_reviews,
    'overall_rating',avg_rating,
    'would_exchange_again_percentage',exchange_again_pct
  );
end;
$$;

-- Browser access is RPC-only for writes; review text is never directly selectable.
revoke all on function private.bc_peer_agreement_immutable() from public,anon,authenticated;
revoke all on function private.bc_capture_peer_agreement_version() from public,anon,authenticated;
revoke all on function private.bc_guard_no_new_peer_dispute_state() from public,anon,authenticated;

revoke all on function public.cancel_exchange_case_before_mutual_handoff(uuid,bigint,text,text) from public,anon;
revoke all on function public.report_exchange_case_issue(uuid,text,text,jsonb,text) from public,anon;
revoke all on function public.respond_exchange_case_issue(uuid,text,jsonb,text) from public,anon;
revoke all on function public.set_exchange_case_issue_status(uuid,text,text) from public,anon;
revoke all on function public.request_exchange_case_support(uuid,text,text,text) from public,anon;
revoke all on function public.exchange_case_overdue_days(uuid,timestamptz) from public,anon;
revoke all on function public.submit_peer_exchange_review(uuid,integer,integer,integer,integer,integer,boolean,text,text) from public,anon;
revoke all on function public.get_peer_exchange_reviews(uuid) from public,anon;
revoke all on function public.exchange_peer_reputation_summary(uuid) from public,anon;

grant execute on function public.cancel_exchange_case_before_mutual_handoff(uuid,bigint,text,text),
  public.report_exchange_case_issue(uuid,text,text,jsonb,text),
  public.respond_exchange_case_issue(uuid,text,jsonb,text),
  public.set_exchange_case_issue_status(uuid,text,text),
  public.request_exchange_case_support(uuid,text,text,text),
  public.exchange_case_overdue_days(uuid,timestamptz),
  public.submit_peer_exchange_review(uuid,integer,integer,integer,integer,integer,boolean,text,text),
  public.get_peer_exchange_reviews(uuid),
  public.exchange_peer_reputation_summary(uuid)
to authenticated;

-- Normal authenticated admins/peers do not arbitrate exchange outcomes.
-- Keep service-role access only for legacy/platform-integrity repair.
do $$
begin
  if pg_catalog.to_regprocedure('public.resolve_exchange_case(uuid,bigint,text,text,text)') is not null then
    execute 'revoke execute on function public.resolve_exchange_case(uuid,bigint,text,text,text) from public,anon,authenticated';
    execute 'grant execute on function public.resolve_exchange_case(uuid,bigint,text,text,text) to service_role';
  end if;
end;
$$;

comment on table public.exchange_case_agreement_versions is
  'Immutable mutually accepted exchange agreement snapshots. A new version is recorded only when both parties accept the same proposal/meetup terms.';
comment on table public.exchange_case_issues is
  'Peer-managed post-handoff issue records. Issue status does not alter custody or the canonical exchange lifecycle.';
comment on table public.exchange_case_support_requests is
  'Out-of-band last-resort support requests. Creating a support request never changes exchange case state.';
comment on table public.exchange_case_reviews is
  'Verified structured peer reviews. Review content is double-blind and exposed only through get_peer_exchange_reviews().';
comment on function public.exchange_peer_reputation_summary(uuid) is
  'Objective peer reputation summary from verified completed exchanges, return timestamps, peer issues, and revealed reviews.';

notify pgrst,'reload schema';
