import {test,expect} from './fixtures';

async function selectReplacement(page:any){
  await page.locator('[data-change-photo="photo-item-1"]').click();
  const form=page.locator('#bc-owner-photo-form');
  await expect(form).toBeVisible();
  await form.locator('#bc-owner-photo-input').setInputFiles({name:'replacement.webp',mimeType:'image/webp',buffer:Buffer.from('replacement-owner-photo')});
  await form.getByRole('button',{name:'Save new photo'}).click();
}

test('replaces an owned-set photo only after the owner-scoped database update succeeds',async({page})=>{
  await page.goto('/v2.html?isolated=photo-replace#sets');
  const oldPath='00000000-0000-4000-8000-000000000007/old-owner-photo.jpg';
  await expect(page.locator('[data-change-photo="photo-item-1"]')).toBeVisible();
  await selectReplacement(page);
  await expect(page.locator('.bc-toast')).toHaveText('Set photo updated.');
  const result=await page.evaluate(()=>({
    item:window.__bcIsolated.collection[0],
    updates:window.__bcIsolated.updateCalls,
    removals:window.__bcIsolated.storage.removals
  }));
  expect(result.item.owner_photo_path).not.toBe(oldPath);
  expect(result.item.available_for_exchange).toBe(true);
  expect(result.removals).toContain(oldPath);
  expect(result.updates).toContainEqual(expect.objectContaining({
    table:'collection_items',
    filters:expect.arrayContaining([['id','photo-item-1'],['user_id','00000000-0000-4000-8000-000000000007']])
  }));
  await expect(page.locator('.bc-myset-visual img')).toHaveAttribute('alt','Owner photo of assembled LEGO set');
});

test('keeps the current owner photo when replacement upload fails',async({page})=>{
  await page.goto('/v2.html?isolated=photo-replace#sets');
  const oldPath='00000000-0000-4000-8000-000000000007/old-owner-photo.jpg';
  await page.evaluate(()=>window.__bcIsolated.storage.failUpload=true);
  await selectReplacement(page);
  expect(await page.evaluate(()=>window.__bcIsolated.collection[0].owner_photo_path)).toBe(oldPath);
  expect(await page.evaluate(()=>window.__bcIsolated.storage.removals)).not.toContain(oldPath);
});

test('cleans up only the new upload when the owner-scoped database update fails',async({page})=>{
  await page.goto('/v2.html?isolated=photo-replace#sets');
  const oldPath='00000000-0000-4000-8000-000000000007/old-owner-photo.jpg';
  await page.evaluate(()=>window.__bcIsolated.failTables.push('collection_items'));
  await selectReplacement(page);
  const result=await page.evaluate(()=>({item:window.__bcIsolated.collection[0],uploads:window.__bcIsolated.storage.uploads,removals:window.__bcIsolated.storage.removals}));
  expect(result.item.owner_photo_path).toBe(oldPath);
  expect(result.item.available_for_exchange).toBe(true);
  expect(result.uploads).toHaveLength(1);
  expect(result.removals).toContain(result.uploads[0]);
  expect(result.removals).not.toContain(oldPath);
});

declare global {interface Window {__bcIsolated:any}}
