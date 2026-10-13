alter table public.profiles add column if not exists membership_ordinal integer;
alter table public.profiles add column if not exists early_member_number integer;
alter table public.profiles add column if not exists early_member_granted_at timestamptz;

create unique index if not exists profiles_membership_ordinal_uidx on public.profiles(membership_ordinal) where membership_ordinal is not null;
create unique index if not exists profiles_early_member_number_uidx on public.profiles(early_member_number) where early_member_number is not null;

do $$ begin
  if not exists(select 1 from pg_constraint where conname='profiles_membership_ordinal_positive') then
    alter table public.profiles add constraint profiles_membership_ordinal_positive check (membership_ordinal is null or membership_ordinal > 0);
  end if;
  if not exists(select 1 from pg_constraint where conname='profiles_early_member_range') then
    alter table public.profiles add constraint profiles_early_member_range check (early_member_number is null or early_member_number between 101 and 1000);
  end if;
end $$;

alter table public.public_profiles add column if not exists early_member_number integer;

drop trigger if exists trg_protect_founding_member_fields on public.profiles;
drop trigger if exists trg_protect_membership_fields on public.profiles;

update public.profiles
set membership_ordinal=founding_member_number
where membership_ordinal is null and founding_member_number is not null;

with ranked as (
  select id,row_number() over(order by created_at,id)::integer as rn from public.profiles
)
update public.profiles p
set membership_ordinal=r.rn
from ranked r
where p.id=r.id and p.membership_ordinal is null;

update public.profiles
set founding_member_number=membership_ordinal::smallint,
    founding_member_granted_at=coalesce(founding_member_granted_at,created_at,now())
where membership_ordinal between 1 and 100 and founding_member_number is null;

update public.profiles
set early_member_number=membership_ordinal,
    early_member_granted_at=coalesce(early_member_granted_at,created_at,now())
where membership_ordinal between 101 and 1000 and early_member_number is null;

create sequence if not exists public.bc_membership_ordinal_seq;
do $$
declare m integer;
begin
  select coalesce(max(membership_ordinal),0) into m from public.profiles;
  if m > 0 then
    perform setval('public.bc_membership_ordinal_seq',m,true);
  else
    perform setval('public.bc_membership_ordinal_seq',1,false);
  end if;
end $$;

create or replace function public.bc_assign_founding_member()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare n integer;
begin
  if new.membership_ordinal is null then
    n:=nextval('public.bc_membership_ordinal_seq');
    new.membership_ordinal:=n;
  else
    n:=new.membership_ordinal;
  end if;
  if n between 1 and 100 then
    new.founding_member_number:=coalesce(new.founding_member_number,n::smallint);
    new.founding_member_granted_at:=coalesce(new.founding_member_granted_at,now());
    new.early_member_number:=null;
    new.early_member_granted_at:=null;
  elsif n between 101 and 1000 then
    new.early_member_number:=coalesce(new.early_member_number,n);
    new.early_member_granted_at:=coalesce(new.early_member_granted_at,now());
  end if;
  return new;
end;
$$;

drop trigger if exists trg_assign_founding_member on public.profiles;
create trigger trg_assign_founding_member before insert on public.profiles for each row execute function public.bc_assign_founding_member();

create or replace function public.bc_protect_membership_fields()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  new.membership_ordinal:=old.membership_ordinal;
  new.founding_member_number:=old.founding_member_number;
  new.founding_member_granted_at:=old.founding_member_granted_at;
  new.early_member_number:=old.early_member_number;
  new.early_member_granted_at:=old.early_member_granted_at;
  return new;
end;
$$;

create trigger trg_protect_membership_fields
before update of membership_ordinal,founding_member_number,founding_member_granted_at,early_member_number,early_member_granted_at
on public.profiles for each row execute function public.bc_protect_membership_fields();

drop function if exists public.bc_protect_founding_member_fields();

create table if not exists public.membership_program_config(
  id smallint primary key check(id=1),
  founding_cap integer not null default 100 check(founding_cap=100),
  early_member_limit integer not null default 1000 check(early_member_limit>=founding_cap),
  beta_free boolean not null default true,
  city_min_members integer not null default 100 check(city_min_members>0),
  city_min_exchangeable_sets integer not null default 200 check(city_min_exchangeable_sets>0),
  city_min_wishlist_items integer not null default 300 check(city_min_wishlist_items>0),
  updated_at timestamptz not null default now()
);
insert into public.membership_program_config(id,founding_cap,early_member_limit,beta_free,city_min_members,city_min_exchangeable_sets,city_min_wishlist_items)
values(1,100,1000,true,100,200,300)
on conflict(id) do update set founding_cap=excluded.founding_cap,early_member_limit=excluded.early_member_limit,beta_free=excluded.beta_free,city_min_members=excluded.city_min_members,city_min_exchangeable_sets=excluded.city_min_exchangeable_sets,city_min_wishlist_items=excluded.city_min_wishlist_items,updated_at=now();
alter table public.membership_program_config enable row level security;
revoke all on public.membership_program_config from anon,authenticated;

