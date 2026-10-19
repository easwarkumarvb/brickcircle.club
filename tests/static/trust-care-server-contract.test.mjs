import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const sql=readFileSync(new URL('../../supabase/migrations/20261019083950_trust_care_condition_safeguards.sql',import.meta.url),'utf8');
const app=readFileSync(new URL('../../app-v3.js',import.meta.url),'utf8');
test('new availability requires all three actual owner photo paths at database boundary',()=>{
  assert.match(sql,/before update on public\.collection_items/);
  assert.match(sql,/new\.available_for_exchange is true and old\.available_for_exchange is not true/);
  for(const a of ["new.owner_photo_path is null","a.angle='side'","a.angle='rear'","a.owner_id=new.user_id"])assert.ok(sql.includes(a),a);
  assert.match(sql,/Make this set unavailable before removing a required photo/);
  assert.match(sql,/before update or delete on public\.collection_item_photo_angles/);
});
test('self-reported parts declaration is durable and cannot be silently revised during exchange',()=>{
  assert.match(sql,/add column if not exists inventory_review_status/);
  assert.match(sql,/known_gaps/);
  assert.match(sql,/Describe the known missing pieces in Notes/);
  assert.match(sql,/from public\.exchange_case_item_locks/);
  assert.match(app,/name="inventory_review_status"/);
  assert.match(app,/inventory_review_status:String\(f\.get\('inventory_review_status'\)/);
});
test('handoff baseline recorded only after both physical handoff confirmations and protected by RLS',()=>{
  assert.match(sql,/new\.state='ACTIVE'/);
  assert.match(sql,/new\.handoff_a_at is not null/);
  assert.match(sql,/new\.handoff_b_at is not null/);
  assert.match(sql,/enable row level security/);
  assert.match(sql,/participants see handoff baseline/);
  assert.match(sql,/Exchange agreement versions|accepted_agreement_version/);
  assert.match(sql,/Handoff baseline evidence is immutable/);
  assert.match(app,/Condition record at mutual handoff/);
});

const storageGuard=readFileSync(new URL('../../supabase/migrations/20261019091952_protect_trust_care_photo_bytes.sql',import.meta.url),'utf8');
test('photo Storage bytes cannot be removed or overwritten while offered, locked, or within 90 days after handoff completion',()=>{
  assert.match(storageGuard,/create policy "trust care preserve collection photo deletion"/);
  assert.match(storageGuard,/create policy "trust care preserve collection photo replacement"/);
  assert.match(storageGuard,/as restrictive for delete to authenticated/);
  assert.match(storageGuard,/as restrictive for update to authenticated/);
  assert.match(storageGuard,/private\.bc_collection_photo_bytes_protected\(name\)/);
  assert.match(storageGuard,/c\.completed_at is null or c\.completed_at > pg_catalog\.now\(\)-interval '90 days'/);
  assert.match(storageGuard,/exchange_case_item_locks/);
  assert.match(storageGuard,/exchange_case_handoff_baselines/);
});
