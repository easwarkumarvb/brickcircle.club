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
