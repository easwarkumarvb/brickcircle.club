import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const read=(path:string)=>fs.readFileSync(path,'utf8');

test('home has a single stable renderer',()=>{
  const html=read('v2.html');
  expect(html).toContain('/home-render-guard.js?v=20260829-stable1');
  expect(html).toContain('/home-stable-v30.js?v=20260829-stable1');
  expect(html).not.toContain('/home-v23.js');
  expect(html).not.toContain('/home-video.js');
  expect(html).not.toContain('/home-persistence-fix.js');
  expect(html).not.toContain('/beta-community.js');
});

test('stable home is idempotent and observer-free',()=>{
  const home=read('home-stable-v30.js');
  expect(home).toContain('data-bc-home-stable="1"');
  expect(home).toContain('if(existing){reveal();return true;}');
  expect(home).not.toContain('MutationObserver');
  expect(home).not.toContain('setInterval(');
});

test('legacy guard only targets the obsolete V2.1 home template',()=>{
  const guard=read('home-render-guard.js');
  expect(guard).toContain("text.includes('V2.1 · LIVE PRODUCTION')");
  expect(guard).toContain("text.includes('Your LEGO collection.')");
  expect(guard).toContain('isHome()&&stable&&isLegacyHome(value)');
});
