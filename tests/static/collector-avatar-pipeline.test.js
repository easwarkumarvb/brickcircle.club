const fs=require('fs');
const assert=require('assert');

const migration=fs.readFileSync('supabase/migrations/20261001154500_canonical_collector_avatar_pipeline.sql','utf8');
const app=fs.readFileSync('app-v3.js','utf8');

// --- Migration contract -------------------------------------------------------
assert.match(migration,/bc_provider_avatar_from_metadata/);
assert.match(migration,/nullif\(pg_catalog\.btrim\(coalesce\(p\.avatar_url,''\)\), ''\) is null/i);
assert.match(migration,/create or replace function public\.handle_new_user\(\)/i);
assert.match(migration,/bc_provider_avatar_from_metadata\(new\.raw_user_meta_data\)/i);
assert.match(migration,/avatar_source text check \(avatar_source in \('provider','upload'\)\)/i);
assert.match(migration,/case when provider_avatar is not null then 'provider' end/i);
assert.match(migration,/create or replace function public\.sync_my_provider_avatar\(\)/i);
assert.match(migration,/grant execute on function public\.sync_my_provider_avatar\(\) to authenticated/i);
assert.doesNotMatch(migration,/after update of raw_user_meta_data on auth\.users/i);
assert.doesNotMatch(migration,/delete\s+from\s+storage\.objects/i);

// --- Client contract ----------------------------------------------------------
assert.match(app,/db\.from\('public_profiles'\)\.select\('id,display_name,country,city,bio,avatar_url,/);
assert.doesNotMatch(app,/S\.matches\.forEach\([^\n]+db\.from\('profiles'\)/);
assert.match(app,/function wireAvatars\(/);
assert.match(app,/referrerpolicy="no-referrer"/);
assert.match(app,/if\(pe\)\{await removeOwnedAvatar\(data\.path\);return fail\(pe\)\}/);
assert.match(app,/previous&&previous!==data\.path&&ownedAvatarStoragePath\(previous\)/);
assert.match(app,/update\(\{avatar_url:data\.path,avatar_source:'upload',updated_at:new Date\(\)\.toISOString\(\)\}\)/);
assert.match(app,/db\.rpc\('sync_my_provider_avatar'\)/);
assert.ok(app.includes("if(/^https:\\/\\//i.test(value))return value;"), 'HTTPS external avatars must be allowed');
assert.ok(app.includes("if(/^[a-z][a-z0-9+.-]*:/i.test(value))return '';"), 'non-HTTPS schemes must fall back safely');

// --- find_matches privacy separation -------------------------------------------
const matchFunction=fs.readFileSync('supabase/migrations/20260912022500_city_agnostic_local_matching.sql','utf8');
const start=matchFunction.indexOf('create or replace function public.find_matches');
const end=matchFunction.indexOf('create or replace function public.queue_new_reciprocal_match_notifications',start);
const body=matchFunction.slice(start,end);
assert.ok(body.includes('returns table(match_user uuid'), 'find_matches must continue to return match identity by UUID');
assert.ok(!/avatar_url|display_name|email/i.test(body), 'find_matches must not leak collector profile fields');

console.log('collector-avatar-pipeline contract passed');
