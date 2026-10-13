create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
do $$ begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
end $$;
create schema if not exists auth;
create table auth.users(id uuid primary key,email text);
create or replace function auth.uid() returns uuid language sql stable set search_path='' as $$
  select nullif(pg_catalog.current_setting('request.jwt.claim.sub',true),'')::uuid;
$$;

create table public.profiles(
  id uuid primary key references auth.users(id),display_name text,country text,city text,
  adult_confirmed_at timestamptz,rating numeric not null default 0,review_count integer not null default 0,
  updated_at timestamptz not null default now()
);
create table public.lego_sets(
  set_number text primary key,name text not null,theme text,estimated_value numeric
);
create table public.collection_items(
  id uuid primary key,user_id uuid not null references auth.users(id),set_number text not null references public.lego_sets(set_number),
  condition text,completeness integer,original_box boolean,notes text,owner_photo_path text,
  estimated_value numeric,available_for_exchange boolean not null default false,
  created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table public.wishlists(
  id uuid primary key default extensions.gen_random_uuid(),user_id uuid not null references auth.users(id),set_number text not null,
  priority integer default 3,created_at timestamptz not null default now(),unique(user_id,set_number)
);
create table public.exchange_requests(
  id uuid primary key default extensions.gen_random_uuid(),requester_id uuid not null references auth.users(id),
  responder_id uuid not null references auth.users(id),offered_item_id uuid not null references public.collection_items(id),
  requested_item_id uuid not null references public.collection_items(id),duration_days integer not null,
  offered_value numeric,requested_value numeric,proposed_deposit numeric,message text,
  status text not null default 'pending',created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table public.exchanges(
  id uuid primary key default extensions.gen_random_uuid(),request_id uuid references public.exchange_requests(id),
  user_a uuid not null references auth.users(id),user_b uuid not null references auth.users(id),
  item_a uuid references public.collection_items(id),item_b uuid references public.collection_items(id),
  duration_days integer not null,deposit_amount numeric,payment_status text,condition_photos_required boolean,
  state text not null default 'accepted',started_at timestamptz,outbound_completed_at timestamptz,
  return_due_at timestamptz,completed_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table public.exchange_meetups(
  id uuid primary key default extensions.gen_random_uuid(),exchange_id uuid not null unique references public.exchanges(id),
  proposed_by uuid references auth.users(id),venue_name text,venue_area text,meetup_at timestamptz,
  safety_ack_a boolean not null default false,safety_ack_b boolean not null default false,
  arrived_a boolean not null default false,arrived_b boolean not null default false,
  inspected_a boolean not null default false,inspected_b boolean not null default false,
  confirmed_a boolean not null default false,confirmed_b boolean not null default false,
  issue_a text,issue_b text,status text not null default 'planning',created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table public.exchange_returns(
  id uuid primary key default extensions.gen_random_uuid(),exchange_id uuid not null unique references public.exchanges(id),
  proposed_by uuid references auth.users(id),venue_name text,venue_area text,meetup_at timestamptz,
  safety_ack_a boolean not null default false,safety_ack_b boolean not null default false,
  arrived_a boolean not null default false,arrived_b boolean not null default false,
  inspected_a boolean not null default false,inspected_b boolean not null default false,
  confirmed_a boolean not null default false,confirmed_b boolean not null default false,
  issue_a text,issue_b text,status text not null default 'planning',created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table public.notifications(
  id uuid primary key default extensions.gen_random_uuid(),user_id uuid not null references auth.users(id),kind text not null,
  title text not null,body text not null,actor_user_id uuid references auth.users(id),entity_type text,entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,read_at timestamptz,created_at timestamptz not null default now()
);
create unique index notifications_entity_dedupe_idx on public.notifications(user_id,kind,entity_type,entity_id) where entity_id is not null;
create table public.notification_email_deliveries(
  id uuid primary key default extensions.gen_random_uuid(),
  notification_id uuid not null unique references public.notifications(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  notification_kind text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);
create or replace function public.enqueue_marketplace_notification_email()
returns trigger language plpgsql security definer set search_path=''
as $$ begin return new; end $$;
create trigger marketplace_notification_email_outbox after insert on public.notifications
for each row execute function public.enqueue_marketplace_notification_email();
create table public.messages(
  id uuid primary key default extensions.gen_random_uuid(),exchange_id uuid references public.exchanges(id),
  sender_id uuid not null references auth.users(id),recipient_id uuid references auth.users(id),body text not null,created_at timestamptz not null default now()
);
create table public.reviews(
  id uuid primary key default extensions.gen_random_uuid(),exchange_id uuid not null references public.exchanges(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id),reviewee_id uuid not null references public.profiles(id),
  rating integer not null check(rating between 1 and 5),comment text,created_at timestamptz not null default now(),
  unique(exchange_id,reviewer_id)
);

create or replace function public.canonical_lego_product_identity(p_set text)
returns text language sql immutable set search_path='' as $$
  select case pg_catalog.regexp_replace(pg_catalog.lower(pg_catalog.btrim(coalesce(p_set,''))),'-1$','')
    when '21309' then 'apollo-saturn-v' when '92176' then 'apollo-saturn-v'
    else pg_catalog.regexp_replace(pg_catalog.lower(pg_catalog.btrim(coalesce(p_set,''))),'-1$','') end;
$$;
create or replace function public.normalize_city(p_country text,p_city text)
returns text language sql immutable set search_path='' as $$
  select pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(p_city,'')),'[^a-zA-Z0-9]+','','g'));
$$;

grant usage on schema public to authenticated,service_role;
grant select,insert,update,delete on all tables in schema public to authenticated,service_role;
