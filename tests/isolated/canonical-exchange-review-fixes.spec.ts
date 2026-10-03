import fs from 'node:fs';
import {test,expect,BrowserContext} from '@playwright/test';

const mock=fs.readFileSync('tests/isolated/fixtures/three-user-supabase-browser-mock.js','utf8');
const actors={
  easwar:{id:'00000000-0000-4000-8000-000000000101',email:'easwar@example.invalid',name:'Easwar'},
  ramya:{id:'00000000-0000-4000-8000-000000000102',email:'ramya@example.invalid',name:'Ramya'},
  dhyan:{id:'00000000-0000-4000-8000-000000000103',email:'dhyan@example.invalid',name:'Dhyan'}
};
const now='2026-09-09T12:00:00.000Z';
const dayMs=24*60*60*1000;

function seed(exchange:any,extras:any={}){
  return {
    profiles:Object.values(actors).map(actor=>({id:actor.id,display_name:actor.name,email:actor.email,country:'India',city:'Bengaluru',rating:0,review_count:0,member_since:now,created_at:now,adult_confirmed_at:now})),
    collection:[
      {id:'item-a',user_id:actors.easwar.id,set_number:'42172-1',condition:'Excellent',completeness:100,owner_photo_path:'a.jpg',available_for_exchange:false,created_at:now},
      {id:'item-b',user_id:actors.ramya.id,set_number:'42143-1',condition:'Excellent',completeness:100,owner_photo_path:'b.jpg',available_for_exchange:false,created_at:now}
    ],wishlist:[],exchanges:[exchange],events:[],notifications:[],messages:[],directMessages:[],reviews:[],
    issues:[],issueResponses:[],supportRequests:[],peerReviews:[],...extras
  };
}

function exchange(state:string,patch:any={}){
  return {id:'case-review-fix',user_a:actors.easwar.id,user_b:actors.ramya.id,proposer_id:actors.easwar.id,recipient_id:actors.ramya.id,item_a:'item-a',item_b:'item-b',duration_days:60,state,state_version:5,created_at:now,updated_at:now,...patch};
}

async function openActor(context:BrowserContext,actor:keyof typeof actors,database:any,route='exchange/case-review-fix'){
  await context.addInitScript(({actor,database})=>{localStorage.setItem('bc_three_user_actor',actor);localStorage.setItem('bc_three_user_db',JSON.stringify(database));sessionStorage.setItem('bc_three_user_initialized','1')},{actor,database});
  const page=await context.newPage();
  await page.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4',route=>route.fulfill({contentType:'application/javascript',body:mock}));
  await page.goto(`/v2.html?isolated=three-user#${route}`);
  if(route.startsWith('exchange/'))await expect(page.locator('#bc-flow')).toBeVisible();
  return page;
}

async function submitStructuredReview(page:any,ratings={overall:'4',reliability:'5',accuracy:'4',communication:'5',condition:'4',again:'yes'},comment='Safe meetup and accurate set.'){
  await page.getByRole('button',{name:'Leave review'}).click();
  const form=page.locator('#bc-peer-review-form');
  await form.locator('select[name="overall_rating"]').selectOption(ratings.overall);
  await form.locator('select[name="return_reliability"]').selectOption(ratings.reliability);
  await form.locator('select[name="set_accuracy"]').selectOption(ratings.accuracy);
  await form.locator('select[name="communication"]').selectOption(ratings.communication);
  await form.locator('select[name="condition_accuracy"]').selectOption(ratings.condition);
  await form.locator('select[name="would_exchange_again"]').selectOption(ratings.again);
  await form.locator('textarea[name="comment"]').fill(comment);
  await form.getByRole('button',{name:'Submit review'}).click();
}

