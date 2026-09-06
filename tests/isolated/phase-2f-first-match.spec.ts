import {test,expect} from './fixtures';

test('new signed-in collector gets one clear next action',async({page})=>{
  await page.goto('/v2.html#home');
  const coach=page.locator('#bc-first-match-coach');
  await expect(coach).toBeVisible();
  await expect(coach).toContainText('Next: Add owned sets');
  await expect(coach.locator('.bc-first-match-step')).toHaveCount(4);
  await expect(coach.locator('.bc-first-match-step.current')).toHaveText('OWN');
  await expect(coach.getByRole('button',{name:'Add owned sets'})).toBeVisible();
});

test('partial collector keeps the coach aligned with actual readiness',async({page})=>{
  await page.goto('/v2.html?isolated=partial#home');
  const coach=page.locator('#bc-first-match-coach');
  await expect(coach).toContainText('Next: Add owned sets');
  await expect(coach).toContainText('Add 3 LEGO sets you own');
});

test('coach CTA reuses the existing router without a new backend flow',async({page})=>{
  await page.goto('/v2.html#home');
  await page.locator('#bc-first-match-coach').getByRole('button',{name:'Add owned sets'}).click();
  await expect(page).toHaveURL(/#browse$/);
  await expect(page.getByRole('heading',{name:'Browse LEGO sets'})).toBeVisible();
});

test('signed-out landing stays untouched by the first-match coach',async({page})=>{
  await page.goto('/v2.html?isolated=signed-out#home');
  await expect(page.locator('.bc-landing-hero')).toBeVisible();
  await expect(page.locator('#bc-first-match-coach')).toHaveCount(0);
});

test('mobile coach stays compact with no horizontal overflow',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/v2.html#home');
  await expect(page.locator('#bc-first-match-coach')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
});
