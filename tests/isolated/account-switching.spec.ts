import {test,expect} from './fixtures';
import type {Page} from '@playwright/test';
import fs from 'node:fs';

async function member(page:Page){
  await page.goto('/v2.html#profile');
  await expect(page.locator('[data-account-card]')).toContainText('collector@example.invalid');
  await expect.poll(()=>page.evaluate(()=>window.__bcIsolated.metrics.channelSubscriptions)).toBe(1);
  await page.evaluate(()=>{
    const w=window as any,s=w.__bcIsolated,db=w.BC_SUPABASE;
    s.accountA={id:s.profile.id,email:s.profile.email,created_at:s.profile.created_at,app_metadata:{provider:'email'}};
    s.accountB={...s.accountA,id:'00000000-0000-4000-8000-000000000008',email:'member-b@example.invalid'};
    s.current=s.accountA;s.logoutMode='success';s.logoutCalls=[];s.sessionReads=0;s.recoveries=0;
    db.auth.getSession=async()=>{s.sessionReads++;return {data:{session:{user:s.current}}}};
    db.auth.refreshSession=async()=>{s.recoveries++;return {data:{session:{user:s.accountA}}}};
    db.auth.getUser=async()=>({data:{user:s.loggedOut?null:s.current},error:null});
    db.auth.signOut=async(options:any)=>{
      s.logoutCalls.push(options);
      if(s.logoutMode==='error')return {error:{message:'Injected logout failure'}};
      if(s.logoutMode==='throw')throw new Error('Injected network failure');
      if(s.logoutMode==='slow')await new Promise<void>(resolve=>s.finishLogout=resolve);
      s.loggedOut=true;s.emitAuth('SIGNED_OUT',null);return {error:null};
    };
    db.auth.signInWithPassword=async(credentials:any)=>{
      s.loginCredentials=credentials;s.current=s.accountB;s.loggedOut=false;
      s.profile={...s.profile,id:s.accountB.id,email:s.accountB.email,display_name:'Member B'};
      s.collection=[];s.wishlist=[];s.notifications=[];
      const session={user:s.accountB};s.emitAuth('SIGNED_IN',session);return {data:{session},error:null};
    };
    // Deliberately hung ancillary cleanup cannot delay or authorize login.
    w.bcWebPush={consider(){},signOut:()=>new Promise(()=>{})};
  });
}

async function switchFromProfile(page:Page){await page.locator('[data-account-card] [data-switch-account]').click()}
async function blankEmail(page:Page){
  await expect(page.locator('#bc-email-signin')).toBeVisible();
  await expect(page.getByLabel('Email',{exact:true})).toHaveValue('');
  await expect(page.getByLabel('Password',{exact:true})).toHaveValue('');
  await expect(page.getByLabel('Email',{exact:true})).toBeFocused();
}

