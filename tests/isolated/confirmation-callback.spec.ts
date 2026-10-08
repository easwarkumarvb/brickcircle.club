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
