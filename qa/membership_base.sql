create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;

create table public.profiles(
  id uuid primary key,
  display_name text,
  email text,
  country text,
  city text,
  bio text,
  avatar_url text,
  rating numeric default 0,
  review_count integer default 0,
  trust_score integer default 0,
  email_verified boolean default false,
  identity_verified boolean default false,
  address_verified boolean default false,
  mfa_enabled boolean default false,
  member_since timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  founding_member_number smallint,
  founding_member_granted_at timestamptz
);

create table public.public_profiles(
  id uuid primary key,
  display_name text,
  country text,
  city text,
  bio text,
  avatar_url text,
  rating numeric default 0,
  review_count integer default 0,
  identity_verified boolean default false,
  member_since timestamptz,
  founding_member_number smallint,
  updated_at timestamptz default now()
);

create table public.collection_items(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  set_number text,
  available_for_exchange boolean not null default false
);

create table public.wishlists(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  set_number text
);
