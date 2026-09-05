import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const read=(path:string)=>fs.readFileSync(path,'utf8');

test('public Join free links use the explicit join intent',()=>{
  const html=read('index.html');
  expect(html).toContain('href="/v2.html?join=1"');
});

test('join entry has one canonical runtime owner',()=>{
  const html=read('v2.html');
  expect(html.match(/\/app-v3\.js\?v=/g)).toHaveLength(1);
  expect(html).not.toContain('/join-entry-v33.js');
  expect(html).not.toContain('/v3-auth-onboarding-hotfix.js');
});

test('join entry opens auth without waiting for remote hydration',()=>{
  const js=read('app-v3.js');
  expect(js).toContain("function parseJoinIntent(){return new URLSearchParams(location.search).get('join')==='1'}");
  expect(js).toContain("if(parseJoinIntent()){showAuth();clearQueryParam('join')}");
  expect(js).toContain("event.target.closest?.('[data-auth]')");
  expect(js).not.toContain('setInterval(');
});

test('PWA cache includes the canonical app and current image assets',()=>{
  const sw=read('catalogue-cache-sw.js');
  expect(sw).toContain("brickcircle-shell-${RELEASE}");
  expect(sw).not.toContain('/join-entry-v33.js');
  expect(sw).not.toContain('/v3-auth-onboarding-hotfix.js');
  expect(sw).toContain('/set-image-fix-v34.js?v=20260905-phase2b');
  expect(sw).toContain('/app-v3.js?v=20260905-phase2b');
  expect(sw).not.toContain("/catalog-search-v32.js");
});
