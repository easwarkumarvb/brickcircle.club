import { test, expect } from '@playwright/test';
import fs from 'node:fs';

test('image performance assets are wired into the PWA shell',()=>{
  const html=fs.readFileSync('v2.html','utf8');
  const sw=fs.readFileSync('catalogue-cache-sw.js','utf8');
  expect(html).toContain('/set-image-fix-v34.js?v=20260902-phase1b');
  expect(html).toContain('/app-v3.js?v=20260902-phase1b');
  expect(html).not.toContain('/catalog-search-v32.js');
  expect(sw).toContain('/set-image-fix-v34.js?v=20260902-phase1b');
  expect(sw).toContain('/app-v3.js?v=20260902-phase1b');
  expect(sw).not.toContain('/catalog-search-v32.js');
});
