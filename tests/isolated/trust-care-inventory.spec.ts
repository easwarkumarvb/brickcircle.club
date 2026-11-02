import {test,expect} from './fixtures';

declare global {interface Window {__bcIsolated:any}}

test('owner can honestly disclose known gaps in My LEGO details',async({page})=>{
  await page.goto('/v2.html?isolated=ready-zero#sets');
  await page.locator('[data-edit-set]').first().click();
  const form=page.locator('#bc-edit-item');
  await expect(form.locator('[name="inventory_review_status"]')).toBeVisible();
  await form.locator('[name="inventory_review_status"]').selectOption('known_gaps');
  await form.locator('[name="notes"]').fill('One grey axle is missing; gearbox not yet tested.');
  await form.getByRole('button',{name:'Save details'}).click();
  await expect.poll(()=>page.evaluate(()=>window.__bcIsolated.collection[0].inventory_review_status)).toBe('known_gaps');
  await expect(page.getByText('Known parts gaps')).toBeVisible();
});

test('known gaps require a written disclosure, not a completeness promise',async({page})=>{
  await page.goto('/v2.html?isolated=ready-zero#sets');
  await page.locator('[data-edit-set]').first().click();
  const form=page.locator('#bc-edit-item');
  await form.locator('[name="inventory_review_status"]').selectOption('known_gaps');
  await form.getByRole('button',{name:'Save details'}).click();
  await expect(page.locator('.bc-toast')).toContainText('describe the known missing pieces');
  await expect(form).toBeVisible();
});

test('a set with missing supplementary photos cannot become available',async({page})=>{
  await page.goto('/v2.html?isolated=ready-zero#sets');
  await page.evaluate(()=>{window.__bcIsolated.photoAngles=[]});
  const toggle=page.locator('[data-exchangeable]').first();
  await toggle.evaluate((input:HTMLInputElement)=>{input.checked=true;input.dispatchEvent(new Event('change',{bubbles:true}))});
  await expect(toggle).not.toBeChecked();
  await expect(page.locator('.bc-toast')).toContainText('add front, side and rear photos');
  expect(await page.evaluate(()=>window.__bcIsolated.rpcCalls.filter((x:any)=>x.name==='set_exchange_item_availability').length)).toBe(0);
});
