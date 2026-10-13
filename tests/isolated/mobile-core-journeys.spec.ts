import {test,expect} from './fixtures';

async function noHorizontalOverflow(page:any){
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
}

test('mobile reciprocal match is visual, concise and proposal-first',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/v2.html?isolated=matched#home');
  await page.getByRole('button',{name:'View my match'}).first().click();
  await expect(page).toHaveURL(/#matches$/);

  await expect(page.getByRole('heading',{name:'Great matches'})).toBeVisible();
  const match=page.locator('.bc-match-premium').first();
  await expect(match).toBeVisible();
  await expect(match.locator('.bc-match-set-image')).toHaveCount(2);
  await expect(match).toContainText('Two collections. One great exchange.');
  await expect(match.getByRole('button',{name:'View & propose'})).toBeVisible();

  await match.getByRole('button',{name:'View & propose'}).click();
  const proposal=page.locator('#bc-inline-proposal');
  await expect(proposal).toBeVisible();
  await expect(page.getByRole('heading',{name:'Match Collector'})).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('heading',{name:'Propose an exchange'})).toBeVisible();
  await expect(proposal.locator('[name="days"]')).toBeVisible();
  await expect(proposal.locator('[name="message"]')).toBeVisible();
  await expect(proposal.getByRole('button',{name:'Send proposal'})).toBeVisible();
  await expect(page.locator('[data-clear-reply-case]')).toHaveCount(0);
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

test('mobile case conversation surfaces the next valid action before message history',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/v2.html?isolated=proposal#exchange/proposal-request-1');

  await page.locator('[data-view-collector-case="proposal-request-1"]').first().click();
  const next=page.getByRole('region',{name:'Exchange next step'});
  await expect(next).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>decodeURIComponent(location.hash))).toBe('#messages/case:proposal-request-1');
  await expect(next).toContainText('Your turn');
  await expect(next).toContainText('Accept proposal');
  await expect(next.locator('[data-thread-case-action="accept"]')).toHaveCount(1);
  await expect(page.locator('[data-thread-case-action="accept"]')).toHaveCount(1);
  await expect(next.getByRole('button',{name:'Accept proposal'})).toBeVisible();
  const beforeHistory=await page.locator('#bc-collector-action').evaluate(node=>{const chat=document.querySelector('#bc-msg-chat');return !!chat&&!!(node.compareDocumentPosition(chat)&Node.DOCUMENT_POSITION_FOLLOWING)});
  expect(beforeHistory).toBeTruthy();
  await noHorizontalOverflow(page);
});


test('inline proposal remains keyboard-accessible and keeps its draft in the collector conversation',async({page})=>{
  await page.goto('/v2.html?isolated=matched#home');
  await page.getByRole('button',{name:'View my match'}).first().click();
  await page.getByRole('button',{name:'View & propose'}).first().click();
  const form=page.locator('#bc-inline-proposal'),message=form.locator('[name="message"]');
  await expect(form).toBeVisible();
  await message.fill('Inspect at the library first');
  await message.focus();
  await page.keyboard.press('Tab');
  await expect(form.getByRole('button',{name:'Send proposal'})).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(message).toBeFocused();
  await expect(message).toHaveValue('Inspect at the library first');
  await expect(page.locator('#bc-overlay')).toHaveCount(0);
});
