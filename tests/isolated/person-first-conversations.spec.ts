import fs from 'node:fs';
import {test,expect} from './fixtures';
const mock=fs.readFileSync('tests/isolated/fixtures/three-user-supabase-browser-mock.js','utf8');
const A='00000000-0000-4000-8000-000000000101',B='00000000-0000-4000-8000-000000000102',C='00000000-0000-4000-8000-000000000103';
const stamp='2026-10-05T12:00:00Z';
async function open(page:any,route='messages/case:guide-case',state='ACCEPTED',twoCases=false){
  const profiles=[{id:A,display_name:'Easwar'},{id:B,display_name:'Ramya'},{id:C,display_name:'Dhyan'}].map(p=>({...p,country:'India',city:'Bengaluru',adult_confirmed_at:stamp,created_at:stamp}));
  const first={id:'guide-case',user_a:A,user_b:B,proposer_id:A,recipient_id:B,item_a:'item-a',item_b:'item-b',duration_days:60,state,state_version:5,created_at:stamp,updated_at:stamp};
  const database={profiles,collection:[{id:'item-a',user_id:A,set_number:'42172-1',available_for_exchange:false},{id:'item-b',user_id:B,set_number:'42143-1',available_for_exchange:false}],wishlist:[],exchanges:twoCases?[first,{...first,id:'second-case',item_a:'item-c',item_b:'item-d',state:'PROPOSED',state_version:2,created_at:'2026-10-06T12:00:00Z'}]:[first],events:[],notifications:[],messages:[],directMessages:[],reviews:[],issues:[],issueResponses:[],supportRequests:[],peerReviews:[]};
  await page.addInitScript(({database}:any)=>{localStorage.setItem('bc_three_user_actor','easwar');localStorage.setItem('bc_three_user_db',JSON.stringify(database));sessionStorage.setItem('bc_three_user_initialized','1')},{database});
  await page.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4',(r:any)=>r.fulfill({contentType:'application/javascript',body:mock}));
  page.on('pageerror',e=>console.log('BROWSER ERROR',e.stack));
  page.on('console',e=>{if(e.type()==='error')console.log('BROWSER CONSOLE',e.text())});
  await page.goto('/v2.html?isolated=three-user#'+route);
  await expect(page.locator('#bc-msg-form')).toBeVisible();
}
test('case deep link views its exchange while ordinary compose targets the named collector',async({page})=>{
  await open(page);
  await expect(page.locator('#bc-case-destination')).toHaveCount(0);
  await expect(page.locator('.bc-person-case-chip')).toHaveCount(1);
  await expect(page.locator('.bc-conversation-guide')).toBeVisible();
  await expect(page.locator('#bc-msg-form')).toHaveAttribute('data-bc-compose-kind','direct');
  await page.locator('#bc-msg-form textarea').fill('Hello Ramya');
  await page.locator('#bc-msg-form').evaluate((f:HTMLFormElement)=>f.requestSubmit());
  await expect.poll(()=>page.evaluate(()=>(window as any).__bcThreeUser.data.directMessages.length)).toBe(1);
  expect(await page.evaluate(()=>(window as any).__bcThreeUser.data.messages.length)).toBe(0);
});
test('explicit contextual reply binds exactly one case and returns to general chat',async({page})=>{
  await open(page);
  await page.locator('[data-reply-about-case="guide-case"]').click();
  await expect(page.locator('#bc-msg-form')).toHaveAttribute('data-bc-compose-kind','case');
  await expect(page.locator('#bc-compose-context')).toContainText('Replying about');
  await page.locator('#bc-msg-form textarea').fill('I can meet at the library');
  await page.locator('#bc-msg-form').evaluate((f:HTMLFormElement)=>f.requestSubmit());
  await expect.poll(()=>page.evaluate(()=>(window as any).__bcThreeUser.data.messages.length)).toBe(1);
  expect(await page.evaluate(()=>(window as any).__bcThreeUser.data.messages[0].case_id)).toBe('guide-case');
  await page.locator('[data-clear-compose-context]').click();
  await expect(page.locator('#bc-msg-form')).toHaveAttribute('data-bc-compose-kind','direct');
});
test('two exchanges stay under one name and case selection never changes send destination',async({page})=>{
  await open(page,'messages/direct:'+B,'ACCEPTED',true);
  await expect(page.locator('.bc-person-case-chip')).toHaveCount(2);
  await page.locator('[data-focus-case="second-case"]').click();
  await expect(page.locator('.bc-person-case-chip.selected')).toHaveCount(1);
  await expect(page.locator('#bc-msg-form')).toHaveAttribute('data-bc-compose-kind','direct');
  await page.locator('[data-reply-about-case="second-case"]').click();
  await expect(page.locator('#bc-msg-form')).toHaveAttribute('data-bc-compose-id','second-case');
  await page.locator('[data-focus-case="guide-case"]').click();
  await expect(page.locator('#bc-msg-form')).toHaveAttribute('data-bc-compose-kind','direct');
  await expect(page.locator('#bc-compose-context')).toBeHidden();
});
for(const state of ['COMPLETED','CANCELLED'])test(`closed ${state} exchange retains general collector chat`,async({page})=>{
  await open(page,'messages/case:guide-case',state);
  await expect(page.locator('#bc-msg-form')).toBeVisible();
  await expect(page.locator('[data-reply-about-case]')).toBeVisible();
  await page.locator('[data-reply-about-case]').click();
  await expect(page.locator('#bc-msg-form')).toHaveAttribute('data-bc-compose-kind','direct');
});
test('per-collector unsent draft survives reload in the same signed-in tab',async({page})=>{
  await open(page,'messages/direct:'+B);
  await page.locator('#bc-msg-form textarea').fill('Sunday at the cafe?');
  await page.reload();
  await expect(page.locator('#bc-msg-form textarea')).toHaveValue('Sunday at the cafe?');
});
test('inbox searches by collector name without splitting exchange threads',async({page})=>{
  await open(page,'messages/direct:'+B);
  await page.goto('/v2.html?isolated=three-user#messages');
  const search=page.locator('[data-message-search]');
  await expect(search).toBeVisible();
  await search.fill('ram');
  await expect(page.locator('.bc-msg-row')).toHaveCount(1);
  await search.fill('nobody');
  await expect(page.locator('.bc-msg-row')).toHaveCount(0);
});
for(const width of [320,390])test(`mobile collector chat fits ${width}px with one usable composer`,async({page})=>{
  await page.setViewportSize({width,height:780});await open(page);
  await expect(page.locator('#bc-msg-form textarea')).toBeVisible();
  await expect(page.locator('#bc-msg-form button[type="submit"]')).toBeVisible();
  const input=await page.locator('#bc-msg-form textarea').boundingBox();
  const send=await page.locator('#bc-msg-form button[type="submit"]').boundingBox();
  expect(input&&send&&send.x>input.x+input.width-2).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