for(const width of [320,390,1280])test(`account controls and A → local logout → blank email → B at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:844});await member(page);
  const menu=page.getByLabel('Account menu');await expect(menu).toBeVisible();await expect(menu).toBeInViewport();
  await menu.click();await expect(page.locator('.bc-account-menu [data-signout-top]')).toBeVisible();
  await expect(page.locator('.bc-account-menu [data-switch-account]')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.locator('.bc-account-menu [data-switch-account]').click();await blankEmail(page);
  await expect(page.locator('.bc-landing-hero')).toBeVisible();
  expect(await page.evaluate(()=>window.__bcIsolated.logoutCalls)).toEqual([{scope:'local'}]);
  expect(await page.evaluate(()=>window.__bcIsolated.metrics.removedChannels)).toBeGreaterThan(0);
  await page.getByLabel('Email',{exact:true}).fill('member-b@example.invalid');
  await page.getByLabel('Password',{exact:true}).fill('injected-password');
  await page.locator('#bc-email-signin button[type="submit"]').click();
  await page.locator('[data-nav="profile"]').click();
  await expect(page.locator('[data-account-card]')).toContainText('member-b@example.invalid');
  await expect(page.locator('#bc-main')).toContainText('Member B');
  expect(await page.evaluate(()=>window.__bcIsolated.loginCredentials.email)).toBe('member-b@example.invalid');
});

test('plain sign out routes home without offering new login',async({page})=>{
  await member(page);await page.locator('[data-account-card] [data-signout]').click();
  await expect(page).toHaveURL(/#home$/);await expect(page.locator('.bc-landing-hero')).toBeVisible();
  await expect(page.locator('#bc-email-signin')).toHaveCount(0);
  expect(await page.evaluate(()=>window.__bcIsolated.logoutCalls)).toEqual([{scope:'local'}]);
});

test('intentional password login to the original email remains possible after switching',async({page})=>{
  await member(page);await switchFromProfile(page);await blankEmail(page);
  await page.evaluate(()=>{
    const w=window as any,s=w.__bcIsolated;
    w.BC_SUPABASE.auth.signInWithPassword=async()=>{s.loggedOut=false;s.current=s.accountA;const session={user:s.accountA};s.emitAuth('SIGNED_IN',session);return {data:{session},error:null}};
  });
  await page.getByLabel('Email',{exact:true}).fill('collector@example.invalid');await page.getByLabel('Password',{exact:true}).fill('injected-password');await page.locator('#bc-email-signin button[type="submit"]').click();
  await page.locator('[data-nav="profile"]').click();await expect(page.locator('[data-account-card]')).toContainText('collector@example.invalid');
});

for(const mode of ['error','throw'])test(`${mode} logout stays locked and only explicit local retry succeeds`,async({page})=>{
  await member(page);await page.evaluate(mode=>window.__bcIsolated.logoutMode=mode,mode);
  await switchFromProfile(page);await expect(page.locator('#bc-logout-status')).toContainText('not confirmed');
  await page.keyboard.press('Escape');await expect(page.locator('#bc-logout-status')).toBeVisible();
  await expect(page.locator('#bc-email-signin')).toHaveCount(0);
  expect(await page.locator('#bc-root').evaluate(el=>(el as HTMLElement).inert)).toBe(true);
  await page.evaluate(()=>{const w=window as any;w.__bcIsolated.emitAuth('TOKEN_REFRESHED',{user:w.__bcIsolated.accountA});w.dispatchEvent(new Event('focus'));w.bcAuth();w.bcV3Refresh()});
  await expect(page.locator('#bc-email-signin')).toHaveCount(0);
  await page.evaluate(()=>window.__bcIsolated.logoutMode='success');await page.locator('#bc-logout-retry').click();await blankEmail(page);
  expect(await page.evaluate(()=>window.__bcIsolated.logoutCalls)).toEqual([{scope:'local'},{scope:'local'}]);
});

test('an earlier password-login completion cannot reopen the retired account',async({page})=>{
  await member(page);await switchFromProfile(page);await blankEmail(page);
  await page.evaluate(()=>{const w=window as any,s=w.__bcIsolated;w.BC_SUPABASE.auth.signInWithPassword=()=>new Promise(resolve=>s.releaseLogin=()=>resolve({data:{session:{user:s.accountA}},error:null}))});
  await page.getByLabel('Email',{exact:true}).fill('collector@example.invalid');await page.getByLabel('Password',{exact:true}).fill('injected-password');await page.locator('#bc-email-signin button[type="submit"]').click();
  await page.evaluate(()=>(window as any).bcSwitchAccount());await blankEmail(page);
  await page.evaluate(()=>window.__bcIsolated.releaseLogin());
  await expect(page.locator('[data-nav="profile"]')).toHaveCount(0);await expect(page.locator('#bc-email-signin')).toBeVisible();
});

test('slow logout times out honestly; duplicates and late success cannot unlock login',async({page})=>{
  await member(page);await page.clock.install();await page.evaluate(()=>window.__bcIsolated.logoutMode='slow');
  await switchFromProfile(page);
  await page.evaluate(()=>{const w=window as any;w.bcSwitchAccount();w.bcSignOut();w.dispatchEvent(new Event('focus'))});
  await page.clock.fastForward(10_100);
  await expect(page.locator('#bc-logout-status')).toContainText('not confirmed');
  await page.locator('#bc-logout-retry').click();
  expect(await page.evaluate(()=>window.__bcIsolated.logoutCalls)).toHaveLength(1);
  await page.evaluate(()=>window.__bcIsolated.finishLogout());await page.clock.fastForward(1000);
  await expect(page.locator('#bc-email-signin')).toHaveCount(0);
  await page.evaluate(()=>window.__bcIsolated.logoutMode='success');await page.locator('#bc-logout-retry').click();await blankEmail(page);
  expect(await page.evaluate(()=>window.__bcIsolated.logoutCalls)).toEqual([{scope:'local'},{scope:'local'}]);
});

test('scheduled resume recovery and delayed signed-in worker cannot resurrect A',async({page})=>{
  await member(page);await page.clock.install();
  await page.evaluate(()=>{const w=window as any;w.dispatchEvent(new Event('focus'));w.__bcIsolated.emitAuth('SIGNED_OUT',null)});
  await switchFromProfile(page);await blankEmail(page);
  await page.evaluate(()=>{const s=window.__bcIsolated;s.emitAuth('SIGNED_IN',{user:s.accountA});s.emitAuth('TOKEN_REFRESHED',{user:s.accountA});window.dispatchEvent(new Event('focus'))});
  await page.clock.fastForward(2000);
  await expect(page.locator('#bc-email-signin')).toBeVisible();await expect(page.locator('[data-nav="profile"]')).toHaveCount(0);
  expect(await page.evaluate(()=>window.__bcIsolated.recoveries)).toBe(0);
  expect(await page.evaluate(()=>window.__bcIsolated.sessionReads)).toBe(1); // focus before logout only
});

test('old profile reads and an already-awaiting SIGNED_IN worker are suppressed after switching',async({page})=>{
  await member(page);
  await page.evaluate(()=>{
    const w=window as any,s=w.__bcIsolated,db=w.BC_SUPABASE,from=db.from.bind(db),rpc=db.rpc.bind(db),old={...s.profile,display_name:'STALE PRIVATE A'};
    db.from=(table:string)=>{const q=from(table);if(table==='profiles'&&s.holdReads)q.maybeSingle=()=>new Promise(resolve=>s.releaseOldRead=()=>resolve({data:old,error:null}));return q};
    s.holdReads=true;w.bcV3Refresh();
    db.rpc=(name:string,args:any)=>name==='bc_record_auth_provider'&&s.holdWorker?new Promise(resolve=>s.releaseWorker=()=>resolve({data:true,error:null})):rpc(name,args);
    s.holdWorker=true;s.emitAuth('SIGNED_IN',{user:s.accountA});
  });
  await expect.poll(()=>page.evaluate(()=>!!window.__bcIsolated.releaseOldRead&&!!window.__bcIsolated.releaseWorker)).toBe(true);
  await switchFromProfile(page);await blankEmail(page);
  await page.evaluate(()=>{const s=window.__bcIsolated;s.holdReads=false;s.holdWorker=false});
  await page.getByLabel('Email',{exact:true}).fill('member-b@example.invalid');await page.getByLabel('Password',{exact:true}).fill('injected-password');await page.locator('#bc-email-signin button[type="submit"]').click();
  await page.locator('[data-nav="profile"]').click();await expect(page.locator('[data-account-card]')).toContainText('member-b@example.invalid');
  await page.evaluate(()=>{const s=window.__bcIsolated;s.releaseOldRead();s.releaseWorker();s.emitAuth('TOKEN_REFRESHED',{user:s.accountA})});
  await expect(page.locator('#bc-main')).not.toContainText('STALE PRIVATE A');await expect(page.locator('[data-account-card]')).toContainText('member-b@example.invalid');
});

const mock=fs.readFileSync('tests/isolated/fixtures/supabase-browser-mock.js','utf8');
async function admin(page:Page,mode='success'){
  await page.route('https://cdn.jsdelivr.net/**',route=>route.fulfill({contentType:'application/javascript',body:mock+`
    const db=window.supabase.createClient(),s=window.__bcIsolated;
    if(location.pathname==='/admin.html'){
      db.auth.getSession=async()=>({data:{session:{access_token:'injected-token',user:{id:s.profile.id}}}});
      db.auth.signOut=async options=>{s.logoutCalls=(s.logoutCalls||[]).concat([options]);if('${mode}'==='error')return {error:{message:'Injected failure'}};await new Promise(resolve=>s.finishLogout=resolve);sessionStorage.setItem('isolated-logged-out','1');s.emitAuth('SIGNED_OUT',null);return {error:null}};
    }else if(sessionStorage.getItem('isolated-logged-out'))s.setSignedOut(true);
  `}));
  await page.route('**/functions/v1/admin-dashboard',route=>route.fulfill({status:403,json:{error:'Administrator access required.'}}));
  await page.goto('/admin.html');await expect(page.locator('#status')).toContainText('Administrator access required');
}

test('admin-denied switch purges immediately and waits for local logout before same-origin email auth',async({page})=>{
  await page.setViewportSize({width:390,height:844});await admin(page);
  await expect(page.getByRole('button',{name:'Use another account'})).toBeVisible();
  await page.locator('#switch-account').click();
  await expect(page.locator('#results')).toBeEmpty();await expect(page.locator('#dashboard')).toBeHidden();await expect(page).toHaveURL(/admin.html$/);
  expect(await page.evaluate(()=>window.__bcIsolated.logoutCalls)).toEqual([{scope:'local'}]);
  await page.evaluate(()=>window.__bcIsolated.finishLogout());await expect(page).toHaveURL(/\/#home$/);await blankEmail(page);
  expect(new URL(page.url()).search).toBe('');
});

test('admin failed switch stays purged and cannot navigate to new login',async({page})=>{
  await admin(page,'error');await page.locator('#switch-account').click();
  await expect(page.locator('#status')).toContainText('not confirmed');await expect(page.locator('#results')).toBeEmpty();await expect(page.locator('#dashboard')).toBeHidden();
  await page.evaluate(()=>{window.__bcIsolated.emitAuth('TOKEN_REFRESHED',{user:{id:'old-account'}});document.dispatchEvent(new Event('visibilitychange'))});
  await expect(page.locator('#marketplace-signin')).toBeHidden();await expect(page).toHaveURL(/admin.html$/);
  expect(await page.evaluate(()=>window.__bcIsolated.logoutCalls)).toEqual([{scope:'local'}]);
});
