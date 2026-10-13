-- BrickCircle beta-release privacy and notification hardening.
-- 1) Keep private profile fields private; expose collector-facing data only via public_profiles.
-- 2) Allow members to read and mark only their own notifications.
-- 3) Stop anonymous/raw exchangeable collection access while preserving participant access to items in requests/exchanges.

alter table public.profiles enable row level security;
alter table public.notifications enable row level security;
alter table public.collection_items enable row level security;
alter table public.public_profiles enable row level security;

-- PROFILES: private source table, owner-only through the client.
drop policy if exists "public profiles readable" on public.profiles;
drop policy if exists "users insert own profile" on public.profiles;
drop policy if exists "users update own profile" on public.profiles;
drop policy if exists "users read own profile" on public.profiles;

revoke all privileges on table public.profiles from anon, authenticated;
grant select, insert, update on table public.profiles to authenticated;

create policy "users read own profile"
on public.profiles for select
to authenticated
using ((select auth.uid()) = id);

create policy "users insert own profile"
on public.profiles for insert
to authenticated
with check ((select auth.uid()) = id);

create policy "users update own profile"
on public.profiles for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

-- PUBLIC_PROFILES: deliberately sanitized projection table, read-only to clients.
revoke all privileges on table public.public_profiles from anon, authenticated;
grant select on table public.public_profiles to anon, authenticated;

-- NOTIFICATIONS: recipient-only read/update; generation remains server-side.
drop policy if exists "users read own notifications" on public.notifications;
drop policy if exists "users update own notifications" on public.notifications;

revoke all privileges on table public.notifications from anon, authenticated;
grant select, update on table public.notifications to authenticated;

create policy "users read own notifications"
on public.notifications for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "users update own notifications"
on public.notifications for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

-- COLLECTION ITEMS: no anonymous/raw marketplace reads. Members may manage their
-- own items, and may inspect the specific counterpart item once it participates
-- in an exchange request or accepted exchange involving them.
drop policy if exists "users manage own collection" on public.collection_items;
drop policy if exists "users read exchangeable collection" on public.collection_items;
drop policy if exists "users read permitted collection items" on public.collection_items;
drop policy if exists "users insert own collection items" on public.collection_items;
drop policy if exists "users update own collection items" on public.collection_items;
drop policy if exists "users delete own collection items" on public.collection_items;

revoke all privileges on table public.collection_items from anon, authenticated;
grant select, insert, update, delete on table public.collection_items to authenticated;

create policy "users read permitted collection items"
on public.collection_items for select
to authenticated
using (
  (select auth.uid()) = user_id
  or exists (
    select 1
    from public.exchange_requests r
    where ((select auth.uid()) = r.requester_id or (select auth.uid()) = r.responder_id)
      and (r.offered_item_id = collection_items.id or r.requested_item_id = collection_items.id)
  )
  or exists (
    select 1
    from public.exchanges e
    where ((select auth.uid()) = e.user_a or (select auth.uid()) = e.user_b)
      and (e.item_a = collection_items.id or e.item_b = collection_items.id)
  )
);

create policy "users insert own collection items"
on public.collection_items for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "users update own collection items"
on public.collection_items for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "users delete own collection items"
on public.collection_items for delete
to authenticated
using ((select auth.uid()) = user_id);
