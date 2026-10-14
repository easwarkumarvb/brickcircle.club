-- Expected vulnerabilities on the unfixed baseline; rollback every proof row.
begin;
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000801';
update public.profiles set identity_verified=true,rating=5,review_count=999,trust_score=100
 where id=auth.uid();
do $$ begin
 if not exists(select 1 from public.public_profiles where id=auth.uid()
 and identity_verified and review_count=999) then raise exception 'Baseline profile exploit did not reproduce'; end if;
end $$;
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000803';
insert into public.profiles(id,display_name,identity_verified,rating,review_count)
values(auth.uid(),'Forged new profile',true,5,999);
do $$ begin
 if not exists(select 1 from public.public_profiles where id=auth.uid()
 and identity_verified and review_count=999) then raise exception 'Baseline sensitive INSERT did not reproduce'; end if;
end $$;
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000801';
insert into public.messages(id,sender_id,recipient_id,body,created_at) values
 ('00000000-0000-4000-8000-000000000901',auth.uid(),'00000000-0000-4000-8000-000000000802','future baseline','2099-01-01');
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000802';
select public.mark_collector_conversation_read('00000000-0000-4000-8000-000000000801','2099-01-01','direct_message','00000000-0000-4000-8000-000000000901');
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000801';
insert into public.messages(sender_id,recipient_id,body) values
 (auth.uid(),'00000000-0000-4000-8000-000000000802','normal baseline after future');
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000802';
do $$ begin
 if not exists(select 1 from public.collector_conversation_summaries where user_id=auth.uid()
 and last_at='2099-01-01' and unread_count=0) then raise exception 'Baseline future cursor exploit did not reproduce'; end if;
end $$;
rollback;
