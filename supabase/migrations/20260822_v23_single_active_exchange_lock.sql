-- BrickCircle V2.3: one physical collection item may participate in only one active accepted exchange.
-- Pending proposals remain allowed. Acceptance atomically reserves both physical collection items.

-- Database-level race protection: each item can appear at most once among active exchanges.
create unique index if not exists uq_active_exchange_item_a
on public.exchanges(item_a)
where state not in ('completed','cancelled','disputed');

create unique index if not exists uq_active_exchange_item_b
on public.exchanges(item_b)
where state not in ('completed','cancelled','disputed');

create or replace function public.respond_exchange_request(p_request_id uuid, p_action text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
 r public.exchange_requests%rowtype;
 ex public.exchanges%rowtype;
 me uuid:=auth.uid();
 conflict_count integer;
begin
 if me is null then raise exception 'Not authenticated'; end if;
 if p_action not in ('accept','decline','cancel') then raise exception 'Invalid action'; end if;
 select * into r from public.exchange_requests where id=p_request_id for update;
 if not found then raise exception 'Exchange request not found'; end if;
 if r.status<>'pending' then raise exception 'Request is no longer pending'; end if;
 if p_action in ('accept','decline') and me<>r.responder_id then raise exception 'Only the responder can accept or decline'; end if;
 if p_action='cancel' and me<>r.requester_id then raise exception 'Only the requester can cancel'; end if;

 if p_action='accept' then
  if r.requester_id=r.responder_id then raise exception 'Self-exchanges are not allowed'; end if;

  -- Lock both physical inventory rows in deterministic order so two simultaneous accepts cannot reserve the same set.
  perform 1 from public.collection_items
   where id in (r.offered_item_id,r.requested_item_id)
   order by id for update;

  if not exists(select 1 from public.collection_items where id=r.offered_item_id and user_id=r.requester_id and available_for_exchange) then
   raise exception 'Offered item is not available for exchange';
  end if;
  if not exists(select 1 from public.collection_items where id=r.requested_item_id and user_id=r.responder_id and available_for_exchange) then
   raise exception 'Requested item is not available for exchange';
  end if;
  if exists(select 1 from public.exchanges where state not in ('completed','cancelled','disputed') and (item_a in(r.offered_item_id,r.requested_item_id) or item_b in(r.offered_item_id,r.requested_item_id))) then
   raise exception 'One of these LEGO sets is already reserved in another active exchange';
  end if;

  update public.exchange_requests set status='accepted',updated_at=now() where id=r.id;

  begin
   insert into public.exchanges(request_id,user_a,user_b,item_a,item_b,duration_days,deposit_amount,payment_status,condition_photos_required,state,started_at,created_at,updated_at)
   values(r.id,r.requester_id,r.responder_id,r.offered_item_id,r.requested_item_id,r.duration_days,r.proposed_deposit,'not_connected',true,'accepted',now(),now(),now())
   returning * into ex;
  exception when unique_violation then
   raise exception 'One of these LEGO sets was just reserved in another active exchange';
  end;

  -- Reserved sets are no longer advertised as exchangeable while this exchange is active.
  update public.collection_items
   set available_for_exchange=false
   where id in(r.offered_item_id,r.requested_item_id);

  -- Other pending proposals involving either physical set can no longer be accepted.
  -- Keep history visible but mark them unavailable instead of silently deleting them.
  update public.exchange_requests
   set status='cancelled',updated_at=now()
   where id<>r.id and status='pending'
     and (offered_item_id in(r.offered_item_id,r.requested_item_id)
       or requested_item_id in(r.offered_item_id,r.requested_item_id));
  get diagnostics conflict_count = row_count;

  insert into public.notifications(user_id,kind,title,body,created_at) values
   (r.requester_id,'exchange_accepted','Exchange request accepted','Your exchange request was accepted. Both LEGO sets are now reserved for this exchange.',now()),
   (r.responder_id,'exchange_created','Exchange created','Your accepted exchange is active. Both LEGO sets are now reserved.',now());
  return jsonb_build_object('ok',true,'status','accepted','exchange_id',ex.id,'sets_reserved',true,'other_requests_closed',conflict_count);

 elsif p_action='decline' then
  update public.exchange_requests set status='declined',updated_at=now() where id=r.id;
  insert into public.notifications(user_id,kind,title,body,created_at) values(r.requester_id,'exchange_declined','Exchange request declined','Your exchange request was declined.',now());
  return jsonb_build_object('ok',true,'status','declined');
 else
  update public.exchange_requests set status='cancelled',updated_at=now() where id=r.id;
  insert into public.notifications(user_id,kind,title,body,created_at) values(r.responder_id,'exchange_cancelled','Exchange request cancelled','An exchange request to you was cancelled.',now());
  return jsonb_build_object('ok',true,'status','cancelled');
 end if;
end; $$;

-- In-person cancellation releases both physical sets back to the marketplace.
create or replace function public.cancel_in_person_exchange(p_exchange_id uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare e public.exchanges%rowtype; me uuid:=auth.uid(); other uuid;
begin
 if me is null then raise exception 'Not authenticated'; end if;
 select * into e from public.exchanges where id=p_exchange_id for update;
 if not found then raise exception 'Exchange not found'; end if;
 if me not in(e.user_a,e.user_b) then raise exception 'Not an exchange participant'; end if;
 if e.state in('completed','cancelled','disputed') then raise exception 'Exchange is already closed'; end if;
 other:=case when me=e.user_a then e.user_b else e.user_a end;
 update public.exchanges set state='cancelled',updated_at=now() where id=e.id;
 update public.exchange_meetups set status='cancelled',updated_at=now() where exchange_id=e.id;
 update public.collection_items set available_for_exchange=true where id in(e.item_a,e.item_b);
 insert into public.notifications(user_id,kind,title,body,created_at)
 values(other,'exchange_cancelled','Exchange cancelled',coalesce(nullif(trim(p_reason),''),'The other collector cancelled this exchange. The LEGO sets are available again.'),now());
 return jsonb_build_object('ok',true,'status','cancelled','sets_released',true);
end $$;

revoke all on function public.respond_exchange_request(uuid,text) from public;
grant execute on function public.respond_exchange_request(uuid,text) to authenticated;
revoke all on function public.cancel_in_person_exchange(uuid,text) from public;
grant execute on function public.cancel_in_person_exchange(uuid,text) to authenticated;
