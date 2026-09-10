import fs from 'node:fs';
import assert from 'node:assert/strict';

const client=fs.readFileSync('app-v3.js','utf8');
const migration=fs.readFileSync('supabase/migrations/20260908093000_require_collection_owner_photo.sql','utf8');
const html=fs.readFileSync('v2.html','utf8');

assert.match(client,/Photo of your finished LEGO set/);
assert.match(client,/type="file"[^>]+accept="image\/jpeg,image\/png,image\/webp"[^>]+required/);
assert.match(client,/button class="bc-btn primary" type="submit" disabled/);
assert.match(client,/owner_photo_path:path/);
assert.match(client,/if\(error\)\{await cleanupOwnerPhoto\(path\);throw error\}/);
assert.match(client,/OWNER_PHOTO_MAX_BYTES=8\*1024\*1024/);

assert.match(client,/data-exchangeable/);
assert.match(client,/addLegacyOwnerPhoto/);
assert.match(migration,/bc_require_owner_photo_for_exchange/);
assert.match(migration,/available_for_exchange/);
assert.match(migration,/owner_photo_path/);

assert.match(migration,/collection-photos/);
assert.match(migration,/false,\s*8388608/);
assert.match(migration,/users read reciprocal matched collection items/);
assert.match(migration,/public\.find_matches/);
assert.match(migration,/collection photos permitted read/);
assert.doesNotMatch(migration,/bc_exchangeable_owner_photo/);
assert.doesNotMatch(migration,/bc_can_read_collection_photo/);

assert.match(client,/hydrateMatchPhotos/);
assert.match(client,/\.from\('collection_items'\)/);
assert.match(client,/createSignedUrl\(path,900\)/);
assert.match(client,/Owner photo · inspect the physical set in person before exchange/);

assert.match(html,/\/app-v3\.js/);
assert.doesNotMatch(html,/\/collection-owner-photo\.js/);
assert.doesNotMatch(html,/\/owner-photo-dedupe-v1\.js/);
assert.doesNotMatch(html,/\/collection-remove-safety\.js/);

console.log('owner photo static regression checks passed');
