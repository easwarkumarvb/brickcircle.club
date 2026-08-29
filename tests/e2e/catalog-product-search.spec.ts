import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const read=(path:string)=>fs.readFileSync(path,'utf8');

test('V3 owns one cancellable product-name catalogue pipeline',()=>{
  const html=read('v2.html');
  const js=read('app-v3.js');
  expect(html).toContain('/app-v3.js?v=20260829-catalogue-v4');
  expect(html).not.toContain('/catalog-search-v32.js');
  expect(js).toContain("db.rpc('bc_search_lego_sets'");
  expect(js).toContain('e.g. McLaren, Ferrari, Saturn V');
  expect(js).toContain('catalogueController?.abort()');
  expect(js).toContain('req.abortSignal(controller.signal)');
  expect(js).toContain('CATALOGUE_TIMEOUT_MS=8000');
  expect(js).toContain('id="bc-cat-retry"');
  expect(js).not.toContain('if(S.browse.busy)return');
});

test('catalogue images normalize suffixed LEGO set numbers and prioritize the first viewport',()=>{
  const html=read('v2.html');
  const js=read('app-v3.js');
  const imageGuard=read('set-image-fix-v34.js');
  const sw=read('catalogue-cache-sw.js');

  expect(js).toContain("/-\\d+$/.test(String(set||''))");
  expect(js).toContain('S.browse.rows.map(setCard)');
  expect(js).toContain('index<6');
  expect(js).toContain('fetchpriority="high"');
  expect(js).toContain('images.weserv.nl');
  expect(js).not.toContain('encodeURIComponent(set)}-1.jpg');

  expect(html).toContain('rel="preconnect" href="https://images.brickset.com"');
  expect(html).toContain('/set-image-fix-v34.js?v=20260829-1');
  expect(html.indexOf('/set-image-fix-v34.js')).toBeLessThan(html.indexOf('/app-v3.js'));
  expect(imageGuard).toContain("img[data-set-image]");
  expect(imageGuard).toContain("fetchPriority='high'");

  expect(sw).toContain("const IMAGE_CACHE='brickcircle-set-images-v1'");
  expect(sw).toContain("url.hostname==='images.brickset.com'");
  expect(sw).toContain("url.hostname==='images.weserv.nl'");
  expect(sw).toContain("response.type==='opaque'");
  expect(sw).toContain('fetchWithTimeout(request)');
});

test('catalogue search RPC is token-aware and case-insensitive',()=>{
  const sql=read('supabase/migrations/20260829_catalog_product_name_search_v32.sql');
  expect(sql).toContain('lower(trim(coalesce(p_query');
  expect(sql).toContain('regexp_split_to_table');
  expect(sql).toContain("lower(coalesce(l.name,''))");
  expect(sql).toContain('grant execute on function public.bc_search_lego_sets');
});
