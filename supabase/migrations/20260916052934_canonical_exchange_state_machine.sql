-- BrickCircle canonical reciprocal exchange aggregate.
-- Forward-only: legacy lifecycle tables are preserved for compatibility and audit.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

alter table public.collection_items
  add column if not exists exchange_review_required boolean not null default false;

create table public.exchange_cases (
  id uuid primary key default extensions.gen_random_uuid(),
  match_key text generated always as (
    pg_catalog.least(item_a::text,item_b::text) || ':' || pg_catalog.greatest(item_a::text,item_b::text)
  ) stored,
  user_a uuid not null references auth.users(id),
  user_b uuid not null references auth.users(id),
  item_a uuid not null references public.collection_items(id),
  item_b uuid not null references public.collection_items(id),
  proposer_id uuid not null references auth.users(id),
  recipient_id uuid not null references auth.users(id),
  duration_days integer not null check (duration_days in (30,60,90)),
  opening_message text,
  state text not null check (state in (
    'PROPOSED','DECLINED','WITHDRAWN','EXPIRED','ACCEPTED','MEETUP_PLANNING',
    'MEETUP_CONFIRMED','INSPECTION','HANDOFF_PENDING','HANDOFF_ISSUE','ACTIVE',
    'EARLY_RETURN','RETURN_PLANNING','RETURN_INSPECTION','DISPUTED','CANCELLED','COMPLETED'
  )),
  state_version bigint not null default 1 check (state_version > 0),
  response_deadline timestamptz,
  accepted_at timestamptz,
  owner_preference_a boolean not null,
  owner_preference_b boolean not null,
  meetup_proposed_by uuid references auth.users(id),
  meetup_accepted_by uuid references auth.users(id),
  meetup_venue_name text,
  meetup_venue_area text,
  meetup_at timestamptz,
  safety_ack_a_at timestamptz,
  safety_ack_b_at timestamptz,
  arrived_a_at timestamptz,
  arrived_b_at timestamptz,
  inspected_a_at timestamptz,
  inspected_b_at timestamptz,
  handoff_a_at timestamptz,
  handoff_b_at timestamptz,
  handoff_at timestamptz,
  return_due_at timestamptz,
  early_return_requested_by uuid references auth.users(id),
  return_proposed_by uuid references auth.users(id),
  return_accepted_by uuid references auth.users(id),
  return_venue_name text,
  return_venue_area text,
  return_meetup_at timestamptz,
  return_arrived_a_at timestamptz,
  return_arrived_b_at timestamptz,
  return_inspected_a_at timestamptz,
  return_inspected_b_at timestamptz,
  return_confirmed_a_at timestamptz,
  return_confirmed_b_at timestamptz,
  issue_type text,
  issue_note text,
  cancelled_reason text,
  accepted_by uuid references auth.users(id),
  completed_at timestamptz,
  cancelled_at timestamptz,
  migration_review_required boolean not null default false,
  migration_note text,
  legacy_request_id uuid unique,
  legacy_exchange_id uuid unique,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint exchange_cases_different_users check (user_a <> user_b),
  constraint exchange_cases_different_items check (item_a <> item_b),
  constraint exchange_cases_parties check (
    proposer_id in (user_a,user_b) and recipient_id in (user_a,user_b) and proposer_id <> recipient_id
  )
);

create index exchange_cases_open_match_idx on public.exchange_cases(match_key)
where state not in ('DECLINED','WITHDRAWN','EXPIRED','CANCELLED','COMPLETED');
create index exchange_cases_user_a_updated_idx on public.exchange_cases(user_a,updated_at desc);
create index exchange_cases_user_b_updated_idx on public.exchange_cases(user_b,updated_at desc);
create index exchange_cases_response_deadline_idx on public.exchange_cases(response_deadline)
where state='PROPOSED';
create index exchange_cases_return_due_idx on public.exchange_cases(return_due_at)
where state in ('ACTIVE','EARLY_RETURN','RETURN_PLANNING','RETURN_INSPECTION');

create table public.exchange_case_item_locks (
  item_id uuid primary key references public.collection_items(id) on delete restrict,
  case_id uuid not null references public.exchange_cases(id) on delete cascade,
  lock_kind text not null check (lock_kind in ('PROPOSAL_PENDING','RESERVED','ON_EXCHANGE','RETURN_PENDING','MANUAL_REVIEW')),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);
create index exchange_case_item_locks_case_idx on public.exchange_case_item_locks(case_id);

create table public.exchange_case_events (
  id uuid primary key default extensions.gen_random_uuid(),
  case_id uuid not null references public.exchange_cases(id) on delete restrict,
  event_type text not null,
  previous_state text,
  resulting_state text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  state_version bigint not null,
  idempotency_key text not null unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default pg_catalog.now()
);
create index exchange_case_events_case_created_idx on public.exchange_case_events(case_id,created_at,id);

create table public.exchange_case_conversations (
  id uuid primary key default extensions.gen_random_uuid(),
  case_id uuid not null unique references public.exchange_cases(id) on delete restrict,
  created_at timestamptz not null default pg_catalog.now(),
  archived_at timestamptz
);

create table public.exchange_case_messages (
  id uuid primary key default extensions.gen_random_uuid(),
  conversation_id uuid not null references public.exchange_case_conversations(id) on delete restrict,
  case_id uuid not null references public.exchange_cases(id) on delete restrict,
  sender_id uuid not null references auth.users(id) on delete restrict,
  recipient_id uuid not null references auth.users(id) on delete restrict,
  body text not null check (pg_catalog.length(pg_catalog.btrim(body)) between 1 and 4000),
  idempotency_key text not null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint exchange_case_messages_parties check (sender_id <> recipient_id),
  unique(sender_id,idempotency_key)
);
create index exchange_case_messages_case_created_idx on public.exchange_case_messages(case_id,created_at,id);

alter table public.notifications
  add column if not exists exchange_case_id uuid references public.exchange_cases(id) on delete set null,
  add column if not exists exchange_case_event_id uuid references public.exchange_case_events(id) on delete set null,
  add column if not exists exchange_case_message_id uuid references public.exchange_case_messages(id) on delete set null,
  add column if not exists dedupe_key text;
create unique index if not exists notifications_dedupe_key_idx
  on public.notifications(dedupe_key) where dedupe_key is not null;
create index if not exists notifications_exchange_case_idx
  on public.notifications(user_id,exchange_case_id,created_at desc) where exchange_case_id is not null;

alter table public.exchange_cases enable row level security;
alter table public.exchange_case_item_locks enable row level security;
alter table public.exchange_case_events enable row level security;
alter table public.exchange_case_conversations enable row level security;
alter table public.exchange_case_messages enable row level security;

revoke all on public.exchange_cases,public.exchange_case_item_locks,public.exchange_case_events,
  public.exchange_case_conversations,public.exchange_case_messages from public,anon,authenticated;
grant select on public.exchange_cases,public.exchange_case_events,
  public.exchange_case_conversations,public.exchange_case_messages to authenticated;
grant all on public.exchange_cases,public.exchange_case_item_locks,public.exchange_case_events,
  public.exchange_case_conversations,public.exchange_case_messages to service_role;

create policy "participants read exchange cases" on public.exchange_cases
for select to authenticated
using ((select auth.uid()) in (user_a,user_b));

create policy "participants read exchange case events" on public.exchange_case_events
for select to authenticated
using (exists (
  select 1 from public.exchange_cases c
  where c.id=case_id and (select auth.uid()) in (c.user_a,c.user_b)
));

create policy "participants read exchange conversations" on public.exchange_case_conversations
for select to authenticated
using (exists (
  select 1 from public.exchange_cases c
  where c.id=case_id and (select auth.uid()) in (c.user_a,c.user_b)
));

