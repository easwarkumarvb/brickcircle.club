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

test('@static auth and onboarding reliability layer follows the canonical app',()=>{
  const html=read('v2.html');
  expect(html.indexOf('/v3-auth-onboarding-hotfix.js')).toBeGreaterThan(html.indexOf('/app-v3.js'));
  const auth=read('v3-auth-onboarding-hotfix.js');
  expect(auth).toContain("provider:'google'");
  expect(auth).toContain('skipBrowserRedirect:true');
  expect(auth).toContain("form.id!=='bc-onboard'");
  expect(auth).toContain('patch={id:user.id');
  expect(auth).toContain("upsert(patch,{onConflict:'id'})");
});
