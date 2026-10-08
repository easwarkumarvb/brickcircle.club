import {test,expect} from './fixtures';
import fs from 'node:fs';

const mock=fs.readFileSync('tests/isolated/fixtures/supabase-browser-mock.js','utf8');
for(const type of ['email','recovery'])test(`canonical ${type} token-hash callback checks server before onboarding/recovery`,async({page})=>{
  await page.route('https://cdn.jsdelivr.net/**',route=>route.fulfill({contentType:'application/javascript',body:mock+`
    const db=window.supabase.createClient(),s=window.__bcIsolated;
    const user={id:'00000000-0000-4000-8000-000000000007',email:'collector@example.invalid',email_confirmed_at:'2026-01-01T00:00:00Z'};
    s.callbackOrder=[];s.callbackCalls=[];s.profile=null;s.serverConfirmed=false;
    db.auth.verifyOtp=async params=>{s.callbackCalls.push(params);s.callbackOrder.push('verify');s.setSignedOut(false);s.emitAuth('${type==='recovery'?'PASSWORD_RECOVERY':'SIGNED_IN'}',{user});return {data:{session:{user},user},error:null}};
    db.auth.getUser=async()=>{s.callbackOrder.push('server-user');if(!s.serverConfirmed)await new Promise(resolve=>s.releaseConfirmation=()=>{s.serverConfirmed=true;resolve()});return {data:{user},error:null}};
    const from=db.from.bind(db);db.from=table=>{if(!s.serverConfirmed&&table==='profiles')s.callbackOrder.push('premature-profile');return from(table)};
  `}));
  await page.goto(`/v2.html?isolated=signed-out&token_hash=dummy-hash&type=${type}`);
  await expect.poll(()=>page.evaluate(()=>!!window.__bcIsolated.releaseConfirmation)).toBe(true);
  await page.evaluate(()=>{window.dispatchEvent(new Event('focus'));window.bcV3Refresh()});
  await expect(page.locator('#bc-onboard,#bc-password-recovery,[data-nav="profile"]')).toHaveCount(0);expect(await page.evaluate(()=>window.__bcIsolated.callbackOrder)).not.toContain('premature-profile');
  await page.evaluate(()=>window.__bcIsolated.releaseConfirmation());await expect(page.locator(type==='email'?'#bc-onboard':'#bc-password-recovery')).toBeVisible();
  if(type==='recovery')await expect(page.locator('#bc-onboard')).toHaveCount(0);
  expect(await page.evaluate(()=>window.__bcIsolated.callbackCalls)).toEqual([{token_hash:'dummy-hash',type}]);await expect(page).not.toHaveURL(/token_hash=/);expect(await page.evaluate(()=>(window as any).dataLayer||[])).toEqual([]);
});
test('invalid token-hash callback cannot call retained-session signup verified or hydrate it',async({page})=>{
  await page.route('https://cdn.jsdelivr.net/**',route=>route.fulfill({contentType:'application/javascript',body:mock+`
    const db=window.supabase.createClient(),s=window.__bcIsolated;s.premature=[];
    db.auth.verifyOtp=async()=>({data:{session:null},error:{code:'otp_expired'}});
    const from=db.from.bind(db);db.from=table=>{if(table==='profiles')s.premature.push(table);return from(table)};
  `}));
  await page.goto('/v2.html?token_hash=dummy-expired&type=email');await expect(page.locator('#bc-email-signin')).toBeVisible();await expect(page.locator('[role="alert"]:visible')).toContainText('This confirmation link is invalid or expired');await expect(page.locator('[data-nav="profile"],#bc-onboard')).toHaveCount(0);expect(await page.evaluate(()=>window.__bcIsolated.premature)).toEqual([]);await expect(page.locator('body')).not.toContainText('Email verified.');
});
test('bare verify route drains retained account before requesting the pending email',async({page})=>{
  await page.goto('/v2.html#verify');await expect(page.locator('#bc-verification-entry')).toBeVisible();await expect(page.locator('[data-nav="profile"],#bc-onboard')).toHaveCount(0);await expect(page.locator('#bc-verification-entry [name="email"]')).toHaveValue('');expect(await page.evaluate(()=>window.__bcIsolated.authCalls.filter((c:any)=>c.method==='signOut').map((c:any)=>c.options))).toEqual([{scope:'local'}]);
});
for(const mode of ['initialize-error-null-session','unsupported-retained-session','consumed-without-session'])test(`PKCE ${mode} fails closed despite getSession error:null`,async({page})=>{
  await page.route('https://cdn.jsdelivr.net/**',route=>route.fulfill({contentType:'application/javascript',body:mock+`
    const db=window.supabase.createClient(),s=window.__bcIsolated,mode=${JSON.stringify(mode)};s.callbackHydration=[];s.initializeCalls=0;
    db.auth.initialize=async()=>{s.initializeCalls++;if(mode==='initialize-error-null-session')return {error:{code:'bad_code',message:'dummy-provider-description'}};if(mode==='consumed-without-session'){const url=new URL(location.href);url.searchParams.delete('code');history.replaceState({},'',url.pathname+url.search+url.hash)}return {error:null}};
    if(mode!=='unsupported-retained-session')db.auth.getSession=async()=>({data:{session:null},error:null});
    const from=db.from.bind(db);db.from=table=>{if(table==='profiles')s.callbackHydration.push(table);return from(table)};
  `}));
  await page.goto('/v2.html?code=dummy-pkce');await expect(page.locator('#bc-email-signin')).toBeVisible();await expect(page.locator('[role="alert"]:visible')).toContainText('This confirmation link is invalid or expired');await expect(page.locator('[data-nav="profile"],#bc-onboard,#bc-password-recovery')).toHaveCount(0);expect(await page.evaluate(()=>window.__bcIsolated.callbackHydration)).toEqual([]);expect(await page.evaluate(()=>window.__bcIsolated.initializeCalls)).toBe(1);await expect(page.locator('body')).not.toContainText('dummy-provider-description');await expect(page).not.toHaveURL(/code=/);
});
for(const type of ['email','oauth','recovery'])test(`valid ${type} PKCE initialization is reused and admitted after code consumption`,async({page})=>{
  await page.route('https://cdn.jsdelivr.net/**',route=>route.fulfill({contentType:'application/javascript',body:mock+`
    const db=window.supabase.createClient(),s=window.__bcIsolated,initialize=db.auth.initialize;s.initializeCalls=0;
    db.auth.initialize=async()=>{s.initializeCalls++;const result=await initialize();if('${type}'==='recovery')s.emitAuth('PASSWORD_RECOVERY');return result};
  `}));
  await page.goto('/v2.html?code=dummy-valid&ref=SAFE-CONTINUITY');await expect(page.locator(type==='recovery'?'#bc-password-recovery':'[data-nav="profile"]').first()).toBeVisible();if(type==='recovery')await expect(page.locator('#bc-onboard')).toHaveCount(0);expect(await page.evaluate(()=>window.__bcIsolated.initializeCalls)).toBe(1);await expect(page).not.toHaveURL(/code=/);await expect(page).toHaveURL(/ref=SAFE-CONTINUITY/);
});
test('initialization deadline retains late SDK writes in the local logout drain',async({page})=>{
  await page.clock.install();await page.route('https://cdn.jsdelivr.net/**',route=>route.fulfill({contentType:'application/javascript',body:mock+`
    const db=window.supabase.createClient(),s=window.__bcIsolated,initialize=db.auth.initialize;
    db.auth.initialize=async()=>{s.initializationStarted=true;await new Promise(resolve=>s.releaseInitialization=resolve);return initialize()};
  `}));await page.goto('/v2.html?code=dummy-slow');await expect.poll(()=>page.evaluate(()=>window.__bcIsolated.initializationStarted)).toBe(true);await page.clock.fastForward(10100);await expect(page.locator('#bc-logout-status')).toBeVisible();await expect(page.locator('[data-nav="profile"],#bc-email-signin')).toHaveCount(0);expect(await page.evaluate(()=>window.__bcIsolated.authCalls.filter((c:any)=>c.method==='signOut'))).toEqual([]);
  await page.evaluate(()=>window.__bcIsolated.releaseInitialization());await page.clock.fastForward(100);await expect(page.locator('#bc-email-signin')).toBeVisible();await expect(page.locator('[role="alert"]:visible')).toContainText('This confirmation link is invalid or expired');await expect(page.locator('[data-nav="profile"]')).toHaveCount(0);expect(await page.evaluate(()=>window.__bcIsolated.authCalls.filter((c:any)=>c.method==='signOut').map((c:any)=>c.options))).toEqual([{scope:'local'}]);
});
