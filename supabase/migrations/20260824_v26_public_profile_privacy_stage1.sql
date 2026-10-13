create table if not exists public.public_profiles (
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
insert into public.public_profiles(id,display_name,country,city,bio,avatar_url,rating,review_count,identity_verified,member_since,updated_at)
select id,display_name,country,city,bio,avatar_url,rating,review_count,identity_verified,member_since,now() from public.profiles
on conflict (id) do update set display_name=excluded.display_name,country=excluded.country,city=excluded.city,bio=excluded.bio,avatar_url=excluded.avatar_url,rating=excluded.rating,review_count=excluded.review_count,identity_verified=excluded.identity_verified,member_since=excluded.member_since,updated_at=now();
create or replace function public.sync_public_profile_projection() returns trigger language plpgsql security definer set search_path='public' as $$ begin insert into public.public_profiles(id,display_name,country,city,bio,avatar_url,rating,review_count,identity_verified,member_since,updated_at) values(new.id,new.display_name,new.country,new.city,new.bio,new.avatar_url,new.rating,new.review_count,new.identity_verified,new.member_since,now()) on conflict(id) do update set display_name=excluded.display_name,country=excluded.country,city=excluded.city,bio=excluded.bio,avatar_url=excluded.avatar_url,rating=excluded.rating,review_count=excluded.review_count,identity_verified=excluded.identity_verified,member_since=excluded.member_since,updated_at=now(); return new; end $$;
drop trigger if exists trg_sync_public_profile_projection on public.profiles;
create trigger trg_sync_public_profile_projection after insert or update of display_name,country,city,bio,avatar_url,rating,review_count,identity_verified,member_since on public.profiles for each row execute function public.sync_public_profile_projection();
alter table public.public_profiles enable row level security;
drop policy if exists "public profile projection readable" on public.public_profiles;
create policy "public profile projection readable" on public.public_profiles for select to anon,authenticated using (true);
revoke all on public.public_profiles from anon,authenticated;
grant select on public.public_profiles to anon,authenticated;
revoke all on public.profiles from anon;
revoke execute on function public.sync_public_profile_projection() from public,anon,authenticated;