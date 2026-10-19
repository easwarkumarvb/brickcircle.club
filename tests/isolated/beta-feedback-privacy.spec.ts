import fs from 'node:fs';
import {test,expect} from './fixtures';
const mock=fs.readFileSync('tests/isolated/fixtures/three-user-supabase-browser-mock.js','utf8');
const A='00000000-0000-4000-8000-000000000101',B='00000000-0000-4000-8000-000000000102';
const stamp='2026-10-05T12:00:00Z';
const secrets=['PRIVATE_MESSAGE_SECRET','DISPLAY_NAME_SECRET','EMAIL_SECRET','PHOTO_URL_SECRET','QUERY_TOKEN_SECRET','HASH_TOKEN_SECRET','RAW_ERROR_SECRET','STORAGE_SECRET',A,B,'guide-case'];

test('Messages feedback is explicit, accessible, copyable and excludes private browser/conversation data',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  const database={
    profiles:[
      {id:A,display_name:'DISPLAY_NAME_SECRET',email:'EMAIL_SECRET@example.invalid',avatar_url:'https://images.invalid/PHOTO_URL_SECRET',country:'India',city:'Bengaluru',adult_confirmed_at:stamp,created_at:stamp},
      {id:B,display_name:'Partner',email:'partner@example.invalid',avatar_url:'https://images.invalid/PHOTO_URL_SECRET',country:'India',city:'Bengaluru',adult_confirmed_at:stamp,created_at:stamp}
    ],
    collection:[],wishlist:[],exchanges:[{id:'guide-case',user_a:A,user_b:B,proposer_id:A,recipient_id:B,item_a:'item-a',item_b:'item-b',duration_days:60,state:'PROPOSED',state_version:5,created_at:stamp,updated_at:stamp}],
    events:[],notifications:[],messages:[{id:'HASH_TOKEN_SECRET',case_id:'guide-case',sender_id:B,recipient_id:A,body:'PRIVATE_MESSAGE_SECRET',created_at:stamp}],directMessages:[],reviews:[],
    issues:[],issueResponses:[],supportRequests:[],peerReviews:[]
  };
  await page.addInitScript(({database}:any)=>{
    localStorage.setItem('bc_three_user_actor','easwar');
    localStorage.setItem('bc_three_user_db',JSON.stringify(database));
    localStorage.setItem('synthetic-private-key','STORAGE_SECRET');
    sessionStorage.setItem('synthetic-private-key','STORAGE_SECRET');
    document.cookie='synthetic=STORAGE_SECRET; path=/';
    sessionStorage.setItem('bc_three_user_initialized','1');
    (window as any).__syntheticRawError='RAW_ERROR_SECRET';
  },{database});
  await page.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4',(route:any)=>route.fulfill({contentType:'application/javascript',body:mock}));
  await page.goto('/v2.html?isolated=three-user&private=QUERY_TOKEN_SECRET#messages');

  const report=page.getByRole('button',{name:'Report a problem'});
  await expect(report).toBeVisible();
  await report.click();
  let dialog=page.getByRole('dialog',{name:'Report a problem'});
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Description (optional)')).toHaveValue('');
  await expect(dialog).toContainText('support@brickcircle.club');
  await expect(dialog).toContainText('Avoid sensitive information');
  await expect(dialog.locator('input[type="file"]')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(report).toBeFocused();

  await page.evaluate(()=>(window as any).bcNav('messages','case:guide-case:message:HASH_TOKEN_SECRET'));
  await expect(page.locator('[data-open-beta-feedback][data-feedback-screen="conversation"]')).toBeVisible();
  const beforeComposer=await page.evaluate(()=>{const state=(window as any).__bcThreeUser;return {rpcArgs:state.rpcArgs.length,supportRequests:state.data.supportRequests.length}});
  await page.locator('[data-open-beta-feedback][data-feedback-screen="conversation"]').click();
  dialog=page.getByRole('dialog',{name:'Report a problem'});
  const description=dialog.getByLabel('Description (optional)');
  const preview=dialog.getByLabel('Copyable report');
  const send=dialog.getByRole('link',{name:'Open email'});
  await expect(description).toHaveValue('');
  const emptyBody=await send.getAttribute('href');
  expect(emptyBody).toContain('mailto:support@brickcircle.club');
  expect(decodeURIComponent(emptyBody||'')).toContain('Release: 20261019-private-feedback-r1');
  expect(decodeURIComponent(emptyBody||'')).toContain('Screen: Conversation');
  for(const secret of secrets)expect(decodeURIComponent(emptyBody||'')).not.toContain(secret);
  expect(await page.evaluate(()=>document.querySelector('[data-feedback-mail]')?.getAttribute('href'))).toBe(emptyBody);
  expect(await page.evaluate(()=>{const state=(window as any).__bcThreeUser;return {rpcArgs:state.rpcArgs.length,supportRequests:state.data.supportRequests.length}})).toEqual(beforeComposer);

  await description.fill('The screen does not fit on my phone.');
  const href=await send.getAttribute('href');
  const decoded=decodeURIComponent(href||'');
  expect(decoded).toContain('The screen does not fit on my phone.');
  expect(decoded).toContain('Release: 20261019-private-feedback-r1');
  expect(decoded).toContain('Screen: Conversation');
  for(const secret of secrets)expect(decoded).not.toContain(secret);

  await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw new Error('synthetic clipboard rejection')}}}));
  await dialog.getByRole('button',{name:'Copy report'}).click();
  await expect(dialog.getByRole('status')).toContainText('Could not copy');
  expect(await preview.inputValue()).toContain('The screen does not fit on my phone.');

  await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async(text:string)=>{(window as any).__copiedReport=text}}}));
  await dialog.getByRole('button',{name:'Copy report'}).click();
  await expect(dialog.getByRole('status')).toContainText('Report copied. It has not been sent.');
  const copied=await page.evaluate(()=>(window as any).__copiedReport);
  expect(copied).toBe(await preview.inputValue());
  for(const secret of secrets)expect(copied).not.toContain(secret);
  await dialog.getByRole('button',{name:'Close report composer'}).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('[data-open-beta-feedback][data-feedback-screen="conversation"]')).toBeFocused();
});
