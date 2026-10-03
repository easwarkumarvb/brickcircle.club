import {test,expect} from './fixtures';

async function noHorizontalOverflow(page:any){
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
}

test('390px reciprocal match reads like a collector opportunity, not backend output',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/v2.html?isolated=matched#matches');

  await expect(page.getByRole('heading',{name:'Great matches'})).toBeVisible();
  const card=page.locator('.bc-match').first();
  await expect(card).toBeVisible();
  await expect(card).toContainText('WHY THIS MATCH');
  await expect(card).toContainText('Two collections. One great exchange.');
  await expect(card.getByRole('button',{name:'Start proposal'})).toBeVisible();
  await expect(card.getByRole('button',{name:/Message/})).toBeVisible();

  const columns=await card.locator('.bc-match-sides').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length);
  expect(columns).toBe(1);
  await noHorizontalOverflow(page);
});

test('mobile Exchanges uses needs-action language and keeps state complexity behind the UI',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/v2.html?isolated=disputed#exchanges');

  await expect(page.getByRole('button',{name:/Needs Action/})).toBeVisible();
  await expect(page.getByRole('button',{name:/Active/})).toBeVisible();
  await expect(page.getByRole('button',{name:/Completed/})).toBeVisible();
  await noHorizontalOverflow(page);
});

test('mobile exchange detail puts next action before conversation and uses a vertical journey',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/v2.html?isolated=disputed#exchange/ex1');

  const aside=page.locator('.bc-exchange-layout > aside');
  await expect(aside.locator('> section').first()).toHaveClass(/bc-next-step-card/);
  await expect(aside.locator('.bc-next-step-card')).toContainText('YOUR NEXT ACTION');
  await expect(aside.getByRole('heading',{name:'Exchange conversation'})).toBeVisible();

  const columns=await page.locator('.bc-timeline').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length);
  expect(columns).toBe(1);
  await noHorizontalOverflow(page);
});
