import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const read=(path:string)=>fs.readFileSync(path,'utf8');

test('V3 app shell loads one application runtime',()=>{
  const html=read('v2.html');
  const release=JSON.parse(read('release-assets.json'));
  expect(html).toContain(`/app-v3.css?v=${release.release}`);
  expect(html).toContain(`/locations-v3.js?v=${release.release}`);
  expect(html).toContain(`/app-v3.js?v=${release.release}`);
  for (const legacy of [
    'v2prod.js','authfix.js','global-locations.js','social-auth.js','home-render-guard.js',
    'home-stable-v30.js','v22b.js','v22reviews.js','v22match.js','catalog-images.js',
    'v23-meetup.js','profile-v23.js','mobile-v23.js','v24-return.js','founding-100.js',
    'ux-v25.js','catalogue-search-v27.js','catalog-search-v32.js','signout-switch-account.js'
  ]) expect(html).not.toContain(legacy);
});

test('V3 has one client, one router and five primary destinations',()=>{
  const app=read('app-v3.js');
  expect((app.match(/createClient\?/g)||[]).length).toBe(1);
  expect(app).toContain("['home','⌂','Home']");
  expect(app).toContain("['browse','⌕','Browse']");
  expect(app).toContain("['sets','🧱','My Sets']");
  expect(app).toContain("['matches','⇄','Matches']");
  expect(app).toContain("['exchanges','🤝','Exchanges']");
  expect(app).not.toContain('new MutationObserver(');
  expect((app.match(/setInterval\(/g)||[]).length).toBe(1);
  expect(app).toContain('notificationPollTimer=setInterval');
});

test('V3 presents the canonical local in-person exchange lifecycle',()=>{
  const app=read('app-v3.js');
  expect(app).toContain("canonicalRpc('create_exchange_case'");
  expect(app).toContain("canonicalRpc('exchange_case_transition'");
  expect(app).toContain("canonicalRpc('send_exchange_case_message'");
  expect(app).toContain("db.from('exchange_cases')");
  expect(app).not.toContain("db.rpc('respond_exchange_request'");
  expect(app).not.toContain("db.rpc('cancel_in_person_exchange'");
  expect(app).not.toContain("db.rpc('advance_exchange'");
  expect(app).not.toContain("'return_shipping'");
  expect(app).not.toContain("'deposit_pending'");
});

test('public join CTA opens V3 authentication and PWA shortcuts match V3 IA',()=>{
  const index=read('index.html');
  const manifest=read('manifest.webmanifest');
  expect(index).toContain('/v2.html?join=1');
  expect(index).not.toContain('data-pwa-install');
  expect(manifest).toContain('/v2.html#sets');
  expect(manifest).toContain('/v2.html#matches');
  expect(manifest).toContain('/v2.html#exchanges');
});
