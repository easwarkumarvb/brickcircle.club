import { test, expect } from '@playwright/test';
import fs from 'node:fs';

test('image performance is owned by the canonical app and wired into the PWA shell',()=>{
  const html=fs.readFileSync('v2.html','utf8');
  const sw=fs.readFileSync('catalogue-cache-sw.js','utf8');
  const release=JSON.parse(fs.readFileSync('release-assets.json','utf8')).release;
  expect(html).not.toContain('/set-image-fix-v34.js');
  expect(html).toContain(`/app-v3.js?v=${release}`);
  expect(html).not.toContain('/catalog-search-v32.js');
  expect(sw).not.toContain('/set-image-fix-v34.js');
  expect(sw).toContain(`/app-v3.js?v=${release}`);
  expect(sw).not.toContain('/catalog-search-v32.js');
});
