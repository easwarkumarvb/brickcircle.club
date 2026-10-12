import fs from 'node:fs';
import vm from 'node:vm';
import {test,expect} from './fixtures';
import type {Page} from '@playwright/test';
const A='00000000-0000-4000-8000-000000000101',B='00000000-0000-4000-8000-000000000102',C='00000000-0000-4000-8000-000000000103';
const AT='2026-10-05T12:00:00.000Z';
const fixture=fs.readFileSync('tests/isolated/fixtures/three-user-supabase-browser-mock.js','utf8').replace("select(){query.selected=true;return query},", "not(){return query},select(){query.selected=true;return query},");
const extension=`
const config=window.__readModelConfig;
const originalRpc=db.rpc,originalFrom=db.from;
const readState=window.__readModel={config,calls:[],legacyReads:[]};
db.from=table=>{
 const query=originalFrom(table);
 if(['messages','exchange_case_messages','exchange_case_events'].includes(table)){
  const record={table,limit:null,scope:null};readState.legacyReads.push(record);
  const limit=query.limit,or=query.or;
  query.limit=value=>{record.limit=value;return limit.call(query,value)};
  query.or=value=>{record.scope=value;return or.call(query,value)};
 }
 return query;
};
const tuple=row=>[row.occurred_at,row.source_type,row.source_id];
const compare=(a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b));
db.rpc=async(name,args)=>{
 if(!['list_collector_conversations','collector_conversation_feed','mark_collector_conversation_read'].includes(name))return originalRpc(name,args);
 readState.calls.push({name,args:JSON.parse(JSON.stringify(args))});
 if(config.errors?.[name])return {data:null,error:config.errors[name]};
 if(name==='list_collector_conversations'){
  const all=[...config.summaries].sort((a,b)=>compare([b.last_at,b.peer_id],[a.last_at,a.peer_id]));
  return {data:all.filter(row=>!args.p_before_at||compare([row.last_at,row.peer_id],[args.p_before_at,args.p_before_peer])<0).slice(0,args.p_limit),error:null};
 }
 if(name==='collector_conversation_feed'){
  const all=[...(config.feeds[args.p_peer_id]||[])].sort((a,b)=>compare(tuple(b),tuple(a)));
  return {data:all.filter(row=>!args.p_before_at||compare(tuple(row),[args.p_before_at,args.p_before_type,args.p_before_id])<0).slice(0,args.p_limit),error:null};
 }
 const row=(config.feeds[args.p_peer_id]||[]).find(row=>row.occurred_at===args.p_through_at&&row.source_type===args.p_through_type&&row.source_id===args.p_through_id);
 if(!row)return {data:null,error:{code:'22023',message:'Invalid displayed source cursor'}};
 if(config.markClearsUnread){const summary=config.summaries.find(row=>row.peer_id===args.p_peer_id);if(summary)summary.unread_count=0}
 return {data:{ok:true},error:null};
};
`;
if(!fixture.includes('not(){return query}'))throw new Error('Read model fixture missing not() query support');
const enabled=fixture.replace(/\}\)\(\);\s*$/,()=>extension+'\n})();');
new vm.Script(enabled);
function summary(peer=B,last=AT){return {peer_id:peer,last_at:last,last_type:'direct_message',last_id:'direct-074',preview:'Latest server preview',unread_count:7,active_case_count:2}}
function direct(i:number,at=AT){const id='direct-'+String(i).padStart(3,'0');return {occurred_at:at,source_type:'direct_message',source_id:id,case_id:null,payload:{id,sender_id:B,recipient_id:A,exchange_id:null,body:'Direct '+String(i).padStart(3,'0'),created_at:at}}}
function database():any{return {profiles:[{id:A,display_name:'Easwar'},{id:B,display_name:'Ramya'},{id:C,display_name:'Dhyan'}].map(p=>({...p,country:'India',city:'Bengaluru',adult_confirmed_at:AT,created_at:AT})),collection:[{id:'item-a',user_id:A,set_number:'42172-1'},{id:'item-b',user_id:B,set_number:'42143-1'}],wishlist:[],exchanges:['case-one','case-two'].map(id=>({id,user_a:A,user_b:B,proposer_id:A,recipient_id:B,item_a:'item-a',item_b:'item-b',duration_days:60,state:'ACCEPTED',state_version:2,created_at:AT,updated_at:AT})),events:[],notifications:[],messages:[],directMessages:[],reviews:[],issues:[],issueResponses:[],supportRequests:[],peerReviews:[]}}
async function open(page:Page,config:any={},route='messages',db:any=database()){
 const full={summaries:[summary()],feeds:{[B]:Array.from({length:75},(_,i)=>direct(i))},errors:{},...config};
 await page.addInitScript(({db,full})=>{localStorage.setItem('bc_three_user_actor','easwar');localStorage.setItem('bc_three_user_db',JSON.stringify(db));sessionStorage.setItem('bc_three_user_initialized','1');(window as any).__readModelConfig=full},{db,full});
 await page.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4',r=>r.fulfill({contentType:'application/javascript',body:enabled}));
 await page.goto('/v2.html?isolated=three-user#'+route);
}
async function calls(page:Page,name:string){return page.evaluate(name=>(window as any).__readModel.calls.filter((row:any)=>row.name===name),name)}
async function thread(page:Page){await page.locator(`[data-message-open="direct:${B}"]`).click();await expect(page.locator('#bc-msg-form')).toBeVisible()}

