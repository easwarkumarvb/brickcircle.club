-- Disposable PostgreSQL CI only: production message RLS omitted by minimal QA base.
grant usage on schema auth to authenticated;
alter table public.messages enable row level security;
create policy "read model QA participants read direct messages" on public.messages for select to authenticated using(auth.uid() in(sender_id,recipient_id));
create policy "read model QA participants send direct messages" on public.messages for insert to authenticated with check(auth.uid()=sender_id);
create view public.public_profiles with(security_invoker=true) as select * from public.profiles;
grant select on public.public_profiles to authenticated;
insert into auth.users(id,email) values
('00000000-0000-4000-8000-000000000201','read-a@example.test'),
('00000000-0000-4000-8000-000000000202','read-b@example.test'),
('00000000-0000-4000-8000-000000000203','read-c@example.test');
insert into public.profiles(id,display_name,adult_confirmed_at) select id,email,now() from auth.users where id::text like '%020_';
set "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000202';
insert into public.messages(sender_id,recipient_id,body,created_at)
select '00000000-0000-4000-8000-000000000202','00000000-0000-4000-8000-000000000201','Equal time message '||n,'2026-10-01' from generate_series(1,1001) n;
set "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000203';
insert into public.messages(sender_id,recipient_id,body,created_at) values('00000000-0000-4000-8000-000000000203','00000000-0000-4000-8000-000000000201','Older peer preserved','2026-09-01');
