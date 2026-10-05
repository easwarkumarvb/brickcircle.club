import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=(path:string)=>fs.readFileSync(path,'utf8');
const release=JSON.parse(read('release-assets.json')).release;

test('V3 opens on one curated iconic 100-set catalogue and searches the full catalogue',()=>{
  const html=read('v2.html');
  const js=read('app-v3.js');
  expect(html).toContain(`/app-v3.js?v=${release}`);
  expect(html).not.toContain('/catalog-search-v32.js');

  const block=js.slice(js.indexOf('const CATALOGUE_SEARCH_LIMIT='),js.indexOf('const OWNER_USER_ID='));
  const categories=runInNewContext(block+';JSON.parse(JSON.stringify(CURATED_CATEGORIES))',{}, {timeout:1000});
  const iconicIds=categories[0].sets;
  expect(iconicIds).toHaveLength(100);
  expect(new Set(iconicIds).size).toBe(100);
  expect(categories.map((c:any)=>c.label)).toEqual(['All favourites','Technic','Supercars','F1','Space','Engineering','Landmarks','City','Friends','Icons','Star Wars','Disney']);
  for(const category of categories.slice(1)){
    expect(category.sets.length).toBeGreaterThan(0);
    expect(new Set(category.sets).size).toBe(category.sets.length);
    for(const id of category.sets)expect(id).toMatch(/^[0-9]{5}-1$/);
  }

  expect(js).toContain('<h1>100 iconic LEGO sets</h1>');
  expect(js).toContain('product code or keywords');
  expect(js).toContain(".in('set_number',activeCategory.sets)");
  expect(js).toContain('const iconicRank=new Map(activeCategory.sets.map');
  expect(js).not.toContain('CATALOGUE_PAGE_SIZE=24');
  expect(js).not.toContain('<div class="bc-pager">');
  expect(js).not.toContain('id="bc-theme"');
  expect(js).not.toContain('id="bc-year"');

  expect(js).toContain("db.rpc('bc_search_lego_sets'");
  expect(js).toContain("p_query:snapshot.q,p_theme:null,p_year:null,p_limit:CATALOGUE_SEARCH_LIMIT");
  expect(js).toContain('CATALOGUE_SEARCH_LIMIT=100');
  expect(js).toContain('across the full catalogue');
  expect(js).toContain('catalogueController?.abort()');
  expect(js).toContain('req.abortSignal(controller.signal)');
  expect(js).toContain('CATALOGUE_TIMEOUT_MS=8000');
  expect(js).toContain('id="bc-cat-retry"');
  expect(js).toContain('wireImages(grid);bindSetActions(grid);');
  expect(js).not.toContain('if(S.browse.busy)return');
});

test('catalogue images normalize suffixed LEGO set numbers and prioritize the first viewport',()=>{
  const html=read('v2.html');
  const js=read('app-v3.js');
  const sw=read('catalogue-cache-sw.js');

  expect(js).toContain("/-\\d+$/.test(String(set||''))");
  expect(js).toContain('S.browse.rows.map(setCard)');
  expect(js).toContain('index<6');
  expect(js).toContain('fetchpriority="high"');
  expect(js).toContain('images.weserv.nl');
  expect(js).not.toContain('encodeURIComponent(set)}-1.jpg');

  expect(html).toContain('rel="preconnect" href="https://images.brickset.com"');
  expect(html).not.toContain('/set-image-fix-v34.js');
  expect(js).toContain("img[data-set-image]");
  expect(js).toContain('fetchpriority="high"');

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

test('duplicate cleanup preserves a model title that is the only complete text match',()=>{
  const sql=read('supabase/migrations/20260830_catalog_text_search_model_names_v35.sql');
  expect(sql).toContain("lx.set_number=l.set_number || '-1'");
  expect(sql).toContain("regexp_split_to_table(p.q, '\\s+') duplicate_token");
  expect(sql).toContain("lower(coalesce(lx.name,''))");
  expect(sql).toContain('security invoker');
});
