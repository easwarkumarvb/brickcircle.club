-- BrickCircle V2.5: acceptance must use canonical beta city values.
create or replace function public.respond_exchange_request(p_request_id uuid,p_action text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.exchange_requests%rowtype; ex public.exchanges%rowtype; me uuid:=auth.uid(); conflict_count integer; city_a text; city_b text; country_a text; country_b text;
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
  select public.normalize_beta_city(country,city),trim(country) into city_a,country_a from public.profiles where id=r.requester_id;
  select public.normalize_beta_city(country,city),trim(country) into city_b,country_b from public.profiles where id=r.responder_id;
  if coalesce(city_a,'')='' or coalesce(city_b,'')='' then raise exception 'Both collectors must choose a supported beta city before accepting a local exchange'; end if;
  if lower(city_a)<>lower(city_b) or lower(coalesce(country_a,''))<>lower(coalesce(country_b,'')) then raise exception 'BrickCircle currently supports in-person exchanges only between collectors registered in the same supported beta city'; end if;
  perform 1 from public.collection_items where id in(r.offered_item_id,r.requested_item_id) order by id for update;
  if not exists(select 1 from public.collection_items where id=r.offered_item_id and user_id=r.requester_id and available_for_exchange) then raise exception 'Offered item is not available for exchange'; end if;
  if not exists(select 1 from public.collection_items where id=r.requested_item_id and user_id=r.responder_id and available_for_exchange) then raise exception 'Requested item is not available for exchange'; end if;
  if exists(select 1 from public.exchanges where state not in ('completed','cancelled','disputed') and (item_a in(r.offered_item_id,r.requested_item_id) or item_b in(r.offered_item_id,r.requested_item_id))) then raise exception 'One of these LEGO sets is already reserved in another active exchange'; end if;
  update public.exchange_requests set status='accepted',updated_at=now() where id=r.id;
  begin
   insert into public.exchanges(request_id,user_a,user_b,item_a,item_b,duration_days,deposit_amount,payment_status,condition_photos_required,state,started_at,created_at,updated_at)
   values(r.id,r.requester_id,r.responder_id,r.offered_item_id,r.requested_item_id,r.duration_days,r.proposed_deposit,'not_connected',true,'accepted',now(),now(),now()) returning * into ex;
  exception when unique_violation then raise exception 'One of these LEGO sets was just reserved in another active exchange'; end;
  update public.collection_items set available_for_exchange=false where id in(r.offered_item_id,r.requested_item_id);
  update public.exchange_requests set status='cancelled',updated_at=now() where id<>r.id and status='pending' and (offered_item_id in(r.offered_item_id,r.requested_item_id) or requested_item_id in(r.offered_item_id,r.requested_item_id));
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
end $$;
