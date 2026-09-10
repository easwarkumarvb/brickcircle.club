create extension if not exists pgcrypto;

do $$ begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
end $$;

create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable set search_path='' as $$
  select nullif(pg_catalog.current_setting('request.jwt.claim.sub',true),'')::uuid;
$$;

create table public.profiles(id uuid primary key,display_name text not null);
create table public.lego_sets(set_number text primary key,name text not null);
create table public.collection_items(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  set_number text not null references public.lego_sets(set_number),
  owner_photo_path text,
  available_for_exchange boolean not null default false,
  unique(user_id,set_number)
);
create table public.exchange_requests(
  id uuid primary key default gen_random_uuid(),requester_id uuid not null references public.profiles(id),
  responder_id uuid not null references public.profiles(id),offered_item_id uuid not null references public.collection_items(id),
  requested_item_id uuid not null references public.collection_items(id),duration_days integer not null,
  status text not null default 'pending',created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table public.exchanges(
  id uuid primary key default gen_random_uuid(),request_id uuid not null references public.exchange_requests(id),
  user_a uuid not null references public.profiles(id),user_b uuid not null references public.profiles(id),
  item_a uuid not null references public.collection_items(id),item_b uuid not null references public.collection_items(id),
  duration_days integer not null,state text not null default 'accepted',created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table public.exchange_meetups(
  id uuid primary key default gen_random_uuid(),exchange_id uuid not null references public.exchanges(id),
  status text not null default 'proposed',updated_at timestamptz not null default now()
);
create table public.notifications(
  id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(id),kind text,title text,body text,created_at timestamptz not null default now()
);

alter table public.collection_items enable row level security;
grant select,insert,update,delete on public.collection_items to authenticated;
grant select on public.exchange_requests,public.exchanges to authenticated;
create policy "owners manage collection" on public.collection_items for all to authenticated
using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);

insert into public.lego_sets(set_number,name) values
  ('42115-1','Lamborghini Sián FKP 37'),('21309-1','NASA Apollo Saturn V'),('42083-1','Bugatti Chiron'),('42143-1','Ferrari Daytona SP3');

create or replace function public.bc_require_owner_photo_for_exchange()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
  if coalesce(new.available_for_exchange,false) and nullif(btrim(coalesce(new.owner_photo_path,'')),'') is null then
    raise exception 'Upload a photo before making this set available.' using errcode='23514';
  end if;
  return new;
end $$;
