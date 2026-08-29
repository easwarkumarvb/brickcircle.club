import { test, expect } from '@playwright/test';
import fs from 'node:fs';

test('image performance assets are wired into the PWA shell',()=>{
  const html=fs.readFileSync('v2.html','utf8');
  const sw=fs.readFileSync('catalogue-cache-sw.js','utf8');
  expect(html).toContain('/set-image-fix-v34.js?v=20260829-1');
  expect(html).toContain('/catalog-search-v32.js?v=20260829-2');
  expect(sw).toContain('/set-image-fix-v34.js?v=20260829-1');
  expect(sw).toContain('/catalog-search-v32.js?v=20260829-2');
});
