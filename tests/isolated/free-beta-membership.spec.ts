import { test, expect } from './fixtures';

const policy='BrickCircle is free during beta while we build a trusted, liquid collector community. If a modest membership fee is introduced later, members will be informed well in advance.';

test('signed-out landing explains the uniform free-beta policy',async({page})=>{
  await page.goto('/v2.html?isolated=signed-out#home');
  await expect(page.locator('.bc-membership-policy')).toContainText(policy);
  await expect(page.getByText(/Founding Member|Early Member|free lifetime/i)).toHaveCount(0);
});

test('signed-in members receive the same beta badge and no pricing gate',async({page})=>{
  await page.goto('/v2.html?isolated=partial#home');
  await expect(page.getByText('Beta Member · Free during beta').first()).toBeVisible();
  await expect(page.locator('.bc-membership-city')).toContainText('If a modest membership fee is introduced later');
  await expect(page.getByText(/Founding Member|Early Member|liquidity gate|paid launch/i)).toHaveCount(0);
});
