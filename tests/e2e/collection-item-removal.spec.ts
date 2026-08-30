import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const read=(path:string)=>fs.readFileSync(path,'utf8');

test('collection removal withdraws dependent pending proposals',()=>{
  const migration=read('supabase/migrations/20260830080019_allow_collection_item_removal_with_pending_requests.sql');
  const schema=read('supabase/schema.sql');
  const ui=read('collection-remove-hotfix.js');

  expect(migration.match(/on delete cascade/gi)).toHaveLength(2);
  expect(migration).toContain('exchange_requests_offered_item_id_fkey');
  expect(migration).toContain('exchange_requests_requested_item_id_fkey');
  expect(migration).not.toContain('exchanges_item_a_fkey');
  expect(migration).not.toContain('exchanges_item_b_fkey');

  expect(schema).toMatch(/offered_item_id uuid not null references public\.collection_items\(id\) on delete cascade/);
  expect(schema).toMatch(/requested_item_id uuid not null references public\.collection_items\(id\) on delete cascade/);

  expect(ui).toContain('Pending proposals involving this set will be withdrawn.');
  expect(ui).toContain(".select('id')");
  expect(ui).toContain("error?.code==='23503'");
  expect(ui).toContain('accepted or completed exchange');
});

test('the removal hotfix is deployed and cached with the V3 shell',()=>{
  const html=read('v2.html');
  const sw=read('catalogue-cache-sw.js');
  const pkg=read('package.json');

  expect(html).toContain('/collection-remove-hotfix.js?v=20260830-1');
  expect(sw).toContain('/collection-remove-hotfix.js?v=20260830-1');
  expect(pkg).toContain('collection-remove-hotfix.js');
});