test('server summaries and feed use bounded pages; older collector survives subsequent summary refresh',async({page})=>{
 const db=database(),peers=Array.from({length:31},(_,i)=>'00000000-0000-4000-8000-'+String(200+i).padStart(12,'0'));
 db.profiles.push(...peers.map((id,i)=>({id,display_name:'Collector '+i,country:'India',city:'Bengaluru',adult_confirmed_at:AT,created_at:AT})));
 const summaries=peers.map((peer,i)=>({...summary(peer,new Date(Date.parse(AT)-i*1000).toISOString()),active_case_count:0}));
 await open(page,{summaries},'messages',db);await expect(page.locator('.bc-msg-row')).toHaveCount(30);
 const initial=(await calls(page,'list_collector_conversations'))[0].args;expect(initial).toEqual({p_before_at:null,p_before_peer:null,p_limit:30});
 await page.locator('[data-load-more-collectors]').click();await expect(page.locator('.bc-msg-row')).toHaveCount(31);
 const older=(await calls(page,'list_collector_conversations')).find((r:any)=>r.args.p_before_at);
 expect(older.args).toEqual({p_before_at:summaries[29].last_at,p_before_peer:peers[29],p_limit:30});
 await page.locator('[data-refresh-messages-list]').click();await expect(page.locator(`[data-message-open="direct:${peers[30]}"]`)).toContainText('Collector 30');
});

test('feed cursor preserves tuple order and IDs across equal timestamps without duplicates',async({page})=>{
 await open(page);await thread(page);await expect(page.locator('[data-timeline-message]')).toHaveCount(50);
 expect((await calls(page,'collector_conversation_feed'))[0].args).toEqual({p_peer_id:B,p_before_at:null,p_before_type:null,p_before_id:null,p_limit:50});
 await page.locator('[data-load-earlier]').click();await expect(page.locator('[data-timeline-message]')).toHaveCount(75);
 expect((await calls(page,'collector_conversation_feed')).find((r:any)=>r.args.p_before_id)?.args).toEqual({p_peer_id:B,p_before_at:AT,p_before_type:'direct_message',p_before_id:'direct-025',p_limit:50});
 await expect(page.locator('[data-timeline-message]').first()).toContainText('Direct 000');await expect(page.locator('[data-timeline-message]').last()).toContainText('Direct 074');
 await page.locator('[data-refresh-thread]').click();await expect(page.locator('[data-timeline-message]')).toHaveCount(75);
 await expect(page.locator('[data-timeline-message="direct-025"]')).toHaveCount(1);
});

test('mobile timeline and read acknowledgment preserve same-millisecond PostgreSQL microseconds',async({page})=>{
 const earlier='2026-10-05T12:00:00.123001+00:00',later='2026-10-05T12:00:00.123999+00:00';
 await page.setViewportSize({width:390,height:844});
 await open(page,{summaries:[summary(B,later)],feeds:{[B]:[direct(9,earlier),direct(1,later)]}});
 await thread(page);
 await expect(page.locator('[data-timeline-message]').first()).toContainText('Direct 009');
 await expect(page.locator('[data-timeline-message]').last()).toContainText('Direct 001');
 await page.locator('#bc-msg-chat').evaluate(e=>{e.scrollTop=e.scrollHeight;e.dispatchEvent(new Event('scroll'))});
 await expect.poll(async()=>(await calls(page,'mark_collector_conversation_read')).length).toBeGreaterThan(0);
 for(const {args} of await calls(page,'mark_collector_conversation_read'))expect(args).toEqual({p_peer_id:B,p_through_at:later,p_through_type:'direct_message',p_through_id:'direct-001'});
});

