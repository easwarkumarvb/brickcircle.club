create extension if not exists pgcrypto;

do $$ begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
end $$;

create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable set search_path='' as $$
  select nullif(pg_catalog.current_setting('request.jwt.claim.sub',true),'')::uuid;
$$;

create table public.profiles(
  id uuid primary key,
  display_name text not null,
  country text not null,
  city text not null
);
create table public.lego_sets(
  set_number text primary key,
  name text not null,
  theme text,
  estimated_value numeric
);
create table public.collection_items(
  id uuid primary key,
  user_id uuid not null references public.profiles(id),
  set_number text not null references public.lego_sets(set_number),
  estimated_value numeric,
  owner_photo_path text,
  available_for_exchange boolean not null default false,
  updated_at timestamptz not null default now()
);
create table public.wishlists(
  id uuid primary key,
  user_id uuid not null references public.profiles(id),
  set_number text not null references public.lego_sets(set_number)
);
create table public.exchange_requests(
  id uuid primary key,
  requester_id uuid not null references public.profiles(id),
  responder_id uuid not null references public.profiles(id),
  offered_item_id uuid not null references public.collection_items(id),
  requested_item_id uuid not null references public.collection_items(id),
  duration_days integer not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.exchanges(
  id uuid primary key,
  request_id uuid not null references public.exchange_requests(id),
  user_a uuid not null references public.profiles(id),
  user_b uuid not null references public.profiles(id),
  item_a uuid references public.collection_items(id),
  item_b uuid references public.collection_items(id),
  duration_days integer not null,
  state text not null default 'accepted',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.notifications(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  kind text not null,
  title text not null,
  body text not null,
  actor_user_id uuid references public.profiles(id),
  entity_type text,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index notifications_entity_dedupe
on public.notifications(user_id,kind,entity_type,entity_id)
where entity_id is not null;

create or replace function public.canonical_lego_product_identity(p_set text)
returns text language sql immutable set search_path='' as $$
  select pg_catalog.regexp_replace(pg_catalog.lower(pg_catalog.btrim(coalesce(p_set,''))),'-1$','');
$$;
create or replace function public.normalize_beta_city(p_country text,p_city text)
returns text language sql immutable set search_path='' as $$
  select pg_catalog.lower(pg_catalog.btrim(coalesce(p_country,''))) || ':' ||
         pg_catalog.lower(pg_catalog.btrim(coalesce(p_city,'')));
$$;

grant usage on schema public to anon,authenticated;
grant select on public.profiles,public.lego_sets,public.collection_items,public.wishlists to authenticated;

insert into public.profiles(id,display_name,country,city) values
('00000000-0000-4000-8000-000000000101','Easwar','India','Bengaluru'),
('00000000-0000-4000-8000-000000000102','Ramya','India','Bengaluru'),
('00000000-0000-4000-8000-000000000103','Dhyan','India','Bengaluru');

insert into public.lego_sets(set_number,name,theme,estimated_value) values
('42172-1','McLaren P1','Technic',450),
('42143-1','Ferrari Daytona SP3','Technic',450),
('42115-1','Lamborghini Sián FKP 37','Technic',420);

insert into public.collection_items(id,user_id,set_number,estimated_value,owner_photo_path,available_for_exchange) values
('10000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000101','42172-1',450,'easwar/mclaren.jpg',true),
('10000000-0000-4000-8000-000000000102','00000000-0000-4000-8000-000000000102','42143-1',450,'ramya/ferrari.jpg',true),
('10000000-0000-4000-8000-000000000103','00000000-0000-4000-8000-000000000103','42115-1',420,'dhyan/lamborghini.jpg',true);

insert into public.wishlists(id,user_id,set_number) values
('20000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000101','42143-1'),
('20000000-0000-4000-8000-000000000102','00000000-0000-4000-8000-000000000102','42172-1');

insert into public.exchange_requests(id,requester_id,responder_id,offered_item_id,requested_item_id,duration_days,status) values
('30000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000103','10000000-0000-4000-8000-000000000101','10000000-0000-4000-8000-000000000103',60,'accepted'),
('30000000-0000-4000-8000-000000000102','00000000-0000-4000-8000-000000000102','00000000-0000-4000-8000-000000000101','10000000-0000-4000-8000-000000000102','10000000-0000-4000-8000-000000000101',60,'pending');

insert into public.exchanges(id,request_id,user_a,user_b,item_a,item_b,duration_days,state) values
('40000000-0000-4000-8000-000000000101','30000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000103','10000000-0000-4000-8000-000000000101','10000000-0000-4000-8000-000000000103',60,'swap_active');
