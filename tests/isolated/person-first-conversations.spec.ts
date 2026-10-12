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
