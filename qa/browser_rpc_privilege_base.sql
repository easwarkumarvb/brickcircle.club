do $ begin
  if not exists(select 1 from pg_roles where rolname='postgres') then create role postgres; end if;
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
end $$;

create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable set search_path='' as $$
  select nullif(pg_catalog.current_setting('request.jwt.claim.sub',true),'')::uuid;
$$;

create sequence public.bc_membership_ordinal_seq;
create sequence public.growth_events_id_seq;
create sequence public.product_metrics_id_seq;

create table public.profiles(
  id uuid primary key,
  membership_ordinal bigint,
  founding_member_number smallint,
  founding_member_granted_at timestamptz,
  early_member_number integer,
  early_member_granted_at timestamptz
);
grant select,insert on public.profiles to authenticated;

create or replace function public.bc_assign_founding_member()
returns trigger language plpgsql security definer set search_path=public as $$
declare n integer;
begin
  n:=nextval('public.bc_membership_ordinal_seq');
  new.membership_ordinal:=n;
  if n between 1 and 100 then new.founding_member_number:=n::smallint; end if;
  return new;
end $$;
create trigger bc_assign_founding_member before insert on public.profiles
for each row execute function public.bc_assign_founding_member();

create or replace function public.bc_founder_status()
returns integer language plpgsql security definer set search_path=public as $$
begin if auth.uid() is null then raise exception 'Authentication required'; end if; return 1; end $$;
create or replace function public.bc_liquidity_status()
returns integer language plpgsql security definer set search_path=public as $$
begin if auth.uid() is null then raise exception 'Authentication required'; end if; return 1; end $$;
create or replace function public.bc_membership_status()
returns integer language plpgsql security definer set search_path=public as $$
begin if auth.uid() is null then raise exception 'Authentication required'; end if; return 1; end $$;
create or replace function public.bc_my_referral_code()
returns text language plpgsql security definer set search_path=public as $$
begin if auth.uid() is null then raise exception 'Authentication required'; end if; return 'TEST'; end $$;
create or replace function public.bc_growth_funnel_snapshot()
returns integer language sql security definer set search_path=public as $$ select count(*)::integer from public.profiles $$;

grant execute on function public.bc_assign_founding_member() to anon,authenticated;
grant execute on function public.bc_founder_status() to anon,authenticated;
grant execute on function public.bc_liquidity_status() to anon,authenticated;
grant execute on function public.bc_membership_status() to anon,authenticated;
grant execute on function public.bc_my_referral_code() to anon,authenticated;
grant execute on function public.bc_growth_funnel_snapshot() to authenticated;
grant usage,select on all sequences in schema public to anon,authenticated;
