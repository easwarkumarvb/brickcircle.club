-- BrickCircle fresh-install-only baseline.
-- Catalog-derived checkpoint 2026-08-31; not historical migration SQL.

do $$ begin
 if to_regclass('public.profiles') is not null
    or to_regclass('public.lego_sets') is not null
    or to_regclass('public.collection_items') is not null
    or to_regclass('public.growth_events') is not null
    or to_regclass('public.exchanges') is not null then
   raise exception 'BrickCircle sentinel objects exist; fresh baseline refused';
 end if;
end $$;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema public;
alter extension pg_trgm set schema public;
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema public to anon, authenticated, service_role;

-- [10] bc_membership_ordinal_seq
create sequence public.bc_membership_ordinal_seq as bigint increment by 1 minvalue 1 maxvalue 9223372036854775807 start with 1 cache 1 no cycle;

-- [20] city_pricing_overrides
create table public.city_pricing_overrides (
  country text not null,
  city text not null,
  pricing_enabled boolean default false not null,
  enabled_at timestamp with time zone,
  note text,
  updated_at timestamp with time zone default now() not null
);

-- [20] collection_items
create table public.collection_items (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  set_number text not null,
  condition text default 'Excellent'::text not null,
  completeness integer default 100 not null,
  original_box boolean default false not null,
  estimated_value numeric(12,2),
  available_for_exchange boolean default false not null,
  notes text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

-- [20] email_outbox
create table public.email_outbox (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  notification_id uuid,
  recipient_email text not null,
  template_key text not null,
  subject text not null,
  payload jsonb default '{}'::jsonb not null,
  status text default 'pending'::text not null,
  attempt_count integer default 0 not null,
  last_error text,
  provider_message_id text,
  next_attempt_at timestamp with time zone default now() not null,
  sent_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

-- [20] exchange_meetups
create table public.exchange_meetups (
  id uuid default gen_random_uuid() not null,
  exchange_id uuid not null,
  proposed_by uuid not null,
  venue_name text,
  venue_area text,
  meetup_at timestamp with time zone,
  safety_ack_a boolean default false not null,
  safety_ack_b boolean default false not null,
  arrived_a boolean default false not null,
  arrived_b boolean default false not null,
  inspected_a boolean default false not null,
  inspected_b boolean default false not null,
  confirmed_a boolean default false not null,
  confirmed_b boolean default false not null,
  issue_a text,
  issue_b text,
  status text default 'planning'::text not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

-- [20] exchange_preferences
create table public.exchange_preferences (
  user_id uuid not null,
  international boolean default true not null,
  max_value numeric(12,2) default 1000 not null,
  shipping_method text default 'tracked'::text not null,
  durations integer[] default ARRAY[30, 60, 90] not null,
  themes text[] default ARRAY[]::text[] not null,
  updated_at timestamp with time zone default now() not null
);

-- [20] exchange_requests
create table public.exchange_requests (
  id uuid default gen_random_uuid() not null,
  requester_id uuid not null,
  responder_id uuid not null,
  offered_item_id uuid not null,
  requested_item_id uuid not null,
  duration_days integer not null,
  offered_value numeric(12,2),
  requested_value numeric(12,2),
  proposed_deposit numeric(12,2),
  status text default 'pending'::text not null,
  message text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

-- [20] exchange_returns
create table public.exchange_returns (
  id uuid default gen_random_uuid() not null,
  exchange_id uuid not null,
  proposed_by uuid not null,
  venue_name text,
  venue_area text,
  meetup_at timestamp with time zone,
  safety_ack_a boolean default false not null,
  safety_ack_b boolean default false not null,
  arrived_a boolean default false not null,
  arrived_b boolean default false not null,
  inspected_a boolean default false not null,
  inspected_b boolean default false not null,
  confirmed_a boolean default false not null,
  confirmed_b boolean default false not null,
  issue_a text,
  issue_b text,
  status text default 'planning'::text not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

-- [20] exchanges
create table public.exchanges (
  id uuid default gen_random_uuid() not null,
  request_id uuid,
  user_a uuid not null,
  user_b uuid not null,
  item_a uuid not null,
  item_b uuid not null,
  duration_days integer not null,
  deposit_amount numeric(12,2),
  payment_status text default 'not_connected'::text not null,
  shipping_a_tracking text,
  shipping_b_tracking text,
  condition_photos_required boolean default true not null,
  state text default 'accepted'::text not null,
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  outbound_completed_at timestamp with time zone,
  return_due_at timestamp with time zone,
  overdue_notified_at_a timestamp with time zone,
  overdue_notified_at_b timestamp with time zone
);

-- [20] growth_events
create table public.growth_events (
  id bigint generated by default as identity not null,
  user_id uuid not null,
  event_name text not null,
  properties jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null
);

-- [20] growth_member_state
create table public.growth_member_state (
  user_id uuid not null,
  match_ready_at timestamp with time zone,
  first_match_alert_at timestamp with time zone,
  last_campaign_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

-- [20] lego_sets
create table public.lego_sets (
  set_number text not null,
  name text not null,
  theme text,
  year integer,
  piece_count integer,
  estimated_value numeric(12,2),
  image_url text,
  created_at timestamp with time zone default now() not null,
  rebrickable_set_num text,
  rebrickable_theme_id integer,
  catalog_source text,
  catalog_updated_at timestamp with time zone,
  valuation_source text,
  valuation_currency text,
  valuation_updated_at timestamp with time zone,
  catalog_active boolean default true not null
);

-- [20] member_notifications
create table public.member_notifications (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  kind text not null,
  title text not null,
  body text not null,
  cta_hash text,
  dedupe_key text,
  read_at timestamp with time zone,
  created_at timestamp with time zone default now() not null
);

-- [20] membership_program_config
create table public.membership_program_config (
  id smallint not null,
  founding_cap integer default 100 not null,
  early_member_limit integer default 1000 not null,
  beta_free boolean default true not null,
  city_min_members integer default 100 not null,
  city_min_exchangeable_sets integer default 200 not null,
  city_min_wishlist_items integer default 300 not null,
  updated_at timestamp with time zone default now() not null
);

-- [20] messages
create table public.messages (
  id uuid default gen_random_uuid() not null,
  exchange_id uuid,
  sender_id uuid not null,
  recipient_id uuid not null,
  body text not null,
  created_at timestamp with time zone default now() not null,
  read_at timestamp with time zone
);

-- [20] notifications
create table public.notifications (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  kind text,
  title text,
  body text,
  read_at timestamp with time zone,
  created_at timestamp with time zone default now() not null
);

-- [20] product_metrics
create table public.product_metrics (
  id bigint generated by default as identity not null,
  user_id uuid,
  metric_name text not null,
  duration_ms numeric,
  properties jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null
);

-- [20] profiles
create table public.profiles (
  id uuid not null,
  display_name text default ''::text not null,
  email text,
  country text,
  city text,
  bio text,
  avatar_url text,
  rating numeric(3,2) default 5.00 not null,
  review_count integer default 0 not null,
  trust_score integer default 50 not null,
  email_verified boolean default false not null,
  identity_verified boolean default false not null,
  address_verified boolean default false not null,
  mfa_enabled boolean default false not null,
  member_since timestamp with time zone default now() not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  founding_member_number smallint,
  founding_member_granted_at timestamp with time zone,
  membership_ordinal integer,
  early_member_number integer,
  early_member_granted_at timestamp with time zone
);

-- [20] public_profiles
create table public.public_profiles (
  id uuid not null,
  display_name text,
  country text,
  city text,
  bio text,
  avatar_url text,
  rating numeric,
  review_count integer,
  identity_verified boolean default false not null,
  member_since timestamp with time zone,
  updated_at timestamp with time zone default now() not null,
  founding_member_number smallint,
  early_member_number integer
);

-- [20] referrals
create table public.referrals (
  id uuid default gen_random_uuid() not null,
  referrer_id uuid not null,
  code text not null,
  claimed_by uuid,
  status text default 'active'::text not null,
  created_at timestamp with time zone default now() not null,
  claimed_at timestamp with time zone
);

-- [20] reviews
create table public.reviews (
  id uuid default gen_random_uuid() not null,
  exchange_id uuid not null,
  reviewer_id uuid not null,
  reviewee_id uuid not null,
  rating integer not null,
  comment text,
  created_at timestamp with time zone default now() not null
);

-- [20] wishlists
create table public.wishlists (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  set_number text not null,
  priority integer default 3 not null,
  created_at timestamp with time zone default now() not null
);

-- [30] city_pricing_overrides.city_pricing_overrides_pkey
alter table public.city_pricing_overrides add constraint city_pricing_overrides_pkey PRIMARY KEY (country, city);

-- [30] collection_items.collection_items_completeness_check
alter table public.collection_items add constraint collection_items_completeness_check CHECK (completeness >= 0 AND completeness <= 100);

-- [30] collection_items.collection_items_pkey
alter table public.collection_items add constraint collection_items_pkey PRIMARY KEY (id);

-- [30] collection_items.collection_items_user_id_set_number_key
alter table public.collection_items add constraint collection_items_user_id_set_number_key UNIQUE (user_id, set_number);

-- [30] email_outbox.email_outbox_pkey
alter table public.email_outbox add constraint email_outbox_pkey PRIMARY KEY (id);

-- [30] email_outbox.email_outbox_status_check
alter table public.email_outbox add constraint email_outbox_status_check CHECK (status = ANY (ARRAY['pending'::text, 'processing'::text, 'sent'::text, 'failed'::text, 'suppressed'::text]));

-- [30] exchange_meetups.exchange_meetups_exchange_id_key
alter table public.exchange_meetups add constraint exchange_meetups_exchange_id_key UNIQUE (exchange_id);

-- [30] exchange_meetups.exchange_meetups_pkey
alter table public.exchange_meetups add constraint exchange_meetups_pkey PRIMARY KEY (id);

-- [30] exchange_meetups.exchange_meetups_status_check
alter table public.exchange_meetups add constraint exchange_meetups_status_check CHECK (status = ANY (ARRAY['planning'::text, 'scheduled'::text, 'meeting'::text, 'inspection'::text, 'completed'::text, 'cancelled'::text, 'issue'::text]));

-- [30] exchange_preferences.exchange_preferences_pkey
alter table public.exchange_preferences add constraint exchange_preferences_pkey PRIMARY KEY (user_id);

-- [30] exchange_requests.exchange_requests_duration_days_check
alter table public.exchange_requests add constraint exchange_requests_duration_days_check CHECK (duration_days = ANY (ARRAY[30, 60, 90]));

-- [30] exchange_requests.exchange_requests_pkey
alter table public.exchange_requests add constraint exchange_requests_pkey PRIMARY KEY (id);

-- [30] exchange_requests.exchange_requests_status_check
alter table public.exchange_requests add constraint exchange_requests_status_check CHECK (status = ANY (ARRAY['pending'::text, 'accepted'::text, 'declined'::text, 'cancelled'::text, 'expired'::text]));

-- [30] exchange_returns.exchange_returns_exchange_id_key
alter table public.exchange_returns add constraint exchange_returns_exchange_id_key UNIQUE (exchange_id);

-- [30] exchange_returns.exchange_returns_pkey
alter table public.exchange_returns add constraint exchange_returns_pkey PRIMARY KEY (id);

-- [30] exchanges.exchanges_pkey
alter table public.exchanges add constraint exchanges_pkey PRIMARY KEY (id);

-- [30] exchanges.exchanges_state_check
alter table public.exchanges add constraint exchanges_state_check CHECK (state = ANY (ARRAY['accepted'::text, 'deposit_pending'::text, 'photos_pending'::text, 'shipping'::text, 'building'::text, 'return_shipping'::text, 'inspection'::text, 'swap_active'::text, 'completed'::text, 'disputed'::text, 'cancelled'::text]));

-- [30] growth_events.growth_events_pkey
alter table public.growth_events add constraint growth_events_pkey PRIMARY KEY (id);

-- [30] growth_member_state.growth_member_state_pkey
alter table public.growth_member_state add constraint growth_member_state_pkey PRIMARY KEY (user_id);

-- [30] lego_sets.lego_sets_pkey
alter table public.lego_sets add constraint lego_sets_pkey PRIMARY KEY (set_number);

-- [30] member_notifications.member_notifications_kind_check
alter table public.member_notifications add constraint member_notifications_kind_check CHECK (kind = ANY (ARRAY['onboarding'::text, 'collection'::text, 'wishlist'::text, 'match'::text, 'referral'::text, 'exchange'::text]));

-- [30] member_notifications.member_notifications_pkey
alter table public.member_notifications add constraint member_notifications_pkey PRIMARY KEY (id);

-- [30] membership_program_config.membership_program_config_check
alter table public.membership_program_config add constraint membership_program_config_check CHECK (early_member_limit >= founding_cap);

-- [30] membership_program_config.membership_program_config_city_min_ex
alter table public.membership_program_config add constraint membership_program_config_city_min_exchangeable_sets_check CHECK (city_min_exchangeable_sets > 0);

-- [30] membership_program_config.membership_program_config_city_min_me
alter table public.membership_program_config add constraint membership_program_config_city_min_members_check CHECK (city_min_members > 0);

-- [30] membership_program_config.membership_program_config_city_min_wi
alter table public.membership_program_config add constraint membership_program_config_city_min_wishlist_items_check CHECK (city_min_wishlist_items > 0);

-- [30] membership_program_config.membership_program_config_founding_ca
alter table public.membership_program_config add constraint membership_program_config_founding_cap_check CHECK (founding_cap = 100);

-- [30] membership_program_config.membership_program_config_id_check
alter table public.membership_program_config add constraint membership_program_config_id_check CHECK (id = 1);

-- [30] membership_program_config.membership_program_config_pkey
alter table public.membership_program_config add constraint membership_program_config_pkey PRIMARY KEY (id);

-- [30] messages.messages_pkey
alter table public.messages add constraint messages_pkey PRIMARY KEY (id);

-- [30] notifications.notifications_pkey
alter table public.notifications add constraint notifications_pkey PRIMARY KEY (id);

-- [30] product_metrics.product_metrics_duration_ms_check
alter table public.product_metrics add constraint product_metrics_duration_ms_check CHECK (duration_ms IS NULL OR duration_ms >= 0::numeric AND duration_ms <= 600000::numeric);

-- [30] product_metrics.product_metrics_metric_name_check
alter table public.product_metrics add constraint product_metrics_metric_name_check CHECK (length(metric_name) >= 1 AND length(metric_name) <= 80);

-- [30] product_metrics.product_metrics_pkey
alter table public.product_metrics add constraint product_metrics_pkey PRIMARY KEY (id);

-- [30] profiles.profiles_early_member_range
alter table public.profiles add constraint profiles_early_member_range CHECK (early_member_number IS NULL OR early_member_number >= 101 AND early_member_number <= 1000);

-- [30] profiles.profiles_founding_member_number_check
alter table public.profiles add constraint profiles_founding_member_number_check CHECK (founding_member_number IS NULL OR founding_member_number >= 1 AND founding_member_number <= 100);

-- [30] profiles.profiles_membership_ordinal_positive
alter table public.profiles add constraint profiles_membership_ordinal_positive CHECK (membership_ordinal IS NULL OR membership_ordinal > 0);

-- [30] profiles.profiles_pkey
alter table public.profiles add constraint profiles_pkey PRIMARY KEY (id);

-- [30] profiles.profiles_trust_score_check
alter table public.profiles add constraint profiles_trust_score_check CHECK (trust_score >= 0 AND trust_score <= 100);

-- [30] public_profiles.public_profiles_pkey
alter table public.public_profiles add constraint public_profiles_pkey PRIMARY KEY (id);

-- [30] referrals.referrals_code_key
alter table public.referrals add constraint referrals_code_key UNIQUE (code);

-- [30] referrals.referrals_pkey
alter table public.referrals add constraint referrals_pkey PRIMARY KEY (id);

-- [30] referrals.referrals_status_check
alter table public.referrals add constraint referrals_status_check CHECK (status = ANY (ARRAY['active'::text, 'claimed'::text, 'disabled'::text]));

-- [30] reviews.reviews_exchange_id_reviewer_id_key
alter table public.reviews add constraint reviews_exchange_id_reviewer_id_key UNIQUE (exchange_id, reviewer_id);

-- [30] reviews.reviews_pkey
alter table public.reviews add constraint reviews_pkey PRIMARY KEY (id);

-- [30] reviews.reviews_rating_check
alter table public.reviews add constraint reviews_rating_check CHECK (rating >= 1 AND rating <= 5);

-- [30] wishlists.wishlists_pkey
alter table public.wishlists add constraint wishlists_pkey PRIMARY KEY (id);

-- [30] wishlists.wishlists_priority_check
alter table public.wishlists add constraint wishlists_priority_check CHECK (priority >= 1 AND priority <= 5);

-- [30] wishlists.wishlists_user_id_set_number_key
alter table public.wishlists add constraint wishlists_user_id_set_number_key UNIQUE (user_id, set_number);

-- [35] collection_items.collection_items_set_number_fkey
alter table public.collection_items add constraint collection_items_set_number_fkey FOREIGN KEY (set_number) REFERENCES lego_sets(set_number);

-- [35] collection_items.collection_items_user_id_fkey
alter table public.collection_items add constraint collection_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- [35] email_outbox.email_outbox_user_id_fkey
alter table public.email_outbox add constraint email_outbox_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- [35] exchange_meetups.exchange_meetups_exchange_id_fkey
alter table public.exchange_meetups add constraint exchange_meetups_exchange_id_fkey FOREIGN KEY (exchange_id) REFERENCES exchanges(id) ON DELETE CASCADE;

-- [35] exchange_meetups.exchange_meetups_proposed_by_fkey
alter table public.exchange_meetups add constraint exchange_meetups_proposed_by_fkey FOREIGN KEY (proposed_by) REFERENCES auth.users(id);

-- [35] exchange_preferences.exchange_preferences_user_id_fkey
alter table public.exchange_preferences add constraint exchange_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- [35] exchange_requests.exchange_requests_offered_item_id_fkey
alter table public.exchange_requests add constraint exchange_requests_offered_item_id_fkey FOREIGN KEY (offered_item_id) REFERENCES collection_items(id) ON DELETE CASCADE;

-- [35] exchange_requests.exchange_requests_requested_item_id_fkey
alter table public.exchange_requests add constraint exchange_requests_requested_item_id_fkey FOREIGN KEY (requested_item_id) REFERENCES collection_items(id) ON DELETE CASCADE;

-- [35] exchange_requests.exchange_requests_requester_id_fkey
alter table public.exchange_requests add constraint exchange_requests_requester_id_fkey FOREIGN KEY (requester_id) REFERENCES profiles(id);

-- [35] exchange_requests.exchange_requests_responder_id_fkey
alter table public.exchange_requests add constraint exchange_requests_responder_id_fkey FOREIGN KEY (responder_id) REFERENCES profiles(id);

-- [35] exchange_returns.exchange_returns_exchange_id_fkey
alter table public.exchange_returns add constraint exchange_returns_exchange_id_fkey FOREIGN KEY (exchange_id) REFERENCES exchanges(id) ON DELETE CASCADE;

-- [35] exchange_returns.exchange_returns_proposed_by_fkey
alter table public.exchange_returns add constraint exchange_returns_proposed_by_fkey FOREIGN KEY (proposed_by) REFERENCES profiles(id);

-- [35] exchanges.exchanges_item_a_fkey
alter table public.exchanges add constraint exchanges_item_a_fkey FOREIGN KEY (item_a) REFERENCES collection_items(id);

-- [35] exchanges.exchanges_item_b_fkey
alter table public.exchanges add constraint exchanges_item_b_fkey FOREIGN KEY (item_b) REFERENCES collection_items(id);

-- [35] exchanges.exchanges_request_id_fkey
alter table public.exchanges add constraint exchanges_request_id_fkey FOREIGN KEY (request_id) REFERENCES exchange_requests(id);

-- [35] exchanges.exchanges_user_a_fkey
alter table public.exchanges add constraint exchanges_user_a_fkey FOREIGN KEY (user_a) REFERENCES profiles(id);

-- [35] exchanges.exchanges_user_b_fkey
alter table public.exchanges add constraint exchanges_user_b_fkey FOREIGN KEY (user_b) REFERENCES profiles(id);

-- [35] growth_events.growth_events_user_id_fkey
alter table public.growth_events add constraint growth_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- [35] growth_member_state.growth_member_state_user_id_fkey
alter table public.growth_member_state add constraint growth_member_state_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- [35] member_notifications.member_notifications_user_id_fkey
alter table public.member_notifications add constraint member_notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- [35] messages.messages_exchange_id_fkey
alter table public.messages add constraint messages_exchange_id_fkey FOREIGN KEY (exchange_id) REFERENCES exchanges(id) ON DELETE CASCADE;

-- [35] messages.messages_recipient_id_fkey
alter table public.messages add constraint messages_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES profiles(id);

-- [35] messages.messages_sender_id_fkey
alter table public.messages add constraint messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES profiles(id);

-- [35] notifications.notifications_user_id_fkey
alter table public.notifications add constraint notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- [35] product_metrics.product_metrics_user_id_fkey
alter table public.product_metrics add constraint product_metrics_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- [35] profiles.profiles_id_fkey
alter table public.profiles add constraint profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- [35] public_profiles.public_profiles_id_fkey
alter table public.public_profiles add constraint public_profiles_id_fkey FOREIGN KEY (id) REFERENCES profiles(id) ON DELETE CASCADE;

-- [35] referrals.referrals_claimed_by_fkey
alter table public.referrals add constraint referrals_claimed_by_fkey FOREIGN KEY (claimed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- [35] referrals.referrals_referrer_id_fkey
alter table public.referrals add constraint referrals_referrer_id_fkey FOREIGN KEY (referrer_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- [35] reviews.reviews_exchange_id_fkey
alter table public.reviews add constraint reviews_exchange_id_fkey FOREIGN KEY (exchange_id) REFERENCES exchanges(id) ON DELETE CASCADE;

-- [35] reviews.reviews_reviewee_id_fkey
alter table public.reviews add constraint reviews_reviewee_id_fkey FOREIGN KEY (reviewee_id) REFERENCES profiles(id);

-- [35] reviews.reviews_reviewer_id_fkey
alter table public.reviews add constraint reviews_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES profiles(id);

-- [35] wishlists.wishlists_set_number_fkey
alter table public.wishlists add constraint wishlists_set_number_fkey FOREIGN KEY (set_number) REFERENCES lego_sets(set_number);

-- [35] wishlists.wishlists_user_id_fkey
alter table public.wishlists add constraint wishlists_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- [40] collection_available_idx
CREATE INDEX collection_available_idx ON public.collection_items USING btree (available_for_exchange);

-- [40] collection_items_set_number_idx
CREATE INDEX collection_items_set_number_idx ON public.collection_items USING btree (set_number);

-- [40] collection_user_idx
CREATE INDEX collection_user_idx ON public.collection_items USING btree (user_id);

-- [40] email_outbox_notification_once_idx
CREATE UNIQUE INDEX email_outbox_notification_once_idx ON public.email_outbox USING btree (notification_id) WHERE (notification_id IS NOT NULL);

-- [40] email_outbox_pending_idx
CREATE INDEX email_outbox_pending_idx ON public.email_outbox USING btree (status, next_attempt_at, created_at);

-- [40] email_outbox_user_idx
CREATE INDEX email_outbox_user_idx ON public.email_outbox USING btree (user_id);

-- [40] exchange_meetups_proposed_by_idx
CREATE INDEX exchange_meetups_proposed_by_idx ON public.exchange_meetups USING btree (proposed_by);

-- [40] exchange_requests_offered_item_idx
CREATE INDEX exchange_requests_offered_item_idx ON public.exchange_requests USING btree (offered_item_id);

-- [40] exchange_requests_requested_item_idx
CREATE INDEX exchange_requests_requested_item_idx ON public.exchange_requests USING btree (requested_item_id);

-- [40] exchange_returns_proposed_by_idx
CREATE INDEX exchange_returns_proposed_by_idx ON public.exchange_returns USING btree (proposed_by);

-- [40] exchanges_request_id_idx
CREATE INDEX exchanges_request_id_idx ON public.exchanges USING btree (request_id);

-- [40] exchanges_user_a_idx
CREATE INDEX exchanges_user_a_idx ON public.exchanges USING btree (user_a, state);

-- [40] exchanges_user_b_idx
CREATE INDEX exchanges_user_b_idx ON public.exchanges USING btree (user_b, state);

-- [40] growth_events_name_created_idx
CREATE INDEX growth_events_name_created_idx ON public.growth_events USING btree (event_name, created_at DESC);

-- [40] growth_events_user_created_idx
CREATE INDEX growth_events_user_created_idx ON public.growth_events USING btree (user_id, created_at DESC);

-- [40] growth_events_user_name_created_idx
CREATE INDEX growth_events_user_name_created_idx ON public.growth_events USING btree (user_id, event_name, created_at DESC);

-- [40] idx_exchange_meetups_exchange
CREATE INDEX idx_exchange_meetups_exchange ON public.exchange_meetups USING btree (exchange_id, status);

-- [40] idx_exchange_requests_participants
CREATE INDEX idx_exchange_requests_participants ON public.exchange_requests USING btree (requester_id, responder_id, status);

-- [40] idx_exchanges_participants
CREATE INDEX idx_exchanges_participants ON public.exchanges USING btree (user_a, user_b, state);

-- [40] idx_messages_exchange_created
CREATE INDEX idx_messages_exchange_created ON public.messages USING btree (exchange_id, created_at);

-- [40] idx_notifications_user_created
CREATE INDEX idx_notifications_user_created ON public.notifications USING btree (user_id, created_at DESC);

-- [40] lego_sets_catalog_active_set_number_idx
CREATE INDEX lego_sets_catalog_active_set_number_idx ON public.lego_sets USING btree (catalog_active, set_number);

-- [40] lego_sets_catalog_active_theme_idx
CREATE INDEX lego_sets_catalog_active_theme_idx ON public.lego_sets USING btree (catalog_active, theme);

-- [40] lego_sets_catalog_active_year_idx
CREATE INDEX lego_sets_catalog_active_year_idx ON public.lego_sets USING btree (catalog_active, year DESC);

-- [40] lego_sets_name_lower_idx
CREATE INDEX lego_sets_name_lower_idx ON public.lego_sets USING btree (lower(name));

-- [40] lego_sets_name_trgm_idx
CREATE INDEX lego_sets_name_trgm_idx ON public.lego_sets USING gin (name gin_trgm_ops) WHERE (catalog_active IS TRUE);

-- [40] lego_sets_rebrickable_set_num_idx
CREATE INDEX lego_sets_rebrickable_set_num_idx ON public.lego_sets USING btree (rebrickable_set_num);

-- [40] lego_sets_set_number_trgm_idx
CREATE INDEX lego_sets_set_number_trgm_idx ON public.lego_sets USING gin (set_number gin_trgm_ops) WHERE (catalog_active IS TRUE);

-- [40] lego_sets_theme_idx
CREATE INDEX lego_sets_theme_idx ON public.lego_sets USING btree (theme);

-- [40] lego_sets_theme_trgm_idx
CREATE INDEX lego_sets_theme_trgm_idx ON public.lego_sets USING gin (theme gin_trgm_ops) WHERE (catalog_active IS TRUE);

-- [40] member_notifications_user_created_idx
CREATE INDEX member_notifications_user_created_idx ON public.member_notifications USING btree (user_id, created_at DESC);

-- [40] member_notifications_user_dedupe_idx
CREATE UNIQUE INDEX member_notifications_user_dedupe_idx ON public.member_notifications USING btree (user_id, dedupe_key) WHERE (dedupe_key IS NOT NULL);

-- [40] messages_exchange_idx
CREATE INDEX messages_exchange_idx ON public.messages USING btree (exchange_id, created_at);

-- [40] messages_recipient_created_idx
CREATE INDEX messages_recipient_created_idx ON public.messages USING btree (recipient_id, created_at DESC);

-- [40] messages_sender_created_idx
CREATE INDEX messages_sender_created_idx ON public.messages USING btree (sender_id, created_at DESC);

-- [40] notifications_user_idx
CREATE INDEX notifications_user_idx ON public.notifications USING btree (user_id, read_at);

-- [40] product_metrics_name_created_idx
CREATE INDEX product_metrics_name_created_idx ON public.product_metrics USING btree (metric_name, created_at DESC);

-- [40] product_metrics_user_created_idx
CREATE INDEX product_metrics_user_created_idx ON public.product_metrics USING btree (user_id, created_at DESC);

-- [40] profiles_city_country_idx
CREATE INDEX profiles_city_country_idx ON public.profiles USING btree (lower(country), lower(city)) WHERE ((city IS NOT NULL) AND (country IS NOT NULL));

-- [40] profiles_early_member_number_uidx
CREATE UNIQUE INDEX profiles_early_member_number_uidx ON public.profiles USING btree (early_member_number) WHERE (early_member_number IS NOT NULL);

-- [40] profiles_founding_member_number_uidx
CREATE UNIQUE INDEX profiles_founding_member_number_uidx ON public.profiles USING btree (founding_member_number) WHERE (founding_member_number IS NOT NULL);

-- [40] profiles_membership_ordinal_uidx
CREATE UNIQUE INDEX profiles_membership_ordinal_uidx ON public.profiles USING btree (membership_ordinal) WHERE (membership_ordinal IS NOT NULL);

-- [40] referrals_claimed_by_idx
CREATE INDEX referrals_claimed_by_idx ON public.referrals USING btree (claimed_by);

-- [40] referrals_one_active_per_member_idx
CREATE UNIQUE INDEX referrals_one_active_per_member_idx ON public.referrals USING btree (referrer_id) WHERE (status = 'active'::text);

-- [40] requests_responder_idx
CREATE INDEX requests_responder_idx ON public.exchange_requests USING btree (responder_id, status);

-- [40] reviews_reviewee_idx
CREATE INDEX reviews_reviewee_idx ON public.reviews USING btree (reviewee_id);

-- [40] reviews_reviewer_idx
CREATE INDEX reviews_reviewer_idx ON public.reviews USING btree (reviewer_id);

-- [40] uq_active_exchange_item_a
CREATE UNIQUE INDEX uq_active_exchange_item_a ON public.exchanges USING btree (item_a) WHERE (state <> ALL (ARRAY['completed'::text, 'cancelled'::text, 'disputed'::text]));

-- [40] uq_active_exchange_item_b
CREATE UNIQUE INDEX uq_active_exchange_item_b ON public.exchanges USING btree (item_b) WHERE (state <> ALL (ARRAY['completed'::text, 'cancelled'::text, 'disputed'::text]));

-- [40] wishlist_user_idx
CREATE INDEX wishlist_user_idx ON public.wishlists USING btree (user_id);

-- [40] wishlists_set_number_idx
CREATE INDEX wishlists_set_number_idx ON public.wishlists USING btree (set_number);

-- [50] city_pricing_overrides
alter table public.city_pricing_overrides enable row level security;

-- [50] collection_items
alter table public.collection_items enable row level security;

-- [50] email_outbox
alter table public.email_outbox enable row level security;

-- [50] exchange_meetups
alter table public.exchange_meetups enable row level security;

-- [50] exchange_preferences
alter table public.exchange_preferences enable row level security;

-- [50] exchange_requests
alter table public.exchange_requests enable row level security;

-- [50] exchange_returns
alter table public.exchange_returns enable row level security;

-- [50] exchanges
alter table public.exchanges enable row level security;

-- [50] growth_events
alter table public.growth_events enable row level security;

-- [50] growth_member_state
alter table public.growth_member_state enable row level security;

-- [50] lego_sets
alter table public.lego_sets enable row level security;

-- [50] member_notifications
alter table public.member_notifications enable row level security;

-- [50] membership_program_config
alter table public.membership_program_config enable row level security;

-- [50] messages
alter table public.messages enable row level security;

-- [50] notifications
alter table public.notifications enable row level security;

-- [50] product_metrics
alter table public.product_metrics enable row level security;

-- [50] profiles
alter table public.profiles enable row level security;

-- [50] public_profiles
alter table public.public_profiles enable row level security;

-- [50] referrals
alter table public.referrals enable row level security;

-- [50] reviews
alter table public.reviews enable row level security;

-- [50] wishlists
alter table public.wishlists enable row level security;

-- [60] public.collection_items.users delete own collection items
create policy "users delete own collection items" on public.collection_items for delete to authenticated using ((( SELECT auth.uid() AS uid) = user_id));

-- [60] public.collection_items.users insert own collection items
create policy "users insert own collection items" on public.collection_items for insert to authenticated with check ((( SELECT auth.uid() AS uid) = user_id));

-- [60] public.collection_items.users read permitted collection items
create policy "users read permitted collection items" on public.collection_items for select to authenticated using (((( SELECT auth.uid() AS uid) = user_id) OR (EXISTS ( SELECT 1
   FROM exchange_requests r
  WHERE (((( SELECT auth.uid() AS uid) = r.requester_id) OR (( SELECT auth.uid() AS uid) = r.responder_id)) AND ((r.offered_item_id = collection_items.id) OR (r.requested_item_id = collection_items.id))))) OR (EXISTS ( SELECT 1
   FROM exchanges e
  WHERE (((( SELECT auth.uid() AS uid) = e.user_a) OR (( SELECT auth.uid() AS uid) = e.user_b)) AND ((e.item_a = collection_items.id) OR (e.item_b = collection_items.id)))))));

-- [60] public.collection_items.users update own collection items
create policy "users update own collection items" on public.collection_items for update to authenticated using ((( SELECT auth.uid() AS uid) = user_id)) with check ((( SELECT auth.uid() AS uid) = user_id));

-- [60] public.exchange_meetups.participants read meetup
create policy "participants read meetup" on public.exchange_meetups for select to authenticated using ((EXISTS ( SELECT 1
   FROM exchanges e
  WHERE ((e.id = exchange_meetups.exchange_id) AND ((auth.uid() = e.user_a) OR (auth.uid() = e.user_b))))));

-- [60] public.exchange_preferences.users manage own preferences
create policy "users manage own preferences" on public.exchange_preferences for all to public using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));

-- [60] public.exchange_requests.participants read requests
create policy "participants read requests" on public.exchange_requests for select to public using (((auth.uid() = requester_id) OR (auth.uid() = responder_id)));

-- [60] public.exchange_requests.requesters create requests
create policy "requesters create requests" on public.exchange_requests for insert to public with check ((auth.uid() = requester_id));

-- [60] public.exchange_returns.participants read exchange returns
create policy "participants read exchange returns" on public.exchange_returns for select to authenticated using ((EXISTS ( SELECT 1
   FROM exchanges e
  WHERE ((e.id = exchange_returns.exchange_id) AND ((auth.uid() = e.user_a) OR (auth.uid() = e.user_b))))));

-- [60] public.exchanges.participants read exchanges
create policy "participants read exchanges" on public.exchanges for select to public using (((auth.uid() = user_a) OR (auth.uid() = user_b)));

-- [60] public.growth_events.members insert own growth events
create policy "members insert own growth events" on public.growth_events for insert to authenticated with check (((( SELECT auth.uid() AS uid) IS NOT NULL) AND (( SELECT auth.uid() AS uid) = user_id)));

-- [60] public.growth_events.members read own growth events
create policy "members read own growth events" on public.growth_events for select to authenticated using ((( SELECT auth.uid() AS uid) = user_id));

-- [60] public.lego_sets.catalogue readable by everyone
create policy "catalogue readable by everyone" on public.lego_sets for select to public using (true);

-- [60] public.member_notifications.members read own notifications
create policy "members read own notifications" on public.member_notifications for select to authenticated using ((( SELECT auth.uid() AS uid) = user_id));

-- [60] public.member_notifications.members update own notifications
create policy "members update own notifications" on public.member_notifications for update to authenticated using ((( SELECT auth.uid() AS uid) = user_id)) with check ((( SELECT auth.uid() AS uid) = user_id));

-- [60] public.messages.participants read messages
create policy "participants read messages" on public.messages for select to public using (((auth.uid() = sender_id) OR (auth.uid() = recipient_id)));

-- [60] public.messages.participants send exchange messages
create policy "participants send exchange messages" on public.messages for insert to authenticated with check (((auth.uid() = sender_id) AND ((exchange_id IS NULL) OR (EXISTS ( SELECT 1
   FROM exchanges e
  WHERE ((e.id = messages.exchange_id) AND ((auth.uid() = e.user_a) OR (auth.uid() = e.user_b)) AND ((messages.recipient_id = e.user_a) OR (messages.recipient_id = e.user_b)) AND (messages.recipient_id <> auth.uid())))))));

-- [60] public.notifications.users read own notifications
create policy "users read own notifications" on public.notifications for select to authenticated using ((( SELECT auth.uid() AS uid) = user_id));

-- [60] public.notifications.users update own notifications
create policy "users update own notifications" on public.notifications for update to authenticated using ((( SELECT auth.uid() AS uid) = user_id)) with check ((( SELECT auth.uid() AS uid) = user_id));

-- [60] public.product_metrics.members insert own metrics
create policy "members insert own metrics" on public.product_metrics for insert to authenticated with check ((( SELECT auth.uid() AS uid) = user_id));

-- [60] public.profiles.users insert own profile
create policy "users insert own profile" on public.profiles for insert to authenticated with check ((( SELECT auth.uid() AS uid) = id));

-- [60] public.profiles.users read own profile
create policy "users read own profile" on public.profiles for select to authenticated using ((( SELECT auth.uid() AS uid) = id));

-- [60] public.profiles.users update own profile
create policy "users update own profile" on public.profiles for update to authenticated using ((( SELECT auth.uid() AS uid) = id)) with check ((( SELECT auth.uid() AS uid) = id));

-- [60] public.public_profiles.public profile projection readable
create policy "public profile projection readable" on public.public_profiles for select to anon, authenticated using (true);

-- [60] public.referrals.members read own referrals
create policy "members read own referrals" on public.referrals for select to authenticated using ((( SELECT auth.uid() AS uid) = referrer_id));

-- [60] public.reviews.authenticated read reviews
create policy "authenticated read reviews" on public.reviews for select to authenticated using (true);

-- [60] public.wishlists.users manage own wishlist
create policy "users manage own wishlist" on public.wishlists for all to public using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));

-- [70] bc_growth_after_collection()
CREATE OR REPLACE FUNCTION public.bc_growth_after_collection()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  insert into public.growth_events(user_id, event_name, properties)
  values (
    new.user_id,
    'collection_added',
    jsonb_build_object(
      'set_number', new.set_number,
      'available', new.available_for_exchange
    )
  );

  return new;
end;
$function$
;

-- [70] notify_new_exchange_request()
CREATE OR REPLACE FUNCTION public.notify_new_exchange_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ begin insert into public.notifications(user_id,kind,title,body) values(new.responder_id,'request_received','New exchange request','A collector sent you an exchange request. Open Requests to review it.'); return new; end; $function$
;

-- [70] bc_assign_founding_member()
CREATE OR REPLACE FUNCTION public.bc_assign_founding_member()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

-- [70] bc_liquidity_status()
CREATE OR REPLACE FUNCTION public.bc_liquidity_status()
 RETURNS TABLE(city text, country text, collection_count integer, exchangeable_count integer, wishlist_count integer, city_members integer, city_exchangeable_sets integer, city_wishlist_items integer, referral_claims integer, liquidity_readiness integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

-- [70] bc_member_growth_snapshot()
CREATE OR REPLACE FUNCTION public.bc_member_growth_snapshot()
 RETURNS TABLE(collection_count bigint, available_count bigint, wishlist_count bigint, unread_count bigint, referral_code text)
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$
  select
    (select count(*) from public.collection_items c where c.user_id=(select auth.uid())),
    (select count(*) from public.collection_items c where c.user_id=(select auth.uid()) and c.available_for_exchange=true),
    (select count(*) from public.wishlists w where w.user_id=(select auth.uid())),
    (select count(*) from public.member_notifications n where n.user_id=(select auth.uid()) and n.read_at is null),
    (select r.code from public.referrals r where r.referrer_id=(select auth.uid()) and r.status='active' order by r.created_at desc limit 1);
$function$
;

-- [70] bc_claim_referral(text)
CREATE OR REPLACE FUNCTION public.bc_claim_referral(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  me uuid := auth.uid();
  r public.referrals%rowtype;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if nullif(trim(p_code),'') is null then return jsonb_build_object('ok',false,'reason','missing_code'); end if;

  select * into r
  from public.referrals
  where upper(code)=upper(trim(p_code))
    and status='active'
  for update;

  if not found then return jsonb_build_object('ok',false,'reason','invalid_code'); end if;
  if r.referrer_id = me then return jsonb_build_object('ok',false,'reason','self_referral'); end if;
  if r.claimed_by is not null then return jsonb_build_object('ok',false,'reason','already_claimed'); end if;

  update public.referrals
  set claimed_by=me,status='claimed',claimed_at=now()
  where id=r.id;

  insert into public.growth_events(user_id,event_name,properties)
  values (me,'referral_claimed',jsonb_build_object('referrer_id',r.referrer_id,'code',r.code));

  insert into public.member_notifications(user_id,kind,title,body,cta_hash,dedupe_key)
  values (r.referrer_id,'referral','Your BrickCircle invite worked','A collector joined BrickCircle using your invite. Their activity can now create more local matches for you.','#growth','referral-claimed-'||me::text)
  on conflict (user_id,dedupe_key) where dedupe_key is not null do nothing;

  return jsonb_build_object('ok',true,'referrer_id',r.referrer_id);
end;
$function$
;

-- [70] meetup_action(uuid,text,text)
CREATE OR REPLACE FUNCTION public.meetup_action(p_exchange_id uuid, p_action text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare e public.exchanges%rowtype; m public.exchange_meetups%rowtype; me uuid:=auth.uid(); isa boolean; done boolean;
begin
 if me is null then raise exception 'Not authenticated'; end if;
 select * into e from public.exchanges where id=p_exchange_id for update;
 if not found or me not in(e.user_a,e.user_b) then raise exception 'Not an exchange participant'; end if;
 select * into m from public.exchange_meetups where exchange_id=e.id for update;
 isa:=me=e.user_a;
 if e.state='swap_active' and p_action='confirm' and found and ((isa and m.confirmed_a) or (not isa and m.confirmed_b)) then
   return jsonb_build_object('ok',true,'handoff_completed',true,'status','swap_active','idempotent',true);
 end if;
 if e.state in('swap_active','completed','cancelled','disputed') then raise exception 'Initial handoff is already closed'; end if;
 if not found then raise exception 'Schedule a meetup first'; end if;
 if p_action='safety_ack' then
  if isa then update public.exchange_meetups set safety_ack_a=true,updated_at=now() where id=m.id; else update public.exchange_meetups set safety_ack_b=true,updated_at=now() where id=m.id; end if;
 elsif p_action='arrived' then
  if not (m.safety_ack_a and m.safety_ack_b) then raise exception 'Both collectors must accept the Safe Meetup rules before arrival can be confirmed'; end if;
  if isa then update public.exchange_meetups set arrived_a=true,status='meeting',updated_at=now() where id=m.id; else update public.exchange_meetups set arrived_b=true,status='meeting',updated_at=now() where id=m.id; end if;
 elsif p_action='inspected' then
  if not (m.arrived_a and m.arrived_b) then raise exception 'Both collectors must be present before either set can be inspected'; end if;
  if isa then update public.exchange_meetups set inspected_a=true,status='inspection',updated_at=now() where id=m.id; else update public.exchange_meetups set inspected_b=true,status='inspection',updated_at=now() where id=m.id; end if;
 elsif p_action='confirm' then
  if not (m.inspected_a and m.inspected_b) then raise exception 'Both collectors must inspect the other set before completing the handoff'; end if;
  if isa then update public.exchange_meetups set confirmed_a=true,updated_at=now() where id=m.id; else update public.exchange_meetups set confirmed_b=true,updated_at=now() where id=m.id; end if;
 elsif p_action='issue' then
  if nullif(trim(p_note),'') is null then raise exception 'Describe the issue before reporting it'; end if;
  if isa then update public.exchange_meetups set issue_a=trim(p_note),status='issue',updated_at=now() where id=m.id; else update public.exchange_meetups set issue_b=trim(p_note),status='issue',updated_at=now() where id=m.id; end if;
  update public.exchanges set state='disputed',updated_at=now() where id=e.id;
 else raise exception 'Invalid meetup action'; end if;
 select * into m from public.exchange_meetups where id=m.id;
 done:=m.confirmed_a and m.confirmed_b and m.inspected_a and m.inspected_b and m.arrived_a and m.arrived_b and m.safety_ack_a and m.safety_ack_b;
 if done then
  update public.exchange_meetups set status='completed',updated_at=now() where id=m.id;
  update public.exchanges set state='swap_active',outbound_completed_at=now(),return_due_at=now()+make_interval(days=>duration_days),updated_at=now() where id=e.id;
  insert into public.notifications(user_id,kind,title,body,created_at) values
   (e.user_a,'swap_started','Temporary swap started','The handoff is complete. Your LEGO set is due to be returned after the agreed swap period.',now()),
   (e.user_b,'swap_started','Temporary swap started','The handoff is complete. Your LEGO set is due to be returned after the agreed swap period.',now());
 end if;
 return jsonb_build_object('ok',true,'handoff_completed',done,'status',case when done then 'swap_active' else m.status end,'idempotent',false);
end $function$
;

-- [70] bc_my_referral_code()
CREATE OR REPLACE FUNCTION public.bc_my_referral_code()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

-- [70] bc_search_lego_sets(text,text,integer,integer)
CREATE OR REPLACE FUNCTION public.bc_search_lego_sets(p_query text, p_theme text DEFAULT NULL::text, p_year integer DEFAULT NULL::integer, p_limit integer DEFAULT 60)
 RETURNS TABLE(set_number text, name text, theme text, year integer, piece_count integer, estimated_value numeric, image_url text)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with params as (
    select lower(trim(coalesce(p_query,''))) as q,
           nullif(trim(coalesce(p_theme,'')),'') as theme_filter,
           p_year as year_filter,
           least(greatest(coalesce(p_limit,60),1),100) as lim
  ), ranked as (
    select
      l.set_number,
      l.name,
      l.theme,
      l.year,
      l.piece_count,
      l.estimated_value,
      l.image_url,
      case
        when lower(l.set_number)=p.q then 0
        when lower(l.name)=p.q then 1
        when lower(l.name) like p.q || '%' then 2
        when lower(l.name) like '%' || p.q || '%' then 3
        when lower(coalesce(l.theme,'')) like '%' || p.q || '%' then 4
        else 5
      end as rank_group
    from public.lego_sets l
    cross join params p
    where p.q <> ''
      and coalesce(l.catalog_active,true)
      and (p.theme_filter is null or lower(l.theme)=lower(p.theme_filter))
      and (p.year_filter is null or l.year=p.year_filter)
      and not (
        position('-' in l.set_number)=0
        and exists (
          select 1
          from public.lego_sets lx
          where lx.set_number=l.set_number || '-1'
            and not exists (
              select 1
              from regexp_split_to_table(p.q, '\s+') duplicate_token
              where concat_ws(' ',lower(lx.set_number),lower(coalesce(lx.name,'')),lower(coalesce(lx.theme,''))) not like '%' || duplicate_token || '%'
            )
        )
      )
      and not exists (
        select 1
        from regexp_split_to_table(p.q, '\s+') token
        where concat_ws(' ',lower(l.set_number),lower(coalesce(l.name,'')),lower(coalesce(l.theme,''))) not like '%' || token || '%'
      )
  )
  select r.set_number,r.name,r.theme,r.year,r.piece_count,r.estimated_value,r.image_url
  from ranked r
  cross join params p
  order by r.rank_group, r.year desc nulls last, r.name asc, r.set_number asc
  limit (select lim from params);
$function$
;

-- [70] setup_return_meetup(uuid,text,text,timestamp with time zone)
CREATE OR REPLACE FUNCTION public.setup_return_meetup(p_exchange_id uuid, p_venue_name text, p_venue_area text, p_meetup_at timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare e public.exchanges%rowtype; me uuid:=auth.uid(); r public.exchange_returns%rowtype; same boolean:=false;
begin
 if me is null then raise exception 'Not authenticated'; end if;
 if nullif(trim(p_venue_name),'') is null then raise exception 'Choose a public return venue'; end if;
 if p_meetup_at is null or p_meetup_at<=now() then raise exception 'Choose a future return meeting time'; end if;
 select * into e from public.exchanges where id=p_exchange_id for update;
 if not found or me not in(e.user_a,e.user_b) then raise exception 'Not an exchange participant'; end if;
 if e.state<>'swap_active' then raise exception 'Return scheduling is available only during an active temporary swap'; end if;
 select * into r from public.exchange_returns where exchange_id=e.id for update;
 if found then
   same := coalesce(trim(r.venue_name),'')=trim(p_venue_name)
      and coalesce(trim(r.venue_area),'')=coalesce(trim(p_venue_area),'')
      and r.meetup_at=p_meetup_at;
   if same then return jsonb_build_object('ok',true,'return_id',r.id,'idempotent',true); end if;
   update public.exchange_returns set proposed_by=me,venue_name=trim(p_venue_name),venue_area=nullif(trim(p_venue_area),''),meetup_at=p_meetup_at,status='scheduled',
     safety_ack_a=false,safety_ack_b=false,arrived_a=false,arrived_b=false,inspected_a=false,inspected_b=false,confirmed_a=false,confirmed_b=false,issue_a=null,issue_b=null,updated_at=now()
   where id=r.id returning * into r;
 else
   insert into public.exchange_returns(exchange_id,proposed_by,venue_name,venue_area,meetup_at,status)
   values(e.id,me,trim(p_venue_name),nullif(trim(p_venue_area),''),p_meetup_at,'scheduled') returning * into r;
 end if;
 insert into public.notifications(user_id,kind,title,body,created_at) values(case when me=e.user_a then e.user_b else e.user_a end,'return_meetup_proposed','Return meetup proposed','Your collector proposed a public meetup to return the temporarily swapped LEGO sets.',now());
 return jsonb_build_object('ok',true,'return_id',r.id,'idempotent',false);
end $function$
;

-- [70] advance_exchange(uuid,text,text)
CREATE OR REPLACE FUNCTION public.advance_exchange(p_exchange_id uuid, p_state text, p_tracking text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare e public.exchanges%rowtype; me uuid:=auth.uid(); old text; valid boolean:=false;
begin
 if me is null then raise exception 'Not authenticated'; end if;
 select * into e from public.exchanges where id=p_exchange_id for update;
 if not found then raise exception 'Exchange not found'; end if;
 if me not in(e.user_a,e.user_b) then raise exception 'Not an exchange participant'; end if;
 old:=e.state;
 valid=(old,p_state) in (('accepted','deposit_pending'),('deposit_pending','photos_pending'),('photos_pending','shipping'),('shipping','building'),('building','return_shipping'),('return_shipping','inspection'),('inspection','completed'),('accepted','cancelled'),('deposit_pending','cancelled'),('photos_pending','cancelled'),('shipping','cancelled'),('building','cancelled'),('return_shipping','cancelled'),('inspection','cancelled'));
 if not valid then raise exception 'Invalid exchange state transition from % to %',old,p_state; end if;
 if p_state in('shipping','return_shipping') and coalesce(trim(p_tracking),'')<>'' then
  if me=e.user_a then update public.exchanges set state=p_state,shipping_a_tracking=p_tracking,updated_at=now() where id=e.id;
  else update public.exchanges set state=p_state,shipping_b_tracking=p_tracking,updated_at=now() where id=e.id; end if;
 else
  update public.exchanges set state=p_state,completed_at=case when p_state='completed' then now() else completed_at end,updated_at=now() where id=e.id;
 end if;
 insert into public.notifications(user_id,kind,title,body,created_at) values(case when me=e.user_a then e.user_b else e.user_a end,'exchange_status','Exchange updated','Your exchange moved to: '||replace(p_state,'_',' '),now());
 return jsonb_build_object('ok',true,'state',p_state);
end; $function$
;

-- [70] bc_founder_status()
CREATE OR REPLACE FUNCTION public.bc_founder_status()
 RETURNS TABLE(founding_cap integer, founding_slots_claimed integer, founding_slots_remaining integer, my_number smallint, my_is_founder boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    100,
    count(*) filter(where p.founding_member_number is not null)::integer,
    greatest(0,100-count(*) filter(where p.founding_member_number is not null)::integer),
    (select p2.founding_member_number from public.profiles p2 where p2.id=auth.uid()),
    coalesce((select p2.founding_member_number is not null from public.profiles p2 where p2.id=auth.uid()),false)
  from public.profiles p;
$function$
;

-- [70] submit_exchange_review(uuid,integer,text)
CREATE OR REPLACE FUNCTION public.submit_exchange_review(p_exchange_id uuid, p_rating integer, p_comment text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare e public.exchanges%rowtype; me uuid:=auth.uid(); other uuid;
begin
 if me is null then raise exception 'Not authenticated'; end if;
 if p_rating<1 or p_rating>5 then raise exception 'Rating must be between 1 and 5'; end if;
 select * into e from public.exchanges where id=p_exchange_id;
 if not found then raise exception 'Exchange not found'; end if;
 if e.state<>'completed' then raise exception 'Reviews are available only after completion'; end if;
 if me not in(e.user_a,e.user_b) then raise exception 'Not an exchange participant'; end if;
 other:=case when me=e.user_a then e.user_b else e.user_a end;
 insert into public.reviews(exchange_id,reviewer_id,reviewee_id,rating,comment,created_at) values(e.id,me,other,p_rating,nullif(trim(p_comment),''),now());
 update public.profiles p set rating=(select round(avg(rating)::numeric,2) from public.reviews where reviewee_id=p.id),review_count=(select count(*) from public.reviews where reviewee_id=p.id),updated_at=now() where p.id=other;
 insert into public.notifications(user_id,kind,title,body,created_at) values(other,'review_received','New collector review','You received a review for a completed BrickCircle exchange.',now());
 return jsonb_build_object('ok',true);
exception when unique_violation then raise exception 'You already reviewed this exchange';
end; $function$
;

-- [70] return_action(uuid,text,text)
CREATE OR REPLACE FUNCTION public.return_action(p_exchange_id uuid, p_action text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare e public.exchanges%rowtype; r public.exchange_returns%rowtype; me uuid:=auth.uid(); isa boolean; done boolean;
begin
 if me is null then raise exception 'Not authenticated'; end if;
 select * into e from public.exchanges where id=p_exchange_id for update;
 if not found or me not in(e.user_a,e.user_b) then raise exception 'Not an exchange participant'; end if;
 select * into r from public.exchange_returns where exchange_id=e.id for update;
 isa:=me=e.user_a;
 if e.state='completed' and p_action='confirm' and found and ((isa and r.confirmed_a) or (not isa and r.confirmed_b)) then
   return jsonb_build_object('ok',true,'completed',true,'status','completed','idempotent',true);
 end if;
 if e.state<>'swap_active' then raise exception 'Return workflow is not active'; end if;
 if not found then raise exception 'Schedule a return meetup first'; end if;
 if p_action='safety_ack' then
  if isa then update public.exchange_returns set safety_ack_a=true,updated_at=now() where id=r.id; else update public.exchange_returns set safety_ack_b=true,updated_at=now() where id=r.id; end if;
 elsif p_action='arrived' then
  if not (r.safety_ack_a and r.safety_ack_b) then raise exception 'Both collectors must accept the Safe Meetup rules before arrival can be confirmed'; end if;
  if isa then update public.exchange_returns set arrived_a=true,status='meeting',updated_at=now() where id=r.id; else update public.exchange_returns set arrived_b=true,status='meeting',updated_at=now() where id=r.id; end if;
 elsif p_action='inspected' then
  if not (r.arrived_a and r.arrived_b) then raise exception 'Both collectors must be present before returned sets can be inspected'; end if;
  if isa then update public.exchange_returns set inspected_a=true,status='inspection',updated_at=now() where id=r.id; else update public.exchange_returns set inspected_b=true,status='inspection',updated_at=now() where id=r.id; end if;
 elsif p_action='confirm' then
  if not (r.inspected_a and r.inspected_b) then raise exception 'Both collectors must inspect the returned sets before completing the return'; end if;
  if isa then update public.exchange_returns set confirmed_a=true,updated_at=now() where id=r.id; else update public.exchange_returns set confirmed_b=true,updated_at=now() where id=r.id; end if;
 elsif p_action='issue' then
  if nullif(trim(p_note),'') is null then raise exception 'Describe the return issue before reporting it'; end if;
  if isa then update public.exchange_returns set issue_a=trim(p_note),status='issue',updated_at=now() where id=r.id; else update public.exchange_returns set issue_b=trim(p_note),status='issue',updated_at=now() where id=r.id; end if;
  update public.exchanges set state='disputed',updated_at=now() where id=e.id;
 else raise exception 'Invalid return action'; end if;
 select * into r from public.exchange_returns where id=r.id;
 done:=r.confirmed_a and r.confirmed_b and r.inspected_a and r.inspected_b and r.arrived_a and r.arrived_b and r.safety_ack_a and r.safety_ack_b;
 if done then
  update public.exchange_returns set status='completed',updated_at=now() where id=r.id;
  update public.exchanges set state='completed',completed_at=now(),updated_at=now() where id=e.id;
  update public.collection_items set available_for_exchange=true where id in(e.item_a,e.item_b);
  insert into public.notifications(user_id,kind,title,body,created_at) values
   (e.user_a,'return_completed','Temporary swap completed','Both LEGO sets have been returned and confirmed. You can now review each other.',now()),
   (e.user_b,'return_completed','Temporary swap completed','Both LEGO sets have been returned and confirmed. You can now review each other.',now());
 end if;
 return jsonb_build_object('ok',true,'completed',done,'status',case when done then 'completed' else r.status end,'idempotent',false);
end $function$
;

-- [70] bc_record_auth_provider(text)
CREATE OR REPLACE FUNCTION public.bc_record_auth_provider(p_provider text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then return; end if;
  insert into public.growth_events(user_id,event_name,properties)
  values (auth.uid(),'auth_completed',jsonb_build_object('provider',lower(trim(coalesce(p_provider,'unknown')))));
end;
$function$
;

-- [70] bc_refresh_growth_for_user(uuid)
CREATE OR REPLACE FUNCTION public.bc_refresh_growth_for_user(p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_collection bigint;
  v_available bigint;
  v_wishlist bigint;
  v_city text;
  v_country text;
  v_ready boolean;
  v_inserted integer := 0;
  r record;
begin
  if p_user is null or not exists(select 1 from public.profiles where id=p_user) then
    return jsonb_build_object('ok',false,'reason','unknown_user');
  end if;

  insert into public.growth_member_state(user_id) values(p_user) on conflict(user_id) do nothing;

  select count(*), count(*) filter(where available_for_exchange),
         (select count(*) from public.wishlists w where w.user_id=p_user)
    into v_collection,v_available,v_wishlist
  from public.collection_items c where c.user_id=p_user;

  select nullif(trim(city),''), nullif(trim(country),'') into v_city,v_country
  from public.profiles where id=p_user;

  v_ready := v_collection>0 and v_available>0 and v_wishlist>0;

  if v_collection=0 then
    insert into public.member_notifications(user_id,kind,title,body,cta_hash,dedupe_key)
    values(p_user,'onboarding','Add your first LEGO set','Add at least one LEGO set to your collection so BrickCircle can start building your exchange graph.','#catalogue','v2-activation-collection')
    on conflict(user_id,dedupe_key) where dedupe_key is not null do nothing;
    get diagnostics v_inserted = row_count;
  elsif v_wishlist=0 then
    insert into public.member_notifications(user_id,kind,title,body,cta_hash,dedupe_key)
    values(p_user,'wishlist','Tell BrickCircle what you want','Add a few sets to your wishlist. Reciprocal matching only works when BrickCircle knows what you would like to borrow.','#wishlist','v2-activation-wishlist')
    on conflict(user_id,dedupe_key) where dedupe_key is not null do nothing;
  elsif v_available=0 then
    insert into public.member_notifications(user_id,kind,title,body,cta_hash,dedupe_key)
    values(p_user,'collection','Make one set exchangeable','Mark at least one collection item available. That turns your wishlist into a live exchange opportunity.','#collection','v2-activation-availability')
    on conflict(user_id,dedupe_key) where dedupe_key is not null do nothing;
  end if;

  if v_ready then
    update public.growth_member_state
       set match_ready_at=coalesce(match_ready_at,now()), updated_at=now()
     where user_id=p_user;
    if not exists(select 1 from public.growth_events where user_id=p_user and event_name='match_ready') then
      insert into public.growth_events(user_id,event_name,properties)
      values(p_user,'match_ready',jsonb_build_object('collection_count',v_collection,'available_count',v_available,'wishlist_count',v_wishlist,'city',v_city,'country',v_country));
    end if;

    for r in
      select distinct c2.user_id as other_user, c1.set_number as my_set, c2.set_number as their_set,
             l1.name as my_name, l2.name as their_name
      from public.collection_items c1
      join public.profiles p1 on p1.id=c1.user_id
      join public.collection_items c2 on c2.user_id<>p_user and c2.available_for_exchange=true
      join public.profiles p2 on p2.id=c2.user_id
      join public.wishlists w1 on w1.user_id=p_user and w1.set_number=c2.set_number
      join public.wishlists w2 on w2.user_id=c2.user_id and w2.set_number=c1.set_number
      join public.lego_sets l1 on l1.set_number=c1.set_number
      join public.lego_sets l2 on l2.set_number=c2.set_number
      where c1.user_id=p_user and c1.available_for_exchange=true
        and lower(trim(coalesce(p1.country,'')))=lower(trim(coalesce(p2.country,'')))
        and lower(trim(coalesce(p1.city,'')))=lower(trim(coalesce(p2.city,'')))
      limit 5
    loop
      insert into public.member_notifications(user_id,kind,title,body,cta_hash,dedupe_key)
      values(p_user,'match','You have a reciprocal LEGO match',
             'A collector in your city has '||r.their_name||' and wants your '||r.my_name||'. Open Matches to review the exchange.',
             '#matches','v2-reciprocal-'||r.other_user::text||'-'||r.my_set||'-'||r.their_set)
      on conflict(user_id,dedupe_key) where dedupe_key is not null do nothing;
      update public.growth_member_state set first_match_alert_at=coalesce(first_match_alert_at,now()),updated_at=now() where user_id=p_user;
    end loop;
  end if;

  if v_city is not null and v_country is not null and v_wishlist>0 then
    for r in
      select distinct owner.user_id as owner_user, owner.set_number, ls.name
      from public.wishlists w
      join public.collection_items owner on owner.set_number=w.set_number and owner.available_for_exchange=true and owner.user_id<>p_user
      join public.profiles op on op.id=owner.user_id
      join public.lego_sets ls on ls.set_number=owner.set_number
      where w.user_id=p_user
        and lower(trim(op.country))=lower(trim(v_country))
        and lower(trim(op.city))=lower(trim(v_city))
        and not exists(
          select 1
          from public.wishlists ow
          join public.collection_items mine on mine.user_id=p_user and mine.available_for_exchange=true and mine.set_number=ow.set_number
          where ow.user_id=owner.user_id
        )
      limit 5
    loop
      insert into public.member_notifications(user_id,kind,title,body,cta_hash,dedupe_key)
      values(r.owner_user,'match','A nearby collector wants your '||r.name,
             'There is active local demand for your '||r.name||'. Add sets you would like to borrow to see whether BrickCircle can turn this into a reciprocal exchange.',
             '#wishlist','v2-near-match-'||r.set_number||'-'||p_user::text||'-'||to_char(current_date,'IYYY-IW'))
      on conflict(user_id,dedupe_key) where dedupe_key is not null do nothing;
    end loop;
  end if;

  return jsonb_build_object('ok',true,'match_ready',v_ready,'collection_count',v_collection,'available_count',v_available,'wishlist_count',v_wishlist);
end;
$function$
;

-- [70] cancel_in_person_exchange(uuid,text)
CREATE OR REPLACE FUNCTION public.cancel_in_person_exchange(p_exchange_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare e public.exchanges%rowtype; me uuid:=auth.uid(); other uuid;
begin
 if me is null then raise exception 'Not authenticated'; end if;
 select * into e from public.exchanges where id=p_exchange_id for update;
 if not found then raise exception 'Exchange not found'; end if;
 if me not in(e.user_a,e.user_b) then raise exception 'Not an exchange participant'; end if;
 if e.state='swap_active' then raise exception 'The LEGO sets have already been handed over. Use the return workflow to close the temporary swap.'; end if;
 if e.state in('completed','cancelled','disputed') then raise exception 'Exchange is already closed'; end if;
 other:=case when me=e.user_a then e.user_b else e.user_a end;
 update public.exchanges set state='cancelled',updated_at=now() where id=e.id;
 update public.exchange_meetups set status='cancelled',updated_at=now() where exchange_id=e.id;
 update public.collection_items set available_for_exchange=true where id in(e.item_a,e.item_b);
 insert into public.notifications(user_id,kind,title,body,created_at)
 values(other,'exchange_cancelled','Exchange cancelled',coalesce(nullif(trim(p_reason),''),'The other collector cancelled this exchange. The LEGO sets are available again.'),now());
 return jsonb_build_object('ok',true,'status','cancelled','sets_released',true);
end $function$
;

-- [70] normalize_beta_city(text,text)
CREATE OR REPLACE FUNCTION public.normalize_beta_city(p_country text, p_city text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
declare c text:=trim(coalesce(p_city,'')); country text:=lower(trim(coalesce(p_country,'')));
begin
 if c='' then return null; end if;
 if country='india' then
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
 elsif country='united kingdom' then
   if lower(c)='londonderry' then return 'Derry'; end if;
 end if;
 return c;
end $function$
;

-- [70] bc_membership_status()
CREATE OR REPLACE FUNCTION public.bc_membership_status()
 RETURNS TABLE(founding_cap integer, founding_claimed integer, founding_remaining integer, early_member_limit integer, early_claimed integer, early_remaining integer, total_members integer, my_number integer, my_tier text, my_access text, beta_free boolean, my_city text, my_country text, city_members integer, city_exchangeable_sets integer, city_wishlist_items integer, city_min_members integer, city_min_exchangeable_sets integer, city_min_wishlist_items integer, city_pricing_eligible boolean, city_pricing_enabled boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

-- [70] sync_profile_email_verification()
CREATE OR REPLACE FUNCTION public.sync_profile_email_verification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.profiles
  set email_verified = (new.email_confirmed_at is not null), updated_at = now()
  where id = new.id;
  return new;
end;
$function$
;

-- [70] bc_growth_after_wishlist()
CREATE OR REPLACE FUNCTION public.bc_growth_after_wishlist()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  insert into public.growth_events(user_id, event_name, properties)
  values (
    new.user_id,
    'wishlist_added',
    jsonb_build_object(
      'set_number', new.set_number,
      'priority', new.priority
    )
  );

  return new;
end;
$function$
;

-- [70] setup_meetup(uuid,text,text,timestamp with time zone)
CREATE OR REPLACE FUNCTION public.setup_meetup(p_exchange_id uuid, p_venue_name text, p_venue_area text, p_meetup_at timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare e public.exchanges%rowtype; me uuid:=auth.uid(); m public.exchange_meetups%rowtype; same boolean:=false;
begin
 if me is null then raise exception 'Not authenticated'; end if;
 if nullif(trim(p_venue_name),'') is null then raise exception 'Choose a public meetup venue'; end if;
 if p_meetup_at is null or p_meetup_at<=now() then raise exception 'Choose a future meeting time'; end if;
 select * into e from public.exchanges where id=p_exchange_id for update;
 if not found or me not in(e.user_a,e.user_b) then raise exception 'Not an exchange participant'; end if;
 if e.state<>'accepted' then raise exception 'Initial meetup scheduling is available only before the temporary swap handoff'; end if;
 select * into m from public.exchange_meetups where exchange_id=e.id for update;
 if found then
   same := coalesce(trim(m.venue_name),'')=trim(p_venue_name)
      and coalesce(trim(m.venue_area),'')=coalesce(trim(p_venue_area),'')
      and m.meetup_at=p_meetup_at;
   if same then return jsonb_build_object('ok',true,'meetup_id',m.id,'idempotent',true); end if;
   update public.exchange_meetups set proposed_by=me,venue_name=trim(p_venue_name),venue_area=nullif(trim(p_venue_area),''),meetup_at=p_meetup_at,status='scheduled',
     safety_ack_a=false,safety_ack_b=false,arrived_a=false,arrived_b=false,inspected_a=false,inspected_b=false,confirmed_a=false,confirmed_b=false,issue_a=null,issue_b=null,updated_at=now()
   where id=m.id returning * into m;
 else
   insert into public.exchange_meetups(exchange_id,proposed_by,venue_name,venue_area,meetup_at,status)
   values(e.id,me,trim(p_venue_name),nullif(trim(p_venue_area),''),p_meetup_at,'scheduled') returning * into m;
 end if;
 insert into public.notifications(user_id,kind,title,body,created_at) values(case when me=e.user_a then e.user_b else e.user_a end,'meetup_proposed','Meetup proposed','Your collector proposed a public meetup for this exchange.',now());
 return jsonb_build_object('ok',true,'meetup_id',m.id,'idempotent',false);
end $function$
;

-- [70] sync_public_profile_projection()
CREATE OR REPLACE FUNCTION public.sync_public_profile_projection()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

-- [70] respond_exchange_request(uuid,text)
CREATE OR REPLACE FUNCTION public.respond_exchange_request(p_request_id uuid, p_action text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  select public.normalize_beta_city(country,city),trim(country) into city_a,country_a from public.profiles where id=r.requester_id;
  select public.normalize_beta_city(country,city),trim(country) into city_b,country_b from public.profiles where id=r.responder_id;
  if coalesce(city_a,'')='' or coalesce(city_b,'')='' then raise exception 'Both collectors must choose a supported beta city before accepting a local exchange'; end if;
  if lower(city_a)<>lower(city_b) or lower(coalesce(country_a,''))<>lower(coalesce(country_b,'')) then raise exception 'BrickCircle currently supports in-person exchanges only between collectors registered in the same supported beta city'; end if;
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
end $function$
;

-- [70] handle_new_user()
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
 insert into public.profiles(id,display_name,email,email_verified) values(new.id,coalesce(new.raw_user_meta_data->>'full_name',''),new.email,new.email_confirmed_at is not null) on conflict(id) do nothing;
 insert into public.exchange_preferences(user_id) values(new.id) on conflict(user_id) do nothing;
 return new;
end; $function$
;

-- [70] queue_growth_notification_email()
CREATE OR REPLACE FUNCTION public.queue_growth_notification_email()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  email_address text;
  template text;
begin
  if new.kind not in ('growth_onboarding','growth_wishlist','growth_availability','growth_match','request_received','exchange_accepted','return_overdue') then
    return new;
  end if;

  select nullif(trim(email),'') into email_address from public.profiles where id = new.user_id;
  if email_address is null then
    return new;
  end if;

  template := case
    when new.kind = 'growth_onboarding' then 'onboarding'
    when new.kind = 'growth_wishlist' then 'wishlist_nudge'
    when new.kind = 'growth_availability' then 'availability_nudge'
    when new.kind = 'growth_match' then 'match_alert'
    when new.kind = 'request_received' then 'exchange_request'
    when new.kind = 'exchange_accepted' then 'exchange_accepted'
    when new.kind = 'return_overdue' then 'return_overdue'
    else 'notification'
  end;

  insert into public.email_outbox(user_id,notification_id,recipient_email,template_key,subject,payload)
  values(new.user_id,new.id,email_address,template,new.title,jsonb_build_object('title',new.title,'body',new.body,'kind',new.kind))
  on conflict do nothing;
  return new;
end;
$function$
;

-- [70] bc_protect_membership_fields()
CREATE OR REPLACE FUNCTION public.bc_protect_membership_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.membership_ordinal:=old.membership_ordinal;
  new.founding_member_number:=old.founding_member_number;
  new.founding_member_granted_at:=old.founding_member_granted_at;
  new.early_member_number:=old.early_member_number;
  new.early_member_granted_at:=old.early_member_granted_at;
  return new;
end;
$function$
;

-- [70] report_overdue_return_issue(uuid,text)
CREATE OR REPLACE FUNCTION public.report_overdue_return_issue(p_exchange_id uuid, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare me uuid:=auth.uid(); e public.exchanges%rowtype; other uuid;
begin
 if me is null then raise exception 'Not authenticated'; end if;
 select * into e from public.exchanges where id=p_exchange_id for update;
 if not found or me not in(e.user_a,e.user_b) then raise exception 'Not an exchange participant'; end if;
 if e.state<>'swap_active' or e.return_due_at is null or e.return_due_at>=now() then raise exception 'This return is not overdue'; end if;
 other:=case when me=e.user_a then e.user_b else e.user_a end;
 update public.exchanges set state='disputed',updated_at=now() where id=e.id;
 update public.exchange_returns set status='issue',issue_a=case when me=e.user_a then coalesce(nullif(trim(p_note),''),'Return overdue / no-show') else issue_a end,issue_b=case when me=e.user_b then coalesce(nullif(trim(p_note),''),'Return overdue / no-show') else issue_b end,updated_at=now() where exchange_id=e.id;
 insert into public.notifications(user_id,kind,title,body,created_at) values(other,'return_dispute','Return issue reported','The other collector reported an overdue return issue. This swap is paused for resolution.',now());
 return jsonb_build_object('ok',true,'status','disputed');
end $function$
;

-- [70] check_my_overdue_returns()
CREATE OR REPLACE FUNCTION public.check_my_overdue_returns()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare me uuid:=auth.uid(); n integer:=0; e public.exchanges%rowtype;
begin
 if me is null then raise exception 'Not authenticated'; end if;
 for e in select * from public.exchanges where state='swap_active' and return_due_at is not null and return_due_at<now() and me in(user_a,user_b) for update loop
  if me=e.user_a and e.overdue_notified_at_a is null then
    insert into public.notifications(user_id,kind,title,body,created_at) values(me,'return_overdue','LEGO return overdue','This temporary swap is overdue. Contact the other collector and arrange the return. If the problem continues, report an overdue return issue.',now());
    update public.exchanges set overdue_notified_at_a=now(),updated_at=now() where id=e.id;n:=n+1;
  elsif me=e.user_b and e.overdue_notified_at_b is null then
    insert into public.notifications(user_id,kind,title,body,created_at) values(me,'return_overdue','LEGO return overdue','This temporary swap is overdue. Contact the other collector and arrange the return. If the problem continues, report an overdue return issue.',now());
    update public.exchanges set overdue_notified_at_b=now(),updated_at=now() where id=e.id;n:=n+1;
  end if;
 end loop;
 return jsonb_build_object('ok',true,'new_overdue_notifications',n);
end $function$
;

-- [70] find_matches(uuid)
CREATE OR REPLACE FUNCTION public.find_matches(p_user uuid)
 RETURNS TABLE(match_user uuid, offered_item uuid, offered_set text, offered_name text, offered_value numeric, requested_item uuid, requested_set text, requested_name text, requested_value numeric, match_score integer)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 select c2.user_id, c1.id, c1.set_number, l1.name, coalesce(c1.estimated_value,l1.estimated_value,0), c2.id, c2.set_number, l2.name, coalesce(c2.estimated_value,l2.estimated_value,0), greatest(50, least(99, 70 + case when abs(coalesce(c1.estimated_value,l1.estimated_value,0)-coalesce(c2.estimated_value,l2.estimated_value,0)) <= greatest(25,coalesce(c2.estimated_value,l2.estimated_value,0)*0.15) then 15 else 0 end + case when l1.theme=l2.theme then 10 else 0 end))
 from public.collection_items c1
 join public.lego_sets l1 on l1.set_number=c1.set_number
 join public.profiles p1 on p1.id=c1.user_id
 join public.collection_items c2 on c2.available_for_exchange=true and c2.user_id<>p_user
 join public.profiles p2 on p2.id=c2.user_id
 join public.lego_sets l2 on l2.set_number=c2.set_number
 join public.wishlists w1 on w1.user_id=p_user and w1.set_number=c2.set_number
 join public.wishlists w2 on w2.user_id=c2.user_id and w2.set_number=c1.set_number
 where p_user=auth.uid() and c1.user_id=p_user and c1.available_for_exchange=true
   and public.normalize_beta_city(p1.country,p1.city)=public.normalize_beta_city(p2.country,p2.city)
   and lower(trim(coalesce(p1.country,'')))=lower(trim(coalesce(p2.country,'')));
$function$
;

-- [70] match_latency_percentiles(interval)
CREATE OR REPLACE FUNCTION public.match_latency_percentiles(p_window interval DEFAULT '24:00:00'::interval)
 RETURNS TABLE(sample_count bigint, p50_ms numeric, p95_ms numeric, p99_ms numeric)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select count(*),
    round(percentile_cont(0.50) within group(order by duration_ms)::numeric,2),
    round(percentile_cont(0.95) within group(order by duration_ms)::numeric,2),
    round(percentile_cont(0.99) within group(order by duration_ms)::numeric,2)
  from public.product_metrics
  where metric_name='find_matches_ms' and duration_ms is not null and created_at >= now()-p_window;
$function$
;

-- [70] bc_growth_is_match_ready(uuid)
CREATE OR REPLACE FUNCTION public.bc_growth_is_match_ready(p_user uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists(select 1 from public.collection_items c where c.user_id=p_user)
     and exists(select 1 from public.collection_items c where c.user_id=p_user and c.available_for_exchange=true)
     and exists(select 1 from public.wishlists w where w.user_id=p_user);
$function$
;

-- [70] bc_queue_member_growth_email()
CREATE OR REPLACE FUNCTION public.bc_queue_member_growth_email()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_email text;
begin
  select nullif(trim(email),'') into v_email from public.profiles where id=new.user_id;
  if v_email is null then return new; end if;
  insert into public.email_outbox(user_id,notification_id,recipient_email,template_key,subject,payload)
  values(new.user_id,new.id,v_email,'growth_v2',new.title,jsonb_build_object('title',new.title,'body',new.body,'kind',new.kind,'cta_hash',new.cta_hash))
  on conflict do nothing;
  return new;
end;
$function$
;

-- [70] bc_growth_refresh_trigger()
CREATE OR REPLACE FUNCTION public.bc_growth_refresh_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.bc_refresh_growth_for_user(coalesce(new.user_id,old.user_id));
  return coalesce(new,old);
end;
$function$
;

-- [70] normalize_profile_beta_location()
CREATE OR REPLACE FUNCTION public.normalize_profile_beta_location()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  new.country := nullif(trim(new.country), '');
  new.city := public.normalize_beta_city(new.country, new.city);
  return new;
end
$function$
;

-- [70] bc_run_growth_campaigns(integer)
CREATE OR REPLACE FUNCTION public.bc_run_growth_campaigns(p_limit integer DEFAULT 500)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r record;
  v_processed integer:=0;
  v_ready boolean;
  v_last_activity timestamptz;
  v_city_ready integer;
  d record;
begin
  for r in
    select p.id,p.city,p.country,p.member_since
    from public.profiles p
    order by p.created_at
    limit greatest(1,least(coalesce(p_limit,500),5000))
  loop
    v_processed:=v_processed+1;
    perform public.bc_refresh_growth_for_user(r.id);
    v_ready:=public.bc_growth_is_match_ready(r.id);

    if not v_ready and now()-coalesce(r.member_since,now()) >= interval '1 day' then
      insert into public.member_notifications(user_id,kind,title,body,cta_hash,dedupe_key)
      values(r.id,'onboarding','Finish becoming match-ready','You are one step away from letting BrickCircle search for exchanges. Complete your collection, availability and wishlist setup.','#catalogue','v2-activation-day1')
      on conflict(user_id,dedupe_key) where dedupe_key is not null do nothing;
    end if;
    if not v_ready and now()-coalesce(r.member_since,now()) >= interval '3 days' then
      insert into public.member_notifications(user_id,kind,title,body,cta_hash,dedupe_key)
      values(r.id,'onboarding','Unlock your first BrickCircle match','Collectors can only discover a reciprocal opportunity once you have an exchangeable set and wishlist demand. Finish those two signals now.','#catalogue','v2-activation-day3')
      on conflict(user_id,dedupe_key) where dedupe_key is not null do nothing;
    end if;

    select max(created_at) into v_last_activity from public.growth_events where user_id=r.id;
    if v_ready and coalesce(v_last_activity,r.member_since,now()) < now()-interval '14 days' then
      insert into public.member_notifications(user_id,kind,title,body,cta_hash,dedupe_key)
      values(r.id,'match','See what changed in your local LEGO exchange market','New collections and wishlists may have created opportunities since your last activity. Check your matches and local demand.','#matches','v2-reactivate-'||to_char(current_date,'IYYY-IW'))
      on conflict(user_id,dedupe_key) where dedupe_key is not null do nothing;
    end if;

    if nullif(trim(r.city),'') is not null and nullif(trim(r.country),'') is not null then
      select count(*) into v_city_ready
      from public.profiles p2
      where lower(trim(p2.city))=lower(trim(r.city)) and lower(trim(p2.country))=lower(trim(r.country))
        and public.bc_growth_is_match_ready(p2.id);
      if v_city_ready>=3 then
        insert into public.member_notifications(user_id,kind,title,body,cta_hash,dedupe_key)
        values(r.id,'match',v_city_ready||' match-ready collectors are active in '||r.city,
               'BrickCircle now has enough local activity to make checking Matches worthwhile. See what collectors in your city are offering and wanting.',
               '#matches','v2-city-liquidity-'||lower(regexp_replace(r.country||'-'||r.city,'[^a-zA-Z0-9]+','-','g'))||'-'||to_char(current_date,'IYYY-IW'))
        on conflict(user_id,dedupe_key) where dedupe_key is not null do nothing;
      end if;
    end if;

    update public.growth_member_state set last_campaign_at=now(),updated_at=now() where user_id=r.id;
  end loop;

  for d in
    select owner.user_id, owner.set_number, ls.name, p.city, count(distinct w.user_id) as demanders
    from public.collection_items owner
    join public.profiles p on p.id=owner.user_id
    join public.lego_sets ls on ls.set_number=owner.set_number
    join public.wishlists w on w.set_number=owner.set_number and w.user_id<>owner.user_id
    join public.profiles wp on wp.id=w.user_id and lower(trim(wp.city))=lower(trim(p.city)) and lower(trim(wp.country))=lower(trim(p.country))
    where owner.available_for_exchange=true and nullif(trim(p.city),'') is not null and nullif(trim(p.country),'') is not null
    group by owner.user_id,owner.set_number,ls.name,p.city
    having count(distinct w.user_id)>=2
    limit 500
  loop
    insert into public.member_notifications(user_id,kind,title,body,cta_hash,dedupe_key)
    values(d.user_id,'collection',d.demanders||' collectors in '||d.city||' want your '||d.name,
           'Your set has local wishlist demand. Keep it exchangeable and expand your wishlist to improve the chance of a reciprocal match.',
           '#wishlist','v2-set-demand-'||d.set_number||'-'||to_char(current_date,'IYYY-IW'))
    on conflict(user_id,dedupe_key) where dedupe_key is not null do nothing;
  end loop;

  return jsonb_build_object('ok',true,'processed_users',v_processed,'ran_at',now());
end;
$function$
;

-- [70] bc_growth_funnel_snapshot()
CREATE OR REPLACE FUNCTION public.bc_growth_funnel_snapshot()
 RETURNS TABLE(total_members bigint, members_with_collection bigint, members_with_available bigint, members_with_wishlist bigint, match_ready_members bigint, members_with_match_alert bigint, exchange_requesters bigint, accepted_exchanges bigint, completed_exchanges bigint)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    (select count(*) from public.profiles),
    (select count(distinct user_id) from public.collection_items),
    (select count(distinct user_id) from public.collection_items where available_for_exchange=true),
    (select count(distinct user_id) from public.wishlists),
    (select count(*) from public.profiles p where public.bc_growth_is_match_ready(p.id)),
    (select count(distinct user_id) from public.member_notifications where kind='match'),
    (select count(distinct requester_id) from public.exchange_requests),
    (select count(*) from public.exchange_requests where status='accepted'),
    (select count(*) from public.exchanges where state='completed');
$function$
;

-- [80] auth.users.on_auth_user_created
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- [80] auth.users.on_auth_user_email_verified
CREATE TRIGGER on_auth_user_email_verified AFTER UPDATE OF email_confirmed_at ON auth.users FOR EACH ROW WHEN (old.email_confirmed_at IS DISTINCT FROM new.email_confirmed_at) EXECUTE FUNCTION sync_profile_email_verification();

-- [80] public.collection_items.bc_growth_collection_insert
CREATE TRIGGER bc_growth_collection_insert AFTER INSERT ON collection_items FOR EACH ROW EXECUTE FUNCTION bc_growth_after_collection();

-- [80] public.collection_items.trg_growth_v2_collection
CREATE TRIGGER trg_growth_v2_collection AFTER INSERT OR DELETE OR UPDATE OF available_for_exchange, set_number ON collection_items FOR EACH ROW EXECUTE FUNCTION bc_growth_refresh_trigger();

-- [80] public.exchange_requests.exchange_request_notification
CREATE TRIGGER exchange_request_notification AFTER INSERT ON exchange_requests FOR EACH ROW EXECUTE FUNCTION notify_new_exchange_request();

-- [80] public.member_notifications.trg_growth_v2_email_queue
CREATE TRIGGER trg_growth_v2_email_queue AFTER INSERT ON member_notifications FOR EACH ROW EXECUTE FUNCTION bc_queue_member_growth_email();

-- [80] public.notifications.trg_queue_growth_notification_email
CREATE TRIGGER trg_queue_growth_notification_email AFTER INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION queue_growth_notification_email();

-- [80] public.profiles.trg_assign_founding_member
CREATE TRIGGER trg_assign_founding_member BEFORE INSERT ON profiles FOR EACH ROW EXECUTE FUNCTION bc_assign_founding_member();

-- [80] public.profiles.trg_normalize_profile_beta_location
CREATE TRIGGER trg_normalize_profile_beta_location BEFORE INSERT OR UPDATE OF country, city ON profiles FOR EACH ROW EXECUTE FUNCTION normalize_profile_beta_location();

-- [80] public.profiles.trg_protect_membership_fields
CREATE TRIGGER trg_protect_membership_fields BEFORE UPDATE OF membership_ordinal, founding_member_number, founding_member_granted_at, early_member_number, early_member_granted_at ON profiles FOR EACH ROW EXECUTE FUNCTION bc_protect_membership_fields();

-- [80] public.profiles.trg_sync_public_profile_projection
CREATE TRIGGER trg_sync_public_profile_projection AFTER INSERT OR UPDATE OF display_name, country, city, bio, avatar_url, rating, review_count, identity_verified, member_since, founding_member_number, early_member_number ON profiles FOR EACH ROW EXECUTE FUNCTION sync_public_profile_projection();

-- [80] public.wishlists.bc_growth_wishlist_insert
CREATE TRIGGER bc_growth_wishlist_insert AFTER INSERT ON wishlists FOR EACH ROW EXECUTE FUNCTION bc_growth_after_wishlist();

-- [80] public.wishlists.trg_growth_v2_wishlist
CREATE TRIGGER trg_growth_v2_wishlist AFTER INSERT OR DELETE OR UPDATE OF set_number, priority ON wishlists FOR EACH ROW EXECUTE FUNCTION bc_growth_refresh_trigger();

-- [85] public.bc_membership_ordinal_seq
revoke all on sequence public.bc_membership_ordinal_seq from public, anon, authenticated, service_role;

-- [85] public.city_pricing_overrides
revoke all on table public.city_pricing_overrides from public, anon, authenticated, service_role;

-- [85] public.collection_items
revoke all on table public.collection_items from public, anon, authenticated, service_role;

-- [85] public.email_outbox
revoke all on table public.email_outbox from public, anon, authenticated, service_role;

-- [85] public.exchange_meetups
revoke all on table public.exchange_meetups from public, anon, authenticated, service_role;

-- [85] public.exchange_preferences
revoke all on table public.exchange_preferences from public, anon, authenticated, service_role;

-- [85] public.exchange_requests
revoke all on table public.exchange_requests from public, anon, authenticated, service_role;

-- [85] public.exchange_returns
revoke all on table public.exchange_returns from public, anon, authenticated, service_role;

-- [85] public.exchanges
revoke all on table public.exchanges from public, anon, authenticated, service_role;

-- [85] public.growth_events
revoke all on table public.growth_events from public, anon, authenticated, service_role;

-- [85] public.growth_events_id_seq
revoke all on sequence public.growth_events_id_seq from public, anon, authenticated, service_role;

-- [85] public.growth_member_state
revoke all on table public.growth_member_state from public, anon, authenticated, service_role;

-- [85] public.lego_sets
revoke all on table public.lego_sets from public, anon, authenticated, service_role;

-- [85] public.member_notifications
revoke all on table public.member_notifications from public, anon, authenticated, service_role;

-- [85] public.membership_program_config
revoke all on table public.membership_program_config from public, anon, authenticated, service_role;

-- [85] public.messages
revoke all on table public.messages from public, anon, authenticated, service_role;

-- [85] public.notifications
revoke all on table public.notifications from public, anon, authenticated, service_role;

-- [85] public.product_metrics
revoke all on table public.product_metrics from public, anon, authenticated, service_role;

-- [85] public.product_metrics_id_seq
revoke all on sequence public.product_metrics_id_seq from public, anon, authenticated, service_role;

-- [85] public.profiles
revoke all on table public.profiles from public, anon, authenticated, service_role;

-- [85] public.public_profiles
revoke all on table public.public_profiles from public, anon, authenticated, service_role;

-- [85] public.referrals
revoke all on table public.referrals from public, anon, authenticated, service_role;

-- [85] public.reviews
revoke all on table public.reviews from public, anon, authenticated, service_role;

-- [85] public.wishlists
revoke all on table public.wishlists from public, anon, authenticated, service_role;

-- [86] public.bc_membership_ordinal_seq.anon.SELECT
grant select on sequence public.bc_membership_ordinal_seq to anon;

-- [86] public.bc_membership_ordinal_seq.anon.UPDATE
grant update on sequence public.bc_membership_ordinal_seq to anon;

-- [86] public.bc_membership_ordinal_seq.anon.USAGE
grant usage on sequence public.bc_membership_ordinal_seq to anon;

-- [86] public.bc_membership_ordinal_seq.authenticated.SELECT
grant select on sequence public.bc_membership_ordinal_seq to authenticated;

-- [86] public.bc_membership_ordinal_seq.authenticated.UPDATE
grant update on sequence public.bc_membership_ordinal_seq to authenticated;

-- [86] public.bc_membership_ordinal_seq.authenticated.USAGE
grant usage on sequence public.bc_membership_ordinal_seq to authenticated;

-- [86] public.bc_membership_ordinal_seq.service_role.SELECT
grant select on sequence public.bc_membership_ordinal_seq to service_role;

-- [86] public.bc_membership_ordinal_seq.service_role.UPDATE
grant update on sequence public.bc_membership_ordinal_seq to service_role;

-- [86] public.bc_membership_ordinal_seq.service_role.USAGE
grant usage on sequence public.bc_membership_ordinal_seq to service_role;

-- [86] public.city_pricing_overrides.service_role.DELETE
grant delete on table public.city_pricing_overrides to service_role;

-- [86] public.city_pricing_overrides.service_role.INSERT
grant insert on table public.city_pricing_overrides to service_role;

-- [86] public.city_pricing_overrides.service_role.MAINTAIN
grant maintain on table public.city_pricing_overrides to service_role;

-- [86] public.city_pricing_overrides.service_role.REFERENCES
grant references on table public.city_pricing_overrides to service_role;

-- [86] public.city_pricing_overrides.service_role.SELECT
grant select on table public.city_pricing_overrides to service_role;

-- [86] public.city_pricing_overrides.service_role.TRIGGER
grant trigger on table public.city_pricing_overrides to service_role;

-- [86] public.city_pricing_overrides.service_role.TRUNCATE
grant truncate on table public.city_pricing_overrides to service_role;

-- [86] public.city_pricing_overrides.service_role.UPDATE
grant update on table public.city_pricing_overrides to service_role;

-- [86] public.collection_items.authenticated.DELETE
grant delete on table public.collection_items to authenticated;

-- [86] public.collection_items.authenticated.INSERT
grant insert on table public.collection_items to authenticated;

-- [86] public.collection_items.authenticated.SELECT
grant select on table public.collection_items to authenticated;

-- [86] public.collection_items.authenticated.UPDATE
grant update on table public.collection_items to authenticated;

-- [86] public.collection_items.service_role.DELETE
grant delete on table public.collection_items to service_role;

-- [86] public.collection_items.service_role.INSERT
grant insert on table public.collection_items to service_role;

-- [86] public.collection_items.service_role.MAINTAIN
grant maintain on table public.collection_items to service_role;

-- [86] public.collection_items.service_role.REFERENCES
grant references on table public.collection_items to service_role;

-- [86] public.collection_items.service_role.SELECT
grant select on table public.collection_items to service_role;

-- [86] public.collection_items.service_role.TRIGGER
grant trigger on table public.collection_items to service_role;

-- [86] public.collection_items.service_role.TRUNCATE
grant truncate on table public.collection_items to service_role;

-- [86] public.collection_items.service_role.UPDATE
grant update on table public.collection_items to service_role;

-- [86] public.email_outbox.service_role.DELETE
grant delete on table public.email_outbox to service_role;

-- [86] public.email_outbox.service_role.INSERT
grant insert on table public.email_outbox to service_role;

-- [86] public.email_outbox.service_role.MAINTAIN
grant maintain on table public.email_outbox to service_role;

-- [86] public.email_outbox.service_role.REFERENCES
grant references on table public.email_outbox to service_role;

-- [86] public.email_outbox.service_role.SELECT
grant select on table public.email_outbox to service_role;

-- [86] public.email_outbox.service_role.TRIGGER
grant trigger on table public.email_outbox to service_role;

-- [86] public.email_outbox.service_role.TRUNCATE
grant truncate on table public.email_outbox to service_role;

-- [86] public.email_outbox.service_role.UPDATE
grant update on table public.email_outbox to service_role;

-- [86] public.exchange_meetups.anon.DELETE
grant delete on table public.exchange_meetups to anon;

-- [86] public.exchange_meetups.anon.INSERT
grant insert on table public.exchange_meetups to anon;

-- [86] public.exchange_meetups.anon.MAINTAIN
grant maintain on table public.exchange_meetups to anon;

-- [86] public.exchange_meetups.anon.REFERENCES
grant references on table public.exchange_meetups to anon;

-- [86] public.exchange_meetups.anon.SELECT
grant select on table public.exchange_meetups to anon;

-- [86] public.exchange_meetups.anon.TRIGGER
grant trigger on table public.exchange_meetups to anon;

-- [86] public.exchange_meetups.anon.TRUNCATE
grant truncate on table public.exchange_meetups to anon;

-- [86] public.exchange_meetups.anon.UPDATE
grant update on table public.exchange_meetups to anon;

-- [86] public.exchange_meetups.authenticated.DELETE
grant delete on table public.exchange_meetups to authenticated;

-- [86] public.exchange_meetups.authenticated.INSERT
grant insert on table public.exchange_meetups to authenticated;

-- [86] public.exchange_meetups.authenticated.MAINTAIN
grant maintain on table public.exchange_meetups to authenticated;

-- [86] public.exchange_meetups.authenticated.REFERENCES
grant references on table public.exchange_meetups to authenticated;

-- [86] public.exchange_meetups.authenticated.SELECT
grant select on table public.exchange_meetups to authenticated;

-- [86] public.exchange_meetups.authenticated.TRIGGER
grant trigger on table public.exchange_meetups to authenticated;

-- [86] public.exchange_meetups.authenticated.TRUNCATE
grant truncate on table public.exchange_meetups to authenticated;

-- [86] public.exchange_meetups.authenticated.UPDATE
grant update on table public.exchange_meetups to authenticated;

-- [86] public.exchange_meetups.service_role.DELETE
grant delete on table public.exchange_meetups to service_role;

-- [86] public.exchange_meetups.service_role.INSERT
grant insert on table public.exchange_meetups to service_role;

-- [86] public.exchange_meetups.service_role.MAINTAIN
grant maintain on table public.exchange_meetups to service_role;

-- [86] public.exchange_meetups.service_role.REFERENCES
grant references on table public.exchange_meetups to service_role;

-- [86] public.exchange_meetups.service_role.SELECT
grant select on table public.exchange_meetups to service_role;

-- [86] public.exchange_meetups.service_role.TRIGGER
grant trigger on table public.exchange_meetups to service_role;

-- [86] public.exchange_meetups.service_role.TRUNCATE
grant truncate on table public.exchange_meetups to service_role;

-- [86] public.exchange_meetups.service_role.UPDATE
grant update on table public.exchange_meetups to service_role;

-- [86] public.exchange_preferences.anon.DELETE
grant delete on table public.exchange_preferences to anon;

-- [86] public.exchange_preferences.anon.INSERT
grant insert on table public.exchange_preferences to anon;

-- [86] public.exchange_preferences.anon.MAINTAIN
grant maintain on table public.exchange_preferences to anon;

-- [86] public.exchange_preferences.anon.REFERENCES
grant references on table public.exchange_preferences to anon;

-- [86] public.exchange_preferences.anon.SELECT
grant select on table public.exchange_preferences to anon;

-- [86] public.exchange_preferences.anon.TRIGGER
grant trigger on table public.exchange_preferences to anon;

-- [86] public.exchange_preferences.anon.TRUNCATE
grant truncate on table public.exchange_preferences to anon;

-- [86] public.exchange_preferences.anon.UPDATE
grant update on table public.exchange_preferences to anon;

-- [86] public.exchange_preferences.authenticated.DELETE
grant delete on table public.exchange_preferences to authenticated;

-- [86] public.exchange_preferences.authenticated.INSERT
grant insert on table public.exchange_preferences to authenticated;

-- [86] public.exchange_preferences.authenticated.MAINTAIN
grant maintain on table public.exchange_preferences to authenticated;

-- [86] public.exchange_preferences.authenticated.REFERENCES
grant references on table public.exchange_preferences to authenticated;

-- [86] public.exchange_preferences.authenticated.SELECT
grant select on table public.exchange_preferences to authenticated;

-- [86] public.exchange_preferences.authenticated.TRIGGER
grant trigger on table public.exchange_preferences to authenticated;

-- [86] public.exchange_preferences.authenticated.TRUNCATE
grant truncate on table public.exchange_preferences to authenticated;

-- [86] public.exchange_preferences.authenticated.UPDATE
grant update on table public.exchange_preferences to authenticated;

-- [86] public.exchange_preferences.service_role.DELETE
grant delete on table public.exchange_preferences to service_role;

-- [86] public.exchange_preferences.service_role.INSERT
grant insert on table public.exchange_preferences to service_role;

-- [86] public.exchange_preferences.service_role.MAINTAIN
grant maintain on table public.exchange_preferences to service_role;

-- [86] public.exchange_preferences.service_role.REFERENCES
grant references on table public.exchange_preferences to service_role;

-- [86] public.exchange_preferences.service_role.SELECT
grant select on table public.exchange_preferences to service_role;

-- [86] public.exchange_preferences.service_role.TRIGGER
grant trigger on table public.exchange_preferences to service_role;

-- [86] public.exchange_preferences.service_role.TRUNCATE
grant truncate on table public.exchange_preferences to service_role;

-- [86] public.exchange_preferences.service_role.UPDATE
grant update on table public.exchange_preferences to service_role;

-- [86] public.exchange_requests.anon.DELETE
grant delete on table public.exchange_requests to anon;

-- [86] public.exchange_requests.anon.INSERT
grant insert on table public.exchange_requests to anon;

-- [86] public.exchange_requests.anon.MAINTAIN
grant maintain on table public.exchange_requests to anon;

-- [86] public.exchange_requests.anon.REFERENCES
grant references on table public.exchange_requests to anon;

-- [86] public.exchange_requests.anon.SELECT
grant select on table public.exchange_requests to anon;

-- [86] public.exchange_requests.anon.TRIGGER
grant trigger on table public.exchange_requests to anon;

-- [86] public.exchange_requests.anon.TRUNCATE
grant truncate on table public.exchange_requests to anon;

-- [86] public.exchange_requests.anon.UPDATE
grant update on table public.exchange_requests to anon;

-- [86] public.exchange_requests.authenticated.DELETE
grant delete on table public.exchange_requests to authenticated;

-- [86] public.exchange_requests.authenticated.INSERT
grant insert on table public.exchange_requests to authenticated;

-- [86] public.exchange_requests.authenticated.MAINTAIN
grant maintain on table public.exchange_requests to authenticated;

-- [86] public.exchange_requests.authenticated.REFERENCES
grant references on table public.exchange_requests to authenticated;

-- [86] public.exchange_requests.authenticated.SELECT
grant select on table public.exchange_requests to authenticated;

-- [86] public.exchange_requests.authenticated.TRIGGER
grant trigger on table public.exchange_requests to authenticated;

-- [86] public.exchange_requests.authenticated.TRUNCATE
grant truncate on table public.exchange_requests to authenticated;

-- [86] public.exchange_requests.authenticated.UPDATE
grant update on table public.exchange_requests to authenticated;

-- [86] public.exchange_requests.service_role.DELETE
grant delete on table public.exchange_requests to service_role;

-- [86] public.exchange_requests.service_role.INSERT
grant insert on table public.exchange_requests to service_role;

-- [86] public.exchange_requests.service_role.MAINTAIN
grant maintain on table public.exchange_requests to service_role;

-- [86] public.exchange_requests.service_role.REFERENCES
grant references on table public.exchange_requests to service_role;

-- [86] public.exchange_requests.service_role.SELECT
grant select on table public.exchange_requests to service_role;

-- [86] public.exchange_requests.service_role.TRIGGER
grant trigger on table public.exchange_requests to service_role;

-- [86] public.exchange_requests.service_role.TRUNCATE
grant truncate on table public.exchange_requests to service_role;

-- [86] public.exchange_requests.service_role.UPDATE
grant update on table public.exchange_requests to service_role;

-- [86] public.exchange_returns.authenticated.DELETE
grant delete on table public.exchange_returns to authenticated;

-- [86] public.exchange_returns.authenticated.INSERT
grant insert on table public.exchange_returns to authenticated;

-- [86] public.exchange_returns.authenticated.MAINTAIN
grant maintain on table public.exchange_returns to authenticated;

-- [86] public.exchange_returns.authenticated.REFERENCES
grant references on table public.exchange_returns to authenticated;

-- [86] public.exchange_returns.authenticated.SELECT
grant select on table public.exchange_returns to authenticated;

-- [86] public.exchange_returns.authenticated.TRIGGER
grant trigger on table public.exchange_returns to authenticated;

-- [86] public.exchange_returns.authenticated.TRUNCATE
grant truncate on table public.exchange_returns to authenticated;

-- [86] public.exchange_returns.authenticated.UPDATE
grant update on table public.exchange_returns to authenticated;

-- [86] public.exchange_returns.service_role.DELETE
grant delete on table public.exchange_returns to service_role;

-- [86] public.exchange_returns.service_role.INSERT
grant insert on table public.exchange_returns to service_role;

-- [86] public.exchange_returns.service_role.MAINTAIN
grant maintain on table public.exchange_returns to service_role;

-- [86] public.exchange_returns.service_role.REFERENCES
grant references on table public.exchange_returns to service_role;

-- [86] public.exchange_returns.service_role.SELECT
grant select on table public.exchange_returns to service_role;

-- [86] public.exchange_returns.service_role.TRIGGER
grant trigger on table public.exchange_returns to service_role;

-- [86] public.exchange_returns.service_role.TRUNCATE
grant truncate on table public.exchange_returns to service_role;

-- [86] public.exchange_returns.service_role.UPDATE
grant update on table public.exchange_returns to service_role;

-- [86] public.exchanges.anon.DELETE
grant delete on table public.exchanges to anon;

-- [86] public.exchanges.anon.INSERT
grant insert on table public.exchanges to anon;

-- [86] public.exchanges.anon.MAINTAIN
grant maintain on table public.exchanges to anon;

-- [86] public.exchanges.anon.REFERENCES
grant references on table public.exchanges to anon;

-- [86] public.exchanges.anon.SELECT
grant select on table public.exchanges to anon;

-- [86] public.exchanges.anon.TRIGGER
grant trigger on table public.exchanges to anon;

-- [86] public.exchanges.anon.TRUNCATE
grant truncate on table public.exchanges to anon;

-- [86] public.exchanges.anon.UPDATE
grant update on table public.exchanges to anon;

-- [86] public.exchanges.authenticated.DELETE
grant delete on table public.exchanges to authenticated;

-- [86] public.exchanges.authenticated.INSERT
grant insert on table public.exchanges to authenticated;

-- [86] public.exchanges.authenticated.MAINTAIN
grant maintain on table public.exchanges to authenticated;

-- [86] public.exchanges.authenticated.REFERENCES
grant references on table public.exchanges to authenticated;

-- [86] public.exchanges.authenticated.SELECT
grant select on table public.exchanges to authenticated;

-- [86] public.exchanges.authenticated.TRIGGER
grant trigger on table public.exchanges to authenticated;

-- [86] public.exchanges.authenticated.TRUNCATE
grant truncate on table public.exchanges to authenticated;

-- [86] public.exchanges.authenticated.UPDATE
grant update on table public.exchanges to authenticated;

-- [86] public.exchanges.service_role.DELETE
grant delete on table public.exchanges to service_role;

-- [86] public.exchanges.service_role.INSERT
grant insert on table public.exchanges to service_role;

-- [86] public.exchanges.service_role.MAINTAIN
grant maintain on table public.exchanges to service_role;

-- [86] public.exchanges.service_role.REFERENCES
grant references on table public.exchanges to service_role;

-- [86] public.exchanges.service_role.SELECT
grant select on table public.exchanges to service_role;

-- [86] public.exchanges.service_role.TRIGGER
grant trigger on table public.exchanges to service_role;

-- [86] public.exchanges.service_role.TRUNCATE
grant truncate on table public.exchanges to service_role;

-- [86] public.exchanges.service_role.UPDATE
grant update on table public.exchanges to service_role;

-- [86] public.growth_events.authenticated.INSERT
grant insert on table public.growth_events to authenticated;

-- [86] public.growth_events.authenticated.SELECT
grant select on table public.growth_events to authenticated;

-- [86] public.growth_events.service_role.DELETE
grant delete on table public.growth_events to service_role;

-- [86] public.growth_events.service_role.INSERT
grant insert on table public.growth_events to service_role;

-- [86] public.growth_events.service_role.MAINTAIN
grant maintain on table public.growth_events to service_role;

-- [86] public.growth_events.service_role.REFERENCES
grant references on table public.growth_events to service_role;

-- [86] public.growth_events.service_role.SELECT
grant select on table public.growth_events to service_role;

-- [86] public.growth_events.service_role.TRIGGER
grant trigger on table public.growth_events to service_role;

-- [86] public.growth_events.service_role.TRUNCATE
grant truncate on table public.growth_events to service_role;

-- [86] public.growth_events.service_role.UPDATE
grant update on table public.growth_events to service_role;

-- [86] public.growth_events_id_seq.authenticated.USAGE
grant usage on sequence public.growth_events_id_seq to authenticated;

-- [86] public.growth_events_id_seq.service_role.SELECT
grant select on sequence public.growth_events_id_seq to service_role;

-- [86] public.growth_events_id_seq.service_role.UPDATE
grant update on sequence public.growth_events_id_seq to service_role;

-- [86] public.growth_events_id_seq.service_role.USAGE
grant usage on sequence public.growth_events_id_seq to service_role;

-- [86] public.growth_member_state.service_role.DELETE
grant delete on table public.growth_member_state to service_role;

-- [86] public.growth_member_state.service_role.INSERT
grant insert on table public.growth_member_state to service_role;

-- [86] public.growth_member_state.service_role.MAINTAIN
grant maintain on table public.growth_member_state to service_role;

-- [86] public.growth_member_state.service_role.REFERENCES
grant references on table public.growth_member_state to service_role;

-- [86] public.growth_member_state.service_role.SELECT
grant select on table public.growth_member_state to service_role;

-- [86] public.growth_member_state.service_role.TRIGGER
grant trigger on table public.growth_member_state to service_role;

-- [86] public.growth_member_state.service_role.TRUNCATE
grant truncate on table public.growth_member_state to service_role;

-- [86] public.growth_member_state.service_role.UPDATE
grant update on table public.growth_member_state to service_role;

-- [86] public.lego_sets.anon.DELETE
grant delete on table public.lego_sets to anon;

-- [86] public.lego_sets.anon.INSERT
grant insert on table public.lego_sets to anon;

-- [86] public.lego_sets.anon.MAINTAIN
grant maintain on table public.lego_sets to anon;

-- [86] public.lego_sets.anon.REFERENCES
grant references on table public.lego_sets to anon;

-- [86] public.lego_sets.anon.SELECT
grant select on table public.lego_sets to anon;

-- [86] public.lego_sets.anon.TRIGGER
grant trigger on table public.lego_sets to anon;

-- [86] public.lego_sets.anon.TRUNCATE
grant truncate on table public.lego_sets to anon;

-- [86] public.lego_sets.anon.UPDATE
grant update on table public.lego_sets to anon;

-- [86] public.lego_sets.authenticated.DELETE
grant delete on table public.lego_sets to authenticated;

-- [86] public.lego_sets.authenticated.INSERT
grant insert on table public.lego_sets to authenticated;

-- [86] public.lego_sets.authenticated.MAINTAIN
grant maintain on table public.lego_sets to authenticated;

-- [86] public.lego_sets.authenticated.REFERENCES
grant references on table public.lego_sets to authenticated;

-- [86] public.lego_sets.authenticated.SELECT
grant select on table public.lego_sets to authenticated;

-- [86] public.lego_sets.authenticated.TRIGGER
grant trigger on table public.lego_sets to authenticated;

-- [86] public.lego_sets.authenticated.TRUNCATE
grant truncate on table public.lego_sets to authenticated;

-- [86] public.lego_sets.authenticated.UPDATE
grant update on table public.lego_sets to authenticated;

-- [86] public.lego_sets.service_role.DELETE
grant delete on table public.lego_sets to service_role;

-- [86] public.lego_sets.service_role.INSERT
grant insert on table public.lego_sets to service_role;

-- [86] public.lego_sets.service_role.MAINTAIN
grant maintain on table public.lego_sets to service_role;

-- [86] public.lego_sets.service_role.REFERENCES
grant references on table public.lego_sets to service_role;

-- [86] public.lego_sets.service_role.SELECT
grant select on table public.lego_sets to service_role;

-- [86] public.lego_sets.service_role.TRIGGER
grant trigger on table public.lego_sets to service_role;

-- [86] public.lego_sets.service_role.TRUNCATE
grant truncate on table public.lego_sets to service_role;

-- [86] public.lego_sets.service_role.UPDATE
grant update on table public.lego_sets to service_role;

-- [86] public.member_notifications.anon.DELETE
grant delete on table public.member_notifications to anon;

-- [86] public.member_notifications.anon.INSERT
grant insert on table public.member_notifications to anon;

-- [86] public.member_notifications.anon.MAINTAIN
grant maintain on table public.member_notifications to anon;

-- [86] public.member_notifications.anon.REFERENCES
grant references on table public.member_notifications to anon;

-- [86] public.member_notifications.anon.SELECT
grant select on table public.member_notifications to anon;

-- [86] public.member_notifications.anon.TRIGGER
grant trigger on table public.member_notifications to anon;

-- [86] public.member_notifications.anon.TRUNCATE
grant truncate on table public.member_notifications to anon;

-- [86] public.member_notifications.anon.UPDATE
grant update on table public.member_notifications to anon;

-- [86] public.member_notifications.authenticated.DELETE
grant delete on table public.member_notifications to authenticated;

-- [86] public.member_notifications.authenticated.INSERT
grant insert on table public.member_notifications to authenticated;

-- [86] public.member_notifications.authenticated.MAINTAIN
grant maintain on table public.member_notifications to authenticated;

-- [86] public.member_notifications.authenticated.REFERENCES
grant references on table public.member_notifications to authenticated;

-- [86] public.member_notifications.authenticated.SELECT
grant select on table public.member_notifications to authenticated;

-- [86] public.member_notifications.authenticated.TRIGGER
grant trigger on table public.member_notifications to authenticated;

-- [86] public.member_notifications.authenticated.TRUNCATE
grant truncate on table public.member_notifications to authenticated;

-- [86] public.member_notifications.authenticated.UPDATE
grant update on table public.member_notifications to authenticated;

-- [86] public.member_notifications.service_role.DELETE
grant delete on table public.member_notifications to service_role;

-- [86] public.member_notifications.service_role.INSERT
grant insert on table public.member_notifications to service_role;

-- [86] public.member_notifications.service_role.MAINTAIN
grant maintain on table public.member_notifications to service_role;

-- [86] public.member_notifications.service_role.REFERENCES
grant references on table public.member_notifications to service_role;

-- [86] public.member_notifications.service_role.SELECT
grant select on table public.member_notifications to service_role;

-- [86] public.member_notifications.service_role.TRIGGER
grant trigger on table public.member_notifications to service_role;

-- [86] public.member_notifications.service_role.TRUNCATE
grant truncate on table public.member_notifications to service_role;

-- [86] public.member_notifications.service_role.UPDATE
grant update on table public.member_notifications to service_role;

-- [86] public.membership_program_config.service_role.DELETE
grant delete on table public.membership_program_config to service_role;

-- [86] public.membership_program_config.service_role.INSERT
grant insert on table public.membership_program_config to service_role;

-- [86] public.membership_program_config.service_role.MAINTAIN
grant maintain on table public.membership_program_config to service_role;

-- [86] public.membership_program_config.service_role.REFERENCES
grant references on table public.membership_program_config to service_role;

-- [86] public.membership_program_config.service_role.SELECT
grant select on table public.membership_program_config to service_role;

-- [86] public.membership_program_config.service_role.TRIGGER
grant trigger on table public.membership_program_config to service_role;

-- [86] public.membership_program_config.service_role.TRUNCATE
grant truncate on table public.membership_program_config to service_role;

-- [86] public.membership_program_config.service_role.UPDATE
grant update on table public.membership_program_config to service_role;

-- [86] public.messages.anon.DELETE
grant delete on table public.messages to anon;

-- [86] public.messages.anon.INSERT
grant insert on table public.messages to anon;

-- [86] public.messages.anon.MAINTAIN
grant maintain on table public.messages to anon;

-- [86] public.messages.anon.REFERENCES
grant references on table public.messages to anon;

-- [86] public.messages.anon.SELECT
grant select on table public.messages to anon;

-- [86] public.messages.anon.TRIGGER
grant trigger on table public.messages to anon;

-- [86] public.messages.anon.TRUNCATE
grant truncate on table public.messages to anon;

-- [86] public.messages.anon.UPDATE
grant update on table public.messages to anon;

-- [86] public.messages.authenticated.DELETE
grant delete on table public.messages to authenticated;

-- [86] public.messages.authenticated.INSERT
grant insert on table public.messages to authenticated;

-- [86] public.messages.authenticated.MAINTAIN
grant maintain on table public.messages to authenticated;

-- [86] public.messages.authenticated.REFERENCES
grant references on table public.messages to authenticated;

-- [86] public.messages.authenticated.SELECT
grant select on table public.messages to authenticated;

-- [86] public.messages.authenticated.TRIGGER
grant trigger on table public.messages to authenticated;

-- [86] public.messages.authenticated.TRUNCATE
grant truncate on table public.messages to authenticated;

-- [86] public.messages.authenticated.UPDATE
grant update on table public.messages to authenticated;

-- [86] public.messages.service_role.DELETE
grant delete on table public.messages to service_role;

-- [86] public.messages.service_role.INSERT
grant insert on table public.messages to service_role;

-- [86] public.messages.service_role.MAINTAIN
grant maintain on table public.messages to service_role;

-- [86] public.messages.service_role.REFERENCES
grant references on table public.messages to service_role;

-- [86] public.messages.service_role.SELECT
grant select on table public.messages to service_role;

-- [86] public.messages.service_role.TRIGGER
grant trigger on table public.messages to service_role;

-- [86] public.messages.service_role.TRUNCATE
grant truncate on table public.messages to service_role;

-- [86] public.messages.service_role.UPDATE
grant update on table public.messages to service_role;

-- [86] public.notifications.authenticated.SELECT
grant select on table public.notifications to authenticated;

-- [86] public.notifications.authenticated.UPDATE
grant update on table public.notifications to authenticated;

-- [86] public.notifications.service_role.DELETE
grant delete on table public.notifications to service_role;

-- [86] public.notifications.service_role.INSERT
grant insert on table public.notifications to service_role;

-- [86] public.notifications.service_role.MAINTAIN
grant maintain on table public.notifications to service_role;

-- [86] public.notifications.service_role.REFERENCES
grant references on table public.notifications to service_role;

-- [86] public.notifications.service_role.SELECT
grant select on table public.notifications to service_role;

-- [86] public.notifications.service_role.TRIGGER
grant trigger on table public.notifications to service_role;

-- [86] public.notifications.service_role.TRUNCATE
grant truncate on table public.notifications to service_role;

-- [86] public.notifications.service_role.UPDATE
grant update on table public.notifications to service_role;

-- [86] public.product_metrics.authenticated.INSERT
grant insert on table public.product_metrics to authenticated;

-- [86] public.product_metrics.service_role.DELETE
grant delete on table public.product_metrics to service_role;

-- [86] public.product_metrics.service_role.INSERT
grant insert on table public.product_metrics to service_role;

-- [86] public.product_metrics.service_role.MAINTAIN
grant maintain on table public.product_metrics to service_role;

-- [86] public.product_metrics.service_role.REFERENCES
grant references on table public.product_metrics to service_role;

-- [86] public.product_metrics.service_role.SELECT
grant select on table public.product_metrics to service_role;

-- [86] public.product_metrics.service_role.TRIGGER
grant trigger on table public.product_metrics to service_role;

-- [86] public.product_metrics.service_role.TRUNCATE
grant truncate on table public.product_metrics to service_role;

-- [86] public.product_metrics.service_role.UPDATE
grant update on table public.product_metrics to service_role;

-- [86] public.product_metrics_id_seq.anon.SELECT
grant select on sequence public.product_metrics_id_seq to anon;

-- [86] public.product_metrics_id_seq.anon.UPDATE
grant update on sequence public.product_metrics_id_seq to anon;

-- [86] public.product_metrics_id_seq.anon.USAGE
grant usage on sequence public.product_metrics_id_seq to anon;

-- [86] public.product_metrics_id_seq.authenticated.SELECT
grant select on sequence public.product_metrics_id_seq to authenticated;

-- [86] public.product_metrics_id_seq.authenticated.UPDATE
grant update on sequence public.product_metrics_id_seq to authenticated;

-- [86] public.product_metrics_id_seq.authenticated.USAGE
grant usage on sequence public.product_metrics_id_seq to authenticated;

-- [86] public.product_metrics_id_seq.service_role.SELECT
grant select on sequence public.product_metrics_id_seq to service_role;

-- [86] public.product_metrics_id_seq.service_role.UPDATE
grant update on sequence public.product_metrics_id_seq to service_role;

-- [86] public.product_metrics_id_seq.service_role.USAGE
grant usage on sequence public.product_metrics_id_seq to service_role;

-- [86] public.profiles.authenticated.INSERT
grant insert on table public.profiles to authenticated;

-- [86] public.profiles.authenticated.SELECT
grant select on table public.profiles to authenticated;

-- [86] public.profiles.authenticated.UPDATE
grant update on table public.profiles to authenticated;

-- [86] public.profiles.service_role.DELETE
grant delete on table public.profiles to service_role;

-- [86] public.profiles.service_role.INSERT
grant insert on table public.profiles to service_role;

-- [86] public.profiles.service_role.MAINTAIN
grant maintain on table public.profiles to service_role;

-- [86] public.profiles.service_role.REFERENCES
grant references on table public.profiles to service_role;

-- [86] public.profiles.service_role.SELECT
grant select on table public.profiles to service_role;

-- [86] public.profiles.service_role.TRIGGER
grant trigger on table public.profiles to service_role;

-- [86] public.profiles.service_role.TRUNCATE
grant truncate on table public.profiles to service_role;

-- [86] public.profiles.service_role.UPDATE
grant update on table public.profiles to service_role;

-- [86] public.public_profiles.anon.SELECT
grant select on table public.public_profiles to anon;

-- [86] public.public_profiles.authenticated.SELECT
grant select on table public.public_profiles to authenticated;

-- [86] public.public_profiles.service_role.DELETE
grant delete on table public.public_profiles to service_role;

-- [86] public.public_profiles.service_role.INSERT
grant insert on table public.public_profiles to service_role;

-- [86] public.public_profiles.service_role.MAINTAIN
grant maintain on table public.public_profiles to service_role;

-- [86] public.public_profiles.service_role.REFERENCES
grant references on table public.public_profiles to service_role;

-- [86] public.public_profiles.service_role.SELECT
grant select on table public.public_profiles to service_role;

-- [86] public.public_profiles.service_role.TRIGGER
grant trigger on table public.public_profiles to service_role;

-- [86] public.public_profiles.service_role.TRUNCATE
grant truncate on table public.public_profiles to service_role;

-- [86] public.public_profiles.service_role.UPDATE
grant update on table public.public_profiles to service_role;

-- [86] public.referrals.anon.DELETE
grant delete on table public.referrals to anon;

-- [86] public.referrals.anon.INSERT
grant insert on table public.referrals to anon;

-- [86] public.referrals.anon.MAINTAIN
grant maintain on table public.referrals to anon;

-- [86] public.referrals.anon.REFERENCES
grant references on table public.referrals to anon;

-- [86] public.referrals.anon.SELECT
grant select on table public.referrals to anon;

-- [86] public.referrals.anon.TRIGGER
grant trigger on table public.referrals to anon;

-- [86] public.referrals.anon.TRUNCATE
grant truncate on table public.referrals to anon;

-- [86] public.referrals.anon.UPDATE
grant update on table public.referrals to anon;

-- [86] public.referrals.authenticated.DELETE
grant delete on table public.referrals to authenticated;

-- [86] public.referrals.authenticated.INSERT
grant insert on table public.referrals to authenticated;

-- [86] public.referrals.authenticated.MAINTAIN
grant maintain on table public.referrals to authenticated;

-- [86] public.referrals.authenticated.REFERENCES
grant references on table public.referrals to authenticated;

-- [86] public.referrals.authenticated.SELECT
grant select on table public.referrals to authenticated;

-- [86] public.referrals.authenticated.TRIGGER
grant trigger on table public.referrals to authenticated;

-- [86] public.referrals.authenticated.TRUNCATE
grant truncate on table public.referrals to authenticated;

-- [86] public.referrals.authenticated.UPDATE
grant update on table public.referrals to authenticated;

-- [86] public.referrals.service_role.DELETE
grant delete on table public.referrals to service_role;

-- [86] public.referrals.service_role.INSERT
grant insert on table public.referrals to service_role;

-- [86] public.referrals.service_role.MAINTAIN
grant maintain on table public.referrals to service_role;

-- [86] public.referrals.service_role.REFERENCES
grant references on table public.referrals to service_role;

-- [86] public.referrals.service_role.SELECT
grant select on table public.referrals to service_role;

-- [86] public.referrals.service_role.TRIGGER
grant trigger on table public.referrals to service_role;

-- [86] public.referrals.service_role.TRUNCATE
grant truncate on table public.referrals to service_role;

-- [86] public.referrals.service_role.UPDATE
grant update on table public.referrals to service_role;

-- [86] public.reviews.anon.DELETE
grant delete on table public.reviews to anon;

-- [86] public.reviews.anon.INSERT
grant insert on table public.reviews to anon;

-- [86] public.reviews.anon.MAINTAIN
grant maintain on table public.reviews to anon;

-- [86] public.reviews.anon.REFERENCES
grant references on table public.reviews to anon;

-- [86] public.reviews.anon.SELECT
grant select on table public.reviews to anon;

-- [86] public.reviews.anon.TRIGGER
grant trigger on table public.reviews to anon;

-- [86] public.reviews.anon.TRUNCATE
grant truncate on table public.reviews to anon;

-- [86] public.reviews.anon.UPDATE
grant update on table public.reviews to anon;

-- [86] public.reviews.authenticated.MAINTAIN
grant maintain on table public.reviews to authenticated;

-- [86] public.reviews.authenticated.REFERENCES
grant references on table public.reviews to authenticated;

-- [86] public.reviews.authenticated.SELECT
grant select on table public.reviews to authenticated;

-- [86] public.reviews.authenticated.TRIGGER
grant trigger on table public.reviews to authenticated;

-- [86] public.reviews.authenticated.TRUNCATE
grant truncate on table public.reviews to authenticated;

-- [86] public.reviews.service_role.DELETE
grant delete on table public.reviews to service_role;

-- [86] public.reviews.service_role.INSERT
grant insert on table public.reviews to service_role;

-- [86] public.reviews.service_role.MAINTAIN
grant maintain on table public.reviews to service_role;

-- [86] public.reviews.service_role.REFERENCES
grant references on table public.reviews to service_role;

-- [86] public.reviews.service_role.SELECT
grant select on table public.reviews to service_role;

-- [86] public.reviews.service_role.TRIGGER
grant trigger on table public.reviews to service_role;

-- [86] public.reviews.service_role.TRUNCATE
grant truncate on table public.reviews to service_role;

-- [86] public.reviews.service_role.UPDATE
grant update on table public.reviews to service_role;

-- [86] public.wishlists.anon.DELETE
grant delete on table public.wishlists to anon;

-- [86] public.wishlists.anon.INSERT
grant insert on table public.wishlists to anon;

-- [86] public.wishlists.anon.MAINTAIN
grant maintain on table public.wishlists to anon;

-- [86] public.wishlists.anon.REFERENCES
grant references on table public.wishlists to anon;

-- [86] public.wishlists.anon.SELECT
grant select on table public.wishlists to anon;

-- [86] public.wishlists.anon.TRIGGER
grant trigger on table public.wishlists to anon;

-- [86] public.wishlists.anon.TRUNCATE
grant truncate on table public.wishlists to anon;

-- [86] public.wishlists.anon.UPDATE
grant update on table public.wishlists to anon;

-- [86] public.wishlists.authenticated.DELETE
grant delete on table public.wishlists to authenticated;

-- [86] public.wishlists.authenticated.INSERT
grant insert on table public.wishlists to authenticated;

-- [86] public.wishlists.authenticated.MAINTAIN
grant maintain on table public.wishlists to authenticated;

-- [86] public.wishlists.authenticated.REFERENCES
grant references on table public.wishlists to authenticated;

-- [86] public.wishlists.authenticated.SELECT
grant select on table public.wishlists to authenticated;

-- [86] public.wishlists.authenticated.TRIGGER
grant trigger on table public.wishlists to authenticated;

-- [86] public.wishlists.authenticated.TRUNCATE
grant truncate on table public.wishlists to authenticated;

-- [86] public.wishlists.authenticated.UPDATE
grant update on table public.wishlists to authenticated;

-- [86] public.wishlists.service_role.DELETE
grant delete on table public.wishlists to service_role;

-- [86] public.wishlists.service_role.INSERT
grant insert on table public.wishlists to service_role;

-- [86] public.wishlists.service_role.MAINTAIN
grant maintain on table public.wishlists to service_role;

-- [86] public.wishlists.service_role.REFERENCES
grant references on table public.wishlists to service_role;

-- [86] public.wishlists.service_role.SELECT
grant select on table public.wishlists to service_role;

-- [86] public.wishlists.service_role.TRIGGER
grant trigger on table public.wishlists to service_role;

-- [86] public.wishlists.service_role.TRUNCATE
grant truncate on table public.wishlists to service_role;

-- [86] public.wishlists.service_role.UPDATE
grant update on table public.wishlists to service_role;

-- [87] advance_exchange(uuid,text,text)
revoke all on function advance_exchange(uuid,text,text) from public, anon, authenticated, service_role;

-- [87] bc_assign_founding_member()
revoke all on function bc_assign_founding_member() from public, anon, authenticated, service_role;

-- [87] bc_claim_referral(text)
revoke all on function bc_claim_referral(text) from public, anon, authenticated, service_role;

-- [87] bc_founder_status()
revoke all on function bc_founder_status() from public, anon, authenticated, service_role;

-- [87] bc_growth_after_collection()
revoke all on function bc_growth_after_collection() from public, anon, authenticated, service_role;

-- [87] bc_growth_after_wishlist()
revoke all on function bc_growth_after_wishlist() from public, anon, authenticated, service_role;

-- [87] bc_growth_funnel_snapshot()
revoke all on function bc_growth_funnel_snapshot() from public, anon, authenticated, service_role;

-- [87] bc_growth_is_match_ready(uuid)
revoke all on function bc_growth_is_match_ready(uuid) from public, anon, authenticated, service_role;

-- [87] bc_growth_refresh_trigger()
revoke all on function bc_growth_refresh_trigger() from public, anon, authenticated, service_role;

-- [87] bc_liquidity_status()
revoke all on function bc_liquidity_status() from public, anon, authenticated, service_role;

-- [87] bc_member_growth_snapshot()
revoke all on function bc_member_growth_snapshot() from public, anon, authenticated, service_role;

-- [87] bc_membership_status()
revoke all on function bc_membership_status() from public, anon, authenticated, service_role;

-- [87] bc_my_referral_code()
revoke all on function bc_my_referral_code() from public, anon, authenticated, service_role;

-- [87] bc_protect_membership_fields()
revoke all on function bc_protect_membership_fields() from public, anon, authenticated, service_role;

-- [87] bc_queue_member_growth_email()
revoke all on function bc_queue_member_growth_email() from public, anon, authenticated, service_role;

-- [87] bc_record_auth_provider(text)
revoke all on function bc_record_auth_provider(text) from public, anon, authenticated, service_role;

-- [87] bc_refresh_growth_for_user(uuid)
revoke all on function bc_refresh_growth_for_user(uuid) from public, anon, authenticated, service_role;

-- [87] bc_run_growth_campaigns(integer)
revoke all on function bc_run_growth_campaigns(integer) from public, anon, authenticated, service_role;

-- [87] bc_search_lego_sets(text,text,integer,integer)
revoke all on function bc_search_lego_sets(text,text,integer,integer) from public, anon, authenticated, service_role;

-- [87] cancel_in_person_exchange(uuid,text)
revoke all on function cancel_in_person_exchange(uuid,text) from public, anon, authenticated, service_role;

-- [87] check_my_overdue_returns()
revoke all on function check_my_overdue_returns() from public, anon, authenticated, service_role;

-- [87] find_matches(uuid)
revoke all on function find_matches(uuid) from public, anon, authenticated, service_role;

-- [87] handle_new_user()
revoke all on function handle_new_user() from public, anon, authenticated, service_role;

-- [87] match_latency_percentiles(interval)
revoke all on function match_latency_percentiles(interval) from public, anon, authenticated, service_role;

-- [87] meetup_action(uuid,text,text)
revoke all on function meetup_action(uuid,text,text) from public, anon, authenticated, service_role;

-- [87] normalize_beta_city(text,text)
revoke all on function normalize_beta_city(text,text) from public, anon, authenticated, service_role;

-- [87] normalize_profile_beta_location()
revoke all on function normalize_profile_beta_location() from public, anon, authenticated, service_role;

-- [87] notify_new_exchange_request()
revoke all on function notify_new_exchange_request() from public, anon, authenticated, service_role;

-- [87] queue_growth_notification_email()
revoke all on function queue_growth_notification_email() from public, anon, authenticated, service_role;

-- [87] report_overdue_return_issue(uuid,text)
revoke all on function report_overdue_return_issue(uuid,text) from public, anon, authenticated, service_role;

-- [87] respond_exchange_request(uuid,text)
revoke all on function respond_exchange_request(uuid,text) from public, anon, authenticated, service_role;

-- [87] return_action(uuid,text,text)
revoke all on function return_action(uuid,text,text) from public, anon, authenticated, service_role;

-- [87] setup_meetup(uuid,text,text,timestamp with time zone)
revoke all on function setup_meetup(uuid,text,text,timestamp with time zone) from public, anon, authenticated, service_role;

-- [87] setup_return_meetup(uuid,text,text,timestamp with time zone)
revoke all on function setup_return_meetup(uuid,text,text,timestamp with time zone) from public, anon, authenticated, service_role;

-- [87] submit_exchange_review(uuid,integer,text)
revoke all on function submit_exchange_review(uuid,integer,text) from public, anon, authenticated, service_role;

-- [87] sync_profile_email_verification()
revoke all on function sync_profile_email_verification() from public, anon, authenticated, service_role;

-- [87] sync_public_profile_projection()
revoke all on function sync_public_profile_projection() from public, anon, authenticated, service_role;

-- [88] advance_exchange(uuid,text,text).authenticated.EXECUTE
grant execute on function advance_exchange(uuid,text,text) to authenticated;

-- [88] advance_exchange(uuid,text,text).service_role.EXECUTE
grant execute on function advance_exchange(uuid,text,text) to service_role;

-- [88] bc_assign_founding_member().PUBLIC.EXECUTE
grant execute on function bc_assign_founding_member() to public;

-- [88] bc_assign_founding_member().anon.EXECUTE
grant execute on function bc_assign_founding_member() to anon;

-- [88] bc_assign_founding_member().authenticated.EXECUTE
grant execute on function bc_assign_founding_member() to authenticated;

-- [88] bc_assign_founding_member().service_role.EXECUTE
grant execute on function bc_assign_founding_member() to service_role;

-- [88] bc_claim_referral(text).authenticated.EXECUTE
grant execute on function bc_claim_referral(text) to authenticated;

-- [88] bc_claim_referral(text).service_role.EXECUTE
grant execute on function bc_claim_referral(text) to service_role;

-- [88] bc_founder_status().anon.EXECUTE
grant execute on function bc_founder_status() to anon;

-- [88] bc_founder_status().authenticated.EXECUTE
grant execute on function bc_founder_status() to authenticated;

-- [88] bc_founder_status().service_role.EXECUTE
grant execute on function bc_founder_status() to service_role;

-- [88] bc_growth_after_collection().PUBLIC.EXECUTE
grant execute on function bc_growth_after_collection() to public;

-- [88] bc_growth_after_collection().anon.EXECUTE
grant execute on function bc_growth_after_collection() to anon;

-- [88] bc_growth_after_collection().authenticated.EXECUTE
grant execute on function bc_growth_after_collection() to authenticated;

-- [88] bc_growth_after_collection().service_role.EXECUTE
grant execute on function bc_growth_after_collection() to service_role;

-- [88] bc_growth_after_wishlist().PUBLIC.EXECUTE
grant execute on function bc_growth_after_wishlist() to public;

-- [88] bc_growth_after_wishlist().anon.EXECUTE
grant execute on function bc_growth_after_wishlist() to anon;

-- [88] bc_growth_after_wishlist().authenticated.EXECUTE
grant execute on function bc_growth_after_wishlist() to authenticated;

-- [88] bc_growth_after_wishlist().service_role.EXECUTE
grant execute on function bc_growth_after_wishlist() to service_role;

-- [88] bc_growth_funnel_snapshot().authenticated.EXECUTE
grant execute on function bc_growth_funnel_snapshot() to authenticated;

-- [88] bc_growth_funnel_snapshot().service_role.EXECUTE
grant execute on function bc_growth_funnel_snapshot() to service_role;

-- [88] bc_growth_is_match_ready(uuid).service_role.EXECUTE
grant execute on function bc_growth_is_match_ready(uuid) to service_role;

-- [88] bc_growth_refresh_trigger().service_role.EXECUTE
grant execute on function bc_growth_refresh_trigger() to service_role;

-- [88] bc_liquidity_status().anon.EXECUTE
grant execute on function bc_liquidity_status() to anon;

-- [88] bc_liquidity_status().authenticated.EXECUTE
grant execute on function bc_liquidity_status() to authenticated;

-- [88] bc_liquidity_status().service_role.EXECUTE
grant execute on function bc_liquidity_status() to service_role;

-- [88] bc_member_growth_snapshot().anon.EXECUTE
grant execute on function bc_member_growth_snapshot() to anon;

-- [88] bc_member_growth_snapshot().authenticated.EXECUTE
grant execute on function bc_member_growth_snapshot() to authenticated;

-- [88] bc_member_growth_snapshot().service_role.EXECUTE
grant execute on function bc_member_growth_snapshot() to service_role;

-- [88] bc_membership_status().PUBLIC.EXECUTE
grant execute on function bc_membership_status() to public;

-- [88] bc_membership_status().anon.EXECUTE
grant execute on function bc_membership_status() to anon;

-- [88] bc_membership_status().authenticated.EXECUTE
grant execute on function bc_membership_status() to authenticated;

-- [88] bc_membership_status().service_role.EXECUTE
grant execute on function bc_membership_status() to service_role;

-- [88] bc_my_referral_code().anon.EXECUTE
grant execute on function bc_my_referral_code() to anon;

-- [88] bc_my_referral_code().authenticated.EXECUTE
grant execute on function bc_my_referral_code() to authenticated;

-- [88] bc_my_referral_code().service_role.EXECUTE
grant execute on function bc_my_referral_code() to service_role;

-- [88] bc_protect_membership_fields().PUBLIC.EXECUTE
grant execute on function bc_protect_membership_fields() to public;

-- [88] bc_protect_membership_fields().anon.EXECUTE
grant execute on function bc_protect_membership_fields() to anon;

-- [88] bc_protect_membership_fields().authenticated.EXECUTE
grant execute on function bc_protect_membership_fields() to authenticated;

-- [88] bc_protect_membership_fields().service_role.EXECUTE
grant execute on function bc_protect_membership_fields() to service_role;

-- [88] bc_queue_member_growth_email().service_role.EXECUTE
grant execute on function bc_queue_member_growth_email() to service_role;

-- [88] bc_record_auth_provider(text).authenticated.EXECUTE
grant execute on function bc_record_auth_provider(text) to authenticated;

-- [88] bc_record_auth_provider(text).service_role.EXECUTE
grant execute on function bc_record_auth_provider(text) to service_role;

-- [88] bc_refresh_growth_for_user(uuid).service_role.EXECUTE
grant execute on function bc_refresh_growth_for_user(uuid) to service_role;

-- [88] bc_run_growth_campaigns(integer).service_role.EXECUTE
grant execute on function bc_run_growth_campaigns(integer) to service_role;

-- [88] bc_search_lego_sets(text,text,integer,integer).anon.EXECUTE
grant execute on function bc_search_lego_sets(text,text,integer,integer) to anon;

-- [88] bc_search_lego_sets(text,text,integer,integer).authenticated.EX
grant execute on function bc_search_lego_sets(text,text,integer,integer) to authenticated;

-- [88] bc_search_lego_sets(text,text,integer,integer).service_role.EXE
grant execute on function bc_search_lego_sets(text,text,integer,integer) to service_role;

-- [88] cancel_in_person_exchange(uuid,text).authenticated.EXECUTE
grant execute on function cancel_in_person_exchange(uuid,text) to authenticated;

-- [88] cancel_in_person_exchange(uuid,text).service_role.EXECUTE
grant execute on function cancel_in_person_exchange(uuid,text) to service_role;

-- [88] check_my_overdue_returns().authenticated.EXECUTE
grant execute on function check_my_overdue_returns() to authenticated;

-- [88] check_my_overdue_returns().service_role.EXECUTE
grant execute on function check_my_overdue_returns() to service_role;

-- [88] find_matches(uuid).authenticated.EXECUTE
grant execute on function find_matches(uuid) to authenticated;

-- [88] find_matches(uuid).service_role.EXECUTE
grant execute on function find_matches(uuid) to service_role;

-- [88] handle_new_user().service_role.EXECUTE
grant execute on function handle_new_user() to service_role;

-- [88] match_latency_percentiles(interval).service_role.EXECUTE
grant execute on function match_latency_percentiles(interval) to service_role;

-- [88] meetup_action(uuid,text,text).authenticated.EXECUTE
grant execute on function meetup_action(uuid,text,text) to authenticated;

-- [88] meetup_action(uuid,text,text).service_role.EXECUTE
grant execute on function meetup_action(uuid,text,text) to service_role;

-- [88] normalize_beta_city(text,text).service_role.EXECUTE
grant execute on function normalize_beta_city(text,text) to service_role;

-- [88] normalize_profile_beta_location().service_role.EXECUTE
grant execute on function normalize_profile_beta_location() to service_role;

-- [88] notify_new_exchange_request().service_role.EXECUTE
grant execute on function notify_new_exchange_request() to service_role;

-- [88] queue_growth_notification_email().service_role.EXECUTE
grant execute on function queue_growth_notification_email() to service_role;

-- [88] report_overdue_return_issue(uuid,text).authenticated.EXECUTE
grant execute on function report_overdue_return_issue(uuid,text) to authenticated;

-- [88] report_overdue_return_issue(uuid,text).service_role.EXECUTE
grant execute on function report_overdue_return_issue(uuid,text) to service_role;

-- [88] respond_exchange_request(uuid,text).authenticated.EXECUTE
grant execute on function respond_exchange_request(uuid,text) to authenticated;

-- [88] respond_exchange_request(uuid,text).service_role.EXECUTE
grant execute on function respond_exchange_request(uuid,text) to service_role;

-- [88] return_action(uuid,text,text).authenticated.EXECUTE
grant execute on function return_action(uuid,text,text) to authenticated;

-- [88] return_action(uuid,text,text).service_role.EXECUTE
grant execute on function return_action(uuid,text,text) to service_role;

-- [88] setup_meetup(uuid,text,text,timestamp with time zone).authentic
grant execute on function setup_meetup(uuid,text,text,timestamp with time zone) to authenticated;

-- [88] setup_meetup(uuid,text,text,timestamp with time zone).service_r
grant execute on function setup_meetup(uuid,text,text,timestamp with time zone) to service_role;

-- [88] setup_return_meetup(uuid,text,text,timestamp with time zone).au
grant execute on function setup_return_meetup(uuid,text,text,timestamp with time zone) to authenticated;

-- [88] setup_return_meetup(uuid,text,text,timestamp with time zone).se
grant execute on function setup_return_meetup(uuid,text,text,timestamp with time zone) to service_role;

-- [88] submit_exchange_review(uuid,integer,text).authenticated.EXECUTE
grant execute on function submit_exchange_review(uuid,integer,text) to authenticated;

-- [88] submit_exchange_review(uuid,integer,text).service_role.EXECUTE
grant execute on function submit_exchange_review(uuid,integer,text) to service_role;

-- [88] sync_profile_email_verification().service_role.EXECUTE
grant execute on function sync_profile_email_verification() to service_role;

-- [88] sync_public_profile_projection().service_role.EXECUTE
grant execute on function sync_public_profile_projection() to service_role;
