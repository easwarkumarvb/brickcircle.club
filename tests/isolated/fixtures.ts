import {test as base, expect} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {isIsolatedTransport} from '../../scripts/ux-transport.mjs';

const mock=fs.readFileSync(path.resolve('tests/isolated/fixtures/supabase-browser-mock.js'),'utf8');

export const test=base.extend({
  browser:[async({browser},use)=>{
    // Cover manually created A/B/C contexts as well as Playwright's default page.
    const origin=`http://127.0.0.1:${process.env.BC_UX_PORT||process.env.BC_ISOLATED_PORT||4173}`;
    const guarded=new Proxy(browser,{get(target,key){
      if(key==='newContext')return async(options:any)=>{
        const context=await target.newContext(options);
        await context.route('**/*',route=>{
          return isIsolatedTransport(route.request().url(),origin)?route.continue():route.abort('blockedbyclient');
        });
        await context.routeWebSocket('**/*',socket=>socket.close());
        return context;
      };
      const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
    }});
    await use(guarded);
  },{scope:'worker'}],
  page:async({page},use)=>{
    await page.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.hostname==='cdn.jsdelivr.net'&&url.pathname.includes('@supabase/supabase-js'))return route.fulfill({status:200,contentType:'application/javascript',body:mock});
      if(isIsolatedTransport(url.href,`http://127.0.0.1:${process.env.BC_UX_PORT||process.env.BC_ISOLATED_PORT||4173}`))return route.continue();
      return route.abort('blockedbyclient');
    });
    await use(page);
  }
});
export {expect};
