import {test,expect} from './fixtures';
import fs from 'node:fs';

const A='00000000-0000-4000-8000-000000000101';
const B='00000000-0000-4000-8000-000000000102';
const NOW='2026-10-18T12:00:00.000Z';
const stamp='2026-10-05T12:00:00Z';

async function open(page:any,actor:string,route:string,patch:any={}){
  const database={
    profiles:[{id:A,display_name:'Easwar'},{id:B,display_name:'Ramya'}].map(p=>({...p,email:p.id+'@example.invalid',country:'India',city:'Bengaluru',adult_confirmed_at:stamp,created_at:stamp})),
    collection:[{id:'item-a',user_id:A,set_number:'42172-1',available_for_exchange:false},{id:'item-b',user_id:B,set_number:'42143-1',available_for_exchange:false}],
    wishlist:[],
    exchanges:[{id:'deadline-case',user_a:A,user_b:B,proposer_id:A,recipient_id:B,item_a:'item-a',item_b:'item-b',duration_days:60,state:'PROPOSED',state_version:5,created_at:stamp,updated_at:stamp,...patch}],
    events:[],notifications:[],messages:[],directMessages:[],reviews:[],issues:[],issueResponses:[],supportRequests:[],peerReviews:[]
  };
  await page.addInitScript(({actor,database}:any)=>{
    if(sessionStorage.getItem('bc_three_user_fixture_seeded')!=='1'){
      localStorage.setItem('bc_three_user_actor',actor);
      localStorage.setItem('bc_three_user_db',JSON.stringify(database));
      sessionStorage.setItem('bc_three_user_fixture_seeded','1');
    }
    sessionStorage.setItem('bc_three_user_initialized','1');
  },{actor,database});
  await page.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4',(r:any)=>r.fulfill({contentType:'application/javascript',body:mock}));
  await page.goto('/v2.html?isolated=three-user#'+route);
}
async function focusCase(page:any){
  const dialog=page.locator('dialog.bc-collector-sheet');
  if(await dialog.isVisible())await dialog.locator('[data-close-collector-sheet], [data-close]').first().click();
  await page.locator('[data-view-collector-case="deadline-case"]').first().click();
  await expect(page.getByRole('region',{name:'Exchange next step'})).toBeVisible();
}

const mock=fs.readFileSync('tests/isolated/fixtures/three-user-supabase-browser-mock.js','utf8');

test('elapsed proposals keep canonical close actions available to either participant',async({page})=>{
  await page.clock.install({time:new Date(NOW)});
  await open(page,'ramya','exchanges',{response_deadline:'2026-10-18T11:59:59.000Z'});
  await page.locator('[data-extab="requests"]').click();
  const card=page.locator('[data-request-card="deadline-case"]');
  await expect(card).toContainText('Response deadline passed');
  await expect(card).toContainText('BrickCircle must confirm whether the proposal is closed');
  await expect(card.locator('[data-request-action="accept"]')).toBeDisabled();
  await expect(card.locator('[data-request-action="counter"]')).toBeDisabled();
  await expect(card.locator('[data-request-action="decline"]')).toBeEnabled();
  await card.locator('[data-request-action="decline"]').click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__bcThreeUser.data.exchanges[0].state)).toBe('DECLINED');
  expect(await page.evaluate(()=>(window as any).__bcThreeUser.rpcArgs.filter((row:any)=>row.name==='exchange_case_transition').map((row:any)=>row.args.p_action))).toEqual(['decline']);

  await page.evaluate(()=>{const fixture=(window as any).__bcThreeUser;fixture.switchActor('easwar');fixture.data.exchanges[0].state='PROPOSED';fixture.data.exchanges[0].state_version=5;fixture.persist()});
  await page.reload();
  await page.locator('[data-extab="requests"]').click();
  const proposerCard=page.locator('[data-request-card="deadline-case"]');
  await expect(proposerCard).toContainText('Response deadline passed');
  await expect(proposerCard.locator('[data-request-action="withdraw"]')).toBeEnabled();
  await proposerCard.locator('[data-request-action="withdraw"]').click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__bcThreeUser.data.exchanges[0].state)).toBe('WITHDRAWN');
  expect(await page.evaluate(()=>(window as any).__bcThreeUser.rpcArgs.filter((row:any)=>row.name==='exchange_case_transition').map((row:any)=>row.args.p_action))).toEqual(['withdraw']);
});

for(const [label,patch] of [
  ['future',{response_deadline:'2026-10-19T12:00:00.000Z'}],
  ['missing',{}],
  ['invalid',{response_deadline:'not-a-deadline'}]
] as const)test(`response actions preserve existing availability for ${label} deadlines`,async({page})=>{
  await page.clock.install({time:new Date(NOW)});
  await open(page,'ramya','exchanges',patch);
  await page.locator('[data-extab="requests"]').click();
  const card=page.locator('[data-request-card="deadline-case"]');
  await expect(card.locator('[data-request-action="accept"]')).toBeEnabled();
  await expect(card.locator('[data-request-action="counter"]')).toBeEnabled();
  await expect(card).not.toContainText('Response deadline passed');
});

for(const action of ['accept','counter'])test(`person-first open view rechecks ${action} after the response deadline passes`,async({page})=>{
  await page.clock.install({time:new Date('2026-10-18T11:59:00.000Z')});
  await open(page,'ramya','messages/case:deadline-case',{response_deadline:'2026-10-18T12:00:00.000Z'});
  await focusCase(page);
  const dialog=page.locator('dialog.bc-collector-sheet');
  const responseAction=dialog.locator(`[data-thread-case-action="${action}"]`);
  await expect(responseAction).toBeEnabled();
  await page.clock.setFixedTime(new Date('2026-10-18T12:01:01.000Z'));
  await responseAction.click();
  await expect(dialog).toContainText('Response deadline passed');
  await expect(dialog.locator('[data-thread-case-action="accept"]')).toBeDisabled();
  await expect(dialog.locator('[data-thread-case-action="counter"]')).toBeDisabled();
  expect(await page.evaluate(()=>(window as any).__bcThreeUser.rpcArgs.filter((row:any)=>row.name==='exchange_case_transition'))).toEqual([]);
});
