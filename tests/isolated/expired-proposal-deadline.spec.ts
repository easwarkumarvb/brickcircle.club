import {test,expect} from './fixtures';
import fs from 'node:fs';

const A='00000000-0000-4000-8000-000000000101';
const B='00000000-0000-4000-8000-000000000102';
const NOW='2026-10-18T12:00:00.000Z';
const stamp='2026-10-05T12:00:00Z';

async function open(page:any,actor:string,route:string,patch:any={}){
  const {additionalExchanges=[],...exchangePatch}=patch;
  const database={
    profiles:[{id:A,display_name:'Easwar'},{id:B,display_name:'Ramya'}].map(p=>({...p,email:p.id+'@example.invalid',country:'India',city:'Bengaluru',adult_confirmed_at:stamp,created_at:stamp})),
    collection:[{id:'item-a',user_id:A,set_number:'42172-1',available_for_exchange:false},{id:'item-b',user_id:B,set_number:'42143-1',available_for_exchange:false}],
    wishlist:[],
    exchanges:[{id:'deadline-case',user_a:A,user_b:B,proposer_id:A,recipient_id:B,item_a:'item-a',item_b:'item-b',duration_days:60,state:'PROPOSED',state_version:5,created_at:stamp,updated_at:stamp,...exchangePatch},...additionalExchanges],
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
  await expect(card).toContainText('sets remain reserved until BrickCircle confirms closure');
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
  ['future',{response_deadline:'2099-10-19T12:00:00.000Z'}],
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

test('counterproposal form rechecks the deadline without disabling another pending case',async({page})=>{
  await page.clock.install({time:new Date(NOW)});
  await open(page,'ramya','exchanges',{
    response_deadline:'2026-10-18T12:01:00.000Z',
    additionalExchanges:[{id:'future-case',user_a:A,user_b:B,proposer_id:A,recipient_id:B,item_a:'item-a',item_b:'item-b',duration_days:60,state:'PROPOSED',state_version:2,response_deadline:'2099-10-19T12:00:00.000Z',created_at:stamp,updated_at:stamp}]
  });
  await page.locator('[data-extab="requests"]').click();
  const card=page.locator('[data-request-card="deadline-case"]');
  await card.locator('[data-request-action="counter"]').click();
  const form=page.locator('#bc-counter');
  await expect(form).toBeVisible();
  await page.clock.setFixedTime(new Date('2026-10-18T12:02:00.000Z'));
  const submit=form.locator('button[type="submit"]');
  await submit.click();
  await expect(submit).toBeDisabled();
  await expect(form).toContainText('The response deadline appears to have passed. Refresh for the latest status. You can still decline or withdraw; sets remain reserved until BrickCircle confirms closure.');
  expect(await page.evaluate(()=>(window as any).__bcThreeUser.rpcArgs.filter((row:any)=>row.name==='exchange_case_transition'))).toEqual([]);
  const futureCard=page.locator('[data-request-card="future-case"]');
  await expect(futureCard.locator('[data-request-action="accept"]')).toBeEnabled();
  await expect(futureCard.locator('[data-request-action="counter"]')).toBeEnabled();
});

test('legacy exchange route disables decisions when the live deadline passes',async({page})=>{
  await page.clock.install({time:new Date('2026-10-18T11:59:00.000Z')});
  await open(page,'ramya','exchange/deadline-case',{response_deadline:'2026-10-18T12:00:00.000Z'});
  await expect.poll(()=>page.evaluate(()=>decodeURIComponent(location.hash))).toBe('#messages/case:deadline-case');
  await focusCase(page);
  const detail=page.locator('dialog.bc-collector-sheet');
  const counter=detail.locator('[data-thread-case-action="counter"]');
  await expect(counter).toBeEnabled();
  await page.clock.setFixedTime(new Date('2026-10-18T12:01:01.000Z'));
  await page.clock.runFor(1000);
  await expect(detail).toContainText('The response deadline appears to have passed. Refresh for the latest status.');
  await expect(detail.locator('[data-thread-case-action="accept"]')).toBeDisabled();
  await expect(counter).toBeDisabled();
  await expect(detail.locator('[data-thread-case-action="decline"]')).toBeEnabled();
  expect(await page.evaluate(()=>(window as any).__bcThreeUser.rpcArgs.filter((row:any)=>row.name==='exchange_case_transition'))).toEqual([]);
});

for(const action of ['accept','counter'])test(`person-first open view disables ${action} after the response deadline passes`,async({page})=>{
  await page.clock.install({time:new Date('2026-10-18T11:59:00.000Z')});
  await open(page,'ramya','messages/case:deadline-case',{response_deadline:'2026-10-18T12:00:00.000Z'});
  await focusCase(page);
  const dialog=page.locator('dialog.bc-collector-sheet');
  const responseAction=dialog.locator(`[data-thread-case-action="${action}"]`);
  await expect(responseAction).toBeEnabled();
  await page.clock.setFixedTime(new Date('2026-10-18T12:01:01.000Z'));
  await page.clock.runFor(1000);
  await expect(dialog).toContainText('Response deadline passed');
  await expect(dialog.locator('[data-thread-case-action="accept"]')).toBeDisabled();
  await expect(dialog.locator('[data-thread-case-action="counter"]')).toBeDisabled();
  expect(await page.evaluate(()=>(window as any).__bcThreeUser.rpcArgs.filter((row:any)=>row.name==='exchange_case_transition'))).toEqual([]);
});


for(const state of ['PROPOSED','EXPIRED'])for(const actor of ['easwar','ramya'])test(`resend ${state} is available only to current proposer (${actor})`,async({page})=>{
  await page.clock.install({time:new Date(NOW)});
  await open(page,actor,'messages/case:deadline-case',{state,response_deadline:'2026-10-18T11:59:00Z'});
  await focusCase(page);
  const dialog=page.locator('dialog.bc-collector-sheet'),resend=dialog.locator('[data-resend-proposal]');
  if(actor==='ramya'){await expect(resend).toBeHidden();return}
  await expect(resend).toBeVisible();await resend.click();
  await expect.poll(()=>page.evaluate(()=>Date.parse((window as any).__bcThreeUser.data.exchanges[0].response_deadline))).toBeGreaterThanOrEqual(Date.parse('2026-10-20T12:00:00.000Z'));
  expect(await page.evaluate(()=>(window as any).__bcThreeUser.rpcArgs.filter((r:any)=>r.name==='resend_exchange_case_invite').length)).toBe(1);
});

test('live deadline shows exact local time, recipient nudge and preserves counter draft',async({page})=>{
  await page.clock.install({time:new Date(NOW)});
  await open(page,'ramya','exchanges',{response_deadline:'2026-10-18T12:01:00Z'});
  await page.locator('[data-extab="requests"]').click();
  const clock=page.locator('[data-proposal-clock]').first();
  await expect(clock).toContainText('Respond by');await expect(clock).toContainText('Your decision:');
  await expect(clock.locator('time')).toContainText('2026');
  await page.locator('[data-request-action="counter"]').click();
  const draft=page.locator('#bc-counter textarea');await draft.fill('Keep my proposed duration and message');
  await page.clock.runFor(2000);
  await expect(clock.locator('[data-proposal-remaining]')).toContainText(/0m 5[0-8]s remaining/);
  await expect(draft).toHaveValue('Keep my proposed duration and message');
  await page.clock.runFor(61000);
  await expect(draft).toHaveValue('Keep my proposed duration and message');
  await expect(clock).toContainText('Response deadline passed');
});

test('counter proposer B can resend; failure preserves draft and restores the action',async({page})=>{
  await page.clock.install({time:new Date(NOW)});
  await open(page,'ramya','messages/case:deadline-case',{proposer_id:B,recipient_id:A,response_deadline:'2026-10-18T11:59:00Z'});
  const existing=page.locator('dialog.bc-collector-sheet');if(await existing.isVisible())await existing.locator('[data-close-collector-sheet]').click();
  const composer=page.locator('#bc-msg-form textarea');await composer.fill('Keep this unsent reply');
  await focusCase(page);
  await page.evaluate(()=>(window as any).__bcThreeUser.failRpc('resend_exchange_case_invite'));
  const resend=page.locator('dialog.bc-collector-sheet [data-resend-proposal]');
  await expect(resend).toBeVisible();await resend.click();await expect(resend).toBeEnabled();
  expect(await page.evaluate(()=>(window as any).__bcThreeUser.data.exchanges[0].state_version)).toBe(5);
  await expect(composer).toHaveValue('Keep this unsent reply');
  await page.evaluate(()=>(window as any).__bcThreeUser.failedRpcs.clear());await resend.click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__bcThreeUser.data.exchanges[0].state_version)).toBe(6);
});

