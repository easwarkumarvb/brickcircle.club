import {test,expect} from './fixtures';

async function noHorizontalOverflow(page:any){
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
}

test('390px signed-in home leads with one next action and compact collector stats',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/v2.html?isolated=partial#home');

  const next=page.locator('.bc-home-next');
  await expect(next).toBeVisible();
  await expect(next).toContainText('YOUR NEXT BEST MOVE');
  await expect(next.getByRole('button',{name:'Add one more set'})).toBeVisible();

  const stats=page.locator('.bc-home-stats article');
  await expect(stats).toHaveCount(4);
  await expect(page.locator('.bc-home-stats')).toContainText('Owned');
  await expect(page.locator('.bc-home-stats')).toContainText('Wanted');
  await expect(page.locator('.bc-home-stats')).toContainText('Available');
  await expect(page.locator('.bc-home-stats')).toContainText('Matches');

  await expect(page.locator('.bc-workflow')).toBeHidden();
  await expect(page.locator('.bc-dashboard-grid')).toBeHidden();
  await noHorizontalOverflow(page);
});

test('first-run mobile home explains three simple setup moves',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/v2.html#home');

  const onboarding=page.locator('.bc-onboarding-card');
  await expect(onboarding).toBeVisible();
  await expect(onboarding.getByRole('heading',{name:'Get match-ready in three moves'})).toBeVisible();
  await expect(onboarding.locator('.bc-onboarding-steps article')).toHaveCount(3);
  await expect(onboarding).toContainText('Add what you own');
  await expect(onboarding).toContainText('Save what you want');
  await expect(onboarding).toContainText('Make one set available');
  await expect(onboarding.getByRole('button',{name:'Add 3 more sets'})).toBeVisible();
  await noHorizontalOverflow(page);
});

test('a reciprocal match becomes the signed-in home priority',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/v2.html?isolated=matched#home');

  const next=page.locator('.bc-home-next');
  await expect(next).toContainText('RECIPROCAL MATCH');
  await expect(next).toContainText('promising match');
  await expect(next.getByRole('button',{name:'View my match'})).toBeVisible();
  await expect(page.locator('.bc-onboarding-card')).toHaveCount(0);
});
