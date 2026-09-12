-- BrickCircle: city-agnostic beta registration with local-only matching.
-- All countries/cities exposed by the registration selector are eligible.
-- Matching and exchange acceptance remain restricted to the same normalized city + country.

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

  -- Deliberately accept any other dropdown-provided city unchanged.
  return c;
end
$$;

-- Backward-compatible wrapper for historical migrations/callers.
create or replace function public.normalize_beta_city(p_country text, p_city text)
returns text
language sql
immutable
set search_path = public
as $$
  select public.normalize_city(p_country, p_city);
$$;

create or replace function public.normalize_profile_beta_location()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.country := nullif(trim(new.country), '');
  new.city := public.normalize_city(new.country, new.city);
  return new;
end
$$;

create or replace function public.find_matches(p_user uuid)
returns table(match_user uuid, offered_item uuid, offered_set text, offered_name text, offered_value numeric, requested_item uuid, requested_set text, requested_name text, requested_value numeric, match_score integer)
language sql
security definer
set search_path = ''
as $$
  select distinct
    c2.user_id,
    c1.id,
    c1.set_number,
    l1.name,
    coalesce(c1.estimated_value,l1.estimated_value,0),
    c2.id,
    c2.set_number,
    l2.name,
    coalesce(c2.estimated_value,l2.estimated_value,0),
    greatest(50,least(99,
      70
      + case when pg_catalog.abs(coalesce(c1.estimated_value,l1.estimated_value,0)-coalesce(c2.estimated_value,l2.estimated_value,0))
          <= greatest(25,coalesce(c2.estimated_value,l2.estimated_value,0)*0.15)
        then 15 else 0 end
      + case when l1.theme=l2.theme then 10 else 0 end
    ))
  from public.collection_items c1
  join public.lego_sets l1 on l1.set_number=c1.set_number
  join public.profiles p1 on p1.id=c1.user_id
  join public.collection_items c2 on c2.available_for_exchange=true and c2.user_id<>p_user
  join public.profiles p2 on p2.id=c2.user_id
  join public.lego_sets l2 on l2.set_number=c2.set_number
  join public.wishlists w1 on w1.user_id=p_user and (
    w1.set_number=c2.set_number
    or public.canonical_lego_product_identity(w1.set_number)=public.canonical_lego_product_identity(c2.set_number)
  )
  join public.wishlists w2 on w2.user_id=c2.user_id and (
    w2.set_number=c1.set_number
    or public.canonical_lego_product_identity(w2.set_number)=public.canonical_lego_product_identity(c1.set_number)
  )
  where p_user=auth.uid()
    and c1.user_id=p_user
    and c1.available_for_exchange=true
    and not exists (
      select 1 from public.exchanges e
      where e.state not in ('completed','cancelled')
        and (e.item_a=c1.id or e.item_b=c1.id)
    )
    and not exists (
      select 1 from public.exchanges e
      where e.state not in ('completed','cancelled')
        and (e.item_a=c2.id or e.item_b=c2.id)
    )
    and public.normalize_city(p1.country,p1.city)=public.normalize_city(p2.country,p2.city)
    and pg_catalog.lower(pg_catalog.btrim(coalesce(p1.country,'')))=pg_catalog.lower(pg_catalog.btrim(coalesce(p2.country,'')));
$$;

