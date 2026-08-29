import { test, expect } from '@playwright/test';

test('public homepage renders without browser errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  const response = await page.goto('/');
  expect(response?.ok()).toBeTruthy();
  await expect(page).toHaveTitle(/BrickCircle/i);
  await expect(page.locator('body')).toContainText(/Founding 100|Experience more LEGO/i);
  expect(errors).toEqual([]);
});

test('V3 signed-out app renders the five-destination shell', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  const response = await page.goto('/v2.html#home');
  expect(response?.ok()).toBeTruthy();
  await expect(page.locator('.bc-topbar')).toBeVisible();
  await expect(page.locator('.bc-desktop-nav button')).toHaveCount(5);
  await expect(page.locator('body')).toContainText(/Join \/ Sign in|Experience more LEGO/i);
  expect(errors).toEqual([]);
});

test('V3 mobile keeps one consistent five-item bottom navigation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/v2.html#home');
  await expect(page.locator('.bc-mobile-nav')).toBeVisible();
  await expect(page.locator('.bc-mobile-nav button')).toHaveCount(5);
  await expect(page.locator('.bc-mobile-nav')).toContainText(/Home/);
  await expect(page.locator('.bc-mobile-nav')).toContainText(/Browse/);
  await expect(page.locator('.bc-mobile-nav')).toContainText(/My Sets/);
  await expect(page.locator('.bc-mobile-nav')).toContainText(/Matches/);
  await expect(page.locator('.bc-mobile-nav')).toContainText(/Exchanges/);
});

test('V3 Browse route loads from the unified router', async ({ page }) => {
  await page.goto('/v2.html#browse');
  await expect(page.locator('body')).toContainText(/Browse LEGO sets/i);
  await expect(page.locator('#bc-q')).toBeVisible();
});
