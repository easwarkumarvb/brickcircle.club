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
  display_name text not null,
  country text,
  city text
);

create table public.lego_sets(
  set_number text primary key,
  name text not null,
  theme text,
  estimated_value numeric
);

create table public.collection_items(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  set_number text not null references public.lego_sets(set_number),
  estimated_value numeric,
  available_for_exchange boolean not null default false,
  unique(user_id,set_number)
);

create table public.wishlists(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  set_number text not null references public.lego_sets(set_number),
  unique(user_id,set_number)
);

create or replace function public.normalize_beta_city(p_country text,p_city text)
returns text language sql immutable strict set search_path='' as $$
  select case
    when pg_catalog.lower(pg_catalog.btrim(p_country))='india' and pg_catalog.lower(pg_catalog.btrim(p_city)) in ('bangalore','bengaluru') then 'Bengaluru'
    else pg_catalog.btrim(p_city)
  end;
$$;

revoke all on function public.normalize_beta_city(text,text) from public, anon, authenticated;
grant execute on function public.normalize_beta_city(text,text) to service_role;