create table if not exists public.city_pricing_overrides(
  country text not null,
  city text not null,
  pricing_enabled boolean not null default false,
  enabled_at timestamptz,
  note text,
  updated_at timestamptz not null default now(),
  primary key(country,city)
);
alter table public.city_pricing_overrides enable row level security;
revoke all on public.city_pricing_overrides from anon,authenticated;

create or replace function public.sync_public_profile_projection()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  insert into public.public_profiles(id,display_name,country,city,bio,avatar_url,rating,review_count,identity_verified,member_since,founding_member_number,early_member_number,updated_at)
  values(new.id,new.display_name,new.country,new.city,new.bio,new.avatar_url,new.rating,new.review_count,new.identity_verified,new.member_since,new.founding_member_number,new.early_member_number,now())
  on conflict(id) do update set
    display_name=excluded.display_name,country=excluded.country,city=excluded.city,bio=excluded.bio,
    avatar_url=excluded.avatar_url,rating=excluded.rating,review_count=excluded.review_count,
    identity_verified=excluded.identity_verified,member_since=excluded.member_since,
    founding_member_number=excluded.founding_member_number,early_member_number=excluded.early_member_number,updated_at=now();
  return new;
end;
$$;

drop trigger if exists trg_sync_public_profile_projection on public.profiles;
create trigger trg_sync_public_profile_projection
after insert or update of display_name,country,city,bio,avatar_url,rating,review_count,identity_verified,member_since,founding_member_number,early_member_number
on public.profiles for each row execute function public.sync_public_profile_projection();

update public.public_profiles pp
set early_member_number=p.early_member_number
from public.profiles p
where pp.id=p.id;

create or replace function public.bc_membership_status()
returns table(
  founding_cap integer,
  founding_claimed integer,
  founding_remaining integer,
  early_member_limit integer,
  early_claimed integer,
  early_remaining integer,
  total_members integer,
  my_number integer,
  my_tier text,
  my_access text,
  beta_free boolean,
  my_city text,
  my_country text,
  city_members integer,
  city_exchangeable_sets integer,
  city_wishlist_items integer,
  city_min_members integer,
  city_min_exchangeable_sets integer,
  city_min_wishlist_items integer,
  city_pricing_eligible boolean,
  city_pricing_enabled boolean
)
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  cfg public.membership_program_config%rowtype;
  uid uuid:=auth.uid();
  p public.profiles%rowtype;
  t integer:=0; f integer:=0; e integer:=0;
  cm integer:=0; ce integer:=0; cw integer:=0;
  enabled boolean:=false;
begin
  select * into cfg from public.membership_program_config where id=1;
  select count(*)::integer,
         count(*) filter(where membership_ordinal between 1 and cfg.founding_cap)::integer,
         count(*) filter(where membership_ordinal between cfg.founding_cap+1 and cfg.early_member_limit)::integer
  into t,f,e from public.profiles;

  if uid is not null then
    select * into p from public.profiles where id=uid;
    if found and p.city is not null and p.country is not null then
      select count(*)::integer into cm from public.profiles x where lower(x.city)=lower(p.city) and lower(x.country)=lower(p.country);
      select count(*)::integer into ce from public.collection_items ci join public.profiles x on x.id=ci.user_id where ci.available_for_exchange and lower(x.city)=lower(p.city) and lower(x.country)=lower(p.country);
      select count(*)::integer into cw from public.wishlists w join public.profiles x on x.id=w.user_id where lower(x.city)=lower(p.city) and lower(x.country)=lower(p.country);
      select coalesce(cpo.pricing_enabled,false) into enabled from public.city_pricing_overrides cpo where lower(cpo.city)=lower(p.city) and lower(cpo.country)=lower(p.country);
      enabled:=coalesce(enabled,false);
    end if;
  end if;

  return query select
    cfg.founding_cap,
    f,
    greatest(0,cfg.founding_cap-f),
    cfg.early_member_limit,
    e,
    greatest(0,(cfg.early_member_limit-cfg.founding_cap)-e),
    t,
    case when uid is not null and p.id is not null then p.membership_ordinal else null end,
    case when uid is null or p.id is null then null
         when p.membership_ordinal<=cfg.founding_cap then 'founding'
         when p.membership_ordinal<=cfg.early_member_limit then 'early'
         else 'standard' end,
    case when uid is null or p.id is null then null
         when p.membership_ordinal<=cfg.founding_cap then 'free_lifetime'
         when cfg.beta_free then 'free_beta'
         when enabled then 'paid_required'
         else 'free_until_city_launch' end,
    cfg.beta_free,
    case when uid is not null and p.id is not null then p.city else null end,
    case when uid is not null and p.id is not null then p.country else null end,
    cm,ce,cw,
    cfg.city_min_members,cfg.city_min_exchangeable_sets,cfg.city_min_wishlist_items,
    (cm>=cfg.city_min_members and ce>=cfg.city_min_exchangeable_sets and cw>=cfg.city_min_wishlist_items),
    enabled;
end;
$$;

grant execute on function public.bc_membership_status() to anon,authenticated;
