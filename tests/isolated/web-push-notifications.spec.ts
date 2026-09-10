import fs from 'node:fs';
import {test,expect} from './fixtures';

test('beta runtime has no Web Push dependency or system-notification control',async({page})=>{
  await page.addInitScript(()=>{
    Object.defineProperty(window,'PushManager',{configurable:true,value:undefined});
    Object.defineProperty(window,'Notification',{configurable:true,value:undefined});
  });
  await page.goto('/v2.html?isolated=ready-one#home');
  expect(await page.evaluate(()=>(window as any).BETA_PWA_ENABLED)).toBe(false);
  expect(await page.evaluate(()=>(window as any).bcWebPush)).toBeUndefined();
  await page.locator('[data-open="notifications"]').click();
  await expect(page.locator('[data-enable-push]')).toHaveCount(0);
});

test('durable reciprocal notification badge still opens Matches and marks the row read',async({page})=>{
  await page.goto('/v2.html?isolated=ready-one#home');
  await page.evaluate(()=>(window as any).__bcIsolated.emitNotification({id:'match-note-1',user_id:'00000000-0000-4000-8000-000000000007',kind:'reciprocal_match',title:'You have a new local BrickCircle match',body:'A nearby collector has a reciprocal LEGO match with you.',actor_user_id:'00000000-0000-4000-8000-000000000099',entity_type:'reciprocal_match',entity_id:'match-event-1',metadata:{route:'#matches'},read_at:null,created_at:'2026-09-07T09:00:00.000Z'}));
  await expect(page.locator('[data-open="notifications"] .bc-badge')).toHaveText('1');
  await page.locator('[data-open="notifications"]').click();
  await expect(page.locator('[data-note="match-note-1"]')).toContainText('View match');
  await page.locator('[data-note="match-note-1"]').dispatchEvent('click');
  await expect(page).toHaveURL(/#matches$/);
  await expect(page.locator('[data-open="notifications"] .bc-badge')).toHaveCount(0);
});

test('dormant browser assets never contain the VAPID private secret',async()=>{
  for(const file of ['v2.html','app-v3.js','web-push-v1.js','web-push-config.js','catalogue-cache-sw.js']){
    const source=fs.readFileSync(file,'utf8');
    expect(source).not.toContain('VAPID_PRIVATE_KEY');
    expect(source).not.toMatch(/vapidPrivateKey/i);
  }
});
