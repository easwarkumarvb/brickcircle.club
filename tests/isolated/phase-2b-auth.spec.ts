import {test,expect} from './fixtures';

test('join intent opens auth immediately and preserves referral continuity',async({page})=>{
  await page.goto('/v2.html?isolated=signed-out&join=1&ref=PHASE2B');
  await expect(page.locator('#bc-overlay')).toBeVisible();
  await expect(page.locator('[data-oauth="google"]')).toBeVisible();
  await expect(page.locator('#bc-email-signin')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>localStorage.getItem('bc_pending_referral'))).toBe('PHASE2B');
  await expect(page).not.toHaveURL(/(?:\?|&)join=1(?:&|$)/);
  await expect(page).toHaveURL(/ref=PHASE2B/);
});

test('signed-out auth entry exposes both sign-in and account creation paths',async({page})=>{
  await page.goto('/v2.html?isolated=signed-out');
  await page.locator('[data-auth]').first().click();
  await expect(page.locator('#bc-email-signin')).toBeVisible();
  await page.locator('[data-auth-tab="signup"]').click();
  await expect(page.locator('#bc-email-signup')).toBeVisible();
  await expect(page.locator('#bc-email-signup [name="name"]')).toBeVisible();
  await expect(page.locator('#bc-email-signup [name="email"]')).toBeVisible();
  await expect(page.locator('#bc-email-signup [name="password"]')).toBeVisible();
});

test('email account creation uses the canonical client and onboarding metadata',async({page})=>{
  await page.goto('/v2.html?isolated=signed-out');
  await page.locator('[data-auth]').first().click();
  await page.locator('[data-auth-tab="signup"]').click();
  const form=page.locator('#bc-email-signup');
  await form.locator('[name="name"]').fill('Beta Collector');
  await form.locator('[name="email"]').fill('beta@example.invalid');
  await form.locator('[name="password"]').fill('password123');
  await form.evaluate((element:HTMLFormElement)=>element.requestSubmit());
  await expect.poll(()=>page.evaluate(()=>window.__bcIsolated.authCalls.some((call:any)=>call.method==='signUp'))).toBe(true);
  const call=await page.evaluate(()=>window.__bcIsolated.authCalls.find((entry:any)=>entry.method==='signUp'));
  expect(call.credentials).toMatchObject({email:'beta@example.invalid',options:{data:{full_name:'Beta Collector'},emailRedirectTo:'http://127.0.0.1:4173/v2.html'}});
});

test('Google OAuth keeps the callback on the BrickCircle loopback origin',async({page})=>{
  await page.goto('/v2.html?isolated=signed-out');
  await page.locator('[data-auth]').first().click();
  await page.locator('[data-oauth="google"]').click();
  const options=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('bc_isolated_oauth')||'null'));
  expect(options).toMatchObject({
    provider:'google',
    options:{
      redirectTo:'http://127.0.0.1:4173/v2.html',
      skipBrowserRedirect:true,
      queryParams:{prompt:'select_account'}
    }
  });
});

test('canonical runtime creates one client and recovers the stored session',async({page})=>{
  await page.goto('/v2.html#profile');
  await expect(page.locator('.bc-profile-hero')).toContainText('Isolated Collector');
  expect(await page.evaluate(()=>window.__bcClientCreateCount)).toBe(1);
  expect(await page.evaluate(()=>window.__bcIsolated.clientOptions.auth)).toMatchObject({persistSession:true,autoRefreshToken:true,detectSessionInUrl:true});
});

test('spurious resume-window sign-out recovers the still-valid session',async({page})=>{
  await page.goto('/v2.html?isolated=ready-one#profile');
  await expect(page.locator('.bc-profile-hero')).toContainText('Isolated Collector');
  await page.evaluate(()=>window.__bcIsolated.emitAuth('SIGNED_OUT',null));
  await page.waitForTimeout(600);
  await expect(page.locator('.bc-profile-hero')).toContainText('Isolated Collector');
  await expect(page.locator('[data-signout]')).toBeVisible();
});

test('email sign-in and reset stay on the canonical client',async({page})=>{
  await page.goto('/v2.html?isolated=signed-out');
  await page.locator('[data-auth]').first().click();
  const form=page.locator('#bc-email-signin');
  await form.locator('[name="email"]').fill('collector@example.invalid');
  await form.locator('[name="password"]').fill('password123');
  await form.evaluate((element:HTMLFormElement)=>element.requestSubmit());
  await expect.poll(()=>page.evaluate(()=>window.__bcIsolated.authCalls.some((call:any)=>call.method==='signInWithPassword'))).toBe(true);
  await page.goto('/v2.html#profile');
  await page.locator('[data-nav="profile"]').first().click();
  await page.getByRole('button',{name:'Sign out'}).click();
  await expect(page.locator('[data-auth]').first()).toBeVisible();
  await page.locator('[data-auth]').first().click();
  page.once('dialog',dialog=>dialog.accept('collector@example.invalid'));
  await page.getByRole('button',{name:'Forgot password?'}).click();
  await expect.poll(()=>page.evaluate(()=>window.__bcIsolated.authCalls.some((call:any)=>call.method==='resetPasswordForEmail'))).toBe(true);
});

test('onboarding persists with an owner-scoped upsert',async({page})=>{
  await page.goto('/v2.html?isolated=onboarding');
  const form=page.locator('#bc-onboard');
  await expect(form).toBeVisible();
  await form.locator('[name="name"]').fill('Canonical Collector');
  await form.locator('[name="country"]').selectOption('India');
  await form.locator('[name="city"]').selectOption('Bengaluru');
  await form.locator('button').click();
  await expect(page).toHaveURL(/#browse/);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('bc_isolated_profile')||'null'))).toMatchObject({id:'00000000-0000-4000-8000-000000000007',display_name:'Canonical Collector',country:'India',city:'Bengaluru'});
});

test('OAuth callback cleanup preserves referral continuity',async({page})=>{
  await page.goto('/v2.html?code=isolated-code&ref=PHASE2B#home');
  await expect(page.locator('[data-nav="profile"]').first()).toBeVisible();
  await expect(page).not.toHaveURL(/code=/);
  await expect(page).toHaveURL(/ref=PHASE2B/);
});

declare global {interface Window {__bcClientCreateCount:number;__bcIsolated:any}}
