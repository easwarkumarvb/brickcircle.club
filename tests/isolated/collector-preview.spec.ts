import {test,expect} from './fixtures';
const preview='/visual-prototype.html';
for(const width of [320,390,1440]){
 test(`collector preview preserves navigation and messaging at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});
  await page.goto(`${preview}?isolated=signed-out#home`);
  await expect(page.locator('.bc-landing-hero')).toBeVisible();
  await expect(page.locator('html')).toHaveClass('bc-collector-preview');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
  await page.goto(`${preview}?isolated=matched#browse`);
  await expect(page.locator('.bc-pop-chip')).toHaveCount(12);
  await expect(page.locator('.bc-set-card').first()).toBeVisible();
  await page.locator('.bc-set-card-open').first().click();
  await expect(page.locator('.bc-overlay')).toBeVisible();
  await page.locator('.bc-close').click();
  await page.locator('[data-cat="supercars"]').click();
  await expect(page.locator('[data-cat="supercars"]')).toHaveAttribute('aria-pressed','true');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
  await page.evaluate(()=>{
   const s=(window as any).__bcIsolated,uid='00000000-0000-4000-8000-000000000007',peer='00000000-0000-4000-8000-000000000099';
   s.publicProfiles=[{id:peer,display_name:'Alex Collector',city:'Bengaluru',country:'India'}];
   s.messages=[{id:'preview-message',sender_id:peer,recipient_id:uid,exchange_id:null,body:'Ready for our next build?',created_at:'2026-10-05T12:00:00Z'}];
   location.hash='messages';
  });
  await expect(page.locator('.bc-msg-row')).toHaveCount(1);
  await page.locator('.bc-msg-row').click();
  await expect(page.locator('#bc-msg-form')).toBeVisible();
  await page.locator('#bc-msg-form textarea').fill('Saturday works for me.');
  await page.locator('#bc-msg-form button').click();
  await expect(page.locator('#bc-msg-chat')).toContainText('Saturday works for me.');
  await expect(page.locator('#bc-msg-form textarea')).toHaveValue('');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
  await page.getByRole('button',{name:'Back to Messages'}).click();
  await expect(page.locator('.bc-msg-row')).toHaveCount(1);
 });
}
test('canonical app does not opt into collector styles',async({page})=>{
 await page.goto('/v2.html?isolated=signed-out#home');
 await expect(page.locator('.bc-landing-hero')).toBeVisible();
 await expect(page.locator('html')).not.toHaveClass('bc-collector-preview');
 await expect(page.locator('link[href*="visual-prototype.css"]')).toHaveCount(0);
});
