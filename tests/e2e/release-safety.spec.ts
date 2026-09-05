import {test,expect} from '@playwright/test';
import fs from 'node:fs';

const read=(file:string)=>fs.readFileSync(file,'utf8');
const manifest=JSON.parse(read('release-assets.json')) as {release:string,shell:string[]};

test('@static release source keeps the deployed HTML and service worker together',()=>{
  const html=read('v2.html');
  const sw=read('catalogue-cache-sw.js');
  expect(sw).toContain(`const RELEASE='${manifest.release}'`);
  expect(sw).toContain('const SHELL_CACHE=`brickcircle-shell-${RELEASE}`');
  for(const asset of manifest.shell){
    const canonical=/\.(?:css|js)$/.test(asset)?`${asset}?v=${manifest.release}`:asset;
    expect(sw,`${canonical} must be precached`).toContain(JSON.stringify(canonical));
    if(/\.(?:css|js)$/.test(asset))expect(html,`${asset} must use the release version`).toContain(canonical);
  }
  const localRuntime=[...html.matchAll(/(?:src|href)=["'](\/(?:[^"']+\.(?:js|css))(?:\?[^"']*)?)["']/g)].map(match=>match[1]);
  expect(localRuntime.length).toBeGreaterThan(0);
  for(const asset of localRuntime){
    expect(asset).toMatch(new RegExp(`\\?v=${manifest.release}$`));
    expect(manifest.shell).toContain(asset.replace(/\?v=.*$/,''));
  }
});

test('@static canonical entrypoint excludes known legacy application layers',()=>{
  const html=read('v2.html');
  expect(JSON.parse(read('vercel.json')).rewrites).toContainEqual({source:'/',destination:'/v2.html'});
  expect(html.match(/\/app-v3\.js\?v=/g)).toHaveLength(1);
  for(const legacy of ['v2prod.js','authfix.js','catalog-search-v32.js','home-stable.js','signout-switch-account.js']){
    expect(html).not.toContain(legacy);
  }
});

test('@static current destructive actions remain scoped to the signed-in owner',()=>{
  const app=read('app-v3.js');
  const collection=read('collection-remove-hotfix.js');
  const exchangeGuard=read('supabase/migrations/20260822_v23_single_active_exchange_lock.sql');
  expect(app).toContain("from('wishlists').delete().eq('id',existing.id).eq('user_id',S.user.id)");
  expect(app).toContain("from('collection_items').delete().eq('id',existing.id).eq('user_id',S.user.id)");
  expect(collection).toContain(".eq('user_id',user.id)");
  expect(exchangeGuard).toContain("raise exception 'One of these LEGO sets is already reserved in another active exchange'");
  expect(exchangeGuard).toContain("set available_for_exchange=false");
});

test('@static app-v3 owns the consolidated auth and onboarding runtime',()=>{
  const html=read('v2.html');
  const app=read('app-v3.js');
  expect(html).not.toContain('/v3-auth-onboarding-hotfix.js');
  expect(html).not.toContain('/join-entry-v33.js');
  expect(app).toContain("provider,options:{redirectTo:`${location.origin}/v2.html`,skipBrowserRedirect:true");
  expect(app).toContain("queryParams:{prompt:'select_account'}");
  expect(app).toContain('patch={id:user.id');
  expect(app).toContain("upsert(patch,{onConflict:'id'})");
  expect(app).toContain('window.BC_SUPABASE=db');
});
