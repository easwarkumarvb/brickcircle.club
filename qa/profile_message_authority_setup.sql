-- Disposable PostgreSQL only; extend canonical QA base to production columns.
alter table auth.users add column raw_user_meta_data jsonb not null default '{}',
  add column email_confirmed_at timestamptz;
grant usage on schema auth,extensions to authenticated,anon,service_role;
alter role service_role bypassrls;
alter table public.profiles add column email text, add column bio text,
  add column avatar_url text, add column trust_score integer not null default 50,
  add column email_verified boolean not null default false,
  add column identity_verified boolean not null default false,
  add column address_verified boolean not null default false,
  add column mfa_enabled boolean not null default false,
  add column member_since timestamptz not null default now(),
  add column created_at timestamptz not null default now(),
  add column founding_member_number smallint,
  add column founding_member_granted_at timestamptz,
  add column future_sensitive_probe text;
create table public.public_profiles (
  id uuid primary key,display_name text,country text,city text,bio text,
  avatar_url text,rating numeric,review_count integer,identity_verified boolean,
  member_since timestamptz,updated_at timestamptz,founding_member_number smallint
);
-- Sanitized projection policy from the production checkpoint, retained by hardening.
create policy "public profile projection readable" on public.public_profiles for select to anon,authenticated using (true);
create table public.exchange_preferences(user_id uuid primary key);
\ir ../supabase/migrations/20260829_membership_program_v31.sql
\ir ../supabase/migrations/20260829072229_beta_release_rls_hardening.sql
\ir ../supabase/migrations/20260911070000_require_adult_confirmation.sql
\ir ../supabase/migrations/20260911081710_free_beta_membership_phase.sql
\ir ../supabase/migrations/20261001154500_canonical_collector_avatar_pipeline.sql
-- Seed real ownership/auth and private provider metadata. No production data.
insert into auth.users(id,email,raw_user_meta_data) values
 ('00000000-0000-4000-8000-000000000801','a@example.test','{"avatar_url":"https://example.test/provider-a.jpg"}'),
 ('00000000-0000-4000-8000-000000000802','b@example.test','{}'),
 ('00000000-0000-4000-8000-000000000803','new@example.test','{}');
insert into public.profiles(id,display_name) values
 ('00000000-0000-4000-8000-000000000801','Authority A'),
 ('00000000-0000-4000-8000-000000000802','Authority B');
alter table public.messages enable row level security;
create policy "authority participants read messages" on public.messages for select to authenticated
 using(auth.uid() in(sender_id,recipient_id));
create policy "authority sender inserts messages" on public.messages for insert to authenticated
 with check(auth.uid()=sender_id and (exchange_id is null or exists(
 select 1 from public.exchanges e where e.id=exchange_id and auth.uid() in(e.user_a,e.user_b))));
-- Regression: separate column grants must not survive table-level REVOKE.
grant insert(future_sensitive_probe),update(future_sensitive_probe) on public.profiles to authenticated;
\ir ../supabase/migrations/20260913090000_exchange_workflow_server_transitions.sql
\ir ../supabase/migrations/20260916052934_canonical_exchange_state_machine.sql
\ir ../supabase/migrations/20260930160000_retire_legacy_exchangeability_trigger.sql
\ir ../supabase/migrations/20261005173802_guided_exchange_messaging.sql
begin;
\ir ../supabase/migrations/20261012083443_person_first_conversation_projection.sql
commit;
