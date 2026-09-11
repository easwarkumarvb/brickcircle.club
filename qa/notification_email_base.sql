create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

do $$ begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
end $$;
alter role service_role bypassrls;

create schema if not exists auth;
create table auth.users(id uuid primary key, email text);
create or replace function auth.uid() returns uuid language sql stable set search_path='' as $$
  select nullif(pg_catalog.current_setting('request.jwt.claim.sub',true),'')::uuid;
$$;

create table public.notifications(
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  kind text,
  title text,
  body text,
  actor_user_id uuid,
  entity_type text,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default pg_catalog.now()
);
alter table public.notifications enable row level security;
revoke all on public.notifications from anon, authenticated;
grant select, update(read_at) on public.notifications to authenticated;
grant all on public.notifications to service_role;
create policy own_notifications_select on public.notifications for select to authenticated using ((select auth.uid())=user_id);
create policy own_notifications_update on public.notifications for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);

insert into auth.users(id,email) values
 ('10000000-0000-4000-8000-000000000001','first@example.com'),
 ('20000000-0000-4000-8000-000000000002','second@example.com');

create or replace function pg_temp.assert_true(ok boolean,message text)
returns void language plpgsql as $$ begin if not coalesce(ok,false) then raise exception 'assertion failed: %',message; end if; end $$;
