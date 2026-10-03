import {test,expect} from './fixtures';

async function noHorizontalOverflow(page:any){
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
}

test('mobile reciprocal match is visual, concise and proposal-first',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/v2.html?isolated=matched#matches');

  await expect(page.getByRole('heading',{name:'Great matches'})).toBeVisible();
  const match=page.locator('.bc-match-premium').first();
  await expect(match).toBeVisible();
  await expect(match.locator('.bc-match-set-image')).toHaveCount(2);
  await expect(match).toContainText('Two collections. One great exchange.');
  await expect(match.getByRole('button',{name:'View & propose'})).toBeVisible();

  await match.getByRole('button',{name:'View & propose'}).click();
  const modal=page.locator('.bc-modal');
  await expect(modal).toBeVisible();
  await expect(modal.locator('.bc-proposal-steps span')).toHaveCount(3);
  await expect(modal.locator('.bc-proposal-pair')).toBeVisible();
  await expect(modal.getByRole('button',{name:'Send proposal'})).toBeVisible();
  await noHorizontalOverflow(page);
});

test('mobile proposals are grouped under a needs-action exchange tab',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/v2.html?isolated=proposal#exchanges');

  await expect(page.getByRole('heading',{name:'Exchanges',exact:true})).toBeVisible();
  const notification=page.locator('#bc-overlay[data-bc-notification-presentation="proposal"]');
  if(await notification.count())await notification.getByRole('button',{name:'Not now'}).click();
  const needsAction=page.getByRole('button',{name:/Needs action · 1/});
  await expect(needsAction).toBeVisible();
  await needsAction.click();
  await expect(page.locator('.bc-request')).toBeVisible();
  await expect(page.locator('.bc-request').getByRole('button',{name:'Accept'})).toBeVisible();
  await noHorizontalOverflow(page);
});

test('mobile exchange detail surfaces the next valid action before secondary content',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/v2.html?isolated=proposal#exchange/proposal-request-1');

  const next=page.locator('.bc-mobile-next');
  await expect(next).toBeVisible();
  await expect(next).toContainText('YOUR NEXT ACTION');
  await expect(next).toContainText('Accept proposal');
  await expect(next.getByRole('button',{name:'Accept proposal'})).toBeVisible();
  await noHorizontalOverflow(page);
});
