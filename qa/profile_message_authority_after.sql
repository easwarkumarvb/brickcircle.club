set role authenticated;
set "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000801';
do $$
declare field text; blocked boolean;
begin
 foreach field in array array['rating','review_count','trust_score','email','email_verified',
 'identity_verified','address_verified','mfa_enabled','member_since','created_at',
 'founding_member_number','founding_member_granted_at','membership_ordinal',
 'early_member_number','early_member_granted_at','adult_confirmed_at',
 'adult_confirmation_version','adult_confirmation_text','future_sensitive_probe'] loop
   blocked:=false;
   begin execute format('update public.profiles set %I=%I where id=auth.uid()',field,field);
   exception when insufficient_privilege then blocked:=true; end;
   if not blocked then raise exception 'Sensitive UPDATE permitted: %',field; end if;
   blocked:=false;
   begin execute format('insert into public.profiles(id,%I) values(auth.uid(),null)',field);
   exception when insufficient_privilege then blocked:=true; end;
   if not blocked then raise exception 'Sensitive INSERT permitted: %',field; end if;
 end loop;
end $$;
-- These unused operations were already denied by RLS; remove grants as well.
do $$ begin
 begin
  update public.messages set created_at='2099-01-01',body='Changed';
  raise exception 'Message update unexpectedly permitted';
 exception when insufficient_privilege then null; end;
 begin
  delete from public.messages;
  raise exception 'Message delete unexpectedly permitted';
 exception when insufficient_privilege then null; end;
end $$;
do $$ begin
 begin
  update public.profiles set display_name=repeat('x',101) where id=auth.uid();
  raise exception 'Oversized profile field unexpectedly accepted';
 exception when check_violation then null; end;
end $$;
-- Same columns as app onboarding upsert and profile editor.
insert into public.profiles(id,display_name,country,city,updated_at)
values(auth.uid(),'Edited A','India','Bengaluru','2099-01-01')
on conflict(id) do update set id=excluded.id,display_name=excluded.display_name,
 country=excluded.country,city=excluded.city,updated_at=excluded.updated_at;
update public.profiles set bio='Collector biography' where id=auth.uid();
do $$ begin
 if not exists(select 1 from public.profiles where id=auth.uid() and bio='Collector biography'
 and updated_at<now()+interval '1 minute') then raise exception 'Allowed edit/upsert failed'; end if;
 if exists(select 1 from public.public_profiles where id=auth.uid() and (identity_verified or review_count<>0)) then
 raise exception 'Forged public reputation survived'; end if;
 begin
   update public.profiles set id='00000000-0000-4000-8000-000000000803' where id=auth.uid();
   raise exception 'Profile ownership transfer permitted';
 exception when insufficient_privilege then null; end;
 update public.profiles set bio='tampered' where id='00000000-0000-4000-8000-000000000802';
 if found then raise exception 'Cross-user edit permitted'; end if;
end $$;
-- Self-scoped provider RPC remains privileged; direct provenance mutation fails.
select public.sync_my_provider_avatar();
do $$ begin
 if not exists(select 1 from public.profiles where id=auth.uid()
 and avatar_source='provider' and avatar_url='https://example.test/provider-a.jpg') then
 raise exception 'Provider synchronization failed'; end if;
 begin
   update public.profiles set avatar_url='https://example.test/forged.jpg',avatar_source='provider' where id=auth.uid();
   raise exception 'Provider provenance forgery permitted';
 exception when insufficient_privilege then null; end;
end $$;
update public.profiles set avatar_url=auth.uid()::text||'/upload.jpg',avatar_source='upload' where id=auth.uid();
select public.sync_my_provider_avatar();
do $$ begin
 if not exists(select 1 from public.profiles where id=auth.uid() and avatar_source='upload'
 and avatar_url=auth.uid()::text||'/upload.jpg') then raise exception 'Provider overwrote upload'; end if;
 begin
   update public.profiles set avatar_source='provider' where id=auth.uid();
   raise exception 'Client provider source assignment permitted';
 exception when insufficient_privilege then null; end;
 begin
   update public.profiles set avatar_url='00000000-0000-4000-8000-000000000802/stolen.jpg',avatar_source='upload' where id=auth.uid();
   raise exception 'Cross-owner uploaded avatar permitted';
 exception when insufficient_privilege then null; end;
end $$;
select public.confirm_adult_status('I confirm that I am at least 18 years old and legally able to participate in BrickCircle exchanges.','2026-09-11');
do $$ begin
 if not exists(select 1 from public.profiles where id=auth.uid() and adult_confirmed_at is not null) then
 raise exception 'Adult RPC was broken'; end if;
 begin
   perform public.confirm_adult_status('wrong','wrong');
   raise exception 'Invalid adult attestation permitted';
 exception when invalid_parameter_value then null; end;
