import {test as base, expect} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const mock=fs.readFileSync(path.resolve('tests/isolated/fixtures/supabase-browser-mock.js'),'utf8');

export const test=base.extend({
  page:async({page},use)=>{
    await page.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.hostname==='cdn.jsdelivr.net'&&url.pathname.includes('@supabase/supabase-js'))return route.fulfill({status:200,contentType:'application/javascript',body:mock});
      if(url.hostname==='127.0.0.1'||url.hostname==='localhost')return route.continue();
      return route.abort('blockedbyclient');
    });
    await use(page);
  }
});
export {expect};
