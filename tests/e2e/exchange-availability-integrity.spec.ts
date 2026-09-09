import {test,expect} from '@playwright/test';
import fs from 'node:fs';

const read=(file:string)=>fs.readFileSync(file,'utf8');

test('@static reserved physical sets cannot leak back into matching',()=>{
  const migration=read('supabase/migrations/20260909103236_exchange_availability_integrity.sql');
  expect(migration).toContain("e.state not in ('completed','cancelled')");
  expect(migration).toContain('bc_guard_collection_exchangeability');
  expect(migration).toContain('bc_enforce_exchange_item_reservations');
  expect(migration.match(/and not exists \(/g)?.length).toBeGreaterThanOrEqual(4);
  expect(migration).toContain("set available_for_exchange = false");
  expect(migration).toContain("set status='cancelled'");
});

test('@static failed acceptance restores its action instead of staying frozen',()=>{
  const app=read('app-v3.js');
  expect(app).toContain("settledTimeout(db.rpc('respond_exchange_request'");
  expect(app).toContain("btn.disabled=false;btn.textContent=original");
  expect(app).toContain("if(data?.ok===false)");
});

test('@static exchange safety release includes the owner-photo race guard',()=>{
  const manifest=JSON.parse(read('release-assets.json')) as {release:string,shell:string[]};
  expect(manifest.release).toBe('20260909-exchange-safety-r1');
  expect(manifest.shell).toContain('/owner-photo-dedupe-v1.js');
});