test('completed canonical case uses structured double-blind peer reviews and prevents duplicates',async({browser})=>{
  const completed=seed(exchange('COMPLETED',{completed_at:now,handoff_at:now,handoff_a_at:now,handoff_b_at:now}));
  const easwarContext=await browser.newContext(),easwar=await openActor(easwarContext,'easwar',completed);
  await expect(easwar.getByRole('button',{name:'Leave review'})).toBeVisible();
  await submitStructuredReview(easwar);
  await expect.poll(()=>easwar.evaluate(()=>window.__bcThreeUser.data.peerReviews.length)).toBe(1);
  await expect(easwar.locator('.bc-notice.good').filter({hasText:/You reviewed Ramya/i})).toBeVisible();
  const first=await easwar.evaluate(()=>({data:JSON.parse(JSON.stringify(window.__bcThreeUser.data)),calls:window.__bcThreeUser.rpcCalls}));
  expect(first.data.peerReviews).toHaveLength(1);
  expect(first.data.peerReviews[0]).toMatchObject({reviewer_id:actors.easwar.id,reviewee_id:actors.ramya.id,overall_rating:4,return_reliability:5,set_accuracy:4,communication:5,condition_accuracy:4,would_exchange_again:true});
  expect(first.calls).toContain('submit_peer_exchange_review');
  expect(first.calls).not.toContain('submit_exchange_case_review');
  expect(first.calls).not.toContain('submit_exchange_review');
  await easwarContext.close();

  const ramyaContext=await browser.newContext(),ramya=await openActor(ramyaContext,'ramya',first.data);
  await expect(ramya.getByText(/Peer trust:.*1 completed exchange/i)).toBeVisible();
  await expect(ramya.getByRole('button',{name:'Leave review'})).toBeVisible();
  await submitStructuredReview(ramya,{overall:'5',reliability:'5',accuracy:'5',communication:'5',condition:'5',again:'yes'},'Would exchange again.');
  await expect(ramya.getByText('Safe meetup and accurate set.')).toBeVisible();

  const duplicate=await ramya.evaluate(async()=>{
    return window.supabase.createClient().rpc('submit_peer_exchange_review',{
      p_case_id:'case-review-fix',p_overall_rating:5,p_return_reliability:5,p_set_accuracy:5,p_communication:5,p_condition_accuracy:5,
      p_would_exchange_again:true,p_comment:'Duplicate attempt',p_idempotency_key:'different-review-attempt'
    });
  });
  expect(duplicate.error?.message).toMatch(/already submitted/i);
  const final=await ramya.evaluate(()=>window.__bcThreeUser.data.peerReviews);
  expect(final).toHaveLength(2);
  await ramyaContext.close();
});

for(const width of [390,1280]){
test(`pre-handoff cancellation at ${width}px remains available after one-sided handoff and releases both sets`,async({browser})=>{
  const snapshot=seed(exchange('HANDOFF_PENDING',{handoff_a_at:now,handoff_b_at:null,owner_preference_a:true,owner_preference_b:true}));
  const context=await browser.newContext({viewport:{width,height:844}}),page=await openActor(context,'easwar',snapshot);
  await expect(page.getByRole('button',{name:'Cancel before handoff'})).toHaveCount(1);
  await expect(page.getByRole('button',{name:'Cancel before handoff'})).toBeVisible();
  page.on('dialog',async dialog=>{if(dialog.type()==='prompt')await dialog.accept('Changed plans before mutual handoff');else await dialog.accept()});
  await page.getByRole('button',{name:'Cancel before handoff'}).click();
  await expect(page.getByText('Cancelled',{exact:true}).first()).toBeVisible();
  await expect(page.locator('.bc-mobile-next')).toHaveCount(0);
  const result=await page.evaluate(()=>({data:window.__bcThreeUser.data,calls:window.__bcThreeUser.rpcCalls}));
  expect(result.data.exchanges[0].state).toBe('CANCELLED');
  expect(result.data.exchanges[0].state).not.toBe('HANDOFF_ISSUE');
  expect(result.data.collection.every((row:any)=>row.available_for_exchange)).toBe(true);
  expect(result.calls).toContain('cancel_exchange_case_before_mutual_handoff');
  await context.close();
});
}

