-- BrickCircle membership is uniformly free during beta. Historical founding and
-- early-member fields remain intact for audit/history, but confer no entitlement.

alter table public.membership_program_config
  add column if not exists membership_phase text;

update public.membership_program_config
set membership_phase='beta_free',
    beta_free=true,
    updated_at=now()
where id=1;

alter table public.membership_program_config
  alter column membership_phase set default 'beta_free',
  alter column membership_phase set not null;

alter table public.membership_program_config
  drop constraint if exists membership_program_config_membership_phase_check;
alter table public.membership_program_config
  add constraint membership_program_config_membership_phase_check
  check (membership_phase in ('beta_free','future_pricing'));

drop trigger if exists trg_assign_founding_member on public.profiles;

-- Retain the historical function name for migration compatibility, but prevent
-- any future signup-order assignment even if an old caller invokes it.
create or replace function public.bc_assign_founding_member()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  return new;
end;
$$;

revoke all on function public.bc_assign_founding_member() from public, anon, authenticated;
grant execute on function public.bc_assign_founding_member() to service_role;

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
set search_path=''
as $$
declare
  cfg public.membership_program_config%rowtype;
  uid uuid:=auth.uid();
  p public.profiles%rowtype;
  t integer:=0;
  f integer:=0;
  e integer:=0;
  cm integer:=0;
  ce integer:=0;
  cw integer:=0;
begin
  select * into cfg from public.membership_program_config where id=1;
  select count(*)::integer,
         count(*) filter(where membership_ordinal between 1 and cfg.founding_cap)::integer,
         count(*) filter(where membership_ordinal between cfg.founding_cap+1 and cfg.early_member_limit)::integer
    into t,f,e
    from public.profiles;

  if uid is not null then
    select * into p from public.profiles where id=uid;
    if found and p.city is not null and p.country is not null then
      select count(*)::integer into cm
        from public.profiles x
        where lower(x.city)=lower(p.city) and lower(x.country)=lower(p.country);
      select count(*)::integer into ce
        from public.collection_items ci
        join public.profiles x on x.id=ci.user_id
        where ci.available_for_exchange
          and lower(x.city)=lower(p.city) and lower(x.country)=lower(p.country);
      select count(*)::integer into cw
        from public.wishlists w
        join public.profiles x on x.id=w.user_id
        where lower(x.city)=lower(p.city) and lower(x.country)=lower(p.country);
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
    null::integer,
    case when uid is not null and p.id is not null then 'beta'::text else null::text end,
    case when uid is not null and p.id is not null then 'free_beta'::text else null::text end,
    (cfg.membership_phase='beta_free'),
    case when uid is not null and p.id is not null then p.city else null end,
    case when uid is not null and p.id is not null then p.country else null end,
    cm,ce,cw,
    cfg.city_min_members,cfg.city_min_exchangeable_sets,cfg.city_min_wishlist_items,
    (cm>=cfg.city_min_members and ce>=cfg.city_min_exchangeable_sets and cw>=cfg.city_min_wishlist_items),
    false;
end;
$$;

revoke all on function public.bc_membership_status() from public, anon;
grant execute on function public.bc_membership_status() to authenticated, service_role;
