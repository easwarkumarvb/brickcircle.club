-- ONLY disposable PostgreSQL: production-compatible Auth claims/session columns.
-- This fixture never connects to Supabase or provisions production identities.
alter table auth.users add column created_at timestamptz not null default now();
alter table auth.users add column email_confirmed_at timestamptz;
create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),not_after timestamptz,created_at timestamptz default now(),updated_at timestamptz default now());
create function auth.jwt() returns jsonb language sql stable set search_path='' as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb); $$;
create or replace function auth.uid() returns uuid language sql stable set search_path='' as $$ select nullif(auth.jwt()->>'sub','')::uuid; $$;
grant usage on schema auth to authenticated;
alter table public.profiles add column created_at timestamptz not null default now();
alter table public.lego_sets add column catalog_active boolean not null default true;
create view public.public_profiles as select * from public.profiles;
