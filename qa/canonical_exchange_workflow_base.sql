create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
do $$ begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
end $$;
create schema if not exists auth;
create table auth.users(id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable set search_path='' as $$
  select nullif(pg_catalog.current_setting('request.jwt.claim.sub',true),'')::uuid;
$$;

create table public.collection_items(
  id uuid primary key, user_id uuid not null references auth.users(id), set_number text not null,
  estimated_value numeric, available_for_exchange boolean not null default false,
  updated_at timestamptz not null default now()
);
create table public.wishlists(id uuid primary key, user_id uuid not null references auth.users(id), set_number text not null);
create table public.exchange_requests(
  id uuid primary key default extensions.gen_random_uuid(), requester_id uuid not null references auth.users(id),
  responder_id uuid not null references auth.users(id), offered_item_id uuid not null references public.collection_items(id),
  requested_item_id uuid not null references public.collection_items(id), duration_days integer not null,
  offered_value numeric, requested_value numeric, proposed_deposit numeric, message text,
  status text not null default 'pending', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.exchanges(
  id uuid primary key default extensions.gen_random_uuid(), request_id uuid references public.exchange_requests(id),
  user_a uuid not null references auth.users(id), user_b uuid not null references auth.users(id),
  item_a uuid references public.collection_items(id), item_b uuid references public.collection_items(id),
  duration_days integer not null, state text not null default 'accepted', return_due_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.exchange_meetups(
  id uuid primary key default extensions.gen_random_uuid(), exchange_id uuid not null references public.exchanges(id),
  status text not null default 'planning', updated_at timestamptz not null default now()
);
create table public.notifications(
  id uuid primary key default extensions.gen_random_uuid(), user_id uuid not null references auth.users(id), kind text not null,
  title text not null, body text not null, actor_user_id uuid references auth.users(id), entity_type text, entity_id uuid,
  metadata jsonb not null default '{}'::jsonb, read_at timestamptz, created_at timestamptz not null default now()
);
create unique index notifications_entity_dedupe on public.notifications(user_id,kind,entity_type,entity_id) where entity_id is not null;
create table public.messages(
  id uuid primary key default extensions.gen_random_uuid(), exchange_id uuid references public.exchanges(id),
  sender_id uuid not null references auth.users(id), recipient_id uuid references auth.users(id), body text not null,
  created_at timestamptz not null default now()
);
create table public.notification_email_deliveries(
  id uuid primary key default extensions.gen_random_uuid(), notification_id uuid not null unique references public.notifications(id),
  recipient_user_id uuid not null references auth.users(id), notification_kind text not null
);
create or replace function public.canonical_lego_product_identity(p_set text)
returns text language sql immutable set search_path='' as $$
  select pg_catalog.regexp_replace(pg_catalog.lower(pg_catalog.btrim(coalesce(p_set,''))),'-1$','');
$$;
grant usage on schema public to authenticated;
grant select,insert,update,delete on all tables in schema public to authenticated;

