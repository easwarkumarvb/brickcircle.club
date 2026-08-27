import { test, expect } from '@playwright/test';

test('homepage and public navigation render without browser errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await expect(page).toHaveTitle(/BrickCircle/i);
  await expect(page.locator('body')).toContainText(/BrickCircle/i);
  expect(errors).toEqual([]);
});

test('public catalogue page responds', async ({ page }) => {
  const response = await page.goto('/#catalogue');
  expect(response?.ok()).toBeTruthy();
  await expect(page.locator('body')).toContainText(/LEGO|Catalogue|BrickCircle/i);
});