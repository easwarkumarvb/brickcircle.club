-- Standards-based Web Push subscriptions and durable reciprocal-match events.
-- Delivery is performed asynchronously by the send-web-push Edge Function.

create table if not exists public.push_subscriptions (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null check (pg_catalog.length(endpoint) between 16 and 4096),
  p256dh text not null check (pg_catalog.length(p256dh) between 16 and 512),
  auth text not null check (pg_catalog.length(auth) between 8 and 512),
  user_agent text check (user_agent is null or pg_catalog.length(user_agent) <= 1000),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  last_success_at timestamptz,
  disabled_at timestamptz,
  constraint push_subscriptions_endpoint_key unique(endpoint)
);

alter table public.push_subscriptions enable row level security;
revoke all on table public.push_subscriptions from public, anon, authenticated;
grant select, insert, update, delete on table public.push_subscriptions to authenticated;
grant all on table public.push_subscriptions to service_role;

drop policy if exists "users select own push subscriptions" on public.push_subscriptions;
create policy "users select own push subscriptions"
on public.push_subscriptions for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "users insert own push subscriptions" on public.push_subscriptions;
create policy "users insert own push subscriptions"
on public.push_subscriptions for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "users update own push subscriptions" on public.push_subscriptions;
create policy "users update own push subscriptions"
on public.push_subscriptions for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "users delete own push subscriptions" on public.push_subscriptions;
create policy "users delete own push subscriptions"
on public.push_subscriptions for delete to authenticated
using ((select auth.uid()) = user_id);

create table if not exists public.push_delivery_log (
  id uuid primary key default extensions.gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  status text not null default 'processing' check (status in ('processing','sent','failed','disabled')),
  http_status integer,
  attempt_count integer not null default 1 check (attempt_count > 0),
  last_error text,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint push_delivery_log_notification_subscription_key unique(notification_id, subscription_id)
);

alter table public.push_delivery_log enable row level security;
revoke all on table public.push_delivery_log from public, anon, authenticated;
grant all on table public.push_delivery_log to service_role;

create index if not exists push_subscriptions_active_user_idx
on public.push_subscriptions(user_id) where disabled_at is null;

create index if not exists push_delivery_log_notification_idx
on public.push_delivery_log(notification_id);

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

revoke all on function public.queue_new_reciprocal_match_notifications(uuid) from public, anon, authenticated;
grant execute on function public.queue_new_reciprocal_match_notifications(uuid) to service_role;

create or replace function public.detect_new_reciprocal_matches()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.queue_new_reciprocal_match_notifications(new.user_id);
  return new;
end;
$$;

revoke all on function public.detect_new_reciprocal_matches() from public, anon, authenticated;
grant execute on function public.detect_new_reciprocal_matches() to service_role;

drop trigger if exists collection_reciprocal_match_notification on public.collection_items;
create trigger collection_reciprocal_match_notification
after insert or update of user_id, set_number, available_for_exchange on public.collection_items
for each row execute function public.detect_new_reciprocal_matches();

drop trigger if exists wishlist_reciprocal_match_notification on public.wishlists;
create trigger wishlist_reciprocal_match_notification
after insert or update of user_id, set_number on public.wishlists
for each row execute function public.detect_new_reciprocal_matches();

create or replace function public.detect_profile_reciprocal_matches()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.queue_new_reciprocal_match_notifications(new.id);
  return new;
end;
$$;

revoke all on function public.detect_profile_reciprocal_matches() from public, anon, authenticated;
grant execute on function public.detect_profile_reciprocal_matches() to service_role;

drop trigger if exists profile_reciprocal_match_notification on public.profiles;
create trigger profile_reciprocal_match_notification
after update of country, city on public.profiles
for each row
when (old.country is distinct from new.country or old.city is distinct from new.city)
execute function public.detect_profile_reciprocal_matches();
