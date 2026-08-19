-- BrickCircle V2 production data model
-- Designed for Supabase/Postgres. Enable RLS before exposing tables to the client.
create extension if not exists pgcrypto;

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  email text,
  country text,
  city text,
  bio text,
  avatar_url text,
  rating numeric(3,2) default 5.00,
  review_count integer default 0,
  trust_score integer default 50 check (trust_score between 0 and 100),
  email_verified boolean default false,
  identity_verified boolean default false,
  address_verified boolean default false,
  mfa_enabled boolean default false,
  member_since timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists exchange_preferences (
  user_id uuid primary key references profiles(id) on delete cascade,
  international boolean default true,
  max_value numeric(12,2) default 1000,
  shipping_method text default 'tracked',
  durations integer[] default array[30,60,90],
  themes text[] default array[]::text[],
  updated_at timestamptz default now()
);

create table if not exists lego_sets (
  set_number text primary key,
  name text not null,
  theme text,
  year integer,
  piece_count integer,
  estimated_value numeric(12,2),
  image_url text,
  created_at timestamptz default now()
);

create table if not exists collection_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  set_number text not null references lego_sets(set_number),
  condition text not null default 'Excellent',
  completeness integer default 100 check (completeness between 0 and 100),
  original_box boolean default false,
  estimated_value numeric(12,2),
  available_for_exchange boolean default false,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id,set_number)
);

create table if not exists wishlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  set_number text not null references lego_sets(set_number),
  priority integer default 3 check(priority between 1 and 5),
  created_at timestamptz default now(),
  unique(user_id,set_number)
);

create table if not exists exchange_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references profiles(id),
  responder_id uuid not null references profiles(id),
  offered_item_id uuid not null references collection_items(id),
  requested_item_id uuid not null references collection_items(id),
  duration_days integer not null check(duration_days in (30,60,90)),
  offered_value numeric(12,2),
  requested_value numeric(12,2),
  proposed_deposit numeric(12,2),
  status text not null default 'pending' check(status in ('pending','accepted','declined','cancelled','expired')),
  message text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists exchanges (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references exchange_requests(id),
  user_a uuid not null references profiles(id),
  user_b uuid not null references profiles(id),
  item_a uuid not null references collection_items(id),
  item_b uuid not null references collection_items(id),
  duration_days integer not null,
  deposit_amount numeric(12,2),
  payment_status text default 'not_connected',
  shipping_a_tracking text,
  shipping_b_tracking text,
  condition_photos_required boolean default true,
  state text not null default 'accepted' check(state in ('accepted','deposit_pending','photos_pending','shipping','building','return_shipping','inspection','completed','disputed','cancelled')),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  exchange_id uuid not null references exchanges(id) on delete cascade,
  reviewer_id uuid not null references profiles(id),
  reviewee_id uuid not null references profiles(id),
  rating integer not null check(rating between 1 and 5),
  comment text,
  created_at timestamptz default now(),
  unique(exchange_id,reviewer_id)
);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  kind text,
  title text,
  body text,
  read_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  exchange_id uuid references exchanges(id) on delete cascade,
  sender_id uuid not null references profiles(id),
  recipient_id uuid not null references profiles(id),
  body text not null,
  created_at timestamptz default now(),
  read_at timestamptz
);

create index if not exists collection_user_idx on collection_items(user_id);
create index if not exists collection_available_idx on collection_items(available_for_exchange);
create index if not exists wishlist_user_idx on wishlists(user_id);
create index if not exists requests_responder_idx on exchange_requests(responder_id,status);
create index if not exists exchanges_user_a_idx on exchanges(user_a,state);
create index if not exists exchanges_user_b_idx on exchanges(user_b,state);
create index if not exists notifications_user_idx on notifications(user_id,read_at);
create index if not exists messages_exchange_idx on messages(exchange_id,created_at);

alter table profiles enable row level security;
alter table exchange_preferences enable row level security;
alter table lego_sets enable row level security;
alter table collection_items enable row level security;
alter table wishlists enable row level security;
alter table exchange_requests enable row level security;
alter table exchanges enable row level security;
alter table reviews enable row level security;
alter table notifications enable row level security;
alter table messages enable row level security;

-- Public catalogue and public collector profiles.
create policy "catalogue readable by everyone" on lego_sets for select using (true);
create policy "public profiles readable" on profiles for select using (true);

-- Owners control their private profile fields/preferences and collection.
create policy "users update own profile" on profiles for update using (auth.uid()=id) with check (auth.uid()=id);
create policy "users insert own profile" on profiles for insert with check (auth.uid()=id);
create policy "users manage own preferences" on exchange_preferences for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy "users read own collection" on collection_items for select using (auth.uid()=user_id or available_for_exchange=true);
create policy "users manage own collection" on collection_items for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy "users manage own wishlist" on wishlists for all using (auth.uid()=user_id) with check (auth.uid()=user_id);

-- Exchange requests are visible to the two participants.
create policy "participants read requests" on exchange_requests for select using (auth.uid()=requester_id or auth.uid()=responder_id);
create policy "requesters create requests" on exchange_requests for insert with check (auth.uid()=requester_id);
create policy "participants update requests" on exchange_requests for update using (auth.uid()=requester_id or auth.uid()=responder_id);
create policy "participants read exchanges" on exchanges for select using (auth.uid()=user_a or auth.uid()=user_b);
create policy "participants read reviews" on reviews for select using (auth.uid()=reviewer_id or auth.uid()=reviewee_id);
create policy "participants create reviews" on reviews for insert with check (auth.uid()=reviewer_id);
create policy "users read notifications" on notifications for select using (auth.uid()=user_id);
create policy "users update notifications" on notifications for update using (auth.uid()=user_id);
create policy "participants read messages" on messages for select using (auth.uid()=sender_id or auth.uid()=recipient_id);
create policy "users send messages" on messages for insert with check (auth.uid()=sender_id);