test('post-handoff issues and support are sidecars and outsiders cannot mutate them',async({browser})=>{
  const snapshot=seed(exchange('ACTIVE',{handoff_at:now,handoff_a_at:now,handoff_b_at:now,return_due_at:'2026-10-30T12:00:00.000Z'}));
  const context=await browser.newContext(),page=await openActor(context,'easwar',snapshot);
  await expect(page.getByRole('button',{name:'Cancel before handoff'})).toHaveCount(0);
  await page.getByRole('button',{name:'Report an issue'}).click();
  const issueForm=page.locator('#bc-case-issue');
  await issueForm.locator('select[name="category"]').selectOption('missing_pieces');
  await issueForm.locator('textarea[name="description"]').fill('Two major pieces are missing from the set.');
  await issueForm.getByRole('button',{name:'Report issue'}).click();
  await expect.poll(()=>page.evaluate(()=>window.__bcThreeUser.data.issues.length)).toBe(1);
  await expect(page.getByText('Two major pieces are missing from the set.')).toBeVisible();

  await page.getByRole('button',{name:'Need BrickCircle support?'}).click();
  const supportForm=page.locator('#bc-case-support');
  await supportForm.locator('select[name="category"]').selectOption('technical');
  await supportForm.locator('textarea[name="note"]').fill('The exchange screen is not updating correctly.');
  await supportForm.getByRole('button',{name:'Send to support'}).click();

  const result=await page.evaluate(()=>({data:JSON.parse(JSON.stringify(window.__bcThreeUser.data)),calls:window.__bcThreeUser.rpcCalls}));
  expect(result.data.exchanges[0]).toMatchObject({state:'ACTIVE',state_version:5});
  expect(result.data.issues).toHaveLength(1);
  expect(result.data.issues[0]).toMatchObject({category:'missing_pieces',status:'open'});
  expect(result.data.supportRequests).toHaveLength(1);
  expect(result.data.supportRequests[0]).toMatchObject({category:'technical',case_state_at_request:'ACTIVE',case_state_version_at_request:5});
  expect(result.calls).toContain('report_exchange_case_issue');
  expect(result.calls).toContain('request_exchange_case_support');
  await context.close();

  const outsiderContext=await browser.newContext(),outsider=await openActor(outsiderContext,'dhyan',result.data,'home');
  const outsiderAttempt=await outsider.evaluate(async()=>{
    return window.supabase.createClient().rpc('report_exchange_case_issue',{
      p_case_id:'case-review-fix',p_category:'communication_problem',p_description:'Outsider attempt',p_evidence:[],p_idempotency_key:'outsider-issue'
    });
  });
  expect(outsiderAttempt.error?.message).toMatch(/not found/i);
  expect(await outsider.evaluate(()=>window.__bcThreeUser.data.issues.length)).toBe(1);
  await outsiderContext.close();
});

test('mutual handoff is required before ACTIVE',async({browser})=>{
  const snapshot=seed(exchange('HANDOFF_PENDING',{handoff_a_at:null,handoff_b_at:null}));
  const easwarContext=await browser.newContext(),easwar=await openActor(easwarContext,'easwar',snapshot);
  easwar.on('dialog',dialog=>dialog.accept());
  await easwar.getByRole('button',{name:'Confirm physical handoff'}).click();
  const afterFirst=await easwar.evaluate(()=>JSON.parse(JSON.stringify(window.__bcThreeUser.data)));
  expect(afterFirst.exchanges[0].state).toBe('HANDOFF_PENDING');
  expect(afterFirst.exchanges[0].handoff_a_at).toBeTruthy();
  expect(afterFirst.exchanges[0].handoff_at).toBeFalsy();
  await easwarContext.close();

  const ramyaContext=await browser.newContext(),ramya=await openActor(ramyaContext,'ramya',afterFirst);
  ramya.on('dialog',dialog=>dialog.accept());
  await ramya.getByRole('button',{name:'Confirm physical handoff'}).click();
  const afterSecond=await ramya.evaluate(()=>window.__bcThreeUser.data.exchanges[0]);
  expect(afterSecond.state).toBe('ACTIVE');
  expect(afterSecond.handoff_a_at).toBeTruthy();
  expect(afterSecond.handoff_b_at).toBeTruthy();
  expect(afterSecond.handoff_at).toBeTruthy();
  await ramyaContext.close();
});