for(const acknowledgment of ['confirmed','uncertain'])test(`same-account auth hydration reconciles ${acknowledgment} send on the replacement mobile composer`,async({page})=>{
 await page.setViewportSize({width:390,height:844});await open(page);await thread(page);
 await page.evaluate((acknowledgment)=>{
  const win=window as any,db=win.BC_SUPABASE,original=db.rpc;
  win.__hydrationSendRequests=[];win.__originalSendForm=document.querySelector('#bc-msg-form');let hold=true;
  db.rpc=(name:string,args:any)=>{
   if(name!=='send_collector_message')return original(name,args);
   win.__hydrationSendRequests.push(JSON.parse(JSON.stringify(args)));
   if(!hold)return original(name,args);hold=false;
   return new Promise(resolve=>{win.__releaseHydrationSend=async()=>{const committed=await original(name,args);resolve(acknowledgment==='confirmed'?committed:{data:null,error:{message:'Acknowledgment lost after commit'}})}});
  };
 },acknowledgment);
 const body=`Hydration ${acknowledgment} message`;
 await page.locator('#bc-msg-form textarea').fill(body);await page.locator('#bc-msg-form').evaluate(form=>(form as HTMLFormElement).requestSubmit());
 await expect.poll(()=>page.evaluate(()=>(window as any).__hydrationSendRequests.length)).toBe(1);
 await page.evaluate(async()=>{await (window as any).BC_SUPABASE.auth.signInWithPassword({email:'unused@example.test',password:'unused'})});
 await expect.poll(()=>page.evaluate(()=>(window as any).__originalSendForm.isConnected)).toBe(false);
 await expect(page.locator('#bc-msg-form textarea')).toHaveValue(body);
 await page.evaluate(async()=>{await (window as any).__releaseHydrationSend()});
 await expect(page.locator('#bc-msg-form textarea')).toBeEnabled();
 if(acknowledgment==='confirmed'){
  await expect(page.locator('#bc-msg-form textarea')).toHaveValue('');
  await page.locator('#bc-msg-form').evaluate(form=>(form as HTMLFormElement).requestSubmit());
  expect(await page.evaluate(()=>(window as any).__hydrationSendRequests.length)).toBe(1);
 }else{
  await expect(page.locator('#bc-msg-error')).toContainText('Retry the same message safely');
  await expect(page.locator('#bc-msg-form textarea')).toHaveValue(body);
  await page.locator('#bc-msg-form').evaluate(form=>(form as HTMLFormElement).requestSubmit());await expect(page.locator('#bc-msg-form textarea')).toHaveValue('');
  const requests=await page.evaluate(()=>(window as any).__hydrationSendRequests);expect(requests).toHaveLength(2);expect(requests[1]).toEqual(requests[0]);
 }
 expect(await page.evaluate(body=>(window as any).__bcThreeUser.data.directMessages.filter((message:any)=>message.body===body).length,body)).toBe(1);
});

test('server unread remains authoritative until a validated visible feed cursor is acknowledged',async({page})=>{
 await page.setViewportSize({width:390,height:844});await open(page,{markClearsUnread:false});
 await expect(page.locator('.bc-msg-unread')).toHaveText('7');await expect(page.locator('main')).not.toContainText('Unread on this device');
 await thread(page);await page.locator('#bc-msg-chat').evaluate(e=>{e.scrollTop=e.scrollHeight;e.dispatchEvent(new Event('scroll'))});
 await expect.poll(async()=>(await calls(page,'mark_collector_conversation_read')).length).toBeGreaterThan(0);
 for(const {args} of await calls(page,'mark_collector_conversation_read'))expect(args).toEqual({p_peer_id:B,p_through_at:AT,p_through_type:'direct_message',p_through_id:'direct-074'});
 await page.getByRole('button',{name:'Back to Messages'}).click();await expect(page.locator('.bc-msg-unread')).toHaveText('7');
});

