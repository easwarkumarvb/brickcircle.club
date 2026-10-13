-- Disposable PG only. Reuse the existing realistic canonical domain base.
\ir ../canonical_exchange_state_machine_base.sql
-- Minimal Storage API schema; bucket limits are metadata here, not upload enforcement.
create schema storage;
create table storage.buckets(id text primary key,name text not null,public boolean not null default false,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default extensions.gen_random_uuid(),bucket_id text not null references storage.buckets(id),name text not null,unique(bucket_id,name));
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;
alter table storage.objects enable row level security;
grant usage on schema auth,storage to authenticated,anon;
grant select,insert,update,delete on storage.objects to authenticated,anon;
-- Anonymous object table privileges intentionally allow RLS denial to be tested.
create table public.public_profiles(id uuid primary key,display_name text);
\ir ../../supabase/migrations/20260829072229_beta_release_rls_hardening.sql
-- Real pre-photo matcher, then canonical migration replaces it with the current matcher.
-- The shared fixture helper has an older argument name; replace it before dependencies.
drop function public.canonical_lego_product_identity(text);
create function public.normalize_beta_city(p_country text,p_city text) returns text language sql immutable as $$ select public.normalize_city(p_country,p_city) $$;
\ir ../../supabase/migrations/20260906084526_reciprocal_lego_product_alias_matching.sql
\ir ../../supabase/migrations/20260908093000_require_collection_owner_photo.sql
\ir ../../supabase/migrations/20260916052934_canonical_exchange_state_machine.sql
-- No policy expression is duplicated in this fixture. Repair is deliberately separate.
