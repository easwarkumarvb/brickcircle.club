create schema if not exists auth;

do $$ begin
  create role anon nologin;
exception when duplicate_object then null;
end $$;

do $$ begin
  create role authenticated nologin;
exception when duplicate_object then null;
end $$;

create or replace function auth.uid()
returns uuid
language sql stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
$$;

create table auth.users (
  id uuid primary key,
  email text,
  email_confirmed_at timestamptz,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);

create table public.profiles (
  id uuid primary key,
  display_name text,
  email text,
  email_verified boolean not null default false,
  country text,
  city text,
  bio text,
  avatar_url text,
  rating numeric,
  review_count integer not null default 0,
  identity_verified boolean not null default false,
  member_since timestamptz default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.public_profiles (
  id uuid primary key references public.profiles(id) on delete cascade,
  display_name text,
  country text,
  city text,
  bio text,
  avatar_url text,
  rating numeric,
  review_count integer,
  identity_verified boolean not null default false,
  member_since timestamptz,
  updated_at timestamptz not null default now()
);

create table public.exchange_preferences (
  user_id uuid primary key
);

create or replace function public.sync_public_profile_projection()
returns trigger
language plpgsql
security definer
set search_path='public'
as $$
begin
  insert into public.public_profiles(id,display_name,country,city,bio,avatar_url,rating,review_count,identity_verified,member_since,updated_at)
  values(new.id,new.display_name,new.country,new.city,new.bio,new.avatar_url,new.rating,new.review_count,new.identity_verified,new.member_since,now())
  on conflict(id) do update set
    display_name=excluded.display_name,
    country=excluded.country,
    city=excluded.city,
    bio=excluded.bio,
    avatar_url=excluded.avatar_url,
    rating=excluded.rating,
    review_count=excluded.review_count,
    identity_verified=excluded.identity_verified,
    member_since=excluded.member_since,
    updated_at=now();
  return new;
end;
$$;

create trigger trg_sync_public_profile_projection
after insert or update of display_name,country,city,bio,avatar_url,rating,review_count,identity_verified,member_since
on public.profiles
for each row execute function public.sync_public_profile_projection();

-- Pre-fix Auth->Profile trigger: intentionally does not copy avatars.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path='public'
as $$
begin
  insert into public.profiles(id,display_name,email,email_verified)
  values(new.id,coalesce(new.raw_user_meta_data->>'full_name',''),new.email,new.email_confirmed_at is not null)
  on conflict(id) do nothing;
  insert into public.exchange_preferences(user_id) values(new.id) on conflict(user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Legacy OAuth profile that should be backfilled by the migration.
insert into auth.users(id,email,raw_user_meta_data) values
('10000000-0000-4000-8000-000000000001','legacy@example.invalid',
 '{"full_name":"Legacy OAuth","picture":"https://lh3.googleusercontent.com/legacy-avatar"}'::jsonb);

-- Explicit BrickCircle upload must win over later provider refreshes/backfill.
insert into auth.users(id,email,raw_user_meta_data) values
('10000000-0000-4000-8000-000000000002','upload@example.invalid',
 '{"full_name":"Uploaded Avatar","picture":"https://lh3.googleusercontent.com/provider-should-not-win"}'::jsonb);
update public.profiles
set avatar_url='10000000-0000-4000-8000-000000000002/profile-uploaded.jpg'
where id='10000000-0000-4000-8000-000000000002';

-- Insecure provider metadata must never become a public avatar.
insert into auth.users(id,email,raw_user_meta_data) values
('10000000-0000-4000-8000-000000000003','http@example.invalid',
 '{"full_name":"HTTP Avatar","picture":"http://example.invalid/avatar.jpg"}'::jsonb);

-- Unknown nonblank legacy avatar: migration/sync must preserve it rather than assuming provider ownership.
insert into auth.users(id,email,raw_user_meta_data) values
('10000000-0000-4000-8000-000000000006','legacy-manual@example.invalid',
 '{"full_name":"Legacy Manual","picture":"https://lh3.googleusercontent.com/provider-must-not-win"}'::jsonb);
update public.profiles
set avatar_url='legacy/manual-avatar.jpg'
where id='10000000-0000-4000-8000-000000000006';