for(const name of ['list_collector_conversations','collector_conversation_feed'])test(`${name} authorization failure fails closed without legacy downgrade`,async({page})=>{
 await open(page,{errors:{[name]:{code:'42501',message:'Not authorized'}}},name==='collector_conversation_feed'?'messages/direct:'+B:'messages');
 await expect(page.getByRole('heading',{name:'Conversation unavailable'})).toBeVisible();await expect(page.locator('#bc-msg-form')).toHaveCount(0);
 // Account boot hydration remains bounded at 100; denied conversation RPCs
 // must never downgrade to the legacy inbox scan or direct thread history.
 const reads=await page.evaluate(()=>(window as any).__readModel.legacyReads.filter((q:any)=>q.table==='messages'));
 expect(reads.filter((q:any)=>q.limit!==100)).toEqual([]);
});

test('a transient feed refresh keeps known messages and unsent composer draft',async({page})=>{
 await open(page);await thread(page);const input=page.locator('#bc-msg-form textarea');await input.fill('Draft through server outage');
 await page.evaluate(()=>{(window as any).__readModel.config.errors.collector_conversation_feed={code:'XX000',message:'Temporary failure'}});await page.locator('[data-refresh-thread]').click();
 await expect(page.locator('#bc-msg-chat')).toContainText('Direct 074');await expect(input).toHaveValue('Draft through server outage');await expect(input).toBeEnabled();
 await page.evaluate(()=>{delete (window as any).__readModel.config.errors.collector_conversation_feed});await page.locator('[data-refresh-thread]').click();await expect(input).toHaveValue('Draft through server outage');
});

test('old notification anchors exact case message without moving the current feed pagination cursor',async({page})=>{
 const db=database(),old='2026-01-01T00:00:00.000Z';db.messages.push({id:'old-case-target',case_id:'case-one',sender_id:B,recipient_id:A,body:'Exact old notification message',created_at:old});
 await open(page,{},'messages/case:case-one:message:old-case-target',db);
 await expect(page.locator('[data-timeline-message="old-case-target"][data-timeline-case="case-one"]')).toContainText('Exact old notification message');
 await expect(page.locator('[data-clear-reply-case]')).toHaveCount(0);
 await page.locator('[data-load-earlier]').click();expect((await calls(page,'collector_conversation_feed')).find((r:any)=>r.args.p_before_id)?.args.p_before_id).toBe('direct-025');
 await expect(page.locator('[data-timeline-message="old-case-target"]')).toHaveCount(1);await expect(page.locator('[data-timeline-message="direct-000"]')).toHaveCount(1);
});

test('two case contexts remain explicit and exact within one server backed collector conversation',async({page})=>{
 await open(page);await expect(page.locator('.bc-msg-row')).toHaveCount(1);await thread(page);await expect(page.locator('.bc-collector-case-chip')).toHaveCount(2);
 await page.locator('[data-view-collector-case="case-two"]').first().click();await expect(page.locator('[data-clear-reply-case]')).toHaveCount(0);
 await page.locator('[data-reply-case="case-two"]').click();await page.locator('#bc-msg-form textarea').fill('Exact second exchange');await page.locator('#bc-msg-form').evaluate((f:HTMLFormElement)=>f.requestSubmit());
 await expect.poll(()=>page.evaluate(()=>(window as any).__bcThreeUser.data.messages.find((m:any)=>m.body==='Exact second exchange')?.case_id)).toBe('case-two');
 expect(await page.evaluate(()=>(window as any).__bcThreeUser.data.messages.some((m:any)=>m.case_id==='case-one'&&m.body==='Exact second exchange'))).toBe(false);
});

test('equal timestamp source identity preserves direct case and event rows sharing an ID',async({page})=>{
 const shared='shared-id',feed=[{...direct(1),source_id:shared,payload:{...direct(1).payload,id:shared,body:'General shared ID'}},{occurred_at:AT,source_type:'case_message',source_id:shared,case_id:'case-one',payload:{id:shared,case_id:'case-one',sender_id:B,recipient_id:A,body:'Case shared ID',created_at:AT}},{occurred_at:AT,source_type:'case_event',source_id:shared,case_id:'case-one',payload:{id:shared,case_id:'case-one',event_type:'exchange_accepted',created_at:AT}}];
 await open(page,{feeds:{[B]:feed}});await thread(page);
 await expect(page.locator('[data-timeline-message="shared-id"]')).toHaveCount(2);await expect(page.locator('.bc-collector-event').filter({hasText:'Exchange agreed'})).toHaveCount(1);
 const text=await page.locator('#bc-msg-chat').innerText();expect(text.indexOf('Exchange agreed')).toBeLessThan(text.indexOf('Case shared ID'));expect(text.indexOf('Case shared ID')).toBeLessThan(text.indexOf('General shared ID'));
 await page.locator('[data-refresh-thread]').click();await expect(page.locator('[data-timeline-message="shared-id"]')).toHaveCount(2);
});

