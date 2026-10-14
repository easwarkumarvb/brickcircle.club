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
  await page.evaluate(()=>window.__bcIsolated.definiteRejectTables.push('collection_items'));
  await selectReplacement(page);
  const result=await page.evaluate(()=>({item:window.__bcIsolated.collection[0],uploads:window.__bcIsolated.storage.uploads,removals:window.__bcIsolated.storage.removals}));
  expect(result.item.owner_photo_path).toBe(oldPath);
  expect(result.item.available_for_exchange).toBe(true);
  expect(result.uploads).toHaveLength(1);
  expect(result.removals).toContain(result.uploads[0]);
  expect(result.removals).not.toContain(oldPath);
});

declare global {interface Window {__bcIsolated:any}}

for(const mode of ['photo-replace','partial','empty'])for(const outcome of ['zero','lost'])test(`${mode} photo metadata ${outcome} never deletes a referenced photo or reports success`,async({page})=>{
  await page.goto(`/v2.html?isolated=${mode}#${mode==='empty'?'browse':'sets'}`);
  if(mode==='photo-replace')await page.locator('[data-change-photo="photo-item-1"]').click();
  else if(mode==='partial')await page.locator('[data-exchangeable="c1"]').click();
  else await page.locator('[data-own]').first().click();
  await page.evaluate(outcome=>{if(outcome==='zero')window.__bcIsolated.silentNoUpdate=true;else window.__bcIsolated.lostCommitTables.push('collection_items')},outcome);
  const form=page.locator('#bc-owner-photo-form');await form.locator('#bc-owner-photo-input').setInputFiles({name:'new.webp',mimeType:'image/webp',buffer:Buffer.from('synthetic')});
  await form.getByRole('button',{name:mode==='photo-replace'?'Save new photo':mode==='partial'?'Upload photo':'Add to My Sets',exact:true}).click();
  await expect(form.locator('[data-photo-status]')).toContainText(outcome==='lost'?'could not be confirmed':'not saved');
  const state=await page.evaluate(()=>({collection:window.__bcIsolated.collection,uploads:window.__bcIsolated.storage.uploads,removals:window.__bcIsolated.storage.removals}));
  expect(state.uploads).toHaveLength(1);
  if(outcome==='lost'){expect(state.collection[0].owner_photo_path).toBe(state.uploads[0]);expect(state.removals).not.toContain(state.uploads[0])}
  else expect(state.removals).toContain(state.uploads[0]);
  expect(state.removals).not.toContain('00000000-0000-4000-8000-000000000007/old-owner-photo.jpg');
});
