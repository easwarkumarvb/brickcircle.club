import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const read=(path:string)=>fs.readFileSync(path,'utf8');
const currentReleaseAssets=['index.html','v2.html','app-v3.js'];

test('current release surfaces use one free-beta membership policy',()=>{
  const html=read('v2.html');
  const release=currentReleaseAssets.map(read).join('\n');
  expect(html).toContain('/app-v3.js');
  expect(html).not.toContain('/membership-v31.js');
  expect(release).toContain('BrickCircle is free during beta');
  expect(release).toContain('members will be informed well in advance');
  expect(release).not.toContain('complimentary marketplace membership for life');
  expect(release).not.toContain('Members #101–#1000');
  expect(release).not.toContain('Join the Founding 100');
  expect(release).not.toContain('Paid membership is enabled');
});

test('free-beta migration removes signup-order entitlement without rewriting history',()=>{
  const sql=read('supabase/migrations/20260911081710_free_beta_membership_phase.sql');
  expect(sql).toContain("membership_phase='beta_free'");
  expect(sql).toContain('drop trigger if exists trg_assign_founding_member');
  expect(sql).toContain("when uid is not null and p.id is not null then 'beta'");
  expect(sql).toContain("when uid is not null and p.id is not null then 'free_beta'");
  expect(sql).toContain('my_number integer');
  expect(sql).toContain('false;');
  expect(sql).not.toMatch(/update\s+public\.profiles/i);
  expect(sql).not.toMatch(/delete\s+from\s+public\.profiles/i);
});

test('obsolete supplemental membership runtimes are absent',()=>{
  expect(fs.existsSync('membership-v31.js')).toBe(false);
  expect(fs.existsSync('founding-100.js')).toBe(false);
});
