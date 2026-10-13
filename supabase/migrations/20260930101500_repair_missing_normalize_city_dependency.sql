-- Repair production schema drift before the canonical exchange state-machine rollout.
-- Production skipped 20260912022500_city_agnostic_local_matching.sql, while later
-- exchange migrations were applied. The canonical state machine requires this helper.
-- This definition intentionally matches the proven staging implementation and is idempotent.

create or replace function public.normalize_city(p_country text, p_city text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  c text := trim(coalesce(p_city, ''));
  country text := lower(trim(coalesce(p_country, '')));
begin
  if c = '' then return null; end if;

  if country = 'india' then
    if lower(c) in ('bangalore','bengaluru') then return 'Bengaluru'; end if;
    if lower(c) in ('bombay','mumbai') then return 'Mumbai'; end if;
    if lower(c) in ('calcutta','kolkata') then return 'Kolkata'; end if;
    if lower(c) in ('madras','chennai') then return 'Chennai'; end if;
    if lower(c) in ('mysore','mysuru') then return 'Mysuru'; end if;
    if lower(c) in ('trivandrum','thiruvananthapuram') then return 'Thiruvananthapuram'; end if;
    if lower(c) in ('cochin','kochi') then return 'Kochi'; end if;
  elsif country in ('united states','usa','us') then
    if lower(c) in ('new york city','nyc','new york') then return 'New York'; end if;
    if lower(c) in ('washington dc','washington, dc','washington, d.c.','dc') then return 'Washington, D.C.'; end if;
  elsif country = 'united kingdom' then
    if lower(c) = 'londonderry' then return 'Derry'; end if;
  end if;

  return c;
end
$$;

revoke all on function public.normalize_city(text,text) from public;
grant execute on function public.normalize_city(text,text) to authenticated;

notify pgrst, 'reload schema';