create policy "participants read exchange case messages" on public.exchange_case_messages
for select to authenticated
using (exists (
  select 1 from public.exchange_cases c
  where c.id=case_id and (select auth.uid()) in (c.user_a,c.user_b)
));

create table private.exchange_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default pg_catalog.now()
);
revoke all on private.exchange_admins from public,anon,authenticated;
grant all on private.exchange_admins to service_role;

create table public.exchange_user_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default pg_catalog.now(),
  primary key (blocker_id,blocked_id),
  constraint exchange_user_blocks_not_self check (blocker_id<>blocked_id)
);
alter table public.exchange_user_blocks enable row level security;
revoke all on public.exchange_user_blocks from public,anon,authenticated;
grant select,insert,delete on public.exchange_user_blocks to authenticated;
grant all on public.exchange_user_blocks to service_role;
create policy "members manage their exchange blocks" on public.exchange_user_blocks
for all to authenticated
using ((select auth.uid())=blocker_id)
with check ((select auth.uid())=blocker_id);

create or replace function private.bc_case_is_terminal(p_state text)
returns boolean language sql immutable security invoker set search_path=''
as $$ select p_state in ('DECLINED','WITHDRAWN','EXPIRED','CANCELLED','COMPLETED') $$;

create or replace function private.bc_case_other_user(p_case public.exchange_cases,p_actor uuid)
returns uuid language sql immutable security invoker set search_path=''
as $$ select case when p_actor=p_case.user_a then p_case.user_b else p_case.user_a end $$;

create or replace function private.bc_case_snapshot(p_case_id uuid,p_idempotent boolean default false)
returns jsonb language sql stable security definer set search_path=''
as $$
  select pg_catalog.jsonb_build_object(
    'ok',true,'idempotent',p_idempotent,'case',pg_catalog.to_jsonb(c),
    'conversation_id',cv.id
  )
  from public.exchange_cases c
  left join public.exchange_case_conversations cv on cv.case_id=c.id
  where c.id=p_case_id and (select auth.uid()) in (c.user_a,c.user_b)
$$;

create or replace function private.bc_case_notify(
  p_case public.exchange_cases,
  p_event_id uuid,
  p_recipient uuid,
  p_kind text,
  p_title text,
  p_body text,
  p_actor uuid
)
returns void language plpgsql security definer set search_path=''
as $$
begin
  if p_recipient is null or p_recipient=p_actor then return; end if;
  insert into public.notifications(
    user_id,kind,title,body,actor_user_id,entity_type,entity_id,metadata,
    exchange_case_id,exchange_case_event_id,dedupe_key
  ) values (
    p_recipient,p_kind,p_title,p_body,p_actor,'exchange_case_event',p_event_id,
    pg_catalog.jsonb_build_object('exchange_case_id',p_case.id,'route','#exchange/'||p_case.id::text),
    p_case.id,p_event_id,'case-event:'||p_recipient::text||':'||p_event_id::text
  ) on conflict (dedupe_key) where dedupe_key is not null do nothing;
end;
$$;

create or replace function private.bc_restore_case_preferences(p_case public.exchange_cases)
returns void language plpgsql security definer set search_path=''
as $$
begin
  perform pg_catalog.set_config('brickcircle.workflow_transition','on',true);
  update public.collection_items
    set available_for_exchange=p_case.owner_preference_a,exchange_review_required=false,updated_at=pg_catalog.now()
    where id=p_case.item_a;
  update public.collection_items
    set available_for_exchange=p_case.owner_preference_b,exchange_review_required=false,updated_at=pg_catalog.now()
    where id=p_case.item_b;
  delete from public.exchange_case_item_locks where case_id=p_case.id;
end;
$$;

create or replace function private.bc_mark_case_completed(p_case public.exchange_cases)
returns void language plpgsql security definer set search_path=''
as $$
begin
  perform pg_catalog.set_config('brickcircle.workflow_transition','on',true);
  update public.collection_items
    set available_for_exchange=false,exchange_review_required=true,updated_at=pg_catalog.now()
    where id in (p_case.item_a,p_case.item_b);
  delete from public.exchange_case_item_locks where case_id=p_case.id;
end;
$$;

create or replace function public.collection_item_exchange_status(p_item_id uuid)
returns text language sql stable security definer set search_path=''
as $$
  select case
    when ci.exchange_review_required then 'NEEDS_OWNER_REVIEW'
    when l.lock_kind='PROPOSAL_PENDING' then 'PROPOSAL_PENDING'
    when l.lock_kind='RESERVED' then 'RESERVED'
    when l.lock_kind='ON_EXCHANGE' then 'ON_EXCHANGE'
    when l.lock_kind='RETURN_PENDING' then 'RETURN_PENDING'
    when l.lock_kind='MANUAL_REVIEW' then 'NEEDS_OWNER_REVIEW'
    when ci.available_for_exchange then 'AVAILABLE'
    else 'NOT_AVAILABLE'
  end
  from public.collection_items ci
  left join public.exchange_case_item_locks l on l.item_id=ci.id
  where ci.id=p_item_id and ci.user_id=(select auth.uid())
$$;

create or replace function public.set_exchange_item_availability(p_item_id uuid,p_available boolean)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare me uuid:=auth.uid(); owned public.collection_items%rowtype; item_lock public.exchange_case_item_locks%rowtype;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  select * into owned from public.collection_items where id=p_item_id for update;
  if not found or owned.user_id<>me then raise exception 'You can update only your own LEGO set'; end if;
  select * into item_lock from public.exchange_case_item_locks where item_id=p_item_id for update;
  if found then raise exception 'This set is part of an exchange case. Open the case to choose the safe next action.'; end if;
  if p_available and owned.owner_photo_path is null then raise exception 'Add an owner photo before making this set available'; end if;
  if p_available and (owned.condition is null or owned.completeness is null) then raise exception 'Add condition and completeness details first'; end if;
  perform pg_catalog.set_config('brickcircle.workflow_transition','on',true);
  update public.collection_items set available_for_exchange=p_available,
    exchange_review_required=case when p_available then false else exchange_review_required end,
    updated_at=pg_catalog.now() where id=p_item_id;
  return pg_catalog.jsonb_build_object('ok',true,'item_id',p_item_id,'available',p_available,
    'status',case when p_available then 'AVAILABLE' else 'NOT_AVAILABLE' end);
end;
$$;

