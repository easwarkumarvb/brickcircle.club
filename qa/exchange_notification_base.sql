create extension if not exists pgcrypto;

do $$ begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
end $$;

create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable set search_path='' as $$
  select nullif(pg_catalog.current_setting('request.jwt.claim.sub',true),'')::uuid;
$$;

create table public.profiles(
  id uuid primary key,
  display_name text not null
);

create table public.collection_items(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  set_number text not null,
  available_for_exchange boolean not null default false
);

create table public.exchange_requests(
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id),
  responder_id uuid not null references public.profiles(id),
  offered_item_id uuid not null references public.collection_items(id),
  requested_item_id uuid not null references public.collection_items(id),
  duration_days integer not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.notifications(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  kind text,
  title text,
  body text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.exchange_requests enable row level security;
alter table public.notifications enable row level security;

grant select, insert on public.exchange_requests to authenticated;
grant select, update on public.notifications to authenticated;
grant all on public.exchange_requests, public.notifications, public.profiles, public.collection_items to service_role;

create policy "requesters create requests"
on public.exchange_requests for insert to authenticated
with check ((select auth.uid())=requester_id);

create policy "participants read requests"
on public.exchange_requests for select to authenticated
using ((select auth.uid())=requester_id or (select auth.uid())=responder_id);

create policy "users read own notifications"
on public.notifications for select to authenticated
using ((select auth.uid())=user_id);

create policy "users update own notifications"
on public.notifications for update to authenticated
using ((select auth.uid())=user_id)
with check ((select auth.uid())=user_id);

create publication supabase_realtime;
