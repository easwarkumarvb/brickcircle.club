import fs from 'node:fs';
import {test,expect} from './fixtures';
const mock=fs.readFileSync('tests/isolated/fixtures/three-user-supabase-browser-mock.js','utf8');
const A='00000000-0000-4000-8000-000000000101',B='00000000-0000-4000-8000-000000000102';
const stamp='2026-10-05T12:00:00Z';
async function open(page:any,route='messages/case:guide-case',state='PROPOSED'){
 const database={profiles:[{id:A,display_name:'Easwar'},{id:B,display_name:'Ramya'}].map(p=>({...p,email:p.id+'@example.invalid',country:'India',city:'Bengaluru',adult_confirmed_at:stamp,created_at:stamp})),collection:[{id:'item-a',user_id:A,set_number:'42172-1'},{id:'item-b',user_id:B,set_number:'42143-1'}],wishlist:[],exchanges:[{id:'guide-case',user_a:A,user_b:B,proposer_id:A,recipient_id:B,item_a:'item-a',item_b:'item-b',duration_days:60,state,state_version:5,created_at:stamp,updated_at:stamp}],events:[],notifications:[],messages:[],directMessages:[],reviews:[],issues:[],issueResponses:[],supportRequests:[],peerReviews:[]};
 await page.addInitScript(({database}:any)=>{localStorage.setItem('bc_three_user_actor','easwar');localStorage.setItem('bc_three_user_db',JSON.stringify(database));sessionStorage.setItem('bc_three_user_initialized','1')},{database});
 await page.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4',(r:any)=>r.fulfill({contentType:'application/javascript',body:mock}));
 await page.goto('/v2.html?isolated=three-user#'+route);
}
test('opening a case does not silently redirect the composer',async({page})=>{
 await page.setViewportSize({width:390,height:844});await open(page);
 await expect(page.locator('#bc-msg-form')).toBeVisible();
 await expect(page.locator('#bc-case-destination')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Reply about this exchange'})).toBeVisible();
 await page.locator('#bc-msg-form textarea').fill('General chat only');
 await page.locator('#bc-msg-form').evaluate((f:HTMLFormElement)=>f.requestSubmit());
 await expect.poll(()=>page.evaluate(()=>(window as any).__bcThreeUser.data.directMessages.some((x:any)=>x.body==='General chat only'))).toBe(true);
 expect(await page.evaluate(()=>(window as any).__bcThreeUser.data.messages.some((x:any)=>x.body==='General chat only'))).toBe(false);
});
test('explicit exchange-reply chip sends only to selected case',async({page})=>{
 await open(page);
 await page.getByRole('button',{name:'Reply about this exchange'}).click();
 await expect(page.locator('#bc-compose-context')).toContainText('About');
 await page.locator('#bc-msg-form textarea').fill('For this exact exchange');
 await page.locator('#bc-msg-form').evaluate((f:HTMLFormElement)=>f.requestSubmit());
 await expect.poll(()=>page.evaluate(()=>(window as any).__bcThreeUser.data.messages.some((x:any)=>x.body==='For this exact exchange'&&x.case_id==='guide-case'))).toBe(true);
});
test('completed exchange retains ordinary collector composer',async({page})=>{
 await open(page,'messages/case:guide-case','COMPLETED');
 await expect(page.locator('#bc-msg-form')).toBeVisible();
 await expect(page.getByRole('button',{name:'Reply about this exchange'})).toHaveCount(0);
 await expect(page.locator('#bc-case-destination')).toHaveCount(0);
});

test('collector opens directly by name and sees the next exchange action above chat',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await open(page,'messages/direct:'+B);
 await expect(page.locator('.bc-msg-hero')).toContainText('Ramya');
 await expect(page.locator('.bc-conversation-exchanges')).toContainText('exchange');
 await expect(page.locator('.bc-conversation-exchanges [data-thread-case-action]')).toHaveCount(1);
 await expect(page.getByRole('button',{name:'Reply about this exchange'})).toBeVisible();
 await expect(page.locator('#bc-msg-form')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('two distinct exchanges share one named-person chat but never cross-route explicit replies',async({page})=>{
 await open(page,'messages/direct:'+B);
 await page.evaluate(()=>{const s=(window as any).__bcThreeUser;s.data.exchanges.push({...s.data.exchanges[0],id:'case-two',state:'ACCEPTED',state_version:2,created_at:'2026-10-06T12:00:00Z',updated_at:'2026-10-06T12:00:00Z'});s.persist();location.hash='#messages';});
 await expect(page.locator('.bc-msg-row')).toHaveCount(1);
 await page.locator('.bc-msg-row').click();
 await expect(page.locator('.bc-peer-case-chip')).toHaveCount(2);
 await page.locator('[data-focus-peer-case="case-two"]').click();
 await expect(page.getByRole('button',{name:'Reply about this exchange'})).toBeVisible();
 await page.getByRole('button',{name:'Reply about this exchange'}).click();
 await page.locator('#bc-msg-form textarea').fill('Second case message');
 await page.locator('#bc-msg-form').evaluate((f:HTMLFormElement)=>f.requestSubmit());
 await expect.poll(()=>page.evaluate(()=>(window as any).__bcThreeUser.data.messages.find((x:any)=>x.body==='Second case message')?.case_id)).toBe('case-two');
 expect(await page.evaluate(()=>(window as any).__bcThreeUser.data.messages.some((x:any)=>x.body==='Second case message'&&x.case_id==='guide-case'))).toBe(false);
});
test('refresh keeps an explicitly selected case reply and its unsent draft',async({page})=>{
 await open(page);
 await page.getByRole('button',{name:'Reply about this exchange'}).click();
 const input=page.locator('#bc-msg-form textarea');await input.fill('Waiting to send this to the exchange');
 await page.locator('[data-refresh-thread]').click();
 await expect(page.locator('#bc-compose-context')).toContainText('About');
 await expect(input).toHaveValue('Waiting to send this to the exchange');
 await page.locator('[data-clear-case-context]').click();
 await expect(page.locator('#bc-compose-context')).toBeEmpty();
 await expect(input).toHaveValue('');
 await page.getByRole('button',{name:'Reply about this exchange'}).click();
 await expect(input).toHaveValue('Waiting to send this to the exchange');
});
