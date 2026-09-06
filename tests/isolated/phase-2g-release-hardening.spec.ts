import {test,expect} from './fixtures';

test('PASSWORD_RECOVERY validates, retries and preserves the signed-in session',async({page})=>{
  await page.goto('/v2.html?isolated=recovery&type=recovery&token_hash=isolated-token#home');
  await page.evaluate(()=>window.__bcIsolated.emitAuth('PASSWORD_RECOVERY'));
  const form=page.locator('#bc-password-recovery');
  await expect(form).toBeVisible();
  await expect(form.locator('[name="password"]')).toBeFocused();

  await form.locator('[name="password"]').fill('password123');
  await form.locator('[name="confirm"]').fill('different123');
  await form.evaluate((element:HTMLFormElement)=>element.requestSubmit());
  await expect(page.locator('.bc-toast')).toContainText('Passwords do not match');
  expect(await page.evaluate(()=>window.__bcIsolated.authCalls.filter((call:any)=>call.method==='updateUser').length)).toBe(0);

  await page.evaluate(()=>{window.__bcIsolated.failUpdateUser=true});
  await form.locator('[name="confirm"]').fill('password123');
  await form.evaluate((element:HTMLFormElement)=>element.requestSubmit());
  await expect(page.locator('.bc-toast')).toContainText('Password update temporarily unavailable');
  await expect(form.getByRole('button',{name:'Save new password'})).toBeEnabled();

  await page.evaluate(()=>{window.__bcIsolated.failUpdateUser=false});
  await form.evaluate((element:HTMLFormElement)=>element.requestSubmit());
  await expect(page.locator('.bc-profile-hero')).toContainText('Isolated Collector');
  await expect(page).toHaveURL(/#profile$/);
  await expect(page).not.toHaveURL(/token_hash=|type=recovery/);
  const calls=await page.evaluate(()=>window.__bcIsolated.authCalls.filter((call:any)=>call.method==='updateUser'));
  expect(calls).toHaveLength(2);
  expect(calls[1].attributes).toEqual({password:'password123'});
});

test('disputed exchange keeps participant chat while progression stays paused',async({page})=>{
  await page.goto('/v2.html?isolated=disputed#exchange/ex1');
  await expect(page.locator('#bc-flow')).toContainText('Exchange paused');
  const chat=page.locator('#bc-chat-form');
  await expect(chat).toBeVisible();
  await expect(page.locator('[data-schedule],[data-flow-action],[data-cancel-exchange]')).toHaveCount(0);
  await chat.locator('[name="message"]').fill('I have documented the issue.');
  await chat.evaluate((element:HTMLFormElement)=>element.requestSubmit());
  await expect.poll(()=>page.evaluate(()=>window.__bcIsolated.messages.length)).toBe(1);
  expect(await page.evaluate(()=>window.__bcIsolated.messages[0])).toMatchObject({exchange_id:'ex1',body:'I have documented the issue.'});
});

test('completed exchange remains terminal and hides participant messaging',async({page})=>{
  await page.goto('/v2.html?isolated=completed#exchange/ex1');
  await expect(page.locator('#bc-flow')).toContainText('Exchange complete');
  await expect(page.locator('#bc-chat-form')).toHaveCount(0);
  await expect(page.locator('[data-schedule],[data-flow-action],[data-cancel-exchange]')).toHaveCount(0);
});

test('transient getUser failure preserves the last confirmed signed-in view',async({page})=>{
  await page.goto('/v2.html?isolated=partial#sets');
  await expect(page.locator('[data-settab="collection"]')).toContainText('2');
  await page.evaluate(async()=>{window.__bcIsolated.failGetUser=true;await window.bcV3Refresh()});
  await expect(page.locator('[data-settab="collection"]')).toContainText('2');
  await expect(page.locator('.bc-refresh-warning')).toContainText('last confirmed view');
  await expect(page.locator('[data-nav="profile"]').first()).toBeVisible();
});

test('failed slices stay visible while successful slices refresh, then true sign-out clears state',async({page})=>{
  await page.goto('/v2.html?isolated=partial#home');
  await page.evaluate(async()=>{
    const state=window.__bcIsolated;
    state.exchanges.push({id:'ex1',request_id:'r1',user_a:'00000000-0000-4000-8000-000000000007',user_b:'00000000-0000-4000-8000-000000000099',item_a:'c1',item_b:'other-item-1',duration_days:60,state:'accepted',created_at:'2026-09-03T12:00:00.000Z'});
    await window.bcV3Refresh();
    state.collection.push({id:'c3',user_id:'00000000-0000-4000-8000-000000000007',set_number:'42115-1',available_for_exchange:false,created_at:'2026-09-03T12:00:00.000Z'});
    state.wishlist=[];state.exchanges=[];state.failTables=['wishlists','exchanges'];
    await window.bcV3Refresh();
  });
  await expect(page.locator('.bc-guided-progress')).toContainText('3/3 owned sets added');
  await expect(page.locator('.bc-guided-progress')).toContainText('1/3 wanted sets added');
  await expect(page.locator('.bc-dashboard-grid .bc-dash-card').filter({hasText:'Exchange activity'}).locator('.bc-statbig')).toHaveText('1');
  await expect(page.locator('.bc-refresh-warning')).toBeVisible();

  await page.evaluate(async()=>{const state=window.__bcIsolated;state.failTables=[];state.setSignedOut(true);await window.bcV3Refresh()});
  await expect(page.locator('.bc-landing-hero')).toBeVisible();
  await expect(page.locator('[data-nav="profile"]')).toHaveCount(0);
  await expect(page.locator('.bc-refresh-warning')).toHaveCount(0);
});

declare global {
  interface Window {__bcIsolated:any;bcV3Refresh:()=>Promise<void>}
}
