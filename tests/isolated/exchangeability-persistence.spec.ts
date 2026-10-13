import {test,expect} from './fixtures';

test('Ready for Exchange remains checked only after the owner update is confirmed',async({page})=>{
  await page.goto('/v2.html?isolated=ready-zero#sets');
  const toggle=page.locator('[data-exchangeable]').first();
  await toggle.check();
  await expect.poll(()=>page.evaluate(()=>window.__bcIsolated.collection[0].available_for_exchange)).toBe(true);
  await page.evaluate(async()=>window.bcV3Refresh());
  await expect(page.locator('[data-exchangeable]').first()).toBeChecked();
});

test('Ready for Exchange reverts when the canonical availability RPC fails',async({page})=>{
  await page.goto('/v2.html?isolated=ready-zero#sets');
  await page.evaluate(()=>window.__bcIsolated.failRpcs=['set_exchange_item_availability']);
  await page.locator('[data-exchangeable]').first().evaluate((input:HTMLInputElement)=>{input.checked=true;input.dispatchEvent(new Event('change',{bubbles:true}))});
  await expect(page.locator('.bc-toast')).toContainText('temporarily unavailable');
  await expect(page.locator('[data-exchangeable]').first()).not.toBeChecked();
});

declare global {interface Window {__bcIsolated:any;bcV3Refresh:()=>Promise<void>}}

test('owner review can be cleared when no active canonical case exists',async({page})=>{
  page.on('dialog',async dialog=>{
    expect(dialog.message()).toContain('have checked its condition and completeness');
    await dialog.accept();
  });
  await page.goto('/v2.html?isolated=owner-review#sets');
  await expect(page.getByText('Needs owner review')).toBeVisible();
  const recovery=page.getByRole('button',{name:'Review complete · make available'});
  await expect(recovery).toBeVisible();
  await recovery.click();
  await expect.poll(()=>page.evaluate(()=>({
    available:window.__bcIsolated.collection[0].available_for_exchange,
    review:window.__bcIsolated.collection[0].exchange_review_required
  }))).toEqual({available:true,review:false});
  await expect(page.locator('[data-exchangeable]').first()).toBeChecked();
  await expect(page.locator('.bc-pill.green').filter({hasText:'Available to Exchange'})).toBeVisible();
  await expect(recovery).toHaveCount(0);
});

test('owner review recovery is not offered while a canonical workflow is active',async({page})=>{
  await page.goto('/v2.html?isolated=owner-review-active#sets');
  await expect(page.getByRole('button',{name:'Review complete · make available'})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Cancel proposal & free set'})).toBeVisible();
  await expect(page.locator('[data-exchangeable]').first()).toBeDisabled();
});
