-- BrickCircle V2.2 Exchange Engine hardening
-- Applied to production Supabase project nsxtromjdpdscknadxez.

create or replace function public.respond_exchange_request(p_request_id uuid, p_action text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.exchange_requests%rowtype; ex public.exchanges%rowtype; me uuid:=auth.uid();
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
  if not exists(select 1 from public.collection_items where id=r.offered_item_id and user_id=r.requester_id and available_for_exchange) then raise exception 'Offered item is not available for exchange'; end if;
  if not exists(select 1 from public.collection_items where id=r.requested_item_id and user_id=r.responder_id and available_for_exchange) then raise exception 'Requested item is not available for exchange'; end if;
  if exists(select 1 from public.exchanges where state not in ('completed','cancelled','disputed') and (item_a in(r.offered_item_id,r.requested_item_id) or item_b in(r.offered_item_id,r.requested_item_id))) then raise exception 'One of these LEGO sets is already in an active exchange'; end if;
  update public.exchange_requests set status='accepted',updated_at=now() where id=r.id;
  insert into public.exchanges(request_id,user_a,user_b,item_a,item_b,duration_days,deposit_amount,payment_status,condition_photos_required,state,started_at,created_at,updated_at)
  values(r.id,r.requester_id,r.responder_id,r.offered_item_id,r.requested_item_id,r.duration_days,r.proposed_deposit,'not_connected',true,'accepted',now(),now(),now()) returning * into ex;
  insert into public.notifications(user_id,kind,title,body,created_at) values
   (r.requester_id,'exchange_accepted','Exchange request accepted','Your exchange request was accepted. Your exchange is now active.',now()),
   (r.responder_id,'exchange_created','Exchange created','Your accepted exchange is now active.',now());
  return jsonb_build_object('ok',true,'status','accepted','exchange_id',ex.id);
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

create or replace function public.advance_exchange(p_exchange_id uuid,p_state text,p_tracking text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare e public.exchanges%rowtype; me uuid:=auth.uid(); old text; valid boolean:=false;
begin
 if me is null then raise exception 'Not authenticated'; end if;
 select * into e from public.exchanges where id=p_exchange_id for update;
 if not found then raise exception 'Exchange not found'; end if;
 if me not in(e.user_a,e.user_b) then raise exception 'Not an exchange participant'; end if;
 old:=e.state;
 valid=(old,p_state) in (('accepted','deposit_pending'),('deposit_pending','photos_pending'),('photos_pending','shipping'),('shipping','building'),('building','return_shipping'),('return_shipping','inspection'),('inspection','completed'),('accepted','cancelled'),('deposit_pending','cancelled'),('photos_pending','cancelled'),('shipping','cancelled'),('building','cancelled'),('return_shipping','cancelled'),('inspection','cancelled'));
 if not valid then raise exception 'Invalid exchange state transition from % to %',old,p_state; end if;
 if p_state in('shipping','return_shipping') and coalesce(trim(p_tracking),'')<>'' then
  if me=e.user_a then update public.exchanges set state=p_state,shipping_a_tracking=p_tracking,updated_at=now() where id=e.id;
  else update public.exchanges set state=p_state,shipping_b_tracking=p_tracking,updated_at=now() where id=e.id; end if;
 else
  update public.exchanges set state=p_state,completed_at=case when p_state='completed' then now() else completed_at end,updated_at=now() where id=e.id;
 end if;
 insert into public.notifications(user_id,kind,title,body,created_at) values(case when me=e.user_a then e.user_b else e.user_a end,'exchange_status','Exchange updated','Your exchange moved to: '||replace(p_state,'_',' '),now());
 return jsonb_build_object('ok',true,'state',p_state);
end; $$;

create or replace function public.submit_exchange_review(p_exchange_id uuid,p_rating integer,p_comment text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare e public.exchanges%rowtype; me uuid:=auth.uid(); other uuid;
begin
 if me is null then raise exception 'Not authenticated'; end if;
 if p_rating<1 or p_rating>5 then raise exception 'Rating must be between 1 and 5'; end if;
 select * into e from public.exchanges where id=p_exchange_id;
 if not found then raise exception 'Exchange not found'; end if;
 if e.state<>'completed' then raise exception 'Reviews are available only after completion'; end if;
 if me not in(e.user_a,e.user_b) then raise exception 'Not an exchange participant'; end if;
 other:=case when me=e.user_a then e.user_b else e.user_a end;
 insert into public.reviews(exchange_id,reviewer_id,reviewee_id,rating,comment,created_at) values(e.id,me,other,p_rating,nullif(trim(p_comment),''),now());
 update public.profiles p set rating=(select round(avg(rating)::numeric,2) from public.reviews where reviewee_id=p.id),review_count=(select count(*) from public.reviews where reviewee_id=p.id),updated_at=now() where p.id=other;
 insert into public.notifications(user_id,kind,title,body,created_at) values(other,'review_received','New collector review','You received a review for a completed BrickCircle exchange.',now());
 return jsonb_build_object('ok',true);
exception when unique_violation then raise exception 'You already reviewed this exchange';
end; $$;

revoke all on function public.respond_exchange_request(uuid,text) from public;
grant execute on function public.respond_exchange_request(uuid,text) to authenticated;
revoke all on function public.advance_exchange(uuid,text,text) from public;
grant execute on function public.advance_exchange(uuid,text,text) to authenticated;
revoke all on function public.submit_exchange_review(uuid,integer,text) from public;
grant execute on function public.submit_exchange_review(uuid,integer,text) to authenticated;

drop policy if exists "participants update requests" on public.exchange_requests;
drop policy if exists "participants update exchanges" on public.exchanges;
drop policy if exists "users send messages" on public.messages;
drop policy if exists "participants send exchange messages" on public.messages;
drop policy if exists "users read notifications" on public.notifications;
drop policy if exists "users read own notifications" on public.notifications;

create policy "participants send exchange messages" on public.messages for insert to authenticated with check(auth.uid()=sender_id and (exchange_id is null or exists(select 1 from public.exchanges e where e.id=exchange_id and auth.uid() in(e.user_a,e.user_b) and recipient_id in(e.user_a,e.user_b) and recipient_id<>auth.uid())));
create policy "users update own notifications" on public.notifications for update to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);

create index if not exists idx_exchange_requests_participants on public.exchange_requests(requester_id,responder_id,status);
create index if not exists idx_exchanges_participants on public.exchanges(user_a,user_b,state);
create index if not exists idx_messages_exchange_created on public.messages(exchange_id,created_at);
create index if not exists idx_notifications_user_created on public.notifications(user_id,created_at desc);
