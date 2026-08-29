import { test, expect } from '@playwright/test';

test('live production Google registration reaches the OAuth handoff without the old configuration error', async ({ page, request }) => {
  test.setTimeout(45000);

  const scriptRes = await request.get('https://www.brickcircle.club/v3-auth-onboarding-hotfix.js');
  expect(scriptRes.ok()).toBeTruthy();
  const script = await scriptRes.text();
  expect(script).not.toContain('Google sign-in configuration could not be found');
  expect(script).toContain('signInWithOAuth');

  const seen: string[] = [];
  page.on('request', req => {
    const u = req.url();
    if (/supabase\.co\/auth\/v1\/authorize|accounts\.google\.com/i.test(u)) seen.push(u);
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('https://www.brickcircle.club/', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.locator('a[href="/v2.html?join=1"]').first().click({ timeout: 7000 });
  await expect(page.locator('#bc-overlay')).toBeVisible({ timeout: 7000 });

  const google = page.locator('[data-oauth="google"], .bc-auth-provider.google').first();
  await expect(google).toBeVisible({ timeout: 7000 });
  await google.click();

  await expect.poll(async () => {
    const body = await page.locator('body').innerText().catch(() => '');
    return /Google sign-in configuration could not be found/i.test(body);
  }, { timeout: 5000 }).toBeFalsy();

  await expect.poll(() => seen.some(u => /supabase\.co\/auth\/v1\/authorize/i.test(u)), { timeout: 15000 }).toBeTruthy();

  await expect.poll(() => {
    const current = page.url();
    return /accounts\.google\.com|supabase\.co\/auth\/v1\/authorize/i.test(current) || seen.some(u => /accounts\.google\.com/i.test(u));
  }, { timeout: 15000 }).toBeTruthy();
});
