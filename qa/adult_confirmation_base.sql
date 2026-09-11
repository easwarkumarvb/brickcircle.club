-- Minimal Supabase-like schema for adult confirmation security tests.
create schema auth;

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create role anon nologin;
create role authenticated nologin;

grant usage on schema public, auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;

create table public.profiles (
  id uuid primary key,
  display_name text,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
grant select, update on public.profiles to authenticated;

create policy profiles_select_own
on public.profiles
for select
to authenticated
using ((select auth.uid()) = id);

create policy profiles_update_own
on public.profiles
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

insert into public.profiles (id, display_name)
values
  ('00000000-0000-4000-8000-000000000007', 'Adult test member'),
  ('00000000-0000-4000-8000-000000000099', 'Other member');
