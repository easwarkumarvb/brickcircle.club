import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const read=(path:string)=>fs.readFileSync(path,'utf8');

test('public Join free links use the explicit join intent',()=>{
  const html=read('index.html');
  expect(html).toContain('href="/v2.html?join=1"');
});

test('join entry reliability layer loads immediately after the app',()=>{
  const html=read('v2.html');
  const app=html.indexOf('/app-v3.js?');
  const join=html.indexOf('/join-entry-v33.js?');
  const auth=html.indexOf('/v3-auth-onboarding-hotfix.js?');
  expect(app).toBeGreaterThan(-1);
  expect(join).toBeGreaterThan(app);
  expect(auth).toBeGreaterThan(join);
});

test('join entry opens auth without waiting for remote hydration',()=>{
  const js=read('join-entry-v33.js');
  expect(js).toContain("const joinIntent=params.get('join')==='1'");
  expect(js).toContain("typeof window.bcAuth!=='function'");
  expect(js).toContain('window.bcAuth();');
  expect(js).toContain("document.getElementById('bc-overlay')");
  expect(js).toContain("event.target.closest?.('[data-auth]')");
  expect(js).not.toContain('setInterval(');
});

test('PWA cache includes the join reliability, auth and current image assets',()=>{
  const sw=read('catalogue-cache-sw.js');
  expect(sw).toContain("brickcircle-shell-v3-20260829-imagefix1");
  expect(sw).toContain("/join-entry-v33.js?v=20260829-1");
  expect(sw).toContain("/v3-auth-onboarding-hotfix.js?v=20260829-4");
  expect(sw).toContain("/set-image-fix-v34.js?v=20260829-1");
  expect(sw).toContain("/catalog-search-v32.js?v=20260829-2");
});
