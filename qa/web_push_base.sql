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

create table public.profiles(
  id uuid primary key references auth.users(id),
  display_name text not null,
  country text,
  city text
);
create table public.lego_sets(set_number text primary key,name text not null);
create table public.collection_items(
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  set_number text not null references public.lego_sets(set_number),
  available_for_exchange boolean not null default false
);
create table public.wishlists(
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  set_number text not null references public.lego_sets(set_number),
  unique(user_id,set_number)
);
create table public.notifications(
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  kind text,
  title text,
  body text,
  actor_user_id uuid references public.profiles(id),
  entity_type text,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index notifications_entity_dedupe_idx
on public.notifications(user_id,kind,entity_type,entity_id) where entity_id is not null;

create or replace function public.normalize_beta_city(p_country text,p_city text)
returns text language sql immutable strict set search_path='' as $$
  select pg_catalog.lower(pg_catalog.btrim(p_country))||':'||pg_catalog.lower(pg_catalog.btrim(p_city));
$$;
create or replace function public.canonical_lego_product_identity(p_set_number text)
returns text language sql immutable strict set search_path='' as $$
  select case when pg_catalog.btrim(p_set_number) ~ '^[0-9]+-1$'
    then pg_catalog.regexp_replace(pg_catalog.btrim(p_set_number),'-1$','','g')
    else pg_catalog.upper(pg_catalog.btrim(p_set_number)) end;
$$;

alter table public.collection_items enable row level security;
alter table public.wishlists enable row level security;
alter table public.notifications enable row level security;
grant select,insert,update,delete on public.collection_items,public.wishlists to authenticated;
grant select,update on public.notifications to authenticated;
grant all on public.profiles,public.lego_sets,public.collection_items,public.wishlists,public.notifications to service_role;
create policy own_collection on public.collection_items for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy own_wishlist on public.wishlists for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy own_notifications_select on public.notifications for select to authenticated using ((select auth.uid())=user_id);
create policy own_notifications_update on public.notifications for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
