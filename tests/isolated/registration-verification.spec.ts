import {test,expect} from './fixtures';
import type {Page} from '@playwright/test';

const email='collector@example.invalid';
async function setup(page:Page){
  await page.goto('/v2.html?isolated=signed-out');
  await page.evaluate(()=>{
    const w=window as any,s=w.__bcIsolated,auth=w.BC_SUPABASE.auth,getUser=auth.getUser;
    s.verifyCalls=[];s.resendCalls=[];s.verificationMode='success';s.resendMode='success';
    auth.getUser=async()=>{const result=await getUser();if(result.data.user)result.data.user.email_confirmed_at=s.verificationMode==='unconfirmed'?null:'2026-01-01T00:00:00Z';return result};
    auth.verifyOtp=async(credentials:any)=>{
      s.verifyCalls.push(credentials);
      if(s.verificationMode==='slow')await new Promise(resolve=>s.releaseVerification=resolve);
      if(['invalid','expired','rate','network'].includes(s.verificationMode))return {data:{session:null},error:{code:s.verificationMode==='rate'?'over_request_rate_limit':s.verificationMode==='network'?'network':s.verificationMode==='invalid'?'invalid_code':'otp_expired',status:s.verificationMode==='rate'?429:400}};
      s.setSignedOut(false);const result=await auth.getUser();const user=result.data.user;
      if(s.verificationMode==='wrong-email')user.email='wrong@example.invalid';
      if(s.verificationMode==='unconfirmed')user.email_confirmed_at=null;
      s.emitAuth('SIGNED_IN',{user});return {data:{session:{user},user},error:null};
    };
    auth.resend=async(credentials:any)=>{s.resendCalls.push(credentials);return {error:s.resendMode==='error'?{status:429,retryAfter:120}:null}};
  });
  await page.locator('[data-auth]').first().click();
}
async function signup(page:Page,submitted=email){
  await page.locator('[data-auth-tab="signup"]').click();const form=page.locator('#bc-email-signup');
  await form.getByLabel('Collector name',{exact:true}).fill('Pending Collector');await form.getByLabel('Email',{exact:true}).fill(submitted);await form.getByLabel('Password',{exact:true}).fill('synthetic-password');await form.locator('[name="adult_confirmation"]').check();await form.locator('[type="submit"]').click();await expect(page.locator('#bc-email-verify')).toBeVisible();
}
async function resume(page:Page,submitted=email){
  await page.getByRole('button',{name:'I have a verification code',exact:true}).click();await page.locator('#bc-verification-entry [name="email"]').fill(submitted);await page.getByRole('button',{name:'Continue with code',exact:true}).click();
}
async function verify(page:Page,code='01234567'){await page.getByLabel('Verification code',{exact:true}).fill(code);await page.getByRole('button',{name:'Verify email',exact:true}).click()}

