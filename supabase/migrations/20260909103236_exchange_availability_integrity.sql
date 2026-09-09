-- Keep the marketplace availability flag, reciprocal matching and physical exchange
-- reservations consistent. Disputed exchanges remain reserved until resolved.

create or replace function public.bc_guard_collection_exchangeability()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(new.available_for_exchange, false)
     and exists (
       select 1
       from public.exchanges e
       where e.state not in ('completed', 'cancelled')
         and (e.item_a = new.id or e.item_b = new.id)
     ) then
    raise exception 'This LEGO set is reserved in an active exchange. Complete or cancel that exchange before offering it again.'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

drop trigger if exists bc_guard_collection_exchangeability on public.collection_items;
create trigger bc_guard_collection_exchangeability
before insert or update of available_for_exchange on public.collection_items
for each row execute function public.bc_guard_collection_exchangeability();

create or replace function public.bc_enforce_exchange_item_reservations()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.state not in ('completed', 'cancelled') then
    if new.item_a is null or new.item_b is null then
      raise exception 'An active exchange must reference both physical LEGO sets.' using errcode = '23514';
    end if;
    if new.item_a = new.item_b then
      raise exception 'The same physical LEGO set cannot be used on both sides of an exchange.' using errcode = '23514';
    end if;

    perform 1
    from public.collection_items
    where id in (new.item_a, new.item_b)
    order by id
    for update;

    if exists (
      select 1
      from public.exchanges e
      where e.id <> new.id
        and e.state not in ('completed', 'cancelled')
        and (
          e.item_a in (new.item_a, new.item_b)
          or e.item_b in (new.item_a, new.item_b)
        )
    ) then
      raise exception 'One of these LEGO sets is already reserved in another active exchange.'
        using errcode = '55000';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists bc_enforce_exchange_item_reservations on public.exchanges;
create trigger bc_enforce_exchange_item_reservations
before insert or update of item_a, item_b, state on public.exchanges
for each row execute function public.bc_enforce_exchange_item_reservations();

-- Disputes are not terminal: the sets must remain reserved while the issue is resolved.
drop index if exists public.uq_active_exchange_item_a;
drop index if exists public.uq_active_exchange_item_b;
create unique index uq_active_exchange_item_a
on public.exchanges(item_a)
where state not in ('completed', 'cancelled');
create unique index uq_active_exchange_item_b
on public.exchanges(item_b)
where state not in ('completed', 'cancelled');

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
    and public.normalize_beta_city(p1.country,p1.city)=public.normalize_beta_city(p2.country,p2.city)
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
      and public.normalize_beta_city(p1.country, p1.city) = public.normalize_beta_city(p2.country, p2.city)
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

-- Repair pre-existing contradictions before the new guard takes effect for future writes.
update public.collection_items c
set available_for_exchange = false,
    updated_at = now()
where c.available_for_exchange = true
  and exists (
    select 1 from public.exchanges e
    where e.state not in ('completed','cancelled')
      and (e.item_a=c.id or e.item_b=c.id)
  );

with invalid_requests as (
  update public.exchange_requests r
  set status='cancelled', updated_at=now()
  where r.status='pending'
    and exists (
      select 1 from public.exchanges e
      where e.state not in ('completed','cancelled')
        and (
          e.item_a in (r.offered_item_id,r.requested_item_id)
          or e.item_b in (r.offered_item_id,r.requested_item_id)
        )
    )
  returning r.requester_id,r.responder_id,r.id
)
insert into public.notifications(user_id,kind,title,body,entity_type,entity_id,metadata)
select recipient_id,'exchange_cancelled','Proposal closed — set unavailable',
       'This proposal was closed because one of the physical LEGO sets is already in an active exchange.',
       'exchange_request',request_id,
       pg_catalog.jsonb_build_object('exchange_request_id',request_id,'route','#exchanges')
from invalid_requests
cross join lateral (values(requester_id),(responder_id)) recipients(recipient_id)
on conflict (user_id,kind,entity_type,entity_id)
  where entity_id is not null
do nothing;

revoke all on function public.bc_guard_collection_exchangeability() from public;
revoke all on function public.bc_enforce_exchange_item_reservations() from public;
revoke all on function public.find_matches(uuid) from public, anon;
grant execute on function public.find_matches(uuid) to authenticated;
revoke all on function public.queue_new_reciprocal_match_notifications(uuid) from public, anon, authenticated;
