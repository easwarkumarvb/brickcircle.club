-- Direct chat retains RLS; retries use one sender-scoped request key.
alter table public.messages add column if not exists client_message_key text;
create unique index if not exists messages_sender_client_key_idx
  on public.messages(sender_id,client_message_key) where client_message_key is not null;
revoke truncate, trigger, references on public.messages from anon, authenticated;

create or replace function public.send_collector_message(p_recipient_id uuid,p_body text,p_idempotency_key text)
returns jsonb language plpgsql security invoker set search_path=''
as $$
declare me uuid:=auth.uid(); clean_body text:=pg_catalog.btrim(p_body); clean_key text:=pg_catalog.btrim(p_idempotency_key); prior public.messages%rowtype;
begin
  if me is null then raise exception 'Sign in to send a message' using errcode='42501'; end if;
  if p_recipient_id is null or p_recipient_id=me then raise exception 'Choose another collector' using errcode='22023'; end if;
  if clean_body is null or pg_catalog.char_length(clean_body) not between 1 and 4000 then raise exception 'Write a message of 1 to 4000 characters' using errcode='22023'; end if;
  if clean_key is null or pg_catalog.char_length(clean_key) not between 1 and 200 then raise exception 'A valid request key is required' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('collector-message:'||me::text||':'||clean_key,0));
  select * into prior from public.messages where sender_id=me and client_message_key=clean_key;
  if found then
    if prior.recipient_id<>p_recipient_id or prior.body<>clean_body or prior.exchange_id is not null then raise exception 'Request key was used for another message' using errcode='22023'; end if;
    return pg_catalog.jsonb_build_object('ok',true,'idempotent',true,'message',pg_catalog.to_jsonb(prior));
  end if;
  if not exists(select 1 from public.public_profiles where id=p_recipient_id) then raise exception 'Collector unavailable' using errcode='22023'; end if;
  insert into public.messages(sender_id,recipient_id,exchange_id,body,client_message_key)
    values(me,p_recipient_id,null,clean_body,clean_key) returning * into prior;
  return pg_catalog.jsonb_build_object('ok',true,'idempotent',false,'message',pg_catalog.to_jsonb(prior));
end;
$$;
revoke all on function public.send_collector_message(uuid,text,text) from public,anon;
grant execute on function public.send_collector_message(uuid,text,text) to authenticated;

-- Existing canonical writer must serialize concurrent retries and bind the key
-- to the original case/body. The notification commits with the message.
create or replace function public.send_exchange_case_message(p_case_id uuid,p_body text,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare me uuid:=auth.uid(); c public.exchange_cases%rowtype; cv public.exchange_case_conversations%rowtype;
  created_message public.exchange_case_messages%rowtype; other_user uuid;
  clean_key text:=pg_catalog.btrim(p_idempotency_key); clean_body text:=pg_catalog.btrim(p_body);
begin
  if me is null then raise exception 'Not authenticated' using errcode='42501'; end if;
  if clean_key is null or pg_catalog.char_length(clean_key) not between 1 and 200 then raise exception 'A valid request key is required' using errcode='22023'; end if;
  if clean_body is null or pg_catalog.char_length(clean_body) not between 1 and 4000 then raise exception 'Write a message of 1 to 4000 characters' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('case-message:'||me::text||':'||clean_key,0));
  select * into created_message from public.exchange_case_messages where sender_id=me and idempotency_key=clean_key;
  if found then
    if created_message.case_id<>p_case_id or created_message.body<>clean_body then raise exception 'Request key was used for another message' using errcode='22023'; end if;
    return pg_catalog.jsonb_build_object('ok',true,'idempotent',true,'message',pg_catalog.to_jsonb(created_message));
  end if;
  select * into c from public.exchange_cases where id=p_case_id for share;
  if not found or me not in(c.user_a,c.user_b) then raise exception 'Exchange case unavailable' using errcode='42501'; end if;
  if c.state in('DECLINED','WITHDRAWN','EXPIRED','CANCELLED','COMPLETED') then raise exception 'This conversation is archived' using errcode='22023'; end if;
  select * into cv from public.exchange_case_conversations where case_id=c.id;
  other_user:=private.bc_case_other_user(c,me);
  insert into public.exchange_case_messages(conversation_id,case_id,sender_id,recipient_id,body,idempotency_key)
    values(cv.id,c.id,me,other_user,clean_body,clean_key) returning * into created_message;
  insert into public.notifications(user_id,kind,title,body,actor_user_id,entity_type,entity_id,metadata,exchange_case_id,exchange_case_message_id,dedupe_key)
    values(other_user,'exchange_message','New exchange message','The other collector sent a message.',me,'exchange_case_message',created_message.id,
      pg_catalog.jsonb_build_object('exchange_case_id',c.id,'route','#messages/case:'||c.id::text),c.id,created_message.id,'case-message:'||other_user::text||':'||created_message.id::text)
    on conflict(dedupe_key) where dedupe_key is not null do nothing;
  return pg_catalog.jsonb_build_object('ok',true,'idempotent',false,'message',pg_catalog.to_jsonb(created_message));
end;
$$;
revoke all on function public.send_exchange_case_message(uuid,text,text) from public,anon;
grant execute on function public.send_exchange_case_message(uuid,text,text) to authenticated;