create or replace function public.create_exchange_case(
  p_offered_item_id uuid,
  p_requested_item_id uuid,
  p_duration_days integer,
  p_message text,
  p_idempotency_key text
)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  me uuid:=auth.uid(); offered public.collection_items%rowtype; requested public.collection_items%rowtype;
  mine public.profiles%rowtype; theirs public.profiles%rowtype; existing_id uuid;
  created_case public.exchange_cases%rowtype; event_id uuid; clean_key text:=nullif(pg_catalog.btrim(p_idempotency_key),'');
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if clean_key is null then raise exception 'An idempotency key is required'; end if;
  select e.case_id into existing_id from public.exchange_case_events e
  join public.exchange_cases c on c.id=e.case_id
  where e.idempotency_key=clean_key and me in (c.user_a,c.user_b);
  if found then return private.bc_case_snapshot(existing_id,true); end if;
  if p_offered_item_id is null or p_requested_item_id is null or p_offered_item_id=p_requested_item_id then raise exception 'Choose two different LEGO sets'; end if;
  if p_duration_days not in (30,60,90) then raise exception 'Choose 30, 60, or 90 days'; end if;
  perform 1 from public.collection_items where id in (p_offered_item_id,p_requested_item_id) order by id for update;
  select * into offered from public.collection_items where id=p_offered_item_id;
  select * into requested from public.collection_items where id=p_requested_item_id;
  if offered.id is null or requested.id is null then raise exception 'One of these LEGO sets is unavailable'; end if;
  if offered.user_id<>me or requested.user_id=me then raise exception 'The selected physical sets do not form an exchange'; end if;
  if not offered.available_for_exchange or offered.exchange_review_required or not requested.available_for_exchange or requested.exchange_review_required then raise exception 'One of these LEGO sets is not available'; end if;
  if offered.owner_photo_path is null or requested.owner_photo_path is null or offered.condition is null or requested.condition is null or offered.completeness is null or requested.completeness is null then raise exception 'Both sets need condition, completeness, and owner photos'; end if;
  select * into mine from public.profiles where id=me;
  select * into theirs from public.profiles where id=requested.user_id;
  if mine.id is null or theirs.id is null or mine.adult_confirmed_at is null or theirs.adult_confirmed_at is null then raise exception 'Both collectors must complete their eligible profiles'; end if;
  if pg_catalog.lower(pg_catalog.btrim(coalesce(mine.country,'')))<>pg_catalog.lower(pg_catalog.btrim(coalesce(theirs.country,'')))
     or public.normalize_city(mine.country,mine.city)<>public.normalize_city(theirs.country,theirs.city) then raise exception 'Collectors must be in the same supported city'; end if;
  if exists(
    select 1 from public.exchange_user_blocks b
    where (b.blocker_id=me and b.blocked_id=requested.user_id)
       or (b.blocker_id=requested.user_id and b.blocked_id=me)
  ) then raise exception 'This collector is not eligible for an exchange with you'; end if;
  if not exists(select 1 from public.wishlists w where w.user_id=me and public.canonical_lego_product_identity(w.set_number)=public.canonical_lego_product_identity(requested.set_number))
     or not exists(select 1 from public.wishlists w where w.user_id=requested.user_id and public.canonical_lego_product_identity(w.set_number)=public.canonical_lego_product_identity(offered.set_number)) then raise exception 'This reciprocal match is no longer available'; end if;
  if exists(select 1 from public.exchange_case_item_locks where item_id in (offered.id,requested.id)) then
    select c.id into existing_id from public.exchange_cases c where c.match_key=pg_catalog.least(offered.id::text,requested.id::text)||':'||pg_catalog.greatest(offered.id::text,requested.id::text)
      and not private.bc_case_is_terminal(c.state) limit 1;
    if existing_id is not null then return private.bc_case_snapshot(existing_id,true); end if;
    raise exception 'One of these LEGO sets is already participating in another case';
  end if;
  insert into public.exchange_cases(user_a,user_b,item_a,item_b,proposer_id,recipient_id,duration_days,opening_message,state,response_deadline,owner_preference_a,owner_preference_b)
  values(me,requested.user_id,offered.id,requested.id,me,requested.user_id,p_duration_days,nullif(pg_catalog.btrim(p_message),''),'PROPOSED',pg_catalog.now()+interval '48 hours',offered.available_for_exchange,requested.available_for_exchange)
  returning * into created_case;
  insert into public.exchange_case_item_locks(item_id,case_id,lock_kind) values
    (offered.id,created_case.id,'PROPOSAL_PENDING'),(requested.id,created_case.id,'PROPOSAL_PENDING');
  insert into public.exchange_case_conversations(case_id) values(created_case.id);
  insert into public.exchange_case_events(case_id,event_type,previous_state,resulting_state,actor_user_id,state_version,idempotency_key,metadata)
  values(created_case.id,'proposal_created',null,'PROPOSED',me,created_case.state_version,clean_key,
    pg_catalog.jsonb_build_object('duration_days',p_duration_days,'response_deadline',created_case.response_deadline)) returning id into event_id;
  perform private.bc_case_notify(created_case,event_id,created_case.recipient_id,'exchange_proposed','New exchange proposal','A collector proposed a temporary local LEGO exchange.',me);
  return private.bc_case_snapshot(created_case.id,false);
end;
$$;

create or replace function public.resolve_exchange_case(
  p_case_id uuid,
  p_expected_version bigint,
  p_resolution text,
  p_note text,
  p_idempotency_key text
)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  me uuid:=auth.uid(); c public.exchange_cases%rowtype; before_state text;
  resolution text:=pg_catalog.lower(pg_catalog.btrim(p_resolution));
  clean_key text:=nullif(pg_catalog.btrim(p_idempotency_key),''); event_id uuid;
begin
  if me is null or not exists(select 1 from private.exchange_admins a where a.user_id=me) then
    raise exception 'Administrator resolution is required';
  end if;
  if clean_key is null then raise exception 'An idempotency key is required'; end if;
  if exists(select 1 from public.exchange_case_events where case_id=p_case_id and idempotency_key=clean_key) then
    select * into c from public.exchange_cases where id=p_case_id;
    return pg_catalog.jsonb_build_object('ok',true,'idempotent',true,'case',pg_catalog.to_jsonb(c));
  end if;
  select * into c from public.exchange_cases where id=p_case_id for update;
  if not found then raise exception 'Exchange case unavailable'; end if;
  if c.state not in ('DISPUTED','HANDOFF_ISSUE') then raise exception 'Only a disputed or uncertain-handoff case can be resolved'; end if;
  if p_expected_version is null or p_expected_version<>c.state_version then raise exception 'This exchange changed. Refresh and try again.'; end if;
  if resolution not in ('cancelled','completed') then raise exception 'Choose cancelled or completed'; end if;
  before_state:=c.state;
  if resolution='completed' then
    update public.exchange_cases set state='COMPLETED',completed_at=pg_catalog.now(),migration_review_required=false,
      migration_note=coalesce(nullif(pg_catalog.btrim(p_note),''),'Resolved by an authorised administrator.'),
      state_version=state_version+1,updated_at=pg_catalog.now() where id=c.id returning * into c;
  else
    update public.exchange_cases set state='CANCELLED',cancelled_at=pg_catalog.now(),cancelled_reason=coalesce(nullif(pg_catalog.btrim(p_note),''),'Resolved by an authorised administrator.'),
      migration_review_required=false,state_version=state_version+1,updated_at=pg_catalog.now() where id=c.id returning * into c;
  end if;
  perform private.bc_mark_case_completed(c);
  update public.exchange_case_conversations set archived_at=pg_catalog.now() where case_id=c.id;
  insert into public.exchange_case_events(case_id,event_type,previous_state,resulting_state,actor_user_id,state_version,idempotency_key,metadata)
  values(c.id,'admin_resolved',before_state,c.state,me,c.state_version,clean_key,
    pg_catalog.jsonb_build_object('resolution',resolution,'note',nullif(pg_catalog.btrim(p_note),''))) returning id into event_id;
  perform private.bc_case_notify(c,event_id,c.user_a,'exchange_resolved','Exchange issue resolved','An authorised BrickCircle administrator resolved the exchange case.',me);
  perform private.bc_case_notify(c,event_id,c.user_b,'exchange_resolved','Exchange issue resolved','An authorised BrickCircle administrator resolved the exchange case.',me);
  return pg_catalog.jsonb_build_object('ok',true,'idempotent',false,'case',pg_catalog.to_jsonb(c));
end;
$$;