test('new remote activity does not mark read while the collector is reading earlier history',async({page})=>{
 await page.setViewportSize({width:390,height:568});await open(page);await thread(page);
 await page.locator('#bc-msg-chat').evaluate(e=>{e.scrollTop=e.scrollHeight;e.dispatchEvent(new Event('scroll'))});
 await expect.poll(async()=>(await calls(page,'mark_collector_conversation_read')).length).toBeGreaterThan(0);
 await expect(page.locator('[data-refresh-thread]')).toBeEnabled();
 await page.locator('#bc-msg-chat').evaluate(e=>{e.scrollTop=0;e.dispatchEvent(new Event('scroll'))});
 const previous=(await calls(page,'mark_collector_conversation_read')).length;
 await page.evaluate(({a,b})=>{const at='2026-10-06T12:00:00.000Z';(window as any).__readModel.config.feeds[b].push({occurred_at:at,source_type:'direct_message',source_id:'new-unseen',case_id:null,payload:{id:'new-unseen',sender_id:b,recipient_id:a,exchange_id:null,body:'New remote activity',created_at:at}})},{a:A,b:B});
 await page.locator('[data-refresh-thread]').click();await expect(page.locator('#bc-msg-chat')).toContainText('New remote activity');
 expect((await calls(page,'mark_collector_conversation_read')).length).toBe(previous);
 await page.locator('#bc-msg-chat').evaluate(e=>{e.scrollTop=e.scrollHeight;e.dispatchEvent(new Event('scroll'))});
 await expect.poll(async()=>(await calls(page,'mark_collector_conversation_read')).at(-1)?.args.p_through_id).toBe('new-unseen');
});

test('feed rows for another collector are never rendered or acknowledged in the current conversation',async({page})=>{
 const foreign={...direct(9),source_id:'foreign-peer-message',payload:{...direct(9).payload,id:'foreign-peer-message',sender_id:C,body:'PRIVATE THIRD COLLECTOR BODY'}};
 await open(page,{feeds:{[B]:[direct(0),foreign]}});await thread(page);
 await expect(page.locator('#bc-msg-chat')).toContainText('Direct 000');await expect(page.locator('#bc-msg-chat')).not.toContainText('PRIVATE THIRD COLLECTOR BODY');
 await page.locator('#bc-msg-chat').evaluate(e=>{e.scrollTop=e.scrollHeight;e.dispatchEvent(new Event('scroll'))});
 await expect.poll(async()=>(await calls(page,'mark_collector_conversation_read')).length).toBeGreaterThan(0);
 expect((await calls(page,'mark_collector_conversation_read')).every((r:any)=>r.args.p_through_id==='direct-000')).toBe(true);
});

test('enabled contract fixture initializes inside the original client scope with one client',async()=>{
 const win:any={__readModelConfig:{summaries:[summary()],feeds:{[B]:[direct(0)]}}};
 const storage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
 new vm.Script(enabled).runInNewContext({window:win,localStorage:storage,sessionStorage:storage,location:{search:''},URLSearchParams});
 expect(win.__bcClientCreateCount).toBe(0);
 const client=win.supabase.createClient();expect(win.__bcClientCreateCount).toBe(1);
 const result=await client.rpc('list_collector_conversations',{p_before_at:null,p_before_peer:null,p_limit:30});
 expect(result.data[0].peer_id).toBe(B);expect(win.__readModel.calls).toHaveLength(1);
 expect(()=>client.from('exchange_cases').select('*').not('state','in','(COMPLETED)')).not.toThrow();
});

for(const size of [5,75])test(`confirmed refresh purges revoked source content while retaining valid history at page size ${size}`,async({page})=>{
 await open(page,{feeds:{[B]:Array.from({length:size},(_,i)=>direct(i))}});await thread(page);
 if(size>50)await page.locator('[data-load-earlier]').click();
 const revoked='direct-'+String(size-1).padStart(3,'0');await expect(page.locator(`[data-timeline-message="${revoked}"]`)).toHaveCount(1);
 await page.evaluate(({peer,id})=>{const config=(window as any).__readModel.config;config.feeds[peer]=config.feeds[peer].filter((row:any)=>row.source_id!==id)},{peer:B,id:revoked});
 await page.locator('[data-refresh-thread]').click();await expect(page.locator(`[data-timeline-message="${revoked}"]`)).toHaveCount(0);
 await expect(page.locator('[data-timeline-message="direct-000"]')).toHaveCount(1);await expect(page.locator('[data-timeline-message]')).toHaveCount(size-1);
});

