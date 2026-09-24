import fs from 'node:fs';
import {test,expect,BrowserContext} from '@playwright/test';

const mock=fs.readFileSync('tests/isolated/fixtures/three-user-supabase-browser-mock.js','utf8');
const actors={
  easwar:{id:'00000000-0000-4000-8000-000000000101',email:'easwar@example.invalid',name:'Easwar'},
  ramya:{id:'00000000-0000-4000-8000-000000000102',email:'ramya@example.invalid',name:'Ramya'},
  dhyan:{id:'00000000-0000-4000-8000-000000000103',email:'dhyan@example.invalid',name:'Dhyan'}
};
const now='2026-09-09T12:00:00.000Z';

function seed(exchange:any,extras:any={}){
  return {
    profiles:Object.values(actors).map(actor=>({id:actor.id,display_name:actor.name,email:actor.email,country:'India',city:'Bengaluru',rating:0,review_count:0,member_since:now,created_at:now,adult_confirmed_at:now})),
    collection:[
      {id:'item-a',user_id:actors.easwar.id,set_number:'42172-1',condition:'Excellent',completeness:100,owner_photo_path:'a.jpg',available_for_exchange:false,created_at:now},
      {id:'item-b',user_id:actors.ramya.id,set_number:'42143-1',condition:'Excellent',completeness:100,owner_photo_path:'b.jpg',available_for_exchange:false,created_at:now}
    ],wishlist:[],exchanges:[exchange],events:[],notifications:[],messages:[],directMessages:[],reviews:[],...extras
  };
}

function exchange(state:string,patch:any={}){
  return {id:'case-review-fix',user_a:actors.easwar.id,user_b:actors.ramya.id,proposer_id:actors.easwar.id,recipient_id:actors.ramya.id,item_a:'item-a',item_b:'item-b',duration_days:60,state,state_version:5,created_at:now,updated_at:now,...patch};
}

async function openActor(context:BrowserContext,actor:'easwar'|'ramya',database:any,route='exchange/case-review-fix'){
  await context.addInitScript(({actor,database})=>{localStorage.setItem('bc_three_user_actor',actor);localStorage.setItem('bc_three_user_db',JSON.stringify(database));sessionStorage.setItem('bc_three_user_initialized','1')},{actor,database});
  const page=await context.newPage();
  await page.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4',route=>route.fulfill({contentType:'application/javascript',body:mock}));
  await page.goto(`/v2.html?isolated=three-user#${route}`);
  if(route.startsWith('exchange/'))await expect(page.locator('#bc-flow')).toBeVisible();
  return page;
}

test('completed canonical case exposes one-review-per-participant path and updates rating',async({browser})=>{
  const context=await browser.newContext(),page=await openActor(context,'easwar',seed(exchange('COMPLETED',{completed_at:now})));
  await expect(page.getByRole('button',{name:'Leave review'})).toBeVisible();
  await page.getByRole('button',{name:'Leave review'}).click();
  await page.locator('#bc-review-form select').selectOption('4');
  await page.locator('#bc-review-form textarea').fill('Safe meetup and accurate set.');
  await page.getByRole('button',{name:'Submit review'}).click();
  await expect(page.getByText(/You reviewed Ramya with 4\/5 stars/)).toBeVisible();
  const result=await page.evaluate(()=>({reviews:window.__bcThreeUser.data.reviews,profiles:window.__bcThreeUser.data.profiles,calls:window.__bcThreeUser.rpcCalls}));
  expect(result.reviews).toHaveLength(1);
  expect(result.profiles.find((row:any)=>row.id===actors.ramya.id)).toMatchObject({rating:4,review_count:1});
  expect(result.calls).toContain('submit_exchange_case_review');
  expect(result.calls).not.toContain('submit_exchange_review');
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

declare global {interface Window {__bcThreeUser:any}}
