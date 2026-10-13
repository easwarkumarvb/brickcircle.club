import {test,expect} from './fixtures';
import type {Page} from '@playwright/test';
import fs from 'node:fs';

async function member(page:Page,mode=''){
  await page.goto(`/v2.html${mode?'?isolated='+mode:''}#profile`);
  await expect(page.locator('[data-account-card]')).toContainText('collector@example.invalid');
  await expect.poll(()=>page.evaluate(()=>window.__bcIsolated.metrics.channelSubscriptions)).toBe(1);
  await page.evaluate(()=>{
    const w=window as any,s=w.__bcIsolated,db=w.BC_SUPABASE;
    s.accountA={id:s.profile.id,email:s.profile.email,created_at:s.profile.created_at,app_metadata:{provider:'email'}};
    s.accountB={...s.accountA,id:'00000000-0000-4000-8000-000000000008',email:'member-b@example.invalid'};
    s.current=s.accountA;s.logoutMode='success';s.logoutCalls=[];s.sessionReads=0;s.recoveries=0;
    db.auth.getSession=async()=>{s.sessionReads++;return {data:{session:s.loggedOut?null:{user:s.current}}}};
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

test('delayed password SDK session overwrite settles before the final local logout and B login',async({page})=>{
  await member(page);await switchFromProfile(page);await blankEmail(page);
  await page.evaluate(()=>{const w=window as any,s=w.__bcIsolated,auth=w.BC_SUPABASE.auth,login=auth.signInWithPassword;s.sdkOrder=[];auth.signInWithPassword=()=>new Promise(resolve=>s.releaseLogin=()=>{s.current=s.accountA;s.loggedOut=false;s.sdkOrder.push('save:A');s.emitAuth('SIGNED_IN',{user:s.accountA});auth.signInWithPassword=login;resolve({data:{session:{user:s.accountA}},error:null})});const logout=auth.signOut;auth.signOut=async(options:any)=>{s.sdkOrder.push('logout:local');return logout(options)}});
  await page.getByLabel('Email',{exact:true}).fill('collector@example.invalid');await page.getByLabel('Password',{exact:true}).fill('injected-password');await page.locator('#bc-email-signin button[type="submit"]').click();
  await page.evaluate(()=>{(window as any).bcSwitchAccount()});await expect(page.locator('#bc-logout-status')).toContainText('Confirming');
  expect(await page.evaluate(()=>window.__bcIsolated.logoutCalls)).toHaveLength(1);
  await expect(page.locator('#bc-email-signin')).toHaveCount(0);
  await page.evaluate(()=>window.__bcIsolated.releaseLogin());
  await blankEmail(page);expect(await page.evaluate(()=>window.__bcIsolated.sdkOrder)).toEqual(['save:A','logout:local']);
  expect(await page.evaluate(()=>window.__bcIsolated.loggedOut)).toBe(true);
  await page.getByLabel('Email',{exact:true}).fill('member-b@example.invalid');await page.getByLabel('Password',{exact:true}).fill('injected-password');await page.locator('#bc-email-signin button[type="submit"]').click();await page.locator('[data-nav="profile"]').click();
  await page.evaluate(()=>{const w=window as any;w.dispatchEvent(new Event('focus'));w.bcV3Refresh()});
  await expect(page.locator('[data-account-card]')).toContainText('member-b@example.invalid');expect(await page.evaluate(()=>window.__bcIsolated.current.email)).toBe('member-b@example.invalid');
});

test('stale signup completion and its auth events cannot replace the lock or resurrect C after B',async({page})=>{
  await member(page);await switchFromProfile(page);await blankEmail(page);
  await page.evaluate(()=>{const w=window as any,s=w.__bcIsolated;s.accountC={...s.accountA,id:'00000000-0000-4000-8000-000000000009'};s.sdkOrder=[];w.BC_SUPABASE.auth.signUp=()=>new Promise(resolve=>s.releaseSignup=()=>{const session={user:s.accountC};s.current=s.accountC;s.loggedOut=false;s.sdkOrder.push('save:C');s.emitAuth('SIGNED_IN',session);resolve({data:{session},error:null})});const logout=w.BC_SUPABASE.auth.signOut;w.BC_SUPABASE.auth.signOut=async(options:any)=>{s.sdkOrder.push('logout:local');return logout(options)}});
  await page.locator('[data-auth-tab="signup"]').click();const form=page.locator('#bc-email-signup');
  await form.getByLabel('Collector name',{exact:true}).fill('Injected C');await form.getByLabel('Email',{exact:true}).fill('member-c@example.invalid');await form.getByLabel('Password',{exact:true}).fill('injected-password');await form.locator('[name="adult_confirmation"]').check();await form.locator('button[type="submit"]').click();
  await page.evaluate(()=>{const w=window as any;w.__bcIsolated.logoutMode='error';w.bcSwitchAccount()});await expect(page.locator('#bc-logout-status')).toContainText('Confirming');expect(await page.evaluate(()=>window.__bcIsolated.logoutCalls)).toHaveLength(1);
  await page.evaluate(()=>window.__bcIsolated.releaseSignup());
  await expect(page.locator('#bc-logout-status')).toContainText('not confirmed');expect(await page.evaluate(()=>window.__bcIsolated.sdkOrder)).toEqual(['save:C','logout:local']);
  await expect(page.locator('#bc-overlay')).toHaveCount(1);await expect(page.locator('#bc-logout-status')).toBeVisible();await expect(page.locator('#bc-email-signup')).toHaveCount(0);
  await page.evaluate(()=>window.__bcIsolated.logoutMode='success');await page.locator('#bc-logout-retry').click();await blankEmail(page);
  await page.getByLabel('Email',{exact:true}).fill('member-b@example.invalid');await page.getByLabel('Password',{exact:true}).fill('injected-password');await page.locator('#bc-email-signin button[type="submit"]').click();await page.locator('[data-nav="profile"]').click();
  await page.evaluate(()=>{const s=window.__bcIsolated;s.emitAuth('SIGNED_IN',{user:s.accountC});s.emitAuth('TOKEN_REFRESHED',{user:s.accountA})});
  await page.evaluate(()=>{const w=window as any;w.dispatchEvent(new Event('focus'));w.bcV3Refresh()});
  await expect(page.locator('[data-account-card]')).toContainText('member-b@example.invalid');expect(await page.evaluate(()=>window.__bcIsolated.current.email)).toBe('member-b@example.invalid');
});

for(const action of ['oauth','reset','recovery'])test(`stale ${action} completion cannot close or redirect the new email modal`,async({page})=>{
  await member(page);
  await page.evaluate(action=>{
    const w=window as any,s=w.__bcIsolated,auth=w.BC_SUPABASE.auth;
    if(action==='recovery'){auth.updateUser=()=>new Promise(resolve=>s.releaseAction=()=>resolve({error:null}));s.emitAuth('PASSWORD_RECOVERY',{user:s.accountA})}
    else{w.bcAuth();auth[action==='oauth'?'signInWithOAuth':'resetPasswordForEmail']=()=>new Promise(resolve=>s.releaseAction=()=>resolve({data:{url:location.origin+'/should-not-navigate'},error:null}))}
  },action);
  if(action==='oauth')await page.locator('[data-oauth="google"]').click();
  else if(action==='reset'){page.once('dialog',dialog=>dialog.accept('injected@example.invalid'));await page.getByRole('button',{name:'Forgot password?'}).click()}
  else{await expect(page.locator('#bc-password-recovery')).toBeVisible();await page.locator('#bc-password-recovery [name="password"]').fill('injected-password');await page.locator('#bc-password-recovery [name="confirm"]').fill('injected-password');await page.locator('#bc-password-recovery button[type="submit"]').click()}
  await page.evaluate(()=>{(window as any).bcSwitchAccount()});await expect(page.locator('#bc-logout-status')).toContainText('Confirming');
  await page.evaluate(()=>window.__bcIsolated.releaseAction());await blankEmail(page);await expect(page).toHaveURL(/#home$/);await expect(page.locator('#bc-password-recovery')).toHaveCount(0);
});

for(const mode of ['error','success'])test(`delayed private proposal and captured drawer/modal actions cannot replace logout UI (${mode})`,async({page})=>{
  await member(page,'matched');
  await page.evaluate(()=>{
    const w=window as any,s=w.__bcIsolated,db=w.BC_SUPABASE,rpc=db.rpc.bind(db);
    s.oldModal=document.querySelector<HTMLElement>('[data-edit-profile]')!.onclick;s.oldDrawer=document.querySelector<HTMLElement>('[data-open="notifications"]')!.onclick;
    db.rpc=(name:string,args:any)=>name==='exchange_peer_reputation_summary'?Promise.resolve({data:null,error:null}):rpc(name,args);
  });
  await page.locator('[data-nav="matches"]').first().click();await expect(page.locator('[data-propose]')).toBeVisible();
  await page.locator('[data-propose]').click();await expect(page.locator('#bc-inline-proposal')).toBeVisible();
  await page.evaluate(()=>{const w=window as any,s=w.__bcIsolated,db=w.BC_SUPABASE,rpc=db.rpc.bind(db);db.rpc=(name:string,args:any)=>name==='create_exchange_case'?new Promise(resolve=>s.releaseProposal=()=>rpc(name,args).then(resolve)):rpc(name,args)});
  await page.locator('#bc-inline-proposal').getByRole('button',{name:'Send proposal'}).click();
  await expect.poll(()=>page.evaluate(()=>!!window.__bcIsolated.releaseProposal)).toBe(true);
  const thread=await page.evaluate(()=>decodeURIComponent(location.hash));
  await page.evaluate(mode=>{const w=window as any;w.__bcIsolated.logoutMode=mode;w.bcSwitchAccount()},mode);
  if(mode==='error'){
    await expect(page.locator('#bc-logout-status')).toContainText('not confirmed');
    await page.evaluate(()=>{const s=window.__bcIsolated;s.oldModal();s.oldDrawer();s.releaseProposal()});
    await expect(page.locator('#bc-overlay')).toHaveCount(1);await expect(page.locator('#bc-logout-status')).toBeVisible();await expect(page.locator('#bc-profile-form,#bc-inline-proposal,#bc-drawer-overlay')).toHaveCount(0);
    await expect.poll(()=>page.evaluate(()=>decodeURIComponent(location.hash))).toBe(thread);
  }else{await blankEmail(page);await page.evaluate(()=>window.__bcIsolated.releaseProposal());await expect(page.locator('#bc-inline-proposal')).toHaveCount(0);await expect(page.locator('#bc-email-signin')).toBeVisible();await expect(page).toHaveURL(/#home$/)}
});

const pushSource=fs.readFileSync('web-push-v1.js','utf8');
async function injectPush(page:Page,defer=false){
  await page.evaluate(defer=>{
    const w=window as any,s=w.__bcIsolated;s.unsubscribes=0;w.PushManager=function(){};
    Object.defineProperty(w,'Notification',{configurable:true,value:{permission:'default'}});
    const subscription={unsubscribe:async()=>{s.unsubscribes++;return true}};
    Object.defineProperty(navigator,'serviceWorker',{configurable:true,value:{getRegistration:async()=>({pushManager:{getSubscription:()=>defer?new Promise(resolve=>s.releaseSubscription=()=>resolve(subscription)):Promise.resolve(subscription)}})}});
  },defer);
  await page.addScriptTag({content:pushSource});
}
test('old automatic push prompt is paused and local unsubscribe never waits for post-logout RLS deletion',async({page})=>{
  await member(page);await page.clock.install();await injectPush(page);
  await page.evaluate(()=>{const w=window as any;w.bcWebPush.consider(w.__bcIsolated.accountA,{meaningful:true});w.__bcIsolated.logoutMode='error'});
  await switchFromProfile(page);await page.clock.fastForward(2000);await expect(page.locator('.bc-push-prompt')).toHaveCount(0);
  await page.evaluate(()=>window.__bcIsolated.logoutMode='success');await page.locator('#bc-logout-retry').click();await blankEmail(page);
  await expect.poll(()=>page.evaluate(()=>window.__bcIsolated.unsubscribes)).toBe(1);
  expect(await page.evaluate(()=>window.__bcIsolated.queries.filter((q:any)=>q.table==='push_subscriptions'&&q.mode==='delete'))).toEqual([]);
});
test('delayed old browser subscription lookup cannot unsubscribe after the new account signs in',async({page})=>{
  await member(page);await injectPush(page,true);await switchFromProfile(page);await blankEmail(page);
  await expect.poll(()=>page.evaluate(()=>!!window.__bcIsolated.releaseSubscription)).toBe(true);
  await page.getByLabel('Email',{exact:true}).fill('member-b@example.invalid');await page.getByLabel('Password',{exact:true}).fill('injected-password');await page.locator('#bc-email-signin button[type="submit"]').click();await page.locator('[data-nav="profile"]').click();
  await page.evaluate(()=>window.__bcIsolated.releaseSubscription());expect(await page.evaluate(()=>window.__bcIsolated.unsubscribes)).toBe(0);
  await expect(page.locator('[data-account-card]')).toContainText('member-b@example.invalid');
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

for(const kind of ['signin','signup'])test(`pending ${kind} SDK storage write times out locked; only settled-write + explicit final logout admits B`,async({page})=>{
  await member(page);await page.clock.install();
  await page.evaluate(kind=>{const w=window as any,s=w.__bcIsolated,auth=w.BC_SUPABASE.auth,method=kind==='signin'?'signInWithPassword':'signUp',original=auth[method];w.bcAuth();auth[method]=()=>new Promise(resolve=>s.releaseSdkWrite=()=>{s.current=s.accountA;s.loggedOut=false;auth[method]=original;s.emitAuth('SIGNED_IN',{user:s.accountA});resolve({data:{session:{user:s.accountA}},error:null})})},kind);
  if(kind==='signup')await page.locator('[data-auth-tab="signup"]').click();
  const form=page.locator(`#bc-email-${kind}`);if(kind==='signup'){await form.getByLabel('Collector name',{exact:true}).fill('Injected A');await form.locator('[name="adult_confirmation"]').check()}
  await form.getByLabel('Email',{exact:true}).fill('collector@example.invalid');await form.getByLabel('Password',{exact:true}).fill('injected-password');await form.locator('button[type="submit"]').click();
  await page.evaluate(()=>{(window as any).bcSwitchAccount()});await page.clock.fastForward(10_100);
  await expect(page.locator('#bc-logout-status')).toContainText('not confirmed');await expect(page.locator('#bc-email-signin')).toHaveCount(0);
  await page.locator('#bc-logout-retry').click();expect(await page.evaluate(()=>window.__bcIsolated.logoutCalls)).toEqual([]);
  await page.evaluate(()=>window.__bcIsolated.releaseSdkWrite());await page.clock.fastForward(1000);
  expect(await page.evaluate(()=>window.__bcIsolated.loggedOut)).toBe(false);expect(await page.evaluate(()=>window.__bcIsolated.logoutCalls)).toEqual([]);
  await expect(page.locator('#bc-logout-status')).toBeVisible();
  await page.locator('#bc-logout-retry').click();await blankEmail(page);
  expect(await page.evaluate(()=>window.__bcIsolated.logoutCalls)).toEqual([{scope:'local'}]);expect(await page.evaluate(()=>window.__bcIsolated.loggedOut)).toBe(true);
  await page.getByLabel('Email',{exact:true}).fill('member-b@example.invalid');await page.getByLabel('Password',{exact:true}).fill('injected-password');await page.locator('#bc-email-signin button[type="submit"]').click();await page.clock.fastForward(100);await page.locator('[data-nav="profile"]').click();
  await page.evaluate(()=>{const w=window as any;w.dispatchEvent(new Event('focus'));w.bcV3Refresh()});await page.clock.fastForward(100);
  await expect(page.locator('[data-account-card]')).toContainText('member-b@example.invalid');
});

test('a retired account returned by fresh SDK getUser cannot populate the new member shell',async({page})=>{
  await member(page);await switchFromProfile(page);await blankEmail(page);
  await page.getByLabel('Email',{exact:true}).fill('member-b@example.invalid');await page.getByLabel('Password',{exact:true}).fill('injected-password');await page.locator('#bc-email-signin button[type="submit"]').click();await page.locator('[data-nav="profile"]').click();await expect(page.locator('[data-account-card]')).toContainText('member-b@example.invalid');
  await page.evaluate(()=>{const w=window as any,s=w.__bcIsolated;s.current=s.accountA;s.loggedOut=false;w.bcV3Refresh()});
  await blankEmail(page);await expect(page.locator('[data-account-card]')).toHaveCount(0);expect(await page.evaluate(()=>window.__bcIsolated.loggedOut)).toBe(true);
});

test('scheduled resume recovery and delayed signed-in worker cannot resurrect A',async({page})=>{
  await member(page);await page.clock.install();
  await page.evaluate(()=>{const w=window as any;w.dispatchEvent(new Event('focus'));w.__bcIsolated.emitAuth('SIGNED_OUT',null)});
  await switchFromProfile(page);await blankEmail(page);
  const readsAfterLogout=await page.evaluate(()=>window.__bcIsolated.sessionReads);
  await page.evaluate(()=>{const s=window.__bcIsolated;s.emitAuth('SIGNED_IN',{user:s.accountA});s.emitAuth('TOKEN_REFRESHED',{user:s.accountA});window.dispatchEvent(new Event('focus'))});
  await page.clock.fastForward(2000);
  await expect(page.locator('#bc-email-signin')).toBeVisible();await expect(page.locator('[data-nav="profile"]')).toHaveCount(0);
  expect(await page.evaluate(()=>window.__bcIsolated.recoveries)).toBe(0);
  expect(await page.evaluate(()=>window.__bcIsolated.sessionReads)).toBe(readsAfterLogout); // no post-logout recovery reads
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
for(const mode of ['retained-slow','retained-error','session-error','session-timeout','anonymous'])test(`#signin boot ${mode} never hydrates or renders the old account before confirmed local logout`,async({page})=>{
  if(mode==='session-timeout')await page.clock.install();
  await page.route('https://cdn.jsdelivr.net/**',route=>route.fulfill({contentType:'application/javascript',body:mock+`
    const db=window.supabase.createClient(),s=window.__bcIsolated,mode=${JSON.stringify(mode)};
    s.bootCalls=[];s.bootLogoutCalls=[];s.bootConfirmed=false;s.oldWriteUI=false;
    const record=value=>{if(!s.bootConfirmed)s.bootCalls.push(value)};
    const from=db.from.bind(db),rpc=db.rpc.bind(db),getUser=db.auth.getUser;
    db.from=(table)=>{record('from:'+table);return from(table)};
    db.rpc=(name,args)=>{record('rpc:'+name);return rpc(name,args)};
    db.auth.getUser=()=>{record('getUser');return getUser()};
    db.auth.getSession=async()=>{
      s.bootSessionStarted=true;
      if(mode==='session-timeout')return new Promise(()=>{});
      if(mode==='session-error')return {data:{session:null},error:{message:'Injected session read failure'}};
      return {data:{session:mode==='anonymous'?null:{user:{id:s.profile.id,email:s.profile.email}}},error:null};
    };
    db.auth.signOut=async options=>{
      s.bootLogoutCalls.push(options);
      if(mode==='retained-error'||mode==='session-error'||mode==='session-timeout')await new Promise(resolve=>s.releaseBootLogout=()=>resolve());
      if(mode==='retained-error'&&!s.retryBootLogout)return {error:{message:'Injected local logout failure'}};
      if(mode==='retained-slow')await new Promise(resolve=>s.releaseBootLogout=()=>resolve());
      s.bootConfirmed=true;s.setSignedOut(true);s.emitAuth('SIGNED_OUT',null);return {error:null};
    };
    const observe=()=>{if(!s.bootConfirmed&&document.querySelector('[data-nav="profile"],[data-account-card],[data-edit-profile],[data-add-set],[data-exchangeable]'))s.oldWriteUI=true};
    new MutationObserver(observe).observe(document,{subtree:true,childList:true});
  `}));
  await page.goto('/#signin');
  if(mode==='session-timeout'){await expect.poll(()=>page.evaluate(()=>window.__bcIsolated.bootSessionStarted)).toBe(true);await page.clock.fastForward(8100)}
  const noOldWork=async()=>{
    expect(await page.evaluate(()=>window.__bcIsolated.bootCalls)).toEqual([]);
    expect(await page.evaluate(()=>window.__bcIsolated.oldWriteUI)).toBe(false);
    await expect(page.locator('[data-nav="profile"],[data-account-card],[data-edit-profile]')).toHaveCount(0);
  };
  if(mode==='anonymous'){await blankEmail(page);expect(await page.evaluate(()=>window.__bcIsolated.bootLogoutCalls)).toEqual([]);await noOldWork();return}
  await expect(page.locator('#bc-logout-status')).toContainText('Confirming');await noOldWork();
  await expect(page.locator('#bc-email-signin')).toHaveCount(0);
  await page.evaluate(()=>{window.dispatchEvent(new Event('focus'));window.bcV3Refresh();(window as any).bcAuth()});await noOldWork();
  await page.evaluate(()=>window.__bcIsolated.releaseBootLogout());
  if(mode==='retained-error'){
    await expect(page.locator('#bc-logout-status')).toContainText('not confirmed');await noOldWork();
    await expect(page.locator('#bc-email-signin')).toHaveCount(0);
    await page.evaluate(()=>window.__bcIsolated.retryBootLogout=true);await page.locator('#bc-logout-retry').click();
    await expect.poll(()=>page.evaluate(()=>window.__bcIsolated.bootLogoutCalls.length)).toBe(2);
    await page.evaluate(()=>window.__bcIsolated.releaseBootLogout());
  }
  await blankEmail(page);await noOldWork();
  expect(await page.evaluate(()=>window.__bcIsolated.bootLogoutCalls)).toEqual(Array(mode==='retained-error'?2:1).fill({scope:'local'}));
  await expect(page).toHaveURL(/\/#home$/);
  await page.getByLabel('Email',{exact:true}).fill('collector@example.invalid');await page.getByLabel('Password',{exact:true}).fill('injected-password');await page.locator('#bc-email-signin button[type="submit"]').click();
  if(mode==='session-timeout')await page.clock.fastForward(100);
  await page.locator('[data-nav="profile"]').click();await expect(page.locator('[data-account-card]')).toContainText('collector@example.invalid');
});

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
