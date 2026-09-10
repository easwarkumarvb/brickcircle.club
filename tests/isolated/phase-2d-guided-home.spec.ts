import {test,expect} from './fixtures';

test('signed-out homepage explains Own Want Match Exchange with the requested entry points',async({page})=>{
  await page.goto('/v2.html?isolated=signed-out#home');
  await expect(page.getByRole('heading',{name:'Experience more LEGO without buying every set.'})).toBeVisible();
  await expect(page.locator('.bc-hero')).toContainText('Add what you own. Pick what you want.');
  await expect(page.getByRole('button',{name:'Start with my collection'})).toBeVisible();
  await expect(page.getByRole('button',{name:'See how it works'})).toBeVisible();
  await expect(page.locator('#how-it-works')).toContainText('Ferrari Daytona SP3');
  await expect(page.locator('.bc-landing-workflow')).toContainText('Add your LEGO sets');
  await expect(page.locator('.bc-landing-workflow')).toContainText('Pick your next experience');
  await expect(page.locator('.bc-example-match')).toContainText('Reciprocal Match');
  await expect(page.locator('.bc-trust')).toContainText('No shipping required');
  await page.waitForTimeout(400);
  await expect(page.getByRole('button',{name:'Start with my collection'})).toBeVisible();
  await page.getByRole('button',{name:'Start with my collection'}).click();
  await expect(page.locator('#bc-overlay')).toBeVisible();
});

test('first-time signed-in homepage starts a deterministic path from existing client state',async({page})=>{
  await page.goto('/v2.html#home');
  const progress=page.locator('.bc-guided-progress');
  await expect(progress).toContainText('Your path to your first match');
  await expect(progress).toContainText('✓ Account created');
  await expect(progress).toContainText('0/3 owned sets added');
  await expect(page.locator('.bc-readiness-status')).toHaveText('3 setup steps left');
  await expect(page.locator('.bc-readiness-counts')).toContainText('0/3 owned');
  await expect(page.locator('.bc-readiness-counts')).toContainText('0/3 wanted');
  await expect(page.locator('.bc-readiness-counts')).toContainText('0/1 available');
  await expect(page.getByRole('button',{name:'Add 3 more sets'}).first()).toBeVisible();
});

test('partial progress recommends the next missing owned set',async({page})=>{
  await page.goto('/v2.html?isolated=partial#home');
  await expect(page.locator('.bc-guided-progress')).toContainText('2/3 owned sets added');
  await expect(page.locator('.bc-guided-progress')).toContainText('1/3 wanted sets added');
  await expect(page.getByRole('button',{name:'Add one more set'}).first()).toBeVisible();
  await expect(page.locator('.bc-readiness')).toContainText('1 more owned set and 2 wanted sets');
});

test('one available set satisfies the exchangeable readiness step',async({page})=>{
  await page.goto('/v2.html?isolated=ready-zero#home');
  const progress=page.locator('.bc-guided-progress');
  await expect(progress).toContainText('0/1 set available');
  await expect(progress.locator('.bc-check').filter({hasText:'Available to Exchange'})).not.toHaveClass(/done/);
  await expect(page.locator('.bc-readiness-status')).toHaveText('1 setup step left');
  await expect(page.getByRole('button',{name:'Make 1 set available'}).first()).toBeVisible();
  await expect(page.locator('.bc-readiness')).toContainText('1 more set available to exchange');

  await page.goto('/v2.html?isolated=ready-one#home');
  await expect(progress).toContainText('1 set available');
  await expect(progress.locator('.bc-check').filter({hasText:'Available to Exchange'})).toHaveClass(/done/);
  await expect(page.locator('.bc-readiness-status')).toHaveText('Match found');
  await expect(page.locator('.bc-readiness')).toContainText('Your sets are ready for reciprocal matching.');
});

test('a reciprocal match becomes the primary next action',async({page})=>{
  await page.goto('/v2.html?isolated=matched#home');
  await expect(page.locator('.bc-guided-progress')).toContainText('1 set available');
  await expect(page.locator('.bc-guided-progress .bc-check').filter({hasText:'Available to Exchange'})).toHaveClass(/done/);
  await expect(page.locator('.bc-readiness-status')).toHaveText('Match found');
  await expect(page.locator('.bc-guided-progress')).toContainText('✓ Reciprocal match');
  await expect(page.getByRole('button',{name:'View my match'}).first()).toBeVisible();
  await page.getByRole('button',{name:'View my match'}).first().click();
  await expect(page).toHaveURL(/#matches$/);
  await expect(page.locator('.bc-match')).toBeVisible();
});

test('My Sets shows transparent counts without an opaque readiness percentage',async({page})=>{
  await page.goto('/v2.html?isolated=partial#sets');
  const summary=page.locator('.bc-setup-summary');
  await expect(summary).toContainText('2/3 owned');
  await expect(summary).toContainText('1/3 wanted');
  await expect(summary).toContainText('0/1 available');
  await expect(page.getByText(/% Match Ready/)).toHaveCount(0);
});

test('guided homepage remains clear at a mobile viewport and keeps bottom navigation',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/v2.html?isolated=signed-out#home');
  await expect(page.locator('.bc-hero')).toBeVisible();
  await expect(page.locator('.bc-landing-workflow article')).toHaveCount(4);
  await expect(page.locator('.bc-story-flow')).toBeVisible();
  await expect(page.locator('.bc-mobile-nav')).toBeVisible();
  await expect(page.locator('body')).not.toHaveCSS('overflow-x','scroll');
});
