-- BrickCircle Founding 100 + liquidity primitives
-- First 100 profiles receive a permanent founding-member number and complimentary marketplace membership.

alter table public.profiles
  add column if not exists founding_member_number smallint,
  add column if not exists founding_member_granted_at timestamptz;

alter table public.profiles
  drop constraint if exists profiles_founding_member_number_check;
alter table public.profiles
  add constraint profiles_founding_member_number_check
  check (founding_member_number is null or founding_member_number between 1 and 100);

create unique index if not exists profiles_founding_member_number_uidx
  on public.profiles(founding_member_number)
  where founding_member_number is not null;

-- Backfill existing members in join order. This migration is intentionally launched while membership is below 100.
with ranked as (
  select id, row_number() over(order by coalesce(member_since,created_at),created_at,id)::smallint as n
  from public.profiles
)
update public.profiles p
set founding_member_number=r.n,
    founding_member_granted_at=coalesce(p.founding_member_granted_at,now())
from ranked r
where p.id=r.id
  and p.founding_member_number is null
  and r.n<=100;

create or replace function public.bc_assign_founding_member()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  next_number integer;
begin
  if new.founding_member_number is not null then return new; end if;
  perform pg_advisory_xact_lock(8152026,100);
  select coalesce(max(founding_member_number),0)+1 into next_number from public.profiles;
  if next_number<=100 then
    new.founding_member_number=next_number;
    new.founding_member_granted_at=now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_assign_founding_member on public.profiles;
create trigger trg_assign_founding_member
before insert on public.profiles
for each row execute function public.bc_assign_founding_member();

create or replace function public.bc_protect_founding_member_fields()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  new.founding_member_number=old.founding_member_number;
  new.founding_member_granted_at=old.founding_member_granted_at;
  return new;
end;
$$;

drop trigger if exists trg_protect_founding_member_fields on public.profiles;
create trigger trg_protect_founding_member_fields
before update of founding_member_number, founding_member_granted_at on public.profiles
for each row execute function public.bc_protect_founding_member_fields();

-- Safe public projection may expose the non-sensitive founder badge, but never private profile fields.
alter table public.public_profiles
  add column if not exists founding_member_number smallint;

update public.public_profiles pp
set founding_member_number=p.founding_member_number
from public.profiles p
where p.id=pp.id;

create or replace function public.sync_public_profile_projection()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  insert into public.public_profiles(id,display_name,country,city,bio,avatar_url,rating,review_count,identity_verified,member_since,founding_member_number,updated_at)
  values(new.id,new.display_name,new.country,new.city,new.bio,new.avatar_url,new.rating,new.review_count,new.identity_verified,new.member_since,new.founding_member_number,now())
  on conflict(id) do update set
    display_name=excluded.display_name,country=excluded.country,city=excluded.city,bio=excluded.bio,
    avatar_url=excluded.avatar_url,rating=excluded.rating,review_count=excluded.review_count,
    identity_verified=excluded.identity_verified,member_since=excluded.member_since,
    founding_member_number=excluded.founding_member_number,updated_at=now();
  return new;
end;
$$;

drop trigger if exists trg_sync_public_profile_projection on public.profiles;
create trigger trg_sync_public_profile_projection
after insert or update of display_name,country,city,bio,avatar_url,rating,review_count,identity_verified,member_since,founding_member_number
on public.profiles for each row execute function public.sync_public_profile_projection();

create or replace function public.bc_founder_status()
returns table(
  founding_cap integer,
  founding_slots_claimed integer,
  founding_slots_remaining integer,
  my_number smallint,
  my_is_founder boolean
)
language sql
stable
security definer
set search_path=public
as $$
  select
    100,
    count(*) filter(where p.founding_member_number is not null)::integer,
    greatest(0,100-count(*) filter(where p.founding_member_number is not null)::integer),
    (select p2.founding_member_number from public.profiles p2 where p2.id=auth.uid()),
    coalesce((select p2.founding_member_number is not null from public.profiles p2 where p2.id=auth.uid()),false)
  from public.profiles p;
$$;

revoke all on function public.bc_founder_status() from public;
grant execute on function public.bc_founder_status() to anon, authenticated;

create or replace function public.bc_my_referral_code()
returns text
language plpgsql
security definer
set search_path=public
as $$
declare
  uid uuid:=auth.uid();
  result_code text;
  attempt integer:=0;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  select code into result_code
  from public.referrals
  where referrer_id=uid and status='active' and claimed_by is null
  order by created_at desc
  limit 1;
  if result_code is not null then return result_code; end if;

  loop
    attempt:=attempt+1;
    result_code:='BC'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
    begin
      insert into public.referrals(referrer_id,code,status) values(uid,result_code,'active');
      return result_code;
    exception when unique_violation then
      if attempt>=5 then raise; end if;
    end;
  end loop;
end;
$$;

revoke all on function public.bc_my_referral_code() from public;
grant execute on function public.bc_my_referral_code() to authenticated;

create or replace function public.bc_liquidity_status()
returns table(
  city text,
  country text,
  collection_count integer,
  exchangeable_count integer,
  wishlist_count integer,
  city_members integer,
  city_exchangeable_sets integer,
  city_wishlist_items integer,
  referral_claims integer,
  liquidity_readiness integer
)
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  uid uuid:=auth.uid();
  p_city text;
  p_country text;
  c_count integer:=0;
  e_count integer:=0;
  w_count integer:=0;
  cm_count integer:=0;
  ce_count integer:=0;
  cw_count integer:=0;
  r_count integer:=0;
  score integer:=0;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  select p.city,p.country into p_city,p_country from public.profiles p where p.id=uid;
  select count(*)::integer, count(*) filter(where available_for_exchange)::integer
    into c_count,e_count from public.collection_items where user_id=uid;
  select count(*)::integer into w_count from public.wishlists where user_id=uid;
  select count(*)::integer into r_count from public.referrals where referrer_id=uid and claimed_by is not null;

  if p_city is not null and p_country is not null then
    select count(*)::integer into cm_count from public.profiles p
      where lower(p.city)=lower(p_city) and lower(p.country)=lower(p_country);
    select count(*)::integer into ce_count
      from public.collection_items ci join public.profiles p on p.id=ci.user_id
      where ci.available_for_exchange and lower(p.city)=lower(p_city) and lower(p.country)=lower(p_country);
    select count(*)::integer into cw_count
      from public.wishlists w join public.profiles p on p.id=w.user_id
      where lower(p.city)=lower(p_city) and lower(p.country)=lower(p_country);
  end if;

  score := (case when p_city is not null and p_country is not null then 20 else 0 end)
         + (case when c_count>=3 then 25 else floor(c_count*25.0/3)::integer end)
         + (case when e_count>=2 then 20 else e_count*10 end)
         + (case when w_count>=3 then 25 else floor(w_count*25.0/3)::integer end)
         + (case when r_count>=1 then 10 else 0 end);

  return query select p_city,p_country,c_count,e_count,w_count,cm_count,ce_count,cw_count,r_count,least(100,score);
end;
$$;

revoke all on function public.bc_liquidity_status() from public;
grant execute on function public.bc_liquidity_status() to authenticated;