test('overdue copy uses server RPC derived days',async({browser})=>{
  // The server counts any started day past return_due_at as a full overdue day,
  // so seed a half-day margin to keep the derived count deterministic.
  const due=new Date(Date.now()-3.5*dayMs).toISOString();
  const context=await browser.newContext(),page=await openActor(context,'easwar',seed(exchange('ACTIVE',{handoff_at:now,handoff_a_at:now,handoff_b_at:now,return_due_at:due})));
  await expect(page.getByText(/Return overdue by 4 days/i)).toBeVisible();
  const calls=await page.evaluate(()=>window.__bcThreeUser.rpcCalls);
  expect(calls).toContain('exchange_case_overdue_days');
  await context.close();
});

test('inbox opens canonical case conversations by case_id and direct messages separately',async({browser})=>{
  const caseMessage={id:'case-message',case_id:'case-review-fix',sender_id:actors.ramya.id,recipient_id:actors.easwar.id,body:'Meetup detail in the case',created_at:now};
  const directMessage={id:'direct-message',exchange_id:null,sender_id:actors.ramya.id,recipient_id:actors.easwar.id,body:'General collector question',created_at:'2026-09-09T13:00:00.000Z'};
  const context=await browser.newContext(),page=await openActor(context,'easwar',seed(exchange('ACCEPTED'),{messages:[caseMessage],directMessages:[directMessage]}));
  await page.getByRole('button',{name:'Inbox'}).click();
  await expect(page.getByRole('button',{name:/Ramya Exchange conversation/})).toBeVisible();
  await expect(page.getByRole('button',{name:/Ramya Direct message/})).toBeVisible();
  await page.getByRole('button',{name:/Ramya Exchange conversation/}).click();
  await expect(page).toHaveURL(/#exchange\/case-review-fix$/);
  await page.getByRole('button',{name:'Inbox'}).click();
  await page.getByRole('button',{name:/Ramya Direct message/}).click();
  await expect(page.getByRole('heading',{name:'Message Ramya'})).toBeVisible();
  await context.close();
});

test('share meetup proposal submits the canonical transition and persists its details',async({browser})=>{
  const expectedAt=new Date('2099-10-02T15:34').toISOString();
  const context=await browser.newContext(),page=await openActor(context,'easwar',seed(exchange('ACCEPTED')));
  await page.getByRole('button',{name:'Plan public meetup'}).click();
  const form=page.locator('#bc-case-meetup');
  await form.locator('[name="venue"]').fill('Udupi Garden');
  await form.locator('[name="area"]').fill('Sanjaynagar');
  await form.locator('[name="when"]').fill('2099-10-02T15:34');
  await form.getByRole('button',{name:'Share proposal'}).click();
  await expect(form).toHaveCount(0);
  await expect(page.getByText('Waiting for the other collector to accept the meetup.')).toBeVisible();
  const result=await page.evaluate(()=>({exchange:window.__bcThreeUser.data.exchanges[0],calls:window.__bcThreeUser.rpcArgs.filter((row:any)=>row.name==='exchange_case_transition')}));
  expect(result.calls).toHaveLength(1);
  expect(result.calls[0].args).toMatchObject({p_action:'propose_meetup',p_payload:{venue_name:'Udupi Garden',venue_area:'Sanjaynagar',meetup_at:expectedAt}});
  expect(result.exchange).toMatchObject({state:'MEETUP_PLANNING',meetup_proposed_by:actors.easwar.id,meetup_venue_name:'Udupi Garden',meetup_venue_area:'Sanjaynagar',meetup_at:expectedAt});
  await context.close();
});

test('proposal, transition and message reuse their idempotency key after a committed response is lost',async({browser})=>{
  test.setTimeout(60000);
  const proposalDb=seed(exchange('CANCELLED'),{
    exchanges:[],collection:[
      {id:'item-a',user_id:actors.easwar.id,set_number:'42172-1',condition:'Excellent',completeness:100,owner_photo_path:'a.jpg',available_for_exchange:true,created_at:now},
      {id:'item-b',user_id:actors.ramya.id,set_number:'42143-1',condition:'Excellent',completeness:100,owner_photo_path:'b.jpg',available_for_exchange:true,created_at:now}
    ],wishlist:[{id:'wa',user_id:actors.easwar.id,set_number:'42143-1'},{id:'wb',user_id:actors.ramya.id,set_number:'42172-1'}]
  });
  const proposalContext=await browser.newContext(),proposal=await openActor(proposalContext,'easwar',proposalDb,'matches');
  await proposal.evaluate(()=>window.__bcThreeUser.loseNextResponse('create_exchange_case'));
  await proposal.locator('[data-propose]').click();
  const send=proposal.locator('#bc-proposal').getByRole('button',{name:'Send proposal'});
  await send.click();await expect(send).toBeEnabled();await send.click();
  const proposalResult=await proposal.evaluate(()=>({data:window.__bcThreeUser.data,args:window.__bcThreeUser.rpcArgs.filter((row:any)=>row.name==='create_exchange_case')}));
  expect(proposalResult.data.exchanges).toHaveLength(1);expect(proposalResult.data.events).toHaveLength(1);expect(proposalResult.data.notifications).toHaveLength(1);
  expect(proposalResult.args).toHaveLength(2);expect(proposalResult.args[0].args.p_idempotency_key).toBe(proposalResult.args[1].args.p_idempotency_key);
  await proposalContext.close();

  const workflowContext=await browser.newContext(),workflow=await openActor(workflowContext,'easwar',seed(exchange('INSPECTION',{safety_ack_a_at:now,safety_ack_b_at:now})));
  await workflow.evaluate(()=>window.__bcThreeUser.loseNextResponse('exchange_case_transition'));
  const arrive=workflow.getByRole('button',{name:'I have arrived'});await arrive.click();await expect(workflow.getByText('Network response was lost after commit')).toBeVisible();await expect(arrive).toBeEnabled();await arrive.click();await expect(workflow.getByText(/Waiting for the other collector to arrive/)).toBeVisible();
  await workflow.evaluate(()=>window.__bcThreeUser.loseNextResponse('send_exchange_case_message'));
  const input=workflow.locator('#bc-chat-form input');await input.fill('Same message once');const messageButton=workflow.locator('#bc-chat-form button');await messageButton.click();await expect(messageButton).toBeEnabled();await messageButton.click();
  const workflowResult=await workflow.evaluate(()=>({data:window.__bcThreeUser.data,args:window.__bcThreeUser.rpcArgs}));
  expect(workflowResult.data.events).toHaveLength(1);expect(workflowResult.data.messages).toHaveLength(1);expect(workflowResult.data.notifications.filter((row:any)=>row.kind==='exchange_message')).toHaveLength(1);
  for(const name of ['exchange_case_transition','send_exchange_case_message']){const calls=workflowResult.args.filter((row:any)=>row.name===name);expect(calls).toHaveLength(2);expect(calls[0].args.p_idempotency_key).toBe(calls[1].args.p_idempotency_key)}
  await workflowContext.close();
});

test('two independently signed-in browsers wait for mutual arrival before initial and return inspection',async({browser})=>{
  for(const returning of [false,true]){
    const state=returning?'RETURN_INSPECTION':'INSPECTION',prefix=returning?'return_':'',snapshot=seed(exchange(state,{[`${prefix}arrived_a_at`]:now,[`${prefix}arrived_b_at`]:null,safety_ack_a_at:now,safety_ack_b_at:now}));
    const easwarContext=await browser.newContext(),ramyaContext=await browser.newContext();
    const easwar=await openActor(easwarContext,'easwar',snapshot),ramya=await openActor(ramyaContext,'ramya',snapshot);
    await expect(easwar.getByText(/Waiting for the other collector to arrive/)).toBeVisible();
    await expect(easwar.getByRole('button',{name:returning?'I inspected my returned set':'I inspected the set'})).toHaveCount(0);
    const arrive=ramya.getByRole('button',{name:returning?'I arrived for return':'I have arrived'});await expect(arrive).toBeVisible();await arrive.click();
    await expect(ramya.getByRole('button',{name:returning?'I inspected my returned set':'I inspected the set'})).toBeVisible();
    await easwarContext.close();await ramyaContext.close();
  }
});

declare global {
  interface Window {
    __bcThreeUser:any;
    supabase:any;
  }
}