for(const width of [320,390,1280])test(`signup retains premium accessible verification at ${width}px and confirms before onboarding`,async({page})=>{
  await page.setViewportSize({width,height:844});await setup(page);await signup(page);
  await expect(page.locator('.bc-auth-modal')).toContainText(email);await expect(page.getByLabel('Verification code',{exact:true})).toBeFocused();
  expect(await page.locator('[data-have-code]').evaluate(el=>el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  await expect(page.getByLabel('Verification code',{exact:true})).toHaveAttribute('type','text');await expect(page.getByLabel('Verification code',{exact:true})).toHaveAttribute('inputmode','numeric');await expect(page.getByLabel('Verification code',{exact:true})).toHaveAttribute('autocomplete','one-time-code');
  await expect(page.locator('[data-nav="profile"],#bc-onboard')).toHaveCount(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.evaluate(()=>{window.__bcIsolated.profile=null});await verify(page,'0 123 4567');
  await expect(page.locator('#bc-onboard')).toBeVisible();expect(await page.evaluate(()=>window.__bcIsolated.verifyCalls)).toEqual([{email,token:'01234567',type:'email'}]);
  expect(await page.evaluate(()=>sessionStorage.getItem('bc_pending_verification'))).toBeNull();
});
for(const mode of ['invalid','expired','rate','network'])test(`${mode} code preserves email and allows explicit retry`,async({page})=>{
  await setup(page);await signup(page);await page.evaluate(mode=>window.__bcIsolated.verificationMode=mode,mode);await verify(page);
  await expect(page.locator('[data-verification-error]')).toBeVisible();await expect(page.locator('#bc-email-verify')).toContainText(email);await expect(page.locator('[data-nav="profile"],#bc-onboard')).toHaveCount(0);
  await page.evaluate(()=>window.__bcIsolated.verificationMode='success');await page.getByRole('button',{name:'Verify email',exact:true}).click();await expect(page.locator('#bc-email-verify')).toHaveCount(0);
});
for(const code of ['012345','0123456789'])test(`accepts ${code.length}-digit string code without numeric conversion`,async({page})=>{
  await setup(page);await resume(page);await verify(page,code);await expect(page.locator('#bc-email-verify')).toHaveCount(0);expect(await page.evaluate(()=>window.__bcIsolated.verifyCalls[0].token)).toBe(code);
});
test('invalid format never calls SDK; paste strips whitespace only',async({page})=>{
  await setup(page);await resume(page);
  for(const code of ['12345','12345678901','01-234567','1e234567']){await verify(page,code);await expect(page.locator('[data-verification-error]')).toContainText('6–10 digits')}
  expect(await page.evaluate(()=>window.__bcIsolated.verifyCalls)).toEqual([]);
  await expect(page.getByLabel('Verification code',{exact:true})).toHaveAttribute('aria-describedby','bc-verification-help bc-verification-error');
  await expect(page.getByLabel('Verification code',{exact:true})).toHaveAttribute('aria-invalid','true');
  await page.getByLabel('Verification code',{exact:true}).fill('0');await expect(page.getByLabel('Verification code',{exact:true})).not.toHaveAttribute('aria-invalid','true');
  await page.getByLabel('Verification code',{exact:true}).fill('');await page.getByLabel('Verification code',{exact:true}).evaluate(el=>{const data=new DataTransfer();data.setData('text',' 01\n234\t567 ');el.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}))});
  await expect(page.getByLabel('Verification code',{exact:true})).toHaveValue('01234567');
});
test('duplicates do not send a second verification operation',async({page})=>{
  await setup(page);await resume(page);await page.evaluate(()=>window.__bcIsolated.verificationMode='slow');await verify(page);
  await page.locator('#bc-email-verify').evaluate((el:HTMLFormElement)=>{el.requestSubmit();el.requestSubmit()});expect(await page.evaluate(()=>window.__bcIsolated.verifyCalls.length)).toBe(1);
  await page.evaluate(()=>window.__bcIsolated.releaseVerification());await expect(page.locator('#bc-email-verify')).toHaveCount(0);
});
test('SDK SIGNED_IN is not private access until the independent server confirmation settles',async({page})=>{
  await setup(page);await resume(page);await page.evaluate(()=>{
    const w=window as any,s=w.__bcIsolated,auth=w.BC_SUPABASE.auth,getUser=auth.getUser;
    auth.verifyOtp=async()=>{s.setSignedOut(false);const user={id:'00000000-0000-4000-8000-000000000007',email:'collector@example.invalid'};s.emitAuth('SIGNED_IN',{user});return {data:{session:{user}},error:null}};
    auth.getUser=()=>new Promise(resolve=>s.releaseServerCheck=async()=>resolve(await getUser()));
  });await verify(page);await expect.poll(()=>page.evaluate(()=>!!window.__bcIsolated.releaseServerCheck)).toBe(true);await page.evaluate(()=>{window.dispatchEvent(new Event('focus'));window.bcV3Refresh()});await expect(page.locator('[data-nav="profile"],#bc-onboard')).toHaveCount(0);await expect(page.locator('#bc-email-verify')).toBeVisible();
  await page.evaluate(()=>{const w=window as any,s=w.__bcIsolated;const release=s.releaseServerCheck;release();w.BC_SUPABASE.auth.getUser=async()=>({data:{user:{id:s.profile.id,email:s.profile.email,email_confirmed_at:'2026-01-01'}},error:null})});await expect(page.locator('#bc-email-verify')).toHaveCount(0);
});
for(const mode of ['success','error'])test(`resend ${mode} is explicit, duplicate-safe and honors cooldown across reload`,async({page})=>{
  await setup(page);await signup(page);await page.clock.install();await page.evaluate(mode=>window.__bcIsolated.resendMode=mode,mode);
  await expect(page.locator('[data-resend]')).toBeDisabled();expect(await page.evaluate(()=>window.__bcIsolated.resendCalls)).toEqual([]);await page.clock.fastForward(60100);
  await page.locator('[data-resend]').click();await expect(page.locator('[data-resend]')).toBeDisabled();expect(await page.evaluate(()=>window.__bcIsolated.resendCalls)).toHaveLength(1);
  if(mode==='error'){await expect(page.locator('[data-verification-error]')).toContainText('Too many attempts');await expect(page.locator('[data-resend]')).toContainText('120s')}else await expect(page.locator('[data-verification-status]')).toContainText('new code');
  const call=await page.evaluate(()=>window.__bcIsolated.resendCalls[0]);expect(call).toMatchObject({type:'signup',email,options:{emailRedirectTo:`${new URL(page.url()).origin}/v2.html`}});
  await page.reload();await page.locator('[data-auth]').first().click();await expect(page.locator('#bc-email-verify')).toContainText(email);await expect(page.locator('[data-resend]')).toBeDisabled();
});
test('close/reopen/reload retains only bounded pending email; change clears it and supports a different email',async({page})=>{
  await setup(page);await signup(page);await page.getByLabel('Close sign-in').click();await page.locator('[data-auth]').first().click();await expect(page.locator('#bc-email-verify')).toContainText(email);
  const stored=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('bc_pending_verification')!));expect(Object.keys(stored).sort()).toEqual(['email','expires','resendAt']);
  await page.reload();await page.locator('[data-auth]').first().click();await expect(page.locator('#bc-email-verify')).toContainText(email);
  await page.getByRole('button',{name:'Change email',exact:true}).click();expect(await page.evaluate(()=>sessionStorage.getItem('bc_pending_verification'))).toBeNull();await page.locator('#bc-verification-entry [name="email"]').fill('other@example.invalid');await page.getByRole('button',{name:'Continue with code',exact:true}).click();await expect(page.locator('#bc-email-verify')).toContainText('other@example.invalid');
  await page.getByRole('button',{name:'Back to sign in',exact:true}).click();await expect(page.locator('#bc-email-signin')).toBeVisible();expect(await page.evaluate(()=>sessionStorage.getItem('bc_pending_verification'))).toBeNull();
});
test('malformed/expired pending storage is safely ignored',async({page})=>{
  await setup(page);await page.getByLabel('Close sign-in').click();
  for(const value of ['{','{"email":"old@example.invalid","expires":0,"resendAt":0}']){await page.evaluate(value=>sessionStorage.setItem('bc_pending_verification',value),value);await page.locator('[data-auth]').first().click();await expect(page.locator('#bc-email-signin')).toBeVisible();await page.getByLabel('Close sign-in').click()}
});
test('unconfirmed password sign-in routes to the same email without retaining password',async({page})=>{
  await setup(page);await page.evaluate(()=>{(window as any).BC_SUPABASE.auth.signInWithPassword=async()=>({error:{code:'email_not_confirmed'}})});
  await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill('synthetic-password');await page.locator('#bc-email-signin [type="submit"]').click();await expect(page.locator('#bc-email-verify')).toContainText(email);await expect(page.locator('[name="password"]')).toHaveCount(0);
});
for(const mode of ['wrong-email','unconfirmed'])test(`server ${mode} does not authorize a private shell`,async({page})=>{
  await setup(page);await resume(page);await page.evaluate(mode=>window.__bcIsolated.verificationMode=mode,mode);await verify(page);await expect(page.locator('#bc-email-signin')).toBeVisible();await expect(page.locator('[data-nav="profile"],#bc-onboard')).toHaveCount(0);
});
for(const action of ['switch','close','change','timeout','drain-timeout'])test(`late A verification (${action}) drains before logout and B login`,async({page})=>{
  await setup(page);await resume(page);await page.clock.install();await page.evaluate(()=>window.__bcIsolated.verificationMode='slow');await verify(page);
  if(action==='switch'||action==='drain-timeout')await page.evaluate(()=>{(window as any).bcSwitchAccount()});else if(action==='close')await page.getByLabel('Close sign-in').click();else if(action==='change')await page.getByRole('button',{name:'Change email',exact:true}).click();else await page.clock.fastForward(10100);
  if(action==='drain-timeout'){await page.clock.fastForward(10100);await expect(page.locator('#bc-logout-status')).toContainText('not confirmed')}
  await expect(page.locator('#bc-email-signin')).toHaveCount(0);await expect(page.locator('[data-nav="profile"],#bc-onboard')).toHaveCount(0);
  await page.evaluate(()=>window.__bcIsolated.releaseVerification());await page.clock.fastForward(100);
  if(action==='drain-timeout'){await expect(page.locator('#bc-email-signin')).toHaveCount(0);await page.locator('#bc-logout-retry').click()}
  await expect(page.locator('#bc-email-signin')).toBeVisible();
  expect(await page.evaluate(()=>window.__bcIsolated.authCalls.filter((c:any)=>c.method==='signOut').map((c:any)=>c.options))).toEqual([{scope:'local'}]);
  await page.evaluate(()=>{const w=window as any,s=w.__bcIsolated,auth=w.BC_SUPABASE.auth;const user={id:'00000000-0000-4000-8000-000000000008',email:'b@example.invalid',email_confirmed_at:'2026-01-01'};auth.signInWithPassword=async()=>{s.setSignedOut(false);s.profile={...s.profile,id:user.id,email:user.email};auth.getUser=async()=>({data:{user},error:null});s.emitAuth('SIGNED_IN',{user});return {data:{session:{user}},error:null}}});
  await page.getByLabel('Email',{exact:true}).fill('b@example.invalid');await page.getByLabel('Password',{exact:true}).fill('synthetic-password');await page.locator('#bc-email-signin [type="submit"]').click();await page.clock.fastForward(100);await page.locator('[data-nav="profile"]').click();await expect(page.locator('[data-account-card]')).toContainText('b@example.invalid');
  await page.evaluate(()=>{window.__bcIsolated.emitAuth('SIGNED_IN',{user:{id:'00000000-0000-4000-8000-000000000007',email:'collector@example.invalid'}});window.__bcIsolated.emitAuth('TOKEN_REFRESHED',{user:{id:'00000000-0000-4000-8000-000000000007',email:'collector@example.invalid'}})});await page.clock.fastForward(100);await expect(page.locator('[data-account-card]')).toContainText('b@example.invalid');
});
test('legacy confirmation is a fixed canonical handoff, not an existing-session success claim',async({page})=>{
  await page.goto('/auth-confirm.html?redirect_to=https://attacker.invalid');await expect(page.locator('#bc-verification-entry')).toBeVisible();await expect(page).toHaveURL(/\/v2.html#home$/);await expect(page.locator('body')).not.toContainText('email verified');expect(await page.evaluate(()=>window.__bcClientCreateCount)).toBe(1);
});
for(const type of ['signup','recovery'])test(`legacy ${type} fragment forwards only safe session fields to canonical runtime`,async({page})=>{
  await page.route('**/v2.html',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Canonical handoff fixture</title>'}));
  await page.goto(`/auth-confirm.html?redirect_to=https://attacker.invalid#access_token=dummy-access&refresh_token=dummy-refresh&type=${type}&email=dummy%40example.invalid&redirect_to=https://attacker.invalid`);
  await expect(page).toHaveURL(/\/v2.html#/);const u=new URL(page.url()),hash=new URLSearchParams(u.hash.slice(1));expect(hash.get('type')).toBe(type);expect(hash.get('access_token')).toBe('dummy-access');expect(hash.get('refresh_token')).toBe('dummy-refresh');expect(hash.has('email')).toBe(false);expect(hash.has('redirect_to')).toBe(false);expect(u.search).toBe('');
});
