-- Dedicated resend RPC: existing transition branches and their ACLs stay intact.
create or replace function public.resend_exchange_case_invite(
 p_case_id uuid,p_expected_version bigint,p_idempotency_key text,p_payload jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 me uuid:=auth.uid(); c public.exchange_cases%rowtype;
 offered public.collection_items%rowtype; requested public.collection_items%rowtype;
 mine public.profiles%rowtype; theirs public.profiles%rowtype;
 clean_key text:=nullif(pg_catalog.btrim(p_idempotency_key),''); event_id uuid;
 old_deadline timestamptz; old_cancelled_at timestamptz; old_reason text; before_state text;
begin
 if me is null then raise exception 'Not authenticated'; end if;
 if clean_key is null then raise exception 'An idempotency key is required'; end if;
 -- Authorization precedes replay lookup, and the case lock serializes replay/revision checks.
 select * into c from public.exchange_cases where id=p_case_id for update;
 if not found or me not in (c.user_a,c.user_b) or me is distinct from c.proposer_id then
   raise exception 'Only the current proposer can resend this invite'; end if;
 if exists(select 1 from public.exchange_case_events where case_id=c.id and idempotency_key=clean_key
   and event_type='proposal_resent' and actor_user_id=me) then return private.bc_case_snapshot(c.id,true); end if;
 if c.migration_review_required or c.state not in ('PROPOSED','EXPIRED') then raise exception 'Only an expired proposal can be resent'; end if;
 if c.response_deadline is null or c.response_deadline>pg_catalog.now() then raise exception 'This proposal has not expired'; end if;
 if p_expected_version is null or p_expected_version<>c.state_version then raise exception 'This exchange changed. Refresh and try again.'; end if;
 perform 1 from public.collection_items where id in (c.item_a,c.item_b) order by id for update;
 select * into offered from public.collection_items where id=c.item_a;
 select * into requested from public.collection_items where id=c.item_b;
 if offered.id is null or requested.id is null or offered.user_id is distinct from c.user_a or requested.user_id is distinct from c.user_b then
   raise exception 'The selected physical sets no longer belong to these collectors'; end if;
  if not offered.available_for_exchange or offered.exchange_review_required or not requested.available_for_exchange or requested.exchange_review_required then raise exception 'One of these LEGO sets is not available'; end if;
  if offered.owner_photo_path is null or requested.owner_photo_path is null or offered.condition is null or requested.condition is null or offered.completeness is null or requested.completeness is null then raise exception 'Both sets need condition, completeness, and owner photos'; end if;
  select * into mine from public.profiles where id=c.user_a;
  select * into theirs from public.profiles where id=c.user_b;
  if mine.id is null or theirs.id is null or mine.adult_confirmed_at is null or theirs.adult_confirmed_at is null then raise exception 'Both collectors must complete their eligible profiles'; end if;
  if pg_catalog.lower(pg_catalog.btrim(coalesce(mine.country,'')))<>pg_catalog.lower(pg_catalog.btrim(coalesce(theirs.country,'')))
     or public.normalize_city(mine.country,mine.city)<>public.normalize_city(theirs.country,theirs.city) then raise exception 'Collectors must be in the same supported city'; end if;
  if exists(
    select 1 from public.exchange_user_blocks b
    where (b.blocker_id=c.user_a and b.blocked_id=c.user_b)
       or (b.blocker_id=c.user_b and b.blocked_id=c.user_a)
  ) then raise exception 'This collector is not eligible for an exchange with you'; end if;
  if not exists(select 1 from public.wishlists w where w.user_id=c.user_a and public.canonical_lego_product_identity(w.set_number)=public.canonical_lego_product_identity(requested.set_number))
     or not exists(select 1 from public.wishlists w where w.user_id=c.user_b and public.canonical_lego_product_identity(w.set_number)=public.canonical_lego_product_identity(offered.set_number)) then raise exception 'This reciprocal match is no longer available'; end if;

 if exists(select 1 from public.exchange_case_item_locks where item_id in (c.item_a,c.item_b)
   and (case_id is distinct from c.id or c.state<>'PROPOSED' or lock_kind<>'PROPOSAL_PENDING')) then
   raise exception 'One of these LEGO sets is already participating in another case'; end if;
 if exists(select 1 from public.exchange_cases other where other.id<>c.id
   and not private.bc_case_is_terminal(other.state)
   and (other.item_a in (c.item_a,c.item_b) or other.item_b in (c.item_a,c.item_b))) then
   raise exception 'One of these LEGO sets has another active invite'; end if;
 old_deadline:=c.response_deadline; old_cancelled_at:=c.cancelled_at; old_reason:=c.cancelled_reason; before_state:=c.state;
 if c.state='PROPOSED' then
   update public.exchange_cases set state='EXPIRED',cancelled_at=pg_catalog.now(),state_version=state_version+1,updated_at=pg_catalog.now() where id=c.id returning * into c;
   insert into public.exchange_case_events(case_id,event_type,previous_state,resulting_state,state_version,idempotency_key,metadata)
   values(c.id,'expire','PROPOSED','EXPIRED',c.state_version,'expire:'||c.id||':'||c.state_version||':'||c.response_deadline,
     pg_catalog.jsonb_build_object('response_deadline',c.response_deadline,'cancelled_at',c.cancelled_at,'cancelled_reason',c.cancelled_reason));
   old_cancelled_at:=c.cancelled_at;
 end if;
 -- Own pending holds may remain; never overwrite a competing reservation.
 insert into public.exchange_case_item_locks(item_id,case_id,lock_kind)
 select item,c.id,'PROPOSAL_PENDING' from unnest(array[c.item_a,c.item_b]) item
 where not exists(select 1 from public.exchange_case_item_locks l where l.item_id=item and l.case_id=c.id and l.lock_kind='PROPOSAL_PENDING');
 update public.exchange_cases set state='PROPOSED',response_deadline=pg_catalog.now()+interval '48 hours',
   cancelled_at=null,cancelled_reason=null,state_version=state_version+1,updated_at=pg_catalog.now() where id=c.id returning * into c;
 update public.exchange_case_conversations set archived_at=null where case_id=c.id;
 insert into public.exchange_case_events(case_id,event_type,previous_state,resulting_state,actor_user_id,state_version,idempotency_key,metadata)
 values(c.id,'proposal_resent','EXPIRED','PROPOSED',me,c.state_version,clean_key,
   pg_catalog.jsonb_build_object('previous_response_deadline',old_deadline,'previous_cancelled_at',old_cancelled_at,
     'previous_cancelled_reason',old_reason,'previous_state',before_state,'response_deadline',c.response_deadline)) returning id into event_id;
 perform private.bc_case_notify(c,event_id,c.recipient_id,'exchange_proposed','Exchange invite resent',
   'The proposer sent a fresh invite. Accept, decline, or counter within 48 hours.',me);
 return private.bc_case_snapshot(c.id,false);
end;
$$;
revoke all on function public.resend_exchange_case_invite(uuid,bigint,text,jsonb) from public,anon,authenticated;
grant execute on function public.resend_exchange_case_invite(uuid,bigint,text,jsonb) to authenticated,service_role;

create or replace function public.expire_exchange_cases(p_limit integer default 100)
returns integer language plpgsql security definer set search_path=''
as $$
declare c public.exchange_cases%rowtype; event_id uuid; expired_count integer:=0;
begin
  for c in select * from public.exchange_cases where state='PROPOSED' and response_deadline<=pg_catalog.now() order by response_deadline for update skip locked limit greatest(1,least(p_limit,1000)) loop
    update public.exchange_cases set state='EXPIRED',cancelled_at=pg_catalog.now(),state_version=state_version+1,updated_at=pg_catalog.now() where id=c.id returning * into c;
    perform private.bc_restore_case_preferences(c);
    insert into public.exchange_case_events(case_id,event_type,previous_state,resulting_state,actor_user_id,state_version,idempotency_key,metadata)
    values(c.id,'expire','PROPOSED','EXPIRED',null,c.state_version,'expire:'||c.id::text||':'||c.state_version::text||':'||c.response_deadline::text,pg_catalog.jsonb_build_object('response_deadline',c.response_deadline,'cancelled_at',c.cancelled_at,'cancelled_reason',c.cancelled_reason)) returning id into event_id;
    perform private.bc_case_notify(c,event_id,c.user_a,'exchange_expired','Exchange proposal expired','The proposal expired after 48 hours.',null);
    perform private.bc_case_notify(c,event_id,c.user_b,'exchange_expired','Exchange proposal expired','The proposal expired after 48 hours.',null);
    expired_count:=expired_count+1;
  end loop;
  return expired_count;
end;
$$;

-- Shared key calculation keeps candidate filtering and locked insertion identical.
create or replace function private.bc_case_reminder_key(c public.exchange_cases,p_now timestamptz)
returns text language sql stable set search_path='' as $$
 select case
 when c.state='PROPOSED' then 'proposal:'||c.id::text||':'||c.response_deadline::text||':'||
   (select coalesce(max(e.state_version),0)::text from public.exchange_case_events e
    where e.case_id=c.id and e.event_type in ('proposal_created','counter','proposal_resent'))||':'||
   case when c.response_deadline<=p_now+interval '1 hour' then '1h' else '24h' end
 when c.return_due_at<p_now then 'return-overdue:'||c.id::text||':'||p_now::date::text
 when c.return_due_at<=p_now+interval '1 day' then 'return-1d:'||c.id::text
 else 'return-7d:'||c.id::text end;
$$;
revoke all on function private.bc_case_reminder_key(public.exchange_cases,timestamptz) from public,anon,authenticated;

create or replace function public.queue_exchange_case_reminders(p_now timestamptz default pg_catalog.now(),p_limit integer default 500)
returns integer language plpgsql security definer set search_path=''
as $$
declare c public.exchange_cases%rowtype; inserted_count integer:=0; recipient uuid; reminder_kind text; reminder_key text; stage text; proposal_revision bigint;
begin
  for c in select candidate.* from public.exchange_cases candidate where (
    (state='PROPOSED' and response_deadline>p_now and response_deadline<=p_now+interval '24 hours')
    or (state in ('ACTIVE','EARLY_RETURN','RETURN_PLANNING','RETURN_INSPECTION') and return_due_at is not null and return_due_at<=p_now+interval '7 days'))
    -- Filter the CURRENT stage before the bounded batch, including both return recipients.
    and exists(
      select 1 from unnest(case when candidate.state='PROPOSED' then array[candidate.recipient_id]
        else array[candidate.user_a,candidate.user_b] end) target(user_id)
      where not exists(select 1 from public.notifications n
        where n.dedupe_key=private.bc_case_reminder_key(candidate,p_now)||':'||target.user_id::text)
    )
    order by updated_at,id limit greatest(1,least(p_limit,2000)) for update skip locked
  loop
    if c.state='PROPOSED' then recipient:=c.recipient_id;reminder_kind:='proposal_reminder';
      select coalesce(max(e.state_version),0) into proposal_revision from public.exchange_case_events e where e.case_id=c.id and e.event_type in ('proposal_created','counter','proposal_resent');
      stage:=case when c.response_deadline<=p_now+interval '1 hour' then '1h' else '24h' end;
      reminder_key:='proposal:'||c.id::text||':'||c.response_deadline::text||':'||proposal_revision::text||':'||stage;
    elsif c.return_due_at<p_now then reminder_kind:='return_overdue';reminder_key:='return-overdue:'||c.id::text||':'||p_now::date::text;
    elsif c.return_due_at<=p_now+interval '1 day' then reminder_kind:='return_due_1d';reminder_key:='return-1d:'||c.id::text;
    else reminder_kind:='return_due_7d';reminder_key:='return-7d:'||c.id::text; end if;
    foreach recipient in array (case when c.state='PROPOSED' then array[c.recipient_id] else array[c.user_a,c.user_b] end) loop
      -- The legacy entity index cannot represent multiple stages/days. Canonical case
      -- routing uses exchange_case_id + metadata; explicit dedupe_key governs these rows.
      reminder_key:=private.bc_case_reminder_key(c,p_now);
      insert into public.notifications(user_id,kind,title,body,entity_type,entity_id,metadata,exchange_case_id,dedupe_key)
      values(recipient,reminder_kind,case when reminder_kind='proposal_reminder' then 'Exchange proposal waiting' else 'LEGO return reminder' end,
        case when reminder_kind='proposal_reminder' then 'Accept, decline, or counter before '||c.response_deadline::text||'. About '||greatest(1,ceil(extract(epoch from (c.response_deadline-p_now))/60))::text||' minutes remain.' when reminder_kind='return_overdue' then 'The agreed return date has passed. Arrange the return or report an issue.' else 'Your temporary LEGO exchange return date is approaching.' end,
        'exchange_case',null,pg_catalog.jsonb_build_object('exchange_case_id',c.id,'route','#exchange/'||c.id::text)||case when c.state='PROPOSED' then pg_catalog.jsonb_build_object('response_deadline',c.response_deadline,'state_version',c.state_version,'recipient_id',c.recipient_id,'stage',stage,'proposal_revision',proposal_revision) else '{}'::jsonb end,c.id,reminder_key||':'||recipient::text)
      on conflict (dedupe_key) where dedupe_key is not null do nothing;
      if found then inserted_count:=inserted_count+1; end if;
    end loop;
  end loop;
  return inserted_count;
end;
$$;


-- Reuse the existing kind; extend the live allowlist without discarding later additions.
do $$ declare definition text; begin
 select pg_get_functiondef('public.enqueue_marketplace_notification_email()'::regprocedure) into definition;
 if position('new.kind = ''proposal_reminder'' or' in definition)>0 then return; end if;
 if position('if new.kind = any(array[' in definition)=0 then raise exception 'Unexpected email outbox trigger definition'; end if;
 execute replace(definition,'if new.kind = any(array[', 'if new.kind = ''proposal_reminder'' or new.kind = any(array[');
end $$;

-- Shared delivery-time validity check. Fail closed if reminder metadata is absent/stale.
create or replace function public.exchange_proposal_notification_current(p_notification_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select n.kind<>'proposal_reminder' or exists(
   select 1 from public.exchange_cases c where c.id=n.exchange_case_id and c.state='PROPOSED'
   and c.recipient_id=n.user_id and c.response_deadline>pg_catalog.now()
   and c.response_deadline::text=(n.metadata->>'response_deadline')::timestamptz::text
   and (select coalesce(max(e.state_version),0)::text from public.exchange_case_events e where e.case_id=c.id and e.event_type in ('proposal_created','counter','proposal_resent'))=n.metadata->>'proposal_revision'
   and c.recipient_id::text=n.metadata->>'recipient_id'
 ) from public.notifications n where n.id=p_notification_id),false);
$$;
revoke all on function public.exchange_proposal_notification_current(uuid) from public,anon,authenticated;
grant execute on function public.exchange_proposal_notification_current(uuid) to service_role;

-- Deployment deliberately fails if Cron is unavailable instead of silently omitting scheduling.
do $$ begin
 if not exists(select 1 from pg_extension where extname='pg_cron') then raise exception 'Enable pg_cron before applying proposal reminder migration'; end if;
 perform cron.schedule('brickcircle-proposal-deadlines','*/5 * * * *',
   'select public.expire_exchange_cases(100); select public.queue_exchange_case_reminders(now(),500);');
end $$;
notify pgrst,'reload schema';
