import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
const app=readFileSync(new URL('../../app-v3.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../../app-v3.css',import.meta.url),'utf8');
const sql=readFileSync(new URL('../../supabase/migrations/20261011103000_collection_item_photo_angles.sql',import.meta.url),'utf8');

test('owner can open three-angle gallery and use existing camera/file workflow',()=>{
  assert.match(app,/function bcOwnerGallery\(/);
  assert.match(app,/data-photo-gallery/);
  assert.match(app,/ownerPhotoPicker\(/);
  assert.match(app,/side:'Side view',rear:'Rear \/ detail view'/);
  assert.match(app,/ownerPhotoUrls\.delete\(prior\)/);
});
test('reciprocal match renders supplementary private photo links with safe attributes',()=>{
  assert.match(app,/bcLoadPhotoAngles\(match\.requested_item\)/);
  assert.match(app,/await signedOwnerPhoto\(entry\.storage_path\)/);
  assert.match(app,/rel="noopener noreferrer"/);
  assert.match(css,/\.bc-match-photo-grid/);
});
test('photo metadata owner writes and reciprocal reads are scoped',()=>{
  assert.match(sql,/enable row level security/);
  assert.match(sql,/owner_id = \(select auth\.uid\(\)\)/);
  assert.match(sql,/ci\.id = item_id and ci\.user_id = owner_id/);
  assert.match(sql,/a\.storage_path = storage\.objects\.name/);
  assert.match(sql,/ci\.owner_photo_path = storage\.objects\.name/);
  assert.match(sql,/angle in \('side','rear'\)/);
});

test('gallery uses exchange language and opens owner photos securely',()=>{
  assert.doesNotMatch(app,/Buyers should inspect the physical set/);
  assert.match(app,/Both collectors should inspect the physical set/);
  assert.match(app,/aria-label="Open large/);
  assert.match(app,/target="_blank" rel="noopener noreferrer"/);
});