create or replace function public.exchange_case_transition(
  p_case_id uuid,
  p_expected_version bigint,
  p_action text,
  p_idempotency_key text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  me uuid:=auth.uid(); c public.exchange_cases%rowtype; before_state text; after_state text;
  clean_action text:=pg_catalog.lower(pg_catalog.btrim(p_action)); clean_key text:=nullif(pg_catalog.btrim(p_idempotency_key),'');
  event_id uuid; other_user uuid; is_a boolean; venue text; area text; meeting_at timestamptz;
  next_duration integer; next_message text; kind text; title text; body text;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if clean_key is null then raise exception 'An idempotency key is required'; end if;
  if exists(select 1 from public.exchange_case_events where case_id=p_case_id and idempotency_key=clean_key) then return private.bc_case_snapshot(p_case_id,true); end if;
  select * into c from public.exchange_cases where id=p_case_id for update;
  if not found or me not in (c.user_a,c.user_b) then raise exception 'Exchange case unavailable'; end if;
  if p_expected_version is null or p_expected_version<>c.state_version then raise exception 'This exchange changed. Refresh and try again.'; end if;
  if private.bc_case_is_terminal(c.state) then raise exception 'This exchange case is closed'; end if;
  before_state:=c.state; after_state:=c.state; other_user:=private.bc_case_other_user(c,me); is_a:=me=c.user_a;

  if clean_action='counter' then
    if c.state<>'PROPOSED' or me<>c.recipient_id then raise exception 'Only the current recipient can counter this proposal'; end if;
    next_duration:=coalesce((p_payload->>'duration_days')::integer,c.duration_days);
    if next_duration not in (30,60,90) then raise exception 'Choose 30, 60, or 90 days'; end if;
    next_message:=nullif(pg_catalog.btrim(p_payload->>'message'),'');
    update public.exchange_cases set proposer_id=me,recipient_id=other_user,duration_days=next_duration,
      opening_message=coalesce(next_message,opening_message),response_deadline=pg_catalog.now()+interval '48 hours',
      state_version=state_version+1,updated_at=pg_catalog.now() where id=c.id returning * into c;
    kind:='exchange_countered';title:='Exchange counterproposal';body:='The other collector updated the exchange proposal.';
  elsif clean_action='accept' then
    if c.state<>'PROPOSED' or me<>c.recipient_id then raise exception 'Only the current recipient can accept this proposal'; end if;
    if c.response_deadline<=pg_catalog.now() then raise exception 'This proposal has expired'; end if;
    if (select count(*) from public.exchange_case_item_locks where case_id=c.id and item_id in (c.item_a,c.item_b))<>2 then raise exception 'The set hold is no longer valid'; end if;
    after_state:='ACCEPTED';
    update public.exchange_cases set state=after_state,accepted_at=pg_catalog.now(),accepted_by=me,state_version=state_version+1,updated_at=pg_catalog.now() where id=c.id returning * into c;
    update public.exchange_case_item_locks set lock_kind='RESERVED',updated_at=pg_catalog.now() where case_id=c.id;
    perform pg_catalog.set_config('brickcircle.workflow_transition','on',true);
    update public.collection_items set available_for_exchange=false,updated_at=pg_catalog.now() where id in (c.item_a,c.item_b);
    kind:='exchange_accepted';title:='Exchange proposal accepted';body:='Plan a safe public meetup and inspect both sets before handoff.';
  elsif clean_action in ('decline','withdraw') then
    if c.state<>'PROPOSED' then raise exception 'Only a pending proposal can be closed'; end if;
    if clean_action='decline' and me<>c.recipient_id then raise exception 'Only the recipient can decline'; end if;
    if clean_action='withdraw' and me<>c.proposer_id then raise exception 'Only the proposer can withdraw'; end if;
    after_state:=case when clean_action='decline' then 'DECLINED' else 'WITHDRAWN' end;
    update public.exchange_cases set state=after_state,cancelled_reason=nullif(pg_catalog.btrim(p_payload->>'reason'),''),cancelled_at=pg_catalog.now(),state_version=state_version+1,updated_at=pg_catalog.now() where id=c.id returning * into c;
    perform private.bc_restore_case_preferences(c);
    kind:=case when clean_action='decline' then 'exchange_declined' else 'exchange_withdrawn' end;
    title:=case when clean_action='decline' then 'Exchange proposal declined' else 'Exchange proposal withdrawn' end; body:=title||'.';
  elsif clean_action='propose_meetup' then
    if c.state not in ('ACCEPTED','MEETUP_PLANNING','MEETUP_CONFIRMED') then raise exception 'Meetup planning is not available now'; end if;
    venue:=nullif(pg_catalog.btrim(p_payload->>'venue_name'),''); area:=nullif(pg_catalog.btrim(p_payload->>'venue_area'),''); meeting_at:=(p_payload->>'meetup_at')::timestamptz;
    if venue is null or meeting_at is null or meeting_at<=pg_catalog.now() then raise exception 'Choose a valid future public meetup'; end if;
    after_state:='MEETUP_PLANNING';
    update public.exchange_cases set state=after_state,meetup_proposed_by=me,meetup_accepted_by=null,meetup_venue_name=venue,meetup_venue_area=area,meetup_at=meeting_at,
      safety_ack_a_at=null,safety_ack_b_at=null,arrived_a_at=null,arrived_b_at=null,inspected_a_at=null,inspected_b_at=null,handoff_a_at=null,handoff_b_at=null,
      state_version=state_version+1,updated_at=pg_catalog.now() where id=c.id returning * into c;
    kind:='meetup_proposed';title:='Meetup proposed';body:='Review the public meetup place and time.';
  elsif clean_action='accept_meetup' then
    if c.state<>'MEETUP_PLANNING' or c.meetup_proposed_by=me then raise exception 'The other collector must accept the meetup'; end if;
    after_state:='MEETUP_CONFIRMED';
    update public.exchange_cases set state=after_state,meetup_accepted_by=me,state_version=state_version+1,updated_at=pg_catalog.now() where id=c.id returning * into c;
    kind:='meetup_accepted';title:='Meetup confirmed';body:='The public meetup time and place are confirmed.';
  elsif clean_action='safety_ack' then
    if c.state not in ('MEETUP_CONFIRMED','INSPECTION') then raise exception 'Confirm the meetup before acknowledging safety'; end if;
    update public.exchange_cases set safety_ack_a_at=case when is_a then coalesce(safety_ack_a_at,pg_catalog.now()) else safety_ack_a_at end,
      safety_ack_b_at=case when not is_a then coalesce(safety_ack_b_at,pg_catalog.now()) else safety_ack_b_at end,
      state_version=state_version+1,updated_at=pg_catalog.now() where id=c.id returning * into c;
    if c.safety_ack_a_at is not null and c.safety_ack_b_at is not null then after_state:='INSPECTION'; update public.exchange_cases set state=after_state where id=c.id returning * into c; end if;
    kind:='meetup_safety_acknowledged';title:='Safety checklist updated';body:='Meet publicly and inspect condition, parts, and completeness before handoff.';
  elsif clean_action='arrive' then
    if c.state<>'INSPECTION' or c.safety_ack_a_at is null or c.safety_ack_b_at is null then raise exception 'Both collectors must acknowledge meetup safety first'; end if;
    update public.exchange_cases set arrived_a_at=case when is_a then coalesce(arrived_a_at,pg_catalog.now()) else arrived_a_at end,
      arrived_b_at=case when not is_a then coalesce(arrived_b_at,pg_catalog.now()) else arrived_b_at end,state_version=state_version+1,updated_at=pg_catalog.now() where id=c.id returning * into c;
    kind:='meetup_arrival';title:='Collector arrived';body:='The other collector marked that they arrived at the meetup.';
  elsif clean_action='inspect' then
    if c.state<>'INSPECTION' or c.arrived_a_at is null or c.arrived_b_at is null then raise exception 'Both collectors must arrive before inspection approval'; end if;
    update public.exchange_cases set inspected_a_at=case when is_a then coalesce(inspected_a_at,pg_catalog.now()) else inspected_a_at end,
      inspected_b_at=case when not is_a then coalesce(inspected_b_at,pg_catalog.now()) else inspected_b_at end,state_version=state_version+1,updated_at=pg_catalog.now() where id=c.id returning * into c;
    if c.inspected_a_at is not null and c.inspected_b_at is not null then after_state:='HANDOFF_PENDING'; update public.exchange_cases set state=after_state where id=c.id returning * into c; end if;
    kind:='inspection_approved';title:='Inspection updated';body:='The other collector approved the physical set inspection.';
  elsif clean_action='handoff' then
    if c.state<>'HANDOFF_PENDING' or c.inspected_a_at is null or c.inspected_b_at is null then raise exception 'Both collectors must approve inspection before handoff'; end if;
    update public.exchange_cases set handoff_a_at=case when is_a then coalesce(handoff_a_at,pg_catalog.now()) else handoff_a_at end,
      handoff_b_at=case when not is_a then coalesce(handoff_b_at,pg_catalog.now()) else handoff_b_at end,state_version=state_version+1,updated_at=pg_catalog.now() where id=c.id returning * into c;
    if c.handoff_a_at is not null and c.handoff_b_at is not null then
      after_state:='ACTIVE'; update public.exchange_cases set state=after_state,handoff_at=pg_catalog.now(),return_due_at=pg_catalog.now()+pg_catalog.make_interval(days=>duration_days) where id=c.id returning * into c;
      update public.exchange_case_item_locks set lock_kind='ON_EXCHANGE',updated_at=pg_catalog.now() where case_id=c.id;
      kind:='exchange_activated';title:='Temporary exchange active';body:='Both handoffs are confirmed. The return period starts now.';
    else kind:='handoff_confirmation_required';title:='Handoff confirmation required';body:='The other collector confirmed handoff. Confirm only after physical custody changed.'; end if;
  elsif clean_action='cancel' then
    if c.handoff_a_at is not null or c.handoff_b_at is not null then
      after_state:='HANDOFF_ISSUE';
      update public.exchange_cases set state=after_state,issue_type='handoff_uncertain',issue_note=nullif(pg_catalog.btrim(p_payload->>'reason'),''),state_version=state_version+1,updated_at=pg_catalog.now() where id=c.id returning * into c;
      update public.exchange_case_item_locks set lock_kind='MANUAL_REVIEW',updated_at=pg_catalog.now() where case_id=c.id;
      kind:='handoff_issue';title:='Handoff issue opened';body:='Physical custody may have changed. Both sets remain locked while you resolve it.';
    elsif c.state in ('PROPOSED','ACCEPTED','MEETUP_PLANNING','MEETUP_CONFIRMED','INSPECTION','HANDOFF_PENDING') then
      after_state:='CANCELLED';
      update public.exchange_cases set state=after_state,cancelled_reason=nullif(pg_catalog.btrim(p_payload->>'reason'),''),cancelled_at=pg_catalog.now(),state_version=state_version+1,updated_at=pg_catalog.now() where id=c.id returning * into c;
      perform private.bc_restore_case_preferences(c);
      kind:='exchange_cancelled';title:='Exchange cancelled';body:='The pre-handoff exchange was cancelled and the set holds were released.';
    else raise exception 'This exchange can no longer be cancelled directly'; end if;
  elsif clean_action='early_return' then
    if c.state<>'ACTIVE' then raise exception 'Early return is available only during an active exchange'; end if;
    after_state:='EARLY_RETURN';
    update public.exchange_cases set state=after_state,early_return_requested_by=me,state_version=state_version+1,updated_at=pg_catalog.now() where id=c.id returning * into c;
    update public.exchange_case_item_locks set lock_kind='RETURN_PENDING',updated_at=pg_catalog.now() where case_id=c.id;
    kind:='early_return_requested';title:='Early return requested';body:='Arrange a public return meetup. Both sets remain locked until return is confirmed.';
  elsif clean_action='propose_return' then
    if c.state not in ('ACTIVE','EARLY_RETURN','RETURN_PLANNING') then raise exception 'Return planning is not available now'; end if;
    venue:=nullif(pg_catalog.btrim(p_payload->>'venue_name'),''); area:=nullif(pg_catalog.btrim(p_payload->>'venue_area'),''); meeting_at:=(p_payload->>'meetup_at')::timestamptz;
    if venue is null or meeting_at is null or meeting_at<=pg_catalog.now() then raise exception 'Choose a valid future public return meetup'; end if;
    after_state:='RETURN_PLANNING';
    update public.exchange_cases set state=after_state,return_proposed_by=me,return_accepted_by=null,return_venue_name=venue,return_venue_area=area,return_meetup_at=meeting_at,
      return_arrived_a_at=null,return_arrived_b_at=null,return_inspected_a_at=null,return_inspected_b_at=null,return_confirmed_a_at=null,return_confirmed_b_at=null,
      state_version=state_version+1,updated_at=pg_catalog.now() where id=c.id returning * into c;
    update public.exchange_case_item_locks set lock_kind='RETURN_PENDING',updated_at=pg_catalog.now() where case_id=c.id;
    kind:='return_meetup_proposed';title:='Return meetup proposed';body:='Review the public return meetup details.';
  elsif clean_action='accept_return' then
    if c.state<>'RETURN_PLANNING' or c.return_proposed_by=me then raise exception 'The other collector must accept the return meetup'; end if;
    after_state:='RETURN_INSPECTION';
    update public.exchange_cases set state=after_state,return_accepted_by=me,state_version=state_version+1,updated_at=pg_catalog.now() where id=c.id returning * into c;
    kind:='return_meetup_accepted';title:='Return meetup confirmed';body:='Meet publicly and inspect each returned set before confirming.';
  elsif clean_action='return_arrive' then
    if c.state<>'RETURN_INSPECTION' then raise exception 'Confirm the return meetup first'; end if;
    update public.exchange_cases set return_arrived_a_at=case when is_a then coalesce(return_arrived_a_at,pg_catalog.now()) else return_arrived_a_at end,
      return_arrived_b_at=case when not is_a then coalesce(return_arrived_b_at,pg_catalog.now()) else return_arrived_b_at end,state_version=state_version+1,updated_at=pg_catalog.now() where id=c.id returning * into c;
    kind:='return_arrival';title:='Collector arrived for return';body:='The other collector marked arrival at the return meetup.';
  elsif clean_action='return_inspect' then
    if c.state<>'RETURN_INSPECTION' or c.return_arrived_a_at is null or c.return_arrived_b_at is null then raise exception 'Both collectors must arrive before return inspection'; end if;
    update public.exchange_cases set return_inspected_a_at=case when is_a then coalesce(return_inspected_a_at,pg_catalog.now()) else return_inspected_a_at end,
      return_inspected_b_at=case when not is_a then coalesce(return_inspected_b_at,pg_catalog.now()) else return_inspected_b_at end,state_version=state_version+1,updated_at=pg_catalog.now() where id=c.id returning * into c;
    kind:='return_inspection_approved';title:='Return inspection updated';body:='The other collector approved their returned set inspection.';
  elsif clean_action='return_confirm' then
    if c.state<>'RETURN_INSPECTION' or c.return_inspected_a_at is null or c.return_inspected_b_at is null then raise exception 'Both returned sets must be inspected first'; end if;
    update public.exchange_cases set return_confirmed_a_at=case when is_a then coalesce(return_confirmed_a_at,pg_catalog.now()) else return_confirmed_a_at end,
      return_confirmed_b_at=case when not is_a then coalesce(return_confirmed_b_at,pg_catalog.now()) else return_confirmed_b_at end,state_version=state_version+1,updated_at=pg_catalog.now() where id=c.id returning * into c;
    if c.return_confirmed_a_at is not null and c.return_confirmed_b_at is not null then
      after_state:='COMPLETED'; update public.exchange_cases set state=after_state,completed_at=pg_catalog.now() where id=c.id returning * into c;
      perform private.bc_mark_case_completed(c);
      update public.exchange_case_conversations set archived_at=pg_catalog.now() where case_id=c.id;
      kind:='exchange_completed';title:='Exchange completed';body:='Both returns are confirmed. Review your set before making it available again.';
    else kind:='return_confirmation_required';title:='Return confirmation required';body:='The other collector confirmed return. Confirm after your set is physically returned.'; end if;
  elsif clean_action='report_issue' then
    after_state:='DISPUTED';
    update public.exchange_cases set state=after_state,issue_type=coalesce(nullif(pg_catalog.btrim(p_payload->>'issue_type'),''),'other'),issue_note=nullif(pg_catalog.btrim(p_payload->>'note'),''),state_version=state_version+1,updated_at=pg_catalog.now() where id=c.id returning * into c;
    update public.exchange_case_item_locks set lock_kind='MANUAL_REVIEW',updated_at=pg_catalog.now() where case_id=c.id;
    kind:='exchange_disputed';title:='Exchange issue reported';body:='The exchange is paused for resolution. Conversation remains available.';
  else raise exception 'Unsupported exchange action'; end if;

  after_state:=c.state;
  insert into public.exchange_case_events(case_id,event_type,previous_state,resulting_state,actor_user_id,state_version,idempotency_key,metadata)
  values(c.id,clean_action,before_state,after_state,me,c.state_version,clean_key,coalesce(p_payload,'{}'::jsonb)) returning id into event_id;
  perform private.bc_case_notify(c,event_id,other_user,kind,title,body,me);
  return private.bc_case_snapshot(c.id,false);
end;
$$;

create or replace function public.send_exchange_case_message(
  p_case_id uuid,p_body text,p_idempotency_key text
)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare me uuid:=auth.uid(); c public.exchange_cases%rowtype; cv public.exchange_case_conversations%rowtype;
  created_message public.exchange_case_messages%rowtype; other_user uuid; clean_key text:=nullif(pg_catalog.btrim(p_idempotency_key),'');
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if clean_key is null then raise exception 'An idempotency key is required'; end if;
  select * into created_message from public.exchange_case_messages where sender_id=me and idempotency_key=clean_key;
  if found then return pg_catalog.jsonb_build_object('ok',true,'idempotent',true,'message',pg_catalog.to_jsonb(created_message)); end if;
  select * into c from public.exchange_cases where id=p_case_id for share;
  if not found or me not in (c.user_a,c.user_b) then raise exception 'Exchange case unavailable'; end if;
  if c.state in ('DECLINED','WITHDRAWN','EXPIRED','CANCELLED','COMPLETED') then raise exception 'This conversation is archived'; end if;
  select * into cv from public.exchange_case_conversations where case_id=c.id;
  other_user:=private.bc_case_other_user(c,me);
  insert into public.exchange_case_messages(conversation_id,case_id,sender_id,recipient_id,body,idempotency_key)
  values(cv.id,c.id,me,other_user,pg_catalog.btrim(p_body),clean_key) returning * into created_message;
  insert into public.notifications(user_id,kind,title,body,actor_user_id,entity_type,entity_id,metadata,exchange_case_id,exchange_case_message_id,dedupe_key)
  values(other_user,'exchange_message','New exchange message','The other collector sent a message.',me,'exchange_case_message',created_message.id,
    pg_catalog.jsonb_build_object('exchange_case_id',c.id,'route','#exchange/'||c.id::text),c.id,created_message.id,
    'case-message:'||other_user::text||':'||created_message.id::text)
  on conflict (dedupe_key) where dedupe_key is not null do nothing;
  return pg_catalog.jsonb_build_object('ok',true,'idempotent',false,'message',pg_catalog.to_jsonb(created_message));
end;
$$;

create or replace function public.expire_exchange_cases(p_limit integer default 100)
returns integer language plpgsql security definer set search_path=''
as $$
declare c public.exchange_cases%rowtype; event_id uuid; expired_count integer:=0;
begin
  for c in select * from public.exchange_cases where state='PROPOSED' and response_deadline<=pg_catalog.now() order by response_deadline for update skip locked limit pg_catalog.greatest(1,pg_catalog.least(p_limit,1000)) loop
    update public.exchange_cases set state='EXPIRED',cancelled_at=pg_catalog.now(),state_version=state_version+1,updated_at=pg_catalog.now() where id=c.id returning * into c;
    perform private.bc_restore_case_preferences(c);
    insert into public.exchange_case_events(case_id,event_type,previous_state,resulting_state,actor_user_id,state_version,idempotency_key,metadata)
    values(c.id,'expire','PROPOSED','EXPIRED',null,c.state_version,'expire:'||c.id::text,'{}'::jsonb) returning id into event_id;
    perform private.bc_case_notify(c,event_id,c.user_a,'exchange_expired','Exchange proposal expired','The proposal expired after 48 hours.',null);
    perform private.bc_case_notify(c,event_id,c.user_b,'exchange_expired','Exchange proposal expired','The proposal expired after 48 hours.',null);
    expired_count:=expired_count+1;
  end loop;
  return expired_count;
end;
$$;

create or replace function public.queue_exchange_case_reminders(p_now timestamptz default pg_catalog.now(),p_limit integer default 500)
returns integer language plpgsql security definer set search_path=''
as $$
declare c public.exchange_cases%rowtype; inserted_count integer:=0; recipient uuid; reminder_kind text; reminder_key text;
begin
  for c in select * from public.exchange_cases where
    (state='PROPOSED' and response_deadline between p_now and p_now+interval '24 hours')
    or (state in ('ACTIVE','EARLY_RETURN','RETURN_PLANNING','RETURN_INSPECTION') and return_due_at is not null and return_due_at<=p_now+interval '7 days')
    order by updated_at limit pg_catalog.greatest(1,pg_catalog.least(p_limit,2000))
  loop
    if c.state='PROPOSED' then recipient:=c.recipient_id;reminder_kind:='proposal_reminder';reminder_key:='proposal-24h:'||c.id::text;
    elsif c.return_due_at<p_now then reminder_kind:='return_overdue';reminder_key:='return-overdue:'||c.id::text||':'||p_now::date::text;
    elsif c.return_due_at<=p_now+interval '1 day' then reminder_kind:='return_due_1d';reminder_key:='return-1d:'||c.id::text;
    else reminder_kind:='return_due_7d';reminder_key:='return-7d:'||c.id::text; end if;
    foreach recipient in array (case when c.state='PROPOSED' then array[c.recipient_id] else array[c.user_a,c.user_b] end) loop
      insert into public.notifications(user_id,kind,title,body,entity_type,entity_id,metadata,exchange_case_id,dedupe_key)
      values(recipient,reminder_kind,case when reminder_kind='proposal_reminder' then 'Exchange proposal waiting' else 'LEGO return reminder' end,
        case when reminder_kind='proposal_reminder' then 'Respond before the proposal expires.' when reminder_kind='return_overdue' then 'The agreed return date has passed. Arrange the return or report an issue.' else 'Your temporary LEGO exchange return date is approaching.' end,
        'exchange_case',c.id,pg_catalog.jsonb_build_object('exchange_case_id',c.id,'route','#exchange/'||c.id::text),c.id,reminder_key||':'||recipient::text)
      on conflict (dedupe_key) where dedupe_key is not null do nothing;
      if found then inserted_count:=inserted_count+1; end if;
    end loop;
  end loop;
  return inserted_count;
end;
$$;

create or replace function public.bc_guard_collection_case_fields()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if pg_catalog.current_setting('brickcircle.workflow_transition',true)<>'on'
     and (new.available_for_exchange is distinct from old.available_for_exchange
       or new.exchange_review_required is distinct from old.exchange_review_required) then
    raise exception 'Use the exchange availability action so active cases remain safe';
  end if;
  return new;
end;
$$;
drop trigger if exists bc_guard_collection_case_fields on public.collection_items;
create trigger bc_guard_collection_case_fields before update of available_for_exchange,exchange_review_required on public.collection_items
for each row execute function public.bc_guard_collection_case_fields();

create or replace function public.bc_guard_collection_case_delete()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if exists(select 1 from public.exchange_case_item_locks where item_id=old.id) then raise exception 'This set is participating in an exchange case'; end if;
  return old;
end;
$$;
drop trigger if exists bc_guard_collection_case_delete on public.collection_items;
create trigger bc_guard_collection_case_delete before delete on public.collection_items
for each row execute function public.bc_guard_collection_case_delete();

-- Canonical reciprocal matching keeps the existing browser return shape while
-- excluding every item represented in the authoritative lock table.
create or replace function public.find_matches(p_user uuid)
returns table(match_user uuid,offered_item uuid,offered_set text,offered_name text,offered_value numeric,requested_item uuid,requested_set text,requested_name text,requested_value numeric,match_score integer)
language sql security definer set search_path=''
as $$
  select distinct c2.user_id,c1.id,c1.set_number,l1.name,coalesce(c1.estimated_value,l1.estimated_value,0),
    c2.id,c2.set_number,l2.name,coalesce(c2.estimated_value,l2.estimated_value,0),
    greatest(50,least(99,70+case when pg_catalog.abs(coalesce(c1.estimated_value,l1.estimated_value,0)-coalesce(c2.estimated_value,l2.estimated_value,0))<=greatest(25,coalesce(c2.estimated_value,l2.estimated_value,0)*0.15) then 15 else 0 end+case when l1.theme=l2.theme then 10 else 0 end))
  from public.collection_items c1
  join public.lego_sets l1 on l1.set_number=c1.set_number
  join public.profiles p1 on p1.id=c1.user_id and p1.adult_confirmed_at is not null
  join public.collection_items c2 on c2.available_for_exchange and not c2.exchange_review_required and c2.user_id<>p_user
  join public.profiles p2 on p2.id=c2.user_id and p2.adult_confirmed_at is not null
  join public.lego_sets l2 on l2.set_number=c2.set_number
  join public.wishlists w1 on w1.user_id=p_user and public.canonical_lego_product_identity(w1.set_number)=public.canonical_lego_product_identity(c2.set_number)
  join public.wishlists w2 on w2.user_id=c2.user_id and public.canonical_lego_product_identity(w2.set_number)=public.canonical_lego_product_identity(c1.set_number)
  where p_user=(select auth.uid()) and c1.user_id=p_user and c1.available_for_exchange and not c1.exchange_review_required
    and c1.owner_photo_path is not null and c2.owner_photo_path is not null
    and c1.condition is not null and c2.condition is not null and c1.completeness is not null and c2.completeness is not null
    and not exists(select 1 from public.exchange_case_item_locks l where l.item_id in (c1.id,c2.id))
    and not exists(select 1 from public.exchange_user_blocks b where
      (b.blocker_id=p_user and b.blocked_id=c2.user_id) or (b.blocker_id=c2.user_id and b.blocked_id=p_user))
    and public.normalize_city(p1.country,p1.city)=public.normalize_city(p2.country,p2.city)
    and pg_catalog.lower(pg_catalog.btrim(coalesce(p1.country,'')))=pg_catalog.lower(pg_catalog.btrim(coalesce(p2.country,'')));
$$;

-- Migrate legacy records without deleting or rewriting their history. Ambiguous
-- shipping-era/custody states are quarantined for manual review.
insert into public.exchange_cases(
  user_a,user_b,item_a,item_b,proposer_id,recipient_id,duration_days,opening_message,state,state_version,
  response_deadline,accepted_at,owner_preference_a,owner_preference_b,return_due_at,completed_at,cancelled_at,
  migration_review_required,migration_note,legacy_request_id,legacy_exchange_id,created_at,updated_at
)
select e.user_a,e.user_b,e.item_a,e.item_b,r.requester_id,r.responder_id,e.duration_days,r.message,
  case e.state when 'accepted' then 'ACCEPTED' when 'swap_active' then 'ACTIVE' when 'completed' then 'COMPLETED'
    when 'cancelled' then 'CANCELLED' when 'released' then 'CANCELLED' when 'disputed' then 'DISPUTED' else 'DISPUTED' end,
  1,r.created_at+interval '48 hours',e.started_at,coalesce(ca.available_for_exchange,false),coalesce(cb.available_for_exchange,false),e.return_due_at,e.completed_at,
  case when e.state in ('cancelled','released') then e.updated_at end,
  e.state not in ('accepted','swap_active','completed','cancelled','released','disputed'),
  case when e.state not in ('accepted','swap_active','completed','cancelled','released','disputed') then 'Ambiguous legacy state '||e.state||'; custody must be reviewed.' end,
  e.request_id,e.id,e.created_at,e.updated_at
from public.exchanges e
join public.exchange_requests r on r.id=e.request_id
join public.collection_items ca on ca.id=e.item_a
join public.collection_items cb on cb.id=e.item_b
on conflict (legacy_exchange_id) do nothing;

insert into public.exchange_cases(
  user_a,user_b,item_a,item_b,proposer_id,recipient_id,duration_days,opening_message,state,state_version,
  response_deadline,owner_preference_a,owner_preference_b,legacy_request_id,created_at,updated_at
)
select r.requester_id,r.responder_id,r.offered_item_id,r.requested_item_id,r.requester_id,r.responder_id,r.duration_days,r.message,
  case r.status when 'declined' then 'DECLINED' when 'cancelled' then 'WITHDRAWN' when 'expired' then 'EXPIRED' when 'released' then 'CANCELLED' else 'PROPOSED' end,
  1,r.created_at+interval '48 hours',coalesce(ca.available_for_exchange,false),coalesce(cb.available_for_exchange,false),r.id,r.created_at,r.updated_at
from public.exchange_requests r
join public.collection_items ca on ca.id=r.offered_item_id
join public.collection_items cb on cb.id=r.requested_item_id
where not exists(select 1 from public.exchanges e where e.request_id=r.id)
on conflict (legacy_request_id) do nothing;

insert into public.exchange_case_conversations(case_id)
select id from public.exchange_cases on conflict (case_id) do nothing;

-- Preserve every legacy exchange conversation message in the canonical case.
insert into public.exchange_case_messages(
  conversation_id,case_id,sender_id,recipient_id,body,idempotency_key,created_at
)
select cv.id,c.id,m.sender_id,
  coalesce(m.recipient_id,case when m.sender_id=c.user_a then c.user_b else c.user_a end),
  m.body,'legacy-message:'||m.id::text,m.created_at
from public.messages m
join public.exchange_cases c on c.legacy_exchange_id=m.exchange_id
join public.exchange_case_conversations cv on cv.case_id=c.id
where m.exchange_id is not null and m.sender_id in (c.user_a,c.user_b)
on conflict (sender_id,idempotency_key) do nothing;

insert into public.exchange_case_events(case_id,event_type,previous_state,resulting_state,actor_user_id,state_version,idempotency_key,metadata)
select c.id,'legacy_migrated',null,c.state,null,c.state_version,'legacy-case:'||c.id::text,
  pg_catalog.jsonb_build_object('legacy_request_id',c.legacy_request_id,'legacy_exchange_id',c.legacy_exchange_id,'manual_review',c.migration_review_required)
from public.exchange_cases c on conflict (idempotency_key) do nothing;

with candidates as (
  select c.id case_id,c.item_a item_id,c.state,c.created_at from public.exchange_cases c where not private.bc_case_is_terminal(c.state)
  union all
  select c.id,c.item_b,c.state,c.created_at from public.exchange_cases c where not private.bc_case_is_terminal(c.state)
), ranked as (
  select *,row_number() over(partition by item_id order by case when state in ('ACTIVE','EARLY_RETURN','RETURN_PLANNING','RETURN_INSPECTION','DISPUTED','HANDOFF_ISSUE') then 0 else 1 end,created_at,case_id) rank
  from candidates
)
insert into public.exchange_case_item_locks(item_id,case_id,lock_kind)
select item_id,case_id,case when state='PROPOSED' then 'PROPOSAL_PENDING' when state in ('ACTIVE') then 'ON_EXCHANGE' when state in ('EARLY_RETURN','RETURN_PLANNING','RETURN_INSPECTION') then 'RETURN_PENDING' when state in ('DISPUTED','HANDOFF_ISSUE') then 'MANUAL_REVIEW' else 'RESERVED' end
from ranked where rank=1 on conflict (item_id) do nothing;

update public.exchange_cases c set migration_review_required=true,
  migration_note=coalesce(c.migration_note||' ','')||'A physical item is referenced by multiple open legacy cases.'
where not private.bc_case_is_terminal(c.state) and exists(
  select 1 from public.exchange_cases other where other.id<>c.id and not private.bc_case_is_terminal(other.state)
    and (other.item_a in (c.item_a,c.item_b) or other.item_b in (c.item_a,c.item_b))
);

select pg_catalog.set_config('brickcircle.workflow_transition','on',false);
update public.collection_items ci set available_for_exchange=false,updated_at=pg_catalog.now()
where exists(select 1 from public.exchange_case_item_locks l where l.item_id=ci.id);
update public.collection_items ci set available_for_exchange=false,exchange_review_required=true,updated_at=pg_catalog.now()
where exists(select 1 from public.exchange_cases c where c.state='COMPLETED' and ci.id in (c.item_a,c.item_b));
select pg_catalog.set_config('brickcircle.workflow_transition','off',false);

-- Direct messages remain supported, but workflow conversation writes now go
-- exclusively through send_exchange_case_message().
create or replace function public.bc_prepare_exchange_message()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if new.exchange_id is not null then raise exception 'Use the canonical exchange case message action'; end if;
  if auth.uid() is null or new.sender_id<>auth.uid() then raise exception 'Only the signed-in sender may create a message'; end if;
  if new.recipient_id is null or new.recipient_id=auth.uid() then raise exception 'Choose another collector'; end if;
  if nullif(pg_catalog.btrim(new.body),'') is null then raise exception 'A message cannot be blank'; end if;
  return new;
end;
$$;

-- Durable email delivery remains asynchronous. Expanding the allow-list does
-- not make the user transition depend on Brevo or any network provider.
create or replace function public.enqueue_marketplace_notification_email()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if new.kind = any(array[
    'reciprocal_match','exchange_proposed','exchange_countered','exchange_accepted','exchange_declined',
    'exchange_withdrawn','exchange_expired','exchange_cancelled','meetup_proposed','meetup_accepted',
    'exchange_activated','early_return_requested','return_meetup_proposed','return_meetup_accepted',
    'return_due_7d','return_due_1d','return_overdue','exchange_disputed','exchange_resolved',
    'exchange_completed','exchange_message'
  ]::text[]) then
    insert into public.notification_email_deliveries(notification_id,recipient_user_id,notification_kind)
    values(new.id,new.user_id,new.kind) on conflict (notification_id) do nothing;
  end if;
  return new;
end;
$$;

-- Disable superseded lifecycle mutation entry points after legacy data is copied.
do $$
declare signature text;
begin
  foreach signature in array array[
    'public.create_exchange_request(uuid,uuid,integer,text)',
    'public.respond_exchange_request(uuid,text)',
    'public.setup_meetup(uuid,text,text,timestamp with time zone)',
    'public.setup_return_meetup(uuid,text,text,timestamp with time zone)',
    'public.meetup_action(uuid,text,text)',
    'public.return_action(uuid,text,text)',
    'public.cancel_in_person_exchange(uuid,text)',
    'public.release_exchange_item(uuid,text)',
    'public.report_overdue_return_issue(uuid,text)'
  ] loop
    if pg_catalog.to_regprocedure(signature) is not null then
      execute 'revoke execute on function '||signature||' from public,anon,authenticated';
    end if;
  end loop;
end $$;
revoke insert,update,delete on public.exchange_requests,public.exchanges,public.exchange_meetups,public.exchange_returns from authenticated;

revoke all on function private.bc_case_is_terminal(text) from public,anon,authenticated;
revoke all on function private.bc_case_other_user(public.exchange_cases,uuid) from public,anon,authenticated;
revoke all on function private.bc_case_snapshot(uuid,boolean) from public,anon,authenticated;
revoke all on function private.bc_case_notify(public.exchange_cases,uuid,uuid,text,text,text,uuid) from public,anon,authenticated;
revoke all on function private.bc_restore_case_preferences(public.exchange_cases) from public,anon,authenticated;
revoke all on function private.bc_mark_case_completed(public.exchange_cases) from public,anon,authenticated;
revoke all on function public.collection_item_exchange_status(uuid) from public,anon;
revoke all on function public.set_exchange_item_availability(uuid,boolean) from public,anon;
revoke all on function public.create_exchange_case(uuid,uuid,integer,text,text) from public,anon;
revoke all on function public.exchange_case_transition(uuid,bigint,text,text,jsonb) from public,anon;
revoke all on function public.resolve_exchange_case(uuid,bigint,text,text,text) from public,anon;
revoke all on function public.send_exchange_case_message(uuid,text,text) from public,anon;
revoke all on function public.expire_exchange_cases(integer) from public,anon,authenticated;
revoke all on function public.queue_exchange_case_reminders(timestamptz,integer) from public,anon,authenticated;
revoke all on function public.bc_guard_collection_case_fields() from public,anon,authenticated;
revoke all on function public.bc_guard_collection_case_delete() from public,anon,authenticated;
revoke all on function public.find_matches(uuid) from public,anon;
grant execute on function public.collection_item_exchange_status(uuid),public.set_exchange_item_availability(uuid,boolean),
  public.create_exchange_case(uuid,uuid,integer,text,text),public.exchange_case_transition(uuid,bigint,text,text,jsonb),
  public.send_exchange_case_message(uuid,text,text),public.find_matches(uuid) to authenticated;
grant execute on function public.resolve_exchange_case(uuid,bigint,text,text,text) to service_role;
grant execute on function public.resolve_exchange_case(uuid,bigint,text,text,text) to authenticated;
grant execute on function public.expire_exchange_cases(integer),public.queue_exchange_case_reminders(timestamptz,integer) to service_role;

comment on table public.exchange_cases is 'Authoritative BrickCircle reciprocal exchange lifecycle aggregate.';
comment on table public.exchange_case_events is 'Append-only exchange case audit and idempotency history.';
comment on table public.exchange_case_item_locks is 'Server-owned physical item soft-hold/reservation/custody locks.';
comment on function public.exchange_case_transition(uuid,bigint,text,text,jsonb) is 'Only participant workflow mutation boundary after proposal creation.';

notify pgrst,'reload schema';
