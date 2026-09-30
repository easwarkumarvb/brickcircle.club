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
