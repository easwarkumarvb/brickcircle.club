-- Strictly demonstrate arbitrary destination storage before the repair; roll back.
begin;
insert into auth.users(id) values('20000000-0000-4000-8000-000000000001');
grant usage on schema auth to authenticated;
set local role authenticated;
set local request.jwt.claim.sub='20000000-0000-4000-8000-000000000001';
insert into public.push_subscriptions(user_id,endpoint,p256dh,auth)
values(auth.uid(),'https://127.0.0.1/private','1234567890123456','12345678');
do $$ begin
 if not exists(select 1 from public.push_subscriptions where endpoint='https://127.0.0.1/private') then
  raise exception 'Original arbitrary endpoint proof did not reproduce';
 end if;
end $$;
rollback;
