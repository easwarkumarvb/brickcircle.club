import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const read=(path:string)=>fs.readFileSync(path,'utf8');

test('@static zen UX replaces duplicate first-match coaching without touching data contracts',()=>{
  const html=read('v2.html');
  const zen=read('zen-ux-v1.js');

  expect(html).toContain('/zen-ux-v1.css?v=20260909-zen-ux-r1');
  expect(html).toContain('/zen-ux-v1.js?v=20260909-zen-ux-r1');
  expect(html).not.toContain('<script src="/phase-2f-first-match.js');

  expect(zen).toContain('Three things. That’s the whole idea.');
  expect(zen).toContain('BrickCircle finds the mutual match');
  expect(zen).toContain('Explore iconic sets');
  expect(zen).toContain('Start exchange');
  expect(zen).toContain('Offer for exchange');

  expect(zen).not.toContain('BC_SUPABASE');
  expect(zen).not.toContain('.from(');
  expect(zen).not.toContain('.rpc(');
});

test('@static zen visual hierarchy progressively discloses catalogue inspiration and match scoring',()=>{
  const css=read('zen-ux-v1.css');
  expect(css).toContain('.bc-zen-route-browse .bc-popular');
  expect(css).toContain('.bc-zen-discovery-open .bc-popular');
  expect(css).toContain('.bc-zen-route-matches .bc-match-top>.bc-pill');
  expect(css).toContain('.bc-zen-home-incomplete .bc-dashboard-grid');
  expect(css).toContain('@media(prefers-reduced-motion:reduce)');
});

test('@static zen audit records the simplified human workflow and safety scope',()=>{
  const audit=read('docs/UX_ZEN_AUDIT_2026-09-09.md');
  expect(audit).toContain('Match is a system outcome, not another task the user must learn.');
  expect(audit).toContain('No matching-engine changes.');
  expect(audit).toContain('No exchange-state-machine changes.');
});