test('sender countdown reveals resend at expiry without refreshing the case dialog',async({page})=>{
  await page.clock.install({time:new Date(NOW)});
  await open(page,'easwar','messages/case:deadline-case',{response_deadline:'2026-10-18T12:00:02Z'});
  await focusCase(page);
  const dialog=page.locator('dialog.bc-collector-sheet'),resend=dialog.locator('[data-resend-proposal]');
  await expect(resend).toBeHidden();await expect(dialog).toContainText('Waiting for the other collector');
  await page.clock.runFor(3000);await expect(resend).toBeVisible();await expect(dialog).toContainText('Response deadline passed');
});


test('deferred resend completion preserves a newly navigated surface and its draft',async({page})=>{
  await page.clock.install({time:new Date(NOW)});
  await open(page,'easwar','messages/case:deadline-case',{response_deadline:'2026-10-18T11:59:00Z',additionalExchanges:[{id:'other-case',user_a:A,user_b:B,proposer_id:B,recipient_id:A,item_a:'item-a',item_b:'item-b',duration_days:30,state:'PROPOSED',state_version:2,response_deadline:'2099-10-19T12:00:00Z',created_at:stamp,updated_at:stamp}]});
  await focusCase(page);
  await page.evaluate(()=>(window as any).__bcThreeUser.delayRpc('resend_exchange_case_invite',60000));
  await page.locator('dialog.bc-collector-sheet [data-resend-proposal]').click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__bcThreeUser.rpcArgs.filter((r:any)=>r.name==='resend_exchange_case_invite').length)).toBe(1);
  await page.evaluate(()=>{document.querySelector<HTMLDialogElement>('dialog')?.close();location.hash='#exchanges'});
  await page.locator('[data-extab="requests"]').click();
  const card=page.locator('[data-request-card="other-case"]');
  await card.locator('[data-request-action="counter"]').click();
  const draft=page.locator('#bc-counter textarea');await draft.fill('Draft on the new surface');
  await card.evaluate(node=>(window as any).__deadlineDestinationCard=node);
  await page.clock.runFor(61000);
  await expect.poll(()=>page.evaluate(()=>(window as any).__bcThreeUser.data.exchanges.find((r:any)=>r.id==='deadline-case').state_version)).toBe(6);
  await expect(draft).toHaveValue('Draft on the new surface');
  expect(await page.evaluate(()=>(window as any).__deadlineDestinationCard===document.querySelector('[data-request-card="other-case"]'))).toBe(true);
  await expect(page).toHaveURL(/#exchanges$/);
  await expect(page.getByText('Invite resent. They have 48 hours to respond.',{exact:true})).toHaveCount(0);
});
