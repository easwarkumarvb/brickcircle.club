import fs from 'node:fs';
import {test,expect} from './fixtures';
const mock=fs.readFileSync('tests/isolated/fixtures/three-user-supabase-browser-mock.js','utf8');
const A='00000000-0000-4000-8000-000000000101',B='00000000-0000-4000-8000-000000000102',C='00000000-0000-4000-8000-000000000103';
const stamp='2026-10-05T12:00:00Z';
async function open(page:any,actor='easwar',state='PROPOSED',patch:any={},route='messages/case:guide-case',seed?:(data:any)=>void){
  const database={profiles:[{id:A,display_name:'Easwar'},{id:B,display_name:'Ramya'},{id:C,display_name:'Dhyan'}].map(p=>({...p,email:p.id+'@example.invalid',country:'India',city:'Bengaluru',adult_confirmed_at:stamp,created_at:stamp})),collection:[{id:'item-a',user_id:A,set_number:'42172-1',available_for_exchange:false},{id:'item-b',user_id:B,set_number:'42143-1',available_for_exchange:false}],wishlist:[],exchanges:[{id:'guide-case',user_a:A,user_b:B,proposer_id:A,recipient_id:B,item_a:'item-a',item_b:'item-b',duration_days:60,state,state_version:5,created_at:stamp,updated_at:stamp,...patch}],events:[],notifications:[],messages:[],directMessages:[],reviews:[],issues:[],issueResponses:[],supportRequests:[],peerReviews:[]};
  seed?.(database);
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
    if(action)await expect(primary).toHaveAttribute('data-thread-case-action',action);
    else if(state==='COMPLETED')await expect(primary).toHaveAttribute('data-thread-case-action','review');
    else await expect(primary).toHaveCount(0);
    await expect(guide).toContainText(['COMPLETED','CANCELLED'].includes(state)?'Closed':action?'Your turn':'Waiting for partner');
    if(['COMPLETED','CANCELLED'].includes(state))await expect(page.locator('#bc-msg-form')).toBeHidden();
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
test('collector inbox groups two exact cases into one row without losing case routing',async({page})=>{
  await open(page,'easwar');
  await page.evaluate(()=>{const s=(window as any).__bcThreeUser;s.data.exchanges.push({...s.data.exchanges[0],id:'guide-case-2',item_a:'item-b',item_b:'item-a',state:'ACCEPTED',state_version:2,created_at:'2026-10-06T12:00:00Z',updated_at:'2026-10-06T12:00:00Z'});s.persist();location.hash='#messages';});
  await expect(page.locator('.bc-msg-row')).toHaveCount(1);
  await expect(page.locator('.bc-msg-row')).toContainText('2 exchanges');
  await page.locator('.bc-msg-row').click();
  await expect(page.locator('#bc-case-destination option')).toHaveCount(3);
  await page.locator('#bc-case-destination').selectOption('guide-case-2');
  await expect.poll(()=>page.evaluate(()=>decodeURIComponent(location.hash))).toBe('#messages/case:guide-case-2');
  await expect(page.locator('#bc-case-destination')).toHaveValue('guide-case-2');
});
test('one chronological timeline merges direct and two case messages; destination never guesses',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await open(page,'easwar');
  await page.evaluate(({A,B}:any)=>{
    const s=(window as any).__bcThreeUser;
    s.data.exchanges.push({...s.data.exchanges[0],id:'second-case',state:'ACCEPTED',created_at:'2026-10-05T12:03:00Z'});
    s.data.directMessages.push({id:'direct-seed',sender_id:B,recipient_id:A,exchange_id:null,body:'First direct',created_at:'2026-10-05T12:01:00Z'});
    s.data.messages.push({id:'case-seed-1',case_id:'guide-case',sender_id:A,recipient_id:B,body:'First case',created_at:'2026-10-05T12:02:00Z'},{id:'case-seed-2',case_id:'second-case',sender_id:B,recipient_id:A,body:'Second case',created_at:'2026-10-05T12:04:00Z'});
    s.data.events.push({id:'case-event',case_id:'second-case',event_type:'exchange_accepted',actor_id:B,created_at:'2026-10-05T12:03:30Z'});
    s.persist();location.hash='#messages/direct:'+B;
  },{A,B});
  const chat=page.locator('#bc-msg-chat');
  await expect(chat).toContainText('First direct');await expect(chat).toContainText('First case');await expect(chat).toContainText('Second case');await expect(chat.locator('.bc-collector-event',{hasText:'Accepted'})).toHaveCount(1);
  const contents=await chat.innerText();expect(contents.indexOf('First direct')).toBeLessThan(contents.indexOf('First case'));expect(contents.indexOf('First case')).toBeLessThan(contents.indexOf('Second case'));
  await expect(page.locator('#bc-case-destination')).toHaveValue('');
  await page.locator('#bc-case-destination').selectOption('second-case');
  await expect(page.locator('#bc-case-destination')).toHaveValue('second-case');
  await page.locator('#bc-msg-form textarea').fill('Exact second case');
  await page.locator('#bc-msg-form').evaluate((f:HTMLFormElement)=>f.requestSubmit());
  await expect.poll(()=>page.evaluate(()=>(window as any).__bcThreeUser.data.messages.find((m:any)=>m.body==='Exact second case')?.case_id)).toBe('second-case');
  await expect(chat).toContainText('Exact second case');
  expect(await page.evaluate(()=>{const s=(window as any).__bcThreeUser;return s.data.messages.find((m:any)=>m.body==='Exact second case')?.case_id})).toBe('second-case');
  await page.locator('#bc-case-destination').selectOption('guide-case');
  await expect(chat).toContainText('First direct');await expect(chat).toContainText('Second case');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({path:'test-results/collector-chat-mobile.png',fullPage:true});
});
test('cursor pages retain 105 messages per source and same IDs across three sources',async({page})=>{
  await open(page,'easwar','PROPOSED',{},'messages/direct:'+B,db=>{
    db.exchanges.push({...db.exchanges[0],id:'second-case',state:'ACCEPTED'});
    for(let i=0;i<105;i++){
      const id=`shared-${String(i).padStart(3,'0')}`,created_at=new Date(Date.parse(stamp)+i*1000).toISOString();
      db.directMessages.push({id,sender_id:B,recipient_id:A,exchange_id:null,body:`General ${i}`,created_at});
      db.messages.push({id,case_id:'guide-case',sender_id:B,recipient_id:A,body:`First case ${i}`,created_at},{id,case_id:'second-case',sender_id:B,recipient_id:A,body:`Second case ${i}`,created_at});
    }
  });
  await expect(page.locator('#bc-msg-chat [data-timeline-message]')).toHaveCount(315);
  await expect(page.locator('#bc-msg-chat')).toContainText('General 0');
  await expect(page.locator('#bc-msg-chat')).toContainText('First case 0');
  await expect(page.locator('#bc-msg-chat')).toContainText('Second case 0');
  await expect(page.locator('[data-timeline-message="shared-000"]')).toHaveCount(3);
  await expect(page.locator('#bc-msg-chat [data-load-earlier]')).toHaveCount(0);
});
test('rendered collector advances exact direct and case watermarks but leaves another collector unread',async({page})=>{
  await open(page,'easwar','PROPOSED',{},'messages/direct:'+B,db=>{
    db.exchanges.push({...db.exchanges[0],id:'second-case',state:'ACCEPTED'});
    db.directMessages.push({id:'b-direct',sender_id:B,recipient_id:A,exchange_id:null,body:'From B',created_at:stamp},{id:'c-direct',sender_id:C,recipient_id:A,exchange_id:null,body:'From C',created_at:stamp});
    db.messages.push({id:'b-case-one',case_id:'guide-case',sender_id:B,recipient_id:A,body:'Case one',created_at:stamp},{id:'b-case-two',case_id:'second-case',sender_id:B,recipient_id:A,body:'Case two',created_at:stamp});
  });
  await expect(page.locator('#bc-msg-chat')).toContainText('Case two');
  const seen=()=>page.evaluate(({A,B,C}:any)=>{const key=(suffix:string)=>localStorage.getItem(`brickcircle:messages:seen:${A}:${suffix}`);return {direct:key(`direct:${B}`),first:key('case:guide-case'),second:key('case:second-case'),other:key(`direct:${C}`)}},{A,B,C});
  await expect.poll(async()=>{const values=await seen();return [!!values.direct,!!values.first,!!values.second,values.other]}).toEqual([true,true,true,null]);
  await expect(page.locator('[data-message-open="direct:'+C+'"] .bc-msg-unread')).toHaveText('1');
  await page.locator('[data-refresh-thread]').click();
  expect((await seen()).other).toBeNull();
});
test('uncertain delivery stays bound to original case and body after switching destinations',async({page})=>{
  await open(page,'easwar');
  await page.evaluate(()=>{const s=(window as any).__bcThreeUser;s.data.exchanges.push({...s.data.exchanges[0],id:'second-case',state:'ACCEPTED'});s.persist()});
  await page.locator('[data-refresh-thread]').click();
  await expect(page.locator('#bc-case-destination option')).toHaveCount(3);
  await page.evaluate(()=>(window as any).__bcThreeUser.loseNextResponse('send_exchange_case_message'));
  const input=page.locator('#bc-msg-form textarea');await input.fill('First case uncertainty');
  await page.locator('#bc-msg-form').evaluate((form:HTMLFormElement)=>form.requestSubmit());
  await expect(page.locator('#bc-msg-error')).toContainText('Retry the same message safely');
  await page.locator('#bc-case-destination').selectOption('second-case');
  await input.fill('Second case message');await page.locator('#bc-msg-form').evaluate((form:HTMLFormElement)=>form.requestSubmit());
  await expect(page.locator('#bc-msg-chat')).toContainText('Second case message');
  await page.locator('#bc-case-destination').selectOption('guide-case');
  await expect(input).toHaveValue('First case uncertainty');
  await page.locator('#bc-msg-form').evaluate((form:HTMLFormElement)=>form.requestSubmit());
  await expect(input).toHaveValue('');
  expect(await page.evaluate(()=>{const messages=(window as any).__bcThreeUser.data.messages;return messages.filter((m:any)=>m.body==='First case uncertainty'||m.body==='Second case message').map((m:any)=>[m.case_id,m.body])})).toEqual([['guide-case','First case uncertainty'],['second-case','Second case message']]);
});
test('same-peer case switch removes stale meetup form and late completion preserves new case form and draft',async({page})=>{
  await open(page,'easwar','ACCEPTED',{},'messages/case:guide-case',db=>{
    db.exchanges.push({...db.exchanges[0],id:'second-case',state:'ACTIVE',handoff_at:stamp});
  });
  const message=page.locator('#bc-msg-form textarea');await message.fill('Case A draft');
  await page.locator('[data-thread-case-action="propose_meetup"]').click();
  const meetup=page.locator('#bc-case-meetup');await meetup.locator('[name="venue"]').fill('Public Library');await meetup.locator('[name="when"]').fill('2026-12-01T12:00');
  await page.locator('#bc-case-destination').selectOption('guide-case');
  await expect(meetup.locator('[name="venue"]')).toHaveValue('Public Library');
  await page.evaluate(()=>{(window as any).__detachedMeetup=document.querySelector('#bc-case-meetup');const db=(window as any).BC_SUPABASE,original=db.rpc;db.rpc=(name:string,args:any)=>name==='exchange_case_transition'?new Promise(resolve=>{(window as any).__releaseMeetup=()=>original(name,args).then(resolve)}):original(name,args)});
  await meetup.evaluate((form:HTMLFormElement)=>form.requestSubmit());
  await expect(meetup.locator('button[type="submit"]')).toBeDisabled();
  await page.locator('#bc-case-destination').selectOption('second-case');
  await expect(meetup).toHaveCount(0);
  await expect(message).toHaveValue('');await message.fill('Case B draft');
  await page.getByText('Help and issues',{exact:true}).click();await page.locator('[data-thread-case-action="request_support"]').click();
  const support=page.locator('#bc-case-support');await support.locator('[name="note"]').fill('Case B support draft');
  await page.evaluate(()=>{(window as any).__detachedMeetup.requestSubmit()});
  await page.evaluate(()=>(window as any).__releaseMeetup());
  await expect.poll(()=>page.evaluate(()=>(window as any).__bcThreeUser.data.exchanges.find((e:any)=>e.id==='guide-case').state)).toBe('MEETUP_PLANNING');
  await expect(support.locator('[name="note"]')).toHaveValue('Case B support draft');
  await expect(message).toHaveValue('Case B draft');
  await expect.poll(()=>page.evaluate(()=>decodeURIComponent(location.hash))).toBe('#messages/case:second-case');
  await page.locator('#bc-case-destination').selectOption('guide-case');
  await expect(support).toHaveCount(0);await expect(message).toHaveValue('Case A draft');
});
test('case focus retains separate drafts and mobile width when switching in one collector thread',async({page})=>{
  await page.setViewportSize({width:390,height:844});await open(page);
  const input=page.locator('#bc-msg-form textarea');await input.fill('Draft for first case');
  await page.locator('#bc-case-destination').selectOption('');await input.fill('General draft');
  await page.locator('#bc-case-destination').selectOption('guide-case');await expect(input).toHaveValue('Draft for first case');
  await page.evaluate(()=>window.dispatchEvent(new Event('online')));await expect(input).toHaveValue('Draft for first case');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
});
test('reciprocal match opens exact physical-item proposal inside Messages without reserving on open',async({page})=>{
  await open(page,'easwar','CANCELLED',{},'matches',db=>{
    db.collection.forEach((item:any)=>{item.available_for_exchange=true});
    db.wishlist.push({id:'wish-a',user_id:A,set_number:'42143-1'},{id:'wish-b',user_id:B,set_number:'42172-1'});
  });
  await page.locator('[data-propose]').click();
  await expect(page.locator('#bc-inline-proposal')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>decodeURIComponent(location.hash))).toBe('#messages/direct:'+B);
  expect(await page.evaluate(()=>(window as any).__bcThreeUser.data.exchanges.length)).toBe(1);
  await page.locator('#bc-inline-proposal').evaluate((form:HTMLFormElement)=>form.requestSubmit());
  await expect.poll(()=>page.evaluate(()=>decodeURIComponent(location.hash))).toBe('#messages/case:case-2');
  await expect(page.locator('#bc-case-destination')).toHaveValue('case-2');
});
test('late proposal response cannot navigate into another collector chat',async({page})=>{
  await open(page,'easwar','CANCELLED',{},'matches',db=>{db.collection.forEach((item:any)=>{item.available_for_exchange=true});db.wishlist.push({id:'wish-a',user_id:A,set_number:'42143-1'},{id:'wish-b',user_id:B,set_number:'42172-1'})});
  await page.locator('[data-propose]').click();await expect(page.locator('#bc-inline-proposal')).toBeVisible();
  await page.evaluate(()=>{
    const db=(window as any).BC_SUPABASE,original=db.rpc;
    db.rpc=(name:string,args:any)=>name==='create_exchange_case'?new Promise(resolve=>{(window as any).__releaseProposal=()=>original(name,args).then(resolve)}):original(name,args);
  });
  await page.locator('#bc-inline-proposal').evaluate((form:HTMLFormElement)=>form.requestSubmit());
  await expect(page.locator('#bc-inline-proposal button[type="submit"]')).toBeDisabled();
  await page.evaluate(C=>(window as any).bcNav('messages','direct:'+C),C);
  await expect(page.locator('.bc-msg-hero h1')).toContainText('Dhyan');
  await page.evaluate(()=>(window as any).__releaseProposal());
  await expect.poll(()=>page.evaluate(()=>decodeURIComponent(location.hash))).toBe('#messages/direct:'+C);
  await expect(page.locator('#bc-inline-proposal')).toHaveCount(0);
});
for(const [action,rpc,form,field] of [['report_issue','report_exchange_case_issue','#bc-case-issue','description'],['request_support','request_exchange_case_support','#bc-case-support','note']])test(`late ${action} completion cannot affect another collector`,async({page})=>{
  await open(page,'easwar','ACTIVE',{handoff_at:stamp});
  await page.getByText('Help and issues',{exact:true}).click();
  await page.locator(`[data-thread-case-action="${action}"]`).click();
  await page.locator(`${form} [name="${field}"]`).fill('Scoped request');
  await page.evaluate((name:string)=>{const db=(window as any).BC_SUPABASE,original=db.rpc;db.rpc=(rpc:string,args:any)=>rpc===name?new Promise(resolve=>{(window as any).__releaseCaseForm=()=>original(rpc,args).then(resolve)}):original(rpc,args)},rpc);
  await page.locator(form).evaluate((element:HTMLFormElement)=>element.requestSubmit());
  await expect(page.locator(`${form} button[type="submit"]`)).toBeDisabled();
  await page.evaluate(C=>(window as any).bcNav('messages','direct:'+C),C);
  await expect(page.locator('.bc-msg-hero h1')).toContainText('Dhyan');
  await page.evaluate(()=>(window as any).__releaseCaseForm());
  await expect.poll(()=>page.evaluate((kind:string)=>((window as any).__bcThreeUser.data[kind]||[]).length,action==='report_issue'?'issues':'supportRequests')).toBe(1);
  await expect.poll(()=>page.evaluate(()=>decodeURIComponent(location.hash))).toBe('#messages/direct:'+C);
  await expect(page.locator('#bc-collector-form')).toBeEmpty();
  await expect(page.locator('.bc-toast')).toHaveCount(0);
});
test('proposal and case-message notifications focus the exact case and message',async({page})=>{
  await open(page,'easwar','PROPOSED',{},'messages',db=>{
    db.messages.push({id:'target-message',case_id:'guide-case',sender_id:B,recipient_id:A,body:'Exact notification target',created_at:stamp});
    db.notifications.push({id:'proposal-note',user_id:A,kind:'exchange_proposed',exchange_case_id:'guide-case',created_at:stamp},{id:'message-note',user_id:A,kind:'exchange_message',exchange_case_id:'guide-case',exchange_case_message_id:'target-message',created_at:stamp});
  });
  await page.locator('[data-bc-notification-presentation] [data-close]').first().click();
  await page.locator('[data-open="notifications"]').click();await page.locator('[data-note="message-note"]').click();
  await expect.poll(()=>page.evaluate(()=>decodeURIComponent(location.hash))).toBe('#messages/case:guide-case:message:target-message');
  await expect(page.locator('[data-timeline-message="target-message"]')).toContainText('Exact notification target');
  await page.locator('[data-open="notifications"]').click();await page.locator('[data-note="proposal-note"]').click();
  await expect(page.locator('#bc-case-destination')).toHaveValue('guide-case');
});
test('unauthenticated exact case link resumes inside Messages after sign-in',async({page})=>{
  await open(page,'easwar');
  await page.evaluate(async()=>{await (window as any).BC_SUPABASE.auth.signOut();location.hash='#messages/case:guide-case'});
  await expect(page.getByRole('heading',{name:'Sign in to open Messages'})).toBeVisible();
  await page.locator('#bc-email-signin [name="email"]').fill('easwar@example.invalid');
  await page.locator('#bc-email-signin [name="password"]').fill('test-password');
  await page.locator('#bc-email-signin').evaluate((form:HTMLFormElement)=>form.requestSubmit());
  await expect(page.locator('#bc-case-destination')).toHaveValue('guide-case');
  await expect.poll(()=>page.evaluate(()=>decodeURIComponent(location.hash))).toBe('#messages/case:guide-case');
});
test('pre-handoff cancellation uses the canonical RPC and releases both item preferences',async({page})=>{
  await open(page,'easwar','ACCEPTED');
  await page.locator('.bc-guide-options summary').click();
  page.on('dialog',dialog=>dialog.type()==='prompt'?dialog.accept('Not exchanging now'):dialog.accept());
  await page.locator('[data-thread-case-action="cancel_before_handoff"]').click();
  await expect(page.locator('#bc-collector-action')).toContainText('Closed');
  await expect(page.locator('#bc-msg-form')).toBeHidden();
  expect(await page.evaluate(()=>(document.querySelector('#bc-msg-chat') as any).bcThread.caseRow.state)).toBe('CANCELLED');
  expect(await page.evaluate(()=>{const s=(window as any).__bcThreeUser;return {state:s.data.exchanges[0].state,available:s.data.collection.map((row:any)=>row.available_for_exchange),rpc:s.rpcArgs.some((r:any)=>r.name==='cancel_exchange_case_before_mutual_handoff'&&r.args.p_case_id==='guide-case')}})).toMatchObject({state:'CANCELLED',available:[true,true],rpc:true});
});
for(const state of ['COMPLETED','CANCELLED'])test(`collector refresh ${state} closes current composer but preserves separate drafts and General chat`,async({page})=>{
  await open(page,'easwar','ACCEPTED',{},'messages/case:guide-case',db=>{
    db.exchanges.push({...db.exchanges[0],id:'second-case',state:'ACCEPTED'});
    db.messages.push({id:'archived-body',case_id:'guide-case',sender_id:B,recipient_id:A,body:'Archived case body',created_at:stamp});
  });
  const input=page.locator('#bc-msg-form textarea'),form=page.locator('#bc-msg-form');
  await expect(input).toBeVisible();await input.fill('First case draft');
  await page.locator('#bc-case-destination').selectOption('second-case');await input.fill('Second case draft');
  await page.locator('#bc-case-destination').selectOption('');await input.fill('General draft');
  await page.locator('#bc-case-destination').selectOption('guide-case');await expect(input).toHaveValue('First case draft');
  await page.evaluate(state=>{const s=(window as any).__bcThreeUser;s.data.exchanges[0].state=state;s.data.exchanges[0].state_version++;s.persist();(document.querySelector('[data-refresh-thread]') as HTMLButtonElement).click()},state);
  await expect(form).toBeHidden();await expect(page.getByRole('region',{name:'Exchange next step'})).toContainText('Closed');
  expect(await page.evaluate(()=>(document.querySelector('#bc-msg-chat') as any).bcThread.caseRow.state)).toBe(state);
  await expect(page.locator('#bc-msg-chat')).toContainText('Archived case body');
  await page.locator('#bc-case-destination').selectOption('second-case');await expect(form).toBeVisible();await expect(input).toHaveValue('Second case draft');
  await page.locator('#bc-case-destination').selectOption('');await expect(form).toBeVisible();await expect(input).toHaveValue('General draft');
  expect(await page.evaluate(()=>(document.querySelector('#bc-msg-chat') as any).bcThread.caseRow)).toBeNull();
  await input.fill('General still sends');await form.evaluate((f:HTMLFormElement)=>f.requestSubmit());await expect(input).toHaveValue('');
  expect(await page.evaluate(()=>(window as any).__bcThreeUser.data.directMessages.at(-1).body)).toBe('General still sends');
  await page.locator('#bc-case-destination').selectOption('guide-case');await expect(form).toBeHidden();await expect(input).toHaveValue('First case draft');
});
test('canonical final return confirmation closes composer immediately without reselect',async({page})=>{
  await open(page,'ramya','RETURN_INSPECTION',{return_arrived_a_at:stamp,return_arrived_b_at:stamp,return_inspected_a_at:stamp,return_inspected_b_at:stamp,return_confirmed_a_at:stamp,handoff_at:stamp});
  const input=page.locator('#bc-msg-form textarea');await input.fill('Unsent final draft');page.on('dialog',dialog=>dialog.accept());
  await page.locator('[data-thread-case-action="return_confirm"]').click();
  await expect(page.getByRole('region',{name:'Exchange next step'})).toContainText('Closed');await expect(page.locator('#bc-msg-form')).toBeHidden();
  await expect(input).toHaveValue('Unsent final draft');
  expect(await page.evaluate(()=>{const s=(window as any).__bcThreeUser;return {state:(document.querySelector('#bc-msg-chat') as any).bcThread.caseRow.state,event:s.data.events.at(-1).event_type,result:s.data.events.at(-1).resulting_state}})).toEqual({state:'COMPLETED',event:'return_confirm',result:'COMPLETED'});
  await expect(page.locator('.bc-collector-event summary')).toContainText('Return confirm');
});
test('collector refresh preserves focus caret and an open meetup form',async({page})=>{
  await open(page,'easwar','ACCEPTED');await page.locator('[data-thread-case-action="propose_meetup"]').click();
  await page.locator('#bc-case-meetup [name="venue"]').fill('Keep venue');
  const input=page.locator('#bc-msg-form textarea');await input.fill('Keep exact caret');
  await input.evaluate((el:HTMLTextAreaElement)=>{el.focus();el.setSelectionRange(2,7);(document.querySelector('[data-refresh-thread]') as HTMLButtonElement).click()});
  await expect(page.locator('[data-refresh-thread]')).toBeEnabled();await expect(input).toHaveValue('Keep exact caret');
  expect(await input.evaluate((el:HTMLTextAreaElement)=>[document.activeElement===el,el.selectionStart,el.selectionEnd])).toEqual([true,2,7]);
  await expect(page.locator('#bc-case-meetup [name="venue"]')).toHaveValue('Keep venue');
});
test('collector refresh keeps a pending case send disabled and bound to its original draft',async({page})=>{
  await open(page,'easwar','ACCEPTED');
  const form=page.locator('#bc-msg-form'),input=form.locator('textarea'),send=form.locator('button[type="submit"]');
  await input.fill('Pending exact case');
  await page.evaluate(()=>{const db=(window as any).BC_SUPABASE,rpc=db.rpc;db.rpc=(name:string,args:any)=>name==='send_exchange_case_message'?new Promise(resolve=>{(window as any).__releaseCaseSend=()=>rpc(name,args).then(resolve)}):rpc(name,args)});
  await form.evaluate((f:HTMLFormElement)=>f.requestSubmit());await expect(input).toBeDisabled();await expect(send).toBeDisabled();
  await page.locator('[data-refresh-thread]').click();await expect(page.locator('[data-refresh-thread]')).toBeEnabled();
  await expect(input).toBeDisabled();await expect(send).toBeDisabled();await expect(input).toHaveValue('Pending exact case');
  await expect(page.locator('#bc-case-destination')).toBeDisabled();
  await page.evaluate(()=>(window as any).__releaseCaseSend());
  await expect(input).toBeEnabled();await expect(input).toHaveValue('');await expect(page.locator('#bc-msg-chat')).toContainText('Pending exact case');
  expect(await page.evaluate(()=>(window as any).__bcThreeUser.data.messages.filter((m:any)=>m.case_id==='guide-case'&&m.body==='Pending exact case').length)).toBe(1);
});
for(const switchAccount of [false,true])test(`late collector refresh respects ${switchAccount?'new account':'new case destination'}`,async({page})=>{
  await open(page,'easwar','ACCEPTED',{},'messages/case:guide-case',db=>{db.exchanges.push({...db.exchanges[0],id:'second-case',state:'ACCEPTED'})});
  await page.locator('#bc-msg-form textarea').fill('Original draft');
  await page.evaluate(()=>{
    const db=(window as any).BC_SUPABASE,from=db.from;let pause=true;
    db.from=(table:string)=>{const q=from(table);if(table==='exchange_cases'&&pause){pause=false;const then=q.then;q.then=(resolve:any)=>then((result:any)=>new Promise(done=>{(window as any).__releaseCollectorRead=()=>done(resolve(result))}))}return q};
    (document.querySelector('[data-refresh-thread]') as HTMLButtonElement).click();
  });
  await expect.poll(()=>page.evaluate(()=>typeof (window as any).__releaseCollectorRead)).toBe('function');
  if(switchAccount){
    await page.evaluate(async()=>{(window as any).__bcThreeUser.switchActor('dhyan');await (window as any).BC_SUPABASE.auth.signInWithPassword()});
    await expect(page.locator('[data-nav="profile"].bc-avatar-btn')).toBeVisible();
    await page.evaluate(peer=>(window as any).bcNav('messages','direct:'+peer),B);
    await expect(page.locator('#bc-case-destination option')).toHaveCount(1);
  }else await page.locator('#bc-case-destination').selectOption('second-case');
  await page.locator('#bc-msg-form textarea').fill('New destination draft');
  await page.evaluate(()=>(window as any).__releaseCollectorRead());
  if(!switchAccount)await expect(page.locator('[data-refresh-thread]')).toBeEnabled();
  await expect(page.locator('#bc-msg-form')).toBeVisible();await expect(page.locator('#bc-msg-form textarea')).toHaveValue('New destination draft');
  if(switchAccount){
    await expect(page.locator('[data-thread-case-action]')).toHaveCount(0);await expect(page.locator('#bc-case-destination')).toHaveValue('');
  }else{
    await expect(page.locator('#bc-case-destination')).toHaveValue('second-case');
    await page.locator('#bc-case-destination').selectOption('guide-case');await expect(page.locator('#bc-msg-form textarea')).toHaveValue('Original draft');
  }
});
test('collector case selector focuses exact case, and reconnect preserves draft',async({page})=>{
  await page.setViewportSize({width:390,height:844});await open(page,'easwar','PROPOSED',{},'messages/direct:'+B);
  await page.locator('#bc-case-destination').selectOption('guide-case');
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
