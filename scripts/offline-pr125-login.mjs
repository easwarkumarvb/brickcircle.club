import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { installTransport } from './hosted-pr125-browser.mjs';
import { STAGING_REF } from './validate-hosted-pr125.mjs';

// Trusted HTTP substitute, not a session injection or candidate SDK substitute.
export async function offlineLogin(browser, candidate, login, notifications) {
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}});
  const diagnostics={deniedSocket:0,deniedProduction:0,deniedExternal:0};
  const url=`https://${STAGING_REF}.supabase.co`;
  const email='offline@example.test',password='offline-password-only';
  const user={id:'00000000-0000-4000-8000-000000000101',email,role:'authenticated',aud:'authenticated',app_metadata:{provider:'email'},user_metadata:{},identities:[],created_at:'2026-10-05T12:00:00Z'};
  let attempts=0,accepted=false;
  try {
    await installTransport(context,{url,key:'offline'},candidate,diagnostics);
    await context.route(url+'/**',async route=>{
      const request=route.request(),target=new URL(request.url());
      let body=[];
      if(target.pathname==='/auth/v1/settings')body={external:{email:true,google:false}};
      else if(target.pathname==='/auth/v1/token'){
        attempts++;
        const credentials=request.postDataJSON();
        assert.ok(target.searchParams.get('grant_type')==='password' && credentials.email===email && credentials.password===password,'Offline password request must match fixture');
        accepted=true;
        body={access_token:'offline-access-token',refresh_token:'offline-refresh-token',token_type:'bearer',expires_in:3600,user};
      }else if(target.pathname==='/auth/v1/user')body=user;
      else if(target.pathname==='/rest/v1/profiles')body={id:user.id,email,display_name:'Offline collector',country:'India',city:'Bengaluru',adult_confirmed_at:user.created_at};
      else if(target.pathname.startsWith('/rest/v1/rpc/') && target.pathname!=='/rest/v1/rpc/find_matches')body={};
      await route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
    });
    await context.routeWebSocket('**/*',ws=>ws.close());
    const page=await context.newPage();
    await login(page,{email,password},()=>{},user.id);
    assert.equal(await page.locator('[data-open="notifications"]').count(),1);
    assert.equal(await page.locator('[data-open="notifications"]').isVisible(),false,'Reproduce original mobile visibility failure after successful Auth');
    await notifications(page,async()=>{
      assert.equal(await page.locator('[data-open="notifications"]').isVisible(),true);
      await page.locator('[data-open="notifications"]').click();
      await expect(page.locator('.bc-drawer-overlay').getByRole('heading',{name:'Notifications',exact:true})).toBeVisible();
      await page.locator('.bc-drawer-overlay [data-close]').click();
    });
    assert.deepEqual(page.viewportSize(),{width:390,height:844});
    assert.equal(accepted,true,'Real form must reach trusted password transport');
    assert.equal(attempts,1,'Exactly one password sign-in');
    assert.equal(diagnostics.deniedProduction,0);
    console.log('Offline real login form and pinned SDK passed; not hosted evidence.');
  } finally { await context.close(); }
}
