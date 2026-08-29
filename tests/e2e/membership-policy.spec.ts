import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const read=(path:string)=>fs.readFileSync(path,'utf8');

test('membership policy layer is loaded after the V3 app',()=>{
  const html=read('v2.html');
  const app=html.indexOf('/app-v3.js');
  const membership=html.indexOf('/membership-v31.js');
  expect(app).toBeGreaterThan(-1);
  expect(membership).toBeGreaterThan(app);
});

test('membership policy preserves Founding 100 and Early 1000 rules',()=>{
  const js=read('membership-v31.js');
  expect(js).toContain('complimentary marketplace membership for life');
  expect(js).toContain('Members #101–#1000');
  expect(js).toContain('free throughout beta');
  expect(js).toContain('Paid membership will be introduced city-by-city');
  expect(js).toContain("db.rpc('bc_membership_status')");
});

test('database migration defines city liquidity gates without auto-enabling pricing',()=>{
  const sql=read('supabase/migrations/20260829_membership_program_v31.sql');
  expect(sql).toContain('city_min_members integer not null default 100');
  expect(sql).toContain('city_min_exchangeable_sets integer not null default 200');
  expect(sql).toContain('city_min_wishlist_items integer not null default 300');
  expect(sql).toContain('pricing_enabled boolean not null default false');
  expect(sql).toContain("when p.membership_ordinal<=cfg.founding_cap then 'free_lifetime'");
  expect(sql).toContain("when cfg.beta_free then 'free_beta'");
});