test('case event payload identity and case mismatch are rejected before rendering or read acknowledgment',async({page})=>{
 const events=[{occurred_at:AT,source_type:'case_event',source_id:'wrong-source-id',case_id:'case-one',payload:{id:'different-payload-id',case_id:'case-one',event_type:'exchange_accepted',created_at:AT}},{occurred_at:AT,source_type:'case_event',source_id:'wrong-case-id',case_id:'case-one',payload:{id:'wrong-case-id',case_id:'case-two',event_type:'exchange_accepted',created_at:AT}}];
 await open(page,{feeds:{[B]:[direct(0),...events]}});await thread(page);
 await expect(page.locator('.bc-collector-event').filter({hasText:'Exchange agreed'})).toHaveCount(0);
 await page.locator('#bc-msg-chat').evaluate(e=>{e.scrollTop=e.scrollHeight;e.dispatchEvent(new Event('scroll'))});
 await expect.poll(async()=>(await calls(page,'mark_collector_conversation_read')).length).toBeGreaterThan(0);
 expect((await calls(page,'mark_collector_conversation_read')).every((r:any)=>r.args.p_through_id==='direct-000')).toBe(true);
});

test('read acknowledgment authorization denial removes protected conversation and composer',async({page})=>{
 await open(page,{errors:{mark_collector_conversation_read:{code:'42501',message:'Read acknowledgment not authorized'}}},'messages/direct:'+B);
 await expect(page.getByRole('heading',{name:'Conversation unavailable'})).toBeVisible();
 await expect(page.locator('#bc-msg-form')).toHaveCount(0);await expect(page.locator('#bc-msg-chat')).toHaveCount(0);
 const marks=await calls(page,'mark_collector_conversation_read');expect(marks.length).toBeGreaterThan(0);
 expect(marks.every((row:any)=>row.args.p_peer_id===B&&row.args.p_through_id==='direct-074'&&row.args.p_through_type==='direct_message'&&row.args.p_through_at===AT)).toBe(true);
});

test('transient read acknowledgment failure preserves draft messages and server unread until recovery',async({page})=>{
 await open(page,{markClearsUnread:false});await thread(page);
 await page.locator('#bc-msg-chat').evaluate(e=>{e.scrollTop=e.scrollHeight;e.dispatchEvent(new Event('scroll'))});
 await expect.poll(async()=>(await calls(page,'mark_collector_conversation_read')).length).toBeGreaterThan(0);
 const input=page.locator('#bc-msg-form textarea');await input.fill('Draft during unread acknowledgment outage');
 await page.evaluate(({a,b})=>{
  const config=(window as any).__readModel.config,at='2026-10-06T12:00:00.000Z';
  config.errors.mark_collector_conversation_read={code:'XX000',message:'Temporary read acknowledgment failure'};
  config.feeds[b].push({occurred_at:at,source_type:'direct_message',source_id:'new-mark-target',case_id:null,payload:{id:'new-mark-target',sender_id:b,recipient_id:a,exchange_id:null,body:'New message during acknowledgment outage',created_at:at}});
 },{a:A,b:B});
 await page.locator('[data-refresh-thread]').click();await expect(page.locator('#bc-msg-chat')).toContainText('New message during acknowledgment outage');
 await page.locator('#bc-msg-chat').evaluate(e=>{e.scrollTop=e.scrollHeight;e.dispatchEvent(new Event('scroll'))});
 await expect.poll(async()=>(await calls(page,'mark_collector_conversation_read')).at(-1)?.args.p_through_id).toBe('new-mark-target');
 await expect(input).toHaveValue('Draft during unread acknowledgment outage');await expect(input).toBeEnabled();await expect(page.locator('.bc-msg-unread')).toHaveText('7');
 await page.evaluate(()=>{const config=(window as any).__readModel.config;delete config.errors.mark_collector_conversation_read;config.markClearsUnread=true});
 await page.locator('#bc-msg-chat').evaluate(e=>e.dispatchEvent(new Event('scroll')));
 await expect(page.locator('.bc-msg-unread')).toHaveCount(0);await expect(input).toHaveValue('Draft during unread acknowledgment outage');
});
