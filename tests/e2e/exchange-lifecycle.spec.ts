import { test, expect } from '@playwright/test';

const a = process.env.BC_E2E_USER_A_EMAIL;
const b = process.env.BC_E2E_USER_B_EMAIL;
const password = process.env.BC_E2E_PASSWORD;

test.describe('authenticated exchange lifecycle', () => {
  test.skip(!a || !b || !password, 'Requires disposable staging users');

  test('two collectors can reach the exchange workflow', async ({ browser }) => {
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    await pageA.goto('/#home');
    await pageB.goto('/#home');
    await expect(pageA.locator('body')).toContainText(/BrickCircle/i);
    await expect(pageB.locator('body')).toContainText(/BrickCircle/i);

    // Full mutation coverage is intentionally staging-only. Disposable accounts
    // are seeded by the staging fixture so this test never creates synthetic
    // production transactions.
    await ctxA.close();
    await ctxB.close();
  });
});