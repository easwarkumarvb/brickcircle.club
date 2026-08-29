import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const read=(path:string)=>fs.readFileSync(path,'utf8');

test('V3 loads product-name catalogue search',()=>{
  const html=read('v2.html');
  const js=read('catalog-search-v32.js');
  expect(html).toContain('/catalog-search-v32.js?v=20260829-1');
  expect(js).toContain("db.rpc('bc_search_lego_sets'");
  expect(js).toContain('e.g. McLaren, Ferrari, Saturn V');
  expect(js).toContain('＋ Add to My Sets');
  expect(js).toContain("db.from('collection_items').insert");
});

test('catalogue search RPC is token-aware and case-insensitive',()=>{
  const sql=read('supabase/migrations/20260829_catalog_product_name_search_v32.sql');
  expect(sql).toContain('lower(trim(coalesce(p_query');
  expect(sql).toContain('regexp_split_to_table');
  expect(sql).toContain("lower(coalesce(l.name,''))");
  expect(sql).toContain('grant execute on function public.bc_search_lego_sets');
});