create or replace function public.queue_new_reciprocal_match_notifications(p_changed_user uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_count integer := 0;
begin
  if p_changed_user is null then return 0; end if;

  with reciprocal as (
    select distinct
      c1.user_id as recipient_id,
      c2.user_id as partner_id,
      c1.id as offered_item_id,
      c2.id as requested_item_id,
      c1.set_number as offered_set,
      c2.set_number as requested_set,
      coalesce(nullif(pg_catalog.btrim(p2.display_name), ''), 'A nearby collector') as partner_name,
      pg_catalog.md5(pg_catalog.format(
        'reciprocal_match|%s|%s|%s|%s',
        c1.user_id,
        c2.user_id,
        public.canonical_lego_product_identity(c1.set_number),
        public.canonical_lego_product_identity(c2.set_number)
      ))::uuid as event_id
    from public.collection_items c1
    join public.lego_sets l1 on l1.set_number = c1.set_number
    join public.profiles p1 on p1.id = c1.user_id
    join public.collection_items c2
      on c2.user_id <> c1.user_id
     and c2.available_for_exchange = true
    join public.profiles p2 on p2.id = c2.user_id
    join public.lego_sets l2 on l2.set_number = c2.set_number
    join public.wishlists w1
      on w1.user_id = c1.user_id
     and public.canonical_lego_product_identity(w1.set_number) = public.canonical_lego_product_identity(c2.set_number)
    join public.wishlists w2
      on w2.user_id = c2.user_id
     and public.canonical_lego_product_identity(w2.set_number) = public.canonical_lego_product_identity(c1.set_number)
    where c1.available_for_exchange = true
      and (c1.user_id = p_changed_user or c2.user_id = p_changed_user)
      and not exists (
        select 1 from public.exchanges e
        where e.state not in ('completed','cancelled')
          and (e.item_a=c1.id or e.item_b=c1.id)
      )
      and not exists (
        select 1 from public.exchanges e
        where e.state not in ('completed','cancelled')
          and (e.item_a=c2.id or e.item_b=c2.id)
      )
      and public.normalize_city(p1.country, p1.city) = public.normalize_city(p2.country, p2.city)
      and pg_catalog.lower(pg_catalog.btrim(coalesce(p1.country, ''))) = pg_catalog.lower(pg_catalog.btrim(coalesce(p2.country, '')))
  )
  insert into public.notifications(user_id, kind, title, body, actor_user_id, entity_type, entity_id, metadata)
  select
    recipient_id,
    'reciprocal_match',
    'You have a new local BrickCircle match',
    pg_catalog.format('%s has a reciprocal LEGO match with you.', partner_name),
    partner_id,
    'reciprocal_match',
    event_id,
    pg_catalog.jsonb_build_object(
      'match_user_id', partner_id,
      'offered_item_id', offered_item_id,
      'requested_item_id', requested_item_id,
      'offered_set', offered_set,
      'requested_set', requested_set,
      'route', '#matches'
    )
  from reciprocal
  on conflict (user_id, kind, entity_type, entity_id)
    where entity_id is not null
  do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

create or replace function public.respond_exchange_request(p_request_id uuid, p_action text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare r public.exchange_requests%rowtype; ex public.exchanges%rowtype; me uuid:=auth.uid(); conflict_count integer; city_a text; city_b text; country_a text; country_b text;
begin
 if me is null then raise exception 'Not authenticated'; end if;
 if p_action not in ('accept','decline','cancel') then raise exception 'Invalid action'; end if;
 select * into r from public.exchange_requests where id=p_request_id for update;
 if not found then raise exception 'Exchange request not found'; end if;
 if r.status<>'pending' then raise exception 'Request is no longer pending'; end if;
 if p_action in ('accept','decline') and me<>r.responder_id then raise exception 'Only the responder can accept or decline'; end if;
 if p_action='cancel' and me<>r.requester_id then raise exception 'Only the requester can cancel'; end if;
 if p_action='accept' then
  if r.requester_id=r.responder_id then raise exception 'Self-exchanges are not allowed'; end if;
  select public.normalize_city(country,city),trim(country) into city_a,country_a from public.profiles where id=r.requester_id;
  select public.normalize_city(country,city),trim(country) into city_b,country_b from public.profiles where id=r.responder_id;
  if coalesce(city_a,'')='' or coalesce(city_b,'')='' then raise exception 'Both collectors must choose a city before accepting a local exchange'; end if;
  if lower(city_a)<>lower(city_b) or lower(coalesce(country_a,''))<>lower(coalesce(country_b,'')) then raise exception 'BrickCircle supports in-person exchanges only between collectors registered in the same city and country'; end if;
  perform 1 from public.collection_items where id in(r.offered_item_id,r.requested_item_id) order by id for update;
  if not exists(select 1 from public.collection_items where id=r.offered_item_id and user_id=r.requester_id and available_for_exchange) then raise exception 'Offered item is not available for exchange'; end if;
  if not exists(select 1 from public.collection_items where id=r.requested_item_id and user_id=r.responder_id and available_for_exchange) then raise exception 'Requested item is not available for exchange'; end if;
  if exists(select 1 from public.exchanges where state not in ('completed','cancelled','disputed') and (item_a in(r.offered_item_id,r.requested_item_id) or item_b in(r.offered_item_id,r.requested_item_id))) then raise exception 'One of these LEGO sets is already reserved in another active exchange'; end if;
  update public.exchange_requests set status='accepted',updated_at=now() where id=r.id;
  begin
   insert into public.exchanges(request_id,user_a,user_b,item_a,item_b,duration_days,deposit_amount,payment_status,condition_photos_required,state,started_at,created_at,updated_at)
   values(r.id,r.requester_id,r.responder_id,r.offered_item_id,r.requested_item_id,r.duration_days,r.proposed_deposit,'not_connected',true,'accepted',now(),now(),now()) returning * into ex;
  exception when unique_violation then raise exception 'One of these LEGO sets was just reserved in another active exchange'; end;
  update public.collection_items set available_for_exchange=false where id in(r.offered_item_id,r.requested_item_id);
  update public.exchange_requests set status='cancelled',updated_at=now() where id<>r.id and status='pending' and (offered_item_id in(r.offered_item_id,r.requested_item_id) or requested_item_id in(r.offered_item_id,r.requested_item_id));
  get diagnostics conflict_count = row_count;
  insert into public.notifications(user_id,kind,title,body,created_at) values
   (r.requester_id,'exchange_accepted','Exchange request accepted','Your exchange request was accepted. Both LEGO sets are now reserved for this exchange.',now()),
   (r.responder_id,'exchange_created','Exchange created','Your accepted exchange is active. Both LEGO sets are now reserved.',now());
  return jsonb_build_object('ok',true,'status','accepted','exchange_id',ex.id,'sets_reserved',true,'other_requests_closed',conflict_count);
 elsif p_action='decline' then
  update public.exchange_requests set status='declined',updated_at=now() where id=r.id;
  insert into public.notifications(user_id,kind,title,body,created_at) values(r.requester_id,'exchange_declined','Exchange request declined','Your exchange request was declined.',now());
  return jsonb_build_object('ok',true,'status','declined');
 else
  update public.exchange_requests set status='cancelled',updated_at=now() where id=r.id;
  insert into public.notifications(user_id,kind,title,body,created_at) values(r.responder_id,'exchange_cancelled','Exchange request cancelled','An exchange request to you was cancelled.',now());
  return jsonb_build_object('ok',true,'status','cancelled');
 end if;
end
$$;

-- Keep exposure explicit and reload PostgREST metadata after rollout.
revoke all on function public.normalize_city(text,text) from public;
grant execute on function public.normalize_city(text,text) to authenticated;
notify pgrst, 'reload schema';
