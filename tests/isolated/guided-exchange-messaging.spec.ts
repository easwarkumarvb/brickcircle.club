import fs from 'node:fs';
import {test,expect} from './fixtures';
const mock=fs.readFileSync('tests/isolated/fixtures/three-user-supabase-browser-mock.js','utf8');
const A='00000000-0000-4000-8000-000000000101',B='00000000-0000-4000-8000-000000000102',C='00000000-0000-4000-8000-000000000103';
const stamp='2026-10-05T12:00:00Z';
async function open(page:any,actor='easwar',state='PROPOSED',patch:any={},route='messages/case:guide-case'){
  const database={profiles:[{id:A,display_name:'Easwar'},{id:B,display_name:'Ramya'},{id:C,display_name:'Dhyan'}].map(p=>({...p,email:p.id+'@example.invalid',country:'India',city:'Bengaluru',adult_confirmed_at:stamp,created_at:stamp})),collection:[{id:'item-a',user_id:A,set_number:'42172-1',available_for_exchange:false},{id:'item-b',user_id:B,set_number:'42143-1',available_for_exchange:false}],wishlist:[],exchanges:[{id:'guide-case',user_a:A,user_b:B,proposer_id:A,recipient_id:B,item_a:'item-a',item_b:'item-b',duration_days:60,state,state_version:5,created_at:stamp,updated_at:stamp,...patch}],events:[],notifications:[],messages:[],directMessages:[],reviews:[],issues:[],issueResponses:[],supportRequests:[],peerReviews:[]};
  await page.addInitScript(({actor,database}:any)=>{localStorage.setItem('bc_three_user_actor',actor);localStorage.setItem('bc_three_user_db',JSON.stringify(database));sessionStorage.setItem('bc_three_user_initialized','1')},{actor,database});
  await page.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4',(r:any)=>r.fulfill({contentType:'application/javascript',body:mock}));
  await page.goto('/v2.html?isolated=three-user#'+route);
}
const stages:[string,any,string|null,string|null][]=[
  ['PROPOSED',{},null,'accept'],
  ['ACCEPTED',{},'propose_meetup','propose_meetup'],
  ['MEETUP_PLANNING',{meetup_proposed_by:A,meetup_venue_name:'Public Library',meetup_at:'2026-12-01T12:00:00Z'},null,'accept_meetup'],
  ['MEETUP_CONFIRMED',{safety_ack_a_at:stamp},null,'safety_ack'],
  ['INSPECTION',{arrived_a_at:stamp},null,'arrive'],
  ['INSPECTION',{arrived_a_at:stamp,arrived_b_at:stamp,inspected_a_at:stamp},null,'inspect'],
  ['HANDOFF_PENDING',{handoff_a_at:stamp},null,'handoff'],
  ['ACTIVE',{return_due_at:'2026-12-01T12:00:00Z'},'propose_return','propose_return'],
  ['RETURN_PLANNING',{return_proposed_by:A,return_venue_name:'Public Library',return_meetup_at:'2026-12-01T12:00:00Z'},null,'accept_return'],
  ['RETURN_INSPECTION',{return_arrived_a_at:stamp},null,'return_arrive'],
  ['RETURN_INSPECTION',{return_arrived_a_at:stamp,return_arrived_b_at:stamp,return_inspected_a_at:stamp},'return_confirm','return_inspect'],
  ['RETURN_INSPECTION',{return_arrived_a_at:stamp,return_arrived_b_at:stamp,return_inspected_a_at:stamp,return_inspected_b_at:stamp,return_confirmed_a_at:stamp},null,'return_confirm'],
  ['COMPLETED',{},null,null],['CANCELLED',{},null,null]
];
for(const [i,[state,patch,a,b]] of stages.entries())for(const [actor,action] of [['easwar',a],['ramya',b]]){
  test(`guided step ${i} ${state} for ${actor}`,async({page})=>{
    await open(page,actor!,state,patch);const guide=page.getByRole('region',{name:'Exchange next step'});
    await expect(guide).toBeVisible();
    const primary=guide.locator('.bc-btn.primary');
    if(action)await expect(primary).toHaveAttribute('data-thread-case-action',action);else await expect(primary).toHaveCount(0);
    await expect(guide).toContainText(['COMPLETED','CANCELLED'].includes(state)?'Closed':action?'Your turn':'Waiting for partner');
    if(['COMPLETED','CANCELLED'].includes(state))await expect(page.locator('#bc-msg-form')).toHaveCount(0);
    if(state==='MEETUP_PLANNING'||state==='RETURN_PLANNING')await expect(guide).toContainText('Public Library');
  });
}
test('accepting inside chat preserves draft and opens the next step in the same conversation',async({page})=>{
  await open(page,'ramya');const draft=page.locator('#bc-msg-form textarea');await draft.fill('Can we meet at the library?');
  await page.locator('[data-thread-case-action="accept"]').click();
  await expect(page.locator('[data-thread-case-action="propose_meetup"]')).toBeVisible();
  await expect(draft).toHaveValue('Can we meet at the library?');await expect(page).toHaveURL(/#messages\/case:guide-case/);
  await page.locator('[data-thread-case-action="propose_meetup"]').click();const form=page.locator('#bc-case-meetup');
  await form.locator('[name="venue"]').fill('Public Library');await form.locator('[name="when"]').fill('2026-12-01T12:00');
  await form.locator('button[type="submit"]').click();
  await expect(page.locator('.bc-conversation-guide')).toContainText('Waiting for meetup agreement');
  await expect(draft).toHaveValue('Can we meet at the library?');
});
test('third collector cannot see or send into the exchange conversation',async({page})=>{
  await open(page,'dhyan');await expect(page.getByRole('heading',{name:'Conversation unavailable'})).toBeVisible();
  await expect(page.locator('#bc-msg-form')).toHaveCount(0);await expect(page.locator('[data-thread-case-action]')).toHaveCount(0);
});
for(const kind of ['case','direct'])test(`${kind} delivery retry after a committed response is lost creates one message`,async({page})=>{
  await open(page,'easwar','PROPOSED',{},kind==='case'?'messages/case:guide-case':'messages/direct:'+B);
  await expect(page.locator('#bc-msg-form')).toBeVisible();
  await page.evaluate(kind=>(window as any).__bcThreeUser.loseNextResponse(kind==='case'?'send_exchange_case_message':'send_collector_message'),kind);
  const input=page.locator('#bc-msg-form textarea');await input.fill('One delivery only');
  await page.locator('#bc-msg-form').evaluate((form:HTMLFormElement)=>form.requestSubmit());
  await expect(page.locator('#bc-msg-error')).toContainText('Retry the same message safely');await expect(input).toHaveValue('One delivery only');
  await page.locator('[data-refresh-thread]').click();
  await expect(page.locator('#bc-msg-chat')).toContainText('One delivery only');
  await expect(page.locator('#bc-msg-error')).toContainText('Retry the same message safely');
  await expect(input).toHaveValue('One delivery only');
  await page.locator('#bc-msg-form').evaluate((form:HTMLFormElement)=>form.requestSubmit());
  await expect(input).toHaveValue('');await expect(page.locator('#bc-msg-chat')).toContainText('One delivery only');
  expect(await page.evaluate(kind=>{const s=(window as any).__bcThreeUser;return (kind==='case'?s.data.messages:s.data.directMessages).filter((m:any)=>m.body==='One delivery only').length},kind)).toBe(1);
});
test('direct chat links to the exchange, and reconnect updates the guide without losing a draft',async({page})=>{
  await page.setViewportSize({width:390,height:844});await open(page,'easwar','PROPOSED',{},'messages/direct:'+B);
  await page.locator('[data-open-messages-case="guide-case"]').click();
  await expect.poll(()=>page.evaluate(()=>decodeURIComponent(location.hash))).toBe('#messages/case:guide-case');
  await expect(page.getByRole('region',{name:'Exchange next step'})).toBeVisible();
  await expect(page.locator('.bc-conversation-guide')).toContainText('Waiting for their reply');
  const input=page.locator('#bc-msg-form textarea');await input.fill('Keep my draft');
  await page.evaluate(()=>{const s=(window as any).__bcThreeUser;s.data.exchanges[0].state='ACCEPTED';s.data.exchanges[0].state_version++;s.persist();window.dispatchEvent(new Event('online'))});
  await expect(page.locator('[data-thread-case-action="propose_meetup"]')).toBeVisible();await expect(input).toHaveValue('Keep my draft');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({path:'test-results/guided-messaging-mobile.png',fullPage:true});
});
test('simultaneous partner confirmation refreshes a stale action before retry',async({page})=>{
  await open(page,'easwar','MEETUP_CONFIRMED');
  await expect(page.locator('[data-thread-case-action="safety_ack"]')).toBeVisible();
  await page.evaluate(()=>{
    const db=(window as any).BC_SUPABASE,original=db.rpc;let first=true;
    db.rpc=async(name:any,args:any)=>{
      if(first&&name==='exchange_case_transition'){
        first=false;const s=(window as any).__bcThreeUser;
        s.data.exchanges[0].state_version++;s.data.exchanges[0].safety_ack_b_at='2026-10-05T12:00:00Z';s.persist();
        return {data:null,error:{code:'40001',message:'The exchange changed. Refresh and retry.'}};
      }
      return original(name,args);
    };
  });
  await page.locator('[data-thread-case-action="safety_ack"]').click();
  await page.locator('.bc-guide-checks summary').click();
  await expect(page.locator('.bc-guide-checks tbody tr').first().locator('td').last()).toHaveText('Confirmed');
  await page.locator('[data-thread-case-action="safety_ack"]').click();
  await expect(page.locator('[data-thread-case-action="arrive"]')).toBeVisible();
  expect(await page.evaluate(()=>(window as any).__bcThreeUser.rpcArgs.filter((r:any)=>r.name==='exchange_case_transition').at(-1).args.p_expected_version)).toBe(6);
});