end $$;
-- New profile insertion is allowed using the onboarding fields, not trust flags.
set "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000803';
do $$ begin
 begin
   insert into public.profiles(id,avatar_url,avatar_source)
   values(auth.uid(),'https://example.test/forged-provider.jpg','provider');
   raise exception 'Client INSERT provider provenance permitted';
 exception when insufficient_privilege then null; end;
end $$;
insert into public.profiles(id,display_name,country,city,updated_at)
values(auth.uid(),'New C','India','Bengaluru',now())
on conflict(id) do update set id=excluded.id,display_name=excluded.display_name,
 country=excluded.country,city=excluded.city,updated_at=excluded.updated_at;
do $$ begin
 if not exists(select 1 from public.public_profiles where id=auth.uid() and display_name='New C') then
 raise exception 'New onboarding projection failed'; end if;
end $$;

set "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000801';
insert into public.messages(id,sender_id,recipient_id,body,created_at) values
 ('00000000-0000-4000-8000-000000000901',auth.uid(),'00000000-0000-4000-8000-000000000802','  future candidate  ','2099-01-01');
do $$ begin
 if not exists(select 1 from public.messages where id='00000000-0000-4000-8000-000000000901'
 and body='future candidate' and created_at between now()-interval '1 minute' and now()+interval '1 minute') then
 raise exception 'Direct message timestamp/body authority failed'; end if;
 begin
   insert into public.messages(sender_id,recipient_id,body) values(auth.uid(),'00000000-0000-4000-8000-000000000802',repeat('x',4001));
   raise exception 'Oversized direct body permitted';
 exception when invalid_parameter_value then null; end;
 begin
   insert into public.messages(sender_id,recipient_id,body) values(auth.uid(),'00000000-0000-4000-8000-000000000802','   ');
   raise exception 'Blank direct body permitted';
 exception when invalid_parameter_value then null; end;
 begin
   insert into public.messages(sender_id,recipient_id,body) values('00000000-0000-4000-8000-000000000802',auth.uid(),'forged sender');
   raise exception 'Forged sender permitted';
 exception when insufficient_privilege then null; end;
end $$;
set "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000802';
select public.mark_collector_conversation_read('00000000-0000-4000-8000-000000000801',created_at,'direct_message',id)
from public.messages where id='00000000-0000-4000-8000-000000000901';
set "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000801';
select public.send_collector_message('00000000-0000-4000-8000-000000000802','Later normal message','authority-normal');
select public.send_collector_message('00000000-0000-4000-8000-000000000802','Later normal message','authority-normal');
select public.send_collector_message('00000000-0000-4000-8000-000000000802',repeat('x',4000),'authority-max');
set "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000802';
do $$ begin
 if not exists(select 1 from public.collector_conversation_summaries where user_id=auth.uid()
 and peer_id='00000000-0000-4000-8000-000000000801' and unread_count=2 and through_at<now()+interval '1 minute') then
 raise exception 'Later messages lost unread state'; end if;
 if (select count(*) from public.messages where client_message_key='authority-normal')<>1 then
 raise exception 'Message RPC idempotency broken'; end if;
end $$;
reset role;
-- Existing legacy exchange messages still derive recipient from actual parties.
insert into public.exchanges(id,user_a,user_b,duration_days,state) values
 ('00000000-0000-4000-8000-000000000950','00000000-0000-4000-8000-000000000801',
 '00000000-0000-4000-8000-000000000802',30,'accepted');
set role authenticated;
set "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000801';
insert into public.messages(id,sender_id,recipient_id,exchange_id,body) values
 ('00000000-0000-4000-8000-000000000951',auth.uid(),'00000000-0000-4000-8000-000000000803',
 '00000000-0000-4000-8000-000000000950','legacy participants');
do $$ begin
 if not exists(select 1 from public.messages where id='00000000-0000-4000-8000-000000000951'
 and recipient_id='00000000-0000-4000-8000-000000000802') then
 raise exception 'Legacy exchange recipient binding broken'; end if;
end $$;
set "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000803';
do $$ begin
 begin
   insert into public.messages(sender_id,recipient_id,exchange_id,body)
   values(auth.uid(),'00000000-0000-4000-8000-000000000801','00000000-0000-4000-8000-000000000950','outsider');
   raise exception 'Legacy outsider message permitted';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
-- Trusted server authority still updates protected values and its projection.
set role service_role;
update public.profiles set rating=4,review_count=1,identity_verified=true where id='00000000-0000-4000-8000-000000000802';
reset role;
do $$ begin
 if not exists(select 1 from public.public_profiles where id='00000000-0000-4000-8000-000000000802'
 and rating=4 and review_count=1 and identity_verified) then raise exception 'Trusted server profile projection broken'; end if;
end $$;
set role anon;
do $$ begin
 begin
   update public.profiles set display_name='anonymous' where id='00000000-0000-4000-8000-000000000801';
   raise exception 'Anonymous profile edit permitted';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
