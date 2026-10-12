import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium,expect as playwrightExpect} from '@playwright/test';
import {createClient} from '@supabase/supabase-js';
import {validateTarget,PR138_SHA,STAGING_REF,PRODUCTION_REF} from './validate-hosted-pr138.mjs';
import {browserLogin,browserProposal,browserFixtureSets,installTransport,canonicalArchiveEvents,transportAllowed,stagingApplication} from './hosted-pr125-browser.mjs';
import {insertOwnedItem,serializeRedactedReport,validateStagingEmails} from './hosted-exchange-smoke.mjs';
const expect=playwrightExpect.configure({timeout:30000});
const READ_RPCS=['list_collector_conversations','collector_conversation_feed','mark_collector_conversation_read'];
export function timestampMicros(value){
 assert.equal(typeof value,'string');
 const match=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.(\d{1,6}))?(?:Z|[+-]\d{2}:\d{2})$/.exec(value),millis=match?Date.parse(value):NaN;
 assert.ok(Number.isFinite(millis),'Feed timestamps must retain a valid offset and PostgreSQL precision');
 return BigInt(millis)*1000n+BigInt((match[1]||'').padEnd(6,'0').slice(3));
}
export function assertFeedPage(rows,peer,uid){
 assert.ok(Array.isArray(rows));assert.ok(rows.length<=50);
 const keys=new Set();let previous=null;
 for(const row of rows){
  const occurredAt=timestampMicros(row.occurred_at);assert.ok(['direct_message','case_message','case_event'].includes(row.source_type));assert.ok(row.source_id);
  const key=JSON.stringify([row.source_type,row.source_id,row.case_id||null]);assert.ok(!keys.has(key));keys.add(key);
  const tuple=[occurredAt,row.source_type,row.source_id];
  if(previous)assert.ok(compareTuple(previous,tuple)>=0);previous=tuple;
  assert.equal(row.payload?.id,row.source_id);
  if(row.source_type==='case_event')assert.equal(row.payload.case_id,row.case_id);
  else{const m=row.payload;assert.ok(m.sender_id===uid&&m.recipient_id===peer||m.sender_id===peer&&m.recipient_id===uid);if(row.source_type==='case_message')assert.equal(m.case_id,row.case_id);else assert.equal(m.exchange_id,null)}
 }
 return rows;
}
const lexical=(a,b)=>String(a)<String(b)?-1:String(a)>String(b)?1:0;
export function compareTuple(a,b){return (a[0]<b[0]?-1:a[0]>b[0]?1:0)||lexical(a[1],b[1])||lexical(a[2],b[2])}
export function assertRequestBounds(calls){
 for(const {name,args} of calls){
  if(name==='list_collector_conversations')assert.equal(args.p_limit,30);
  if(name==='collector_conversation_feed'){assert.equal(args.p_limit,50);assert.ok(args.p_peer_id);assert.equal(!!args.p_before_at,!!args.p_before_type);assert.equal(!!args.p_before_at,!!args.p_before_id)}
  if(name==='mark_collector_conversation_read'){assert.ok(args.p_peer_id&&args.p_through_id&&args.p_through_type);timestampMicros(args.p_through_at)}
 }
 for(const name of READ_RPCS)assert.ok(calls.some(call=>call.name===name),`Required read-model request absent: ${name}`);
}
export function assertVisibleReadCursors(calls,rows,peer){
 const marks=calls.filter(call=>call.name==='mark_collector_conversation_read'&&call.args.p_peer_id===peer);assert.ok(marks.length);
 for(const {args} of marks)assert.ok(rows.some(row=>row.occurred_at===args.p_through_at&&row.source_type===args.p_through_type&&row.source_id===args.p_through_id),'Read cursor must name an authorized displayed source');
}
export function assertPublicBrowserEnvironment(env){assert.ok(!env.BC_STAGING_SUPABASE_SECRET_KEY,'Server secret forbidden in browser process')}
export async function assertReadModelReady(client,peer){
 const list=await client.rpc('list_collector_conversations',{p_before_at:null,p_before_peer:null,p_limit:30});assert.ifError(list.error);assert.ok(Array.isArray(list.data));
 const feed=await client.rpc('collector_conversation_feed',{p_peer_id:peer,p_before_at:null,p_before_type:null,p_before_id:null,p_limit:50});assert.ifError(feed.error);assert.ok(Array.isArray(feed.data));
 const invalid=await client.rpc('mark_collector_conversation_read',{p_peer_id:peer,p_through_at:'1900-01-01T00:00:00Z',p_through_type:'direct_message',p_through_id:'00000000-0000-4000-8000-000000000000'});
 assert.equal(invalid.error?.code,'42501','Read cursor validation must reject a nonexistent source');assert.match(invalid.error?.message||'',/Conversation cursor unavailable/);
}
export async function openConversation(page,route){
 await page.evaluate(route=>{window.bcClose();window.bcNav('messages',route)},route);
 await expect(page.locator('#bc-msg-form')).toBeVisible();
}
export async function openDetails(page,id){
 const sheet=page.locator('dialog.bc-collector-sheet');if(await sheet.isVisible())await sheet.locator('[data-close-collector-sheet],[data-close]').first().click();
 await page.locator(`[data-view-collector-case="${id}"]`).first().click();await expect(page.getByRole('region',{name:'Exchange next step'})).toBeVisible();
}
export async function explicitReply(page,id){await openDetails(page,id);await page.locator(`[data-reply-case="${id}"]`).click();await expect(page.locator('#bc-collector-reply-context')).toHaveAttribute('data-reply-case-id',id)}
export async function generalReply(page){const clear=page.locator('[data-clear-reply-context]');if(await clear.count())await clear.click();await expect(clear).toHaveCount(0)}
async function send(page,body){await page.locator('#bc-msg-form textarea').fill(body);await page.locator('#bc-msg-form').evaluate(form=>form.requestSubmit());await expect(page.locator('#bc-msg-form textarea')).toHaveValue('')}
async function refresh(page){const button=page.locator('[data-refresh-thread]');await button.click();await expect(button).toBeEnabled()}
export async function lostResponseRetry(page,{url,caseId,peerId,body,client,runId}){
 if(caseId)await explicitReply(page,caseId);else await generalReply(page);
 const rpc=caseId?'send_exchange_case_message':'send_collector_message',target=url+'/rest/v1/rpc/'+rpc,requests=[];let lost=false;
 const capture=request=>{if(request.url()===target)requests.push(request.postDataJSON())};page.on('request',capture);
 await page.route(target,async route=>{if(lost)return route.continue();const response=await route.fetch();assert.ok(response.ok());lost=true;await route.abort('connectionfailed')});
 try{
  await page.locator('#bc-msg-form textarea').fill(body);await page.locator('#bc-msg-form').evaluate(form=>form.requestSubmit());await expect(page.locator('#bc-msg-error')).toContainText('Retry the same message safely');
  await page.reload();await expect(page.locator('#bc-msg-form')).toBeVisible();await expect(page.locator('[data-clear-reply-context]')).toHaveCount(0);
  if(caseId)await explicitReply(page,caseId);
  await expect(page.locator('#bc-msg-form textarea')).toHaveValue(body);await page.locator('#bc-msg-form').evaluate(form=>form.requestSubmit());await expect(page.locator('#bc-msg-form textarea')).toHaveValue('');
  assert.equal(requests.length,2);assert.equal(requests[0].p_idempotency_key,requests[1].p_idempotency_key);assert.equal(requests[0].p_body,body);assert.equal(requests[1].p_body,body);if(caseId)assert.equal(requests[1].p_case_id,caseId);else assert.equal(requests[1].p_recipient_id,peerId);
  const result=await client.from(caseId?'exchange_case_messages':'messages').select('*').eq('body',body);assert.ifError(result.error);assert.equal(result.data.length,1);if(caseId)assert.equal(result.data[0].case_id,caseId);else{assert.equal(result.data[0].recipient_id,peerId);assert.equal(result.data[0].exchange_id,null)}
  return result.data[0];
 }finally{page.off('request',capture);await page.unroute(target)}
}
export async function personLifecycle({pa,pb,case1,a,b},stage=()=>{}){
 const action=async(page,name,label)=>{stage(label);await openConversation(page,`case:${case1}`);await refresh(page);await openDetails(page,case1);const button=page.locator(`[data-thread-case-action="${name}"]`);await expect(button).toHaveCount(1);await button.click();await expect(button).toHaveCount(0);assert.equal(await page.evaluate(()=>decodeURIComponent(location.hash)),`#messages/case:${case1}`)};
 const plan=async(page,name,label)=>{stage(label);await openConversation(page,`case:${case1}`);await refresh(page);await openDetails(page,case1);await page.locator(`[data-thread-case-action="${name}"]`).click();const form=page.locator('#bc-case-meetup');await form.locator('[name="venue"]').fill('Synthetic public library');await form.locator('[name="when"]').fill(new Date(Date.now()+86400000).toISOString().slice(0,16));await form.evaluate(f=>f.requestSubmit());await expect(form).toHaveCount(0)};
 await action(pb,'accept','accept B');await plan(pa,'propose_meetup','meetup A');await action(pb,'accept_meetup','meetup B');
 for(const name of ['safety_ack','arrive','inspect','handoff'])for(const [page,label] of [[pa,'A'],[pb,'B']])await action(page,name,`${name} ${label}`);
 let state=await a.client.from('exchange_cases').select('state').eq('id',case1).single();assert.ifError(state.error);assert.equal(state.data.state,'ACTIVE');
 await plan(pa,'propose_return','return A');await action(pb,'accept_return','return B');
 for(const name of ['return_arrive','return_inspect','return_confirm'])for(const [page,label] of [[pa,'A'],[pb,'B']])await action(page,name,`${name} ${label}`);
 state=await a.client.from('exchange_cases').select('state,state_version').eq('id',case1).single();assert.ifError(state.error);assert.equal(state.data.state,'COMPLETED');
 await openDetails(pb,case1);await expect(pb.getByRole('region',{name:'Exchange next step'})).toContainText('Closed');await expect(pb.locator(`[data-reply-case="${case1}"]`)).toHaveCount(0);await pb.locator('[data-close-collector-sheet]').click();
 await expect(pb.locator('#bc-msg-form')).toBeVisible();await expect(pb.locator('[data-clear-reply-context]')).toHaveCount(0);await send(pb,'PR138 general thanks after return');
 const events=await a.client.from('exchange_case_events').select('*').eq('case_id',case1);assert.ifError(events.error);canonicalArchiveEvents(events.data,case1,a.id,b.id,state.data.state_version);
}
async function run(env=process.env){
 const report={ok:false,testedPullRequestNumber:138,testedHeadSha:PR138_SHA,target:'approved-staging',checks:[]};let stage='configuration',browser;const clients=[];
 const passed=detail=>report.checks.push({status:'passed',detail});
 try{
  assertPublicBrowserEnvironment(env);validateTarget(env);assert.equal(new URL(env.BC_STAGING_SUPABASE_URL).hostname,STAGING_REF+'.supabase.co');
  const users=validateStagingEmails(['A','B','C'].map(label=>({label,email:env[`BC_STAGING_USER_${label}_EMAIL`],password:env[`BC_STAGING_USER_${label}_PASSWORD`]})),'example.test');assert.ok(users.every(u=>u.password));
  const config={url:env.BC_STAGING_SUPABASE_URL,key:env.BC_STAGING_SUPABASE_PUBLISHABLE_KEY},sessions=[];
  stage='independent public-key synthetic sessions';
  for(const user of users){const client=createClient(config.url,config.key,{auth:{persistSession:false,autoRefreshToken:false}});clients.push(client);const auth=await client.auth.signInWithPassword(user);assert.ifError(auth.error);const checked=await client.auth.getUser();assert.ifError(checked.error);assert.equal(auth.data.user.id,checked.data.user.id);sessions.push({client,id:checked.data.user.id,label:user.label})}
  const [a,b,c]=sessions;assert.equal(new Set(sessions.map(s=>s.id)).size,3);
  stage='authenticated required read model preflight';await assertReadModelReady(a.client,b.id);await assertReadModelReady(b.client,a.id);await assertReadModelReady(c.client,a.id);passed('Required authenticated summary, feed and validated read-cursor RPCs present; no compatibility fallback');
  stage='synthetic physical item fixtures';const runId=`pr138-${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}`,sets=await browserFixtureSets(a.client,env.BC_STAGING_SET_A,env.BC_STAGING_SET_B),items=[];
  for(const [index,session] of [a,b,a,b].entries()){const item=await insertOwnedItem(session,sets[index],runId);items.push(item);const ready=await session.client.rpc('set_exchange_item_availability',{p_item_id:item.id,p_available:true});assert.ifError(ready.error)}
  for(const [session,set] of [[a,sets[1]],[b,sets[0]],[a,sets[3]],[b,sets[2]]]){const wish=await session.client.from('wishlists').upsert({user_id:session.id,set_number:set,priority:3},{onConflict:'user_id,set_number'});assert.ifError(wish.error)}
  stage='three real browser logins';browser=await chromium.launch();const pages=[],captures=[],diagnostics={deniedSocket:0,deniedProduction:0,deniedExternal:0};
  for(const [index,user] of users.entries()){const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}});await installTransport(context,config,env.BC_HOSTED_CANDIDATE_PATH,diagnostics);const page=await context.newPage();page.on('dialog',dialog=>dialog.accept());const requests=[];page.on('request',request=>{const name=request.url().split('/rest/v1/rpc/')[1];if(READ_RPCS.includes(name))requests.push({name,args:request.postDataJSON()})});captures.push(requests);await browserLogin(page,user,()=>{},sessions[index].id);pages.push(page)}
  const [pa,pb,pc]=pages;
  stage='person-first proposal exact physical pairs';const {case1,case2}=await browserProposal(pa,{url:config.url,a,b,sets,items,runId});
  await openConversation(pa,`direct:${b.id}`);await send(pa,'PR138 general first');await explicitReply(pa,case1);await send(pa,'PR138 exact first case');await explicitReply(pa,case2);await send(pa,'PR138 exact second case');await generalReply(pa);
  await pa.locator('#bc-msg-form textarea').fill('PR138 general reload draft');await explicitReply(pa,case1);await pa.locator('#bc-msg-form textarea').fill('PR138 exact reload draft');await pa.reload();await expect(pa.locator('#bc-msg-form textarea')).toHaveValue('PR138 general reload draft');await explicitReply(pa,case1);await expect(pa.locator('#bc-msg-form textarea')).toHaveValue('PR138 exact reload draft');
  const retried=await lostResponseRetry(pa,{url:config.url,caseId:case1,body:'PR138 committed lost response',client:a.client,runId});const notes=await b.client.from('notifications').select('id').eq('exchange_case_message_id',retried.id);assert.ifError(notes.error);assert.equal(notes.data.length,1);await lostResponseRetry(pa,{url:config.url,caseId:null,peerId:b.id,body:'PR138 direct committed lost response',client:a.client,runId});passed('General-by-default chat; exact two-case replies; reload drafts; committed-response-lost retry once and one notification');
  stage='server merged feed pagination and unread cursors';
  for(let i=0;i<55;i++){const result=await a.client.rpc('send_collector_message',{p_recipient_id:b.id,p_body:`PR138 cursor ${String(i).padStart(3,'0')}`,p_idempotency_key:runId+':feed:'+i});assert.ifError(result.error)}
  await openConversation(pb,`direct:${a.id}`);await expect(pb.locator('[data-load-earlier]')).toBeVisible();await pb.locator('[data-load-earlier]').click();await expect(pb.locator('#bc-msg-chat')).toContainText('PR138 general first');
  await openConversation(pc,`direct:${b.id}`);await send(pc,'PR138 third collector unread');await refresh(pb);
  const summary=await b.client.rpc('list_collector_conversations',{p_before_at:null,p_before_peer:null,p_limit:30});assert.ifError(summary.error);assert.equal(summary.data.filter(row=>row.peer_id===a.id).length,1);assert.equal(summary.data.find(row=>row.peer_id===c.id)?.unread_count,1);
  const feed=await b.client.rpc('collector_conversation_feed',{p_peer_id:a.id,p_before_at:null,p_before_type:null,p_before_id:null,p_limit:50});assert.ifError(feed.error);assertFeedPage(feed.data,a.id,b.id);const floor=feed.data.at(-1),older=await b.client.rpc('collector_conversation_feed',{p_peer_id:a.id,p_before_at:floor.occurred_at,p_before_type:floor.source_type,p_before_id:floor.source_id,p_limit:50});assert.ifError(older.error);assertFeedPage(older.data,a.id,b.id);assert.ok(older.data.length);assert.ok(!older.data.some(row=>feed.data.some(newer=>newer.source_type===row.source_type&&newer.source_id===row.source_id&&newer.case_id===row.case_id)));
  await pb.locator('#bc-msg-chat').evaluate(chat=>{chat.scrollTop=chat.scrollHeight;chat.dispatchEvent(new Event('scroll'))});await expect.poll(()=>captures[1].filter(call=>call.name==='mark_collector_conversation_read').length).toBeGreaterThan(0);assertRequestBounds(captures[1]);assertVisibleReadCursors(captures[1],[...feed.data,...older.data],a.id);passed('Required server inbox/feed cursor pagination, tuple deduplication and visible read acknowledgement; third collector unread preserved');
  stage='old exact notification anchor';await pb.evaluate(({id,message})=>window.bcNav('messages',`case:${id}:message:${message}`),{id:case1,message:retried.id});await expect(pb.locator(`[data-timeline-message="${retried.id}"][data-timeline-case="${case1}"]`)).toBeVisible();await expect(pb.locator('[data-clear-reply-context]')).toHaveCount(0);
  stage='outsider browser server read model and canonical writes';await pc.evaluate(id=>window.bcNav('messages',`case:${id}`),case1);await expect(pc.getByRole('heading',{name:'Conversation unavailable'})).toBeVisible();await expect(pc.locator('#bc-msg-form')).toHaveCount(0);
  const foreign=await c.client.rpc('collector_conversation_feed',{p_peer_id:a.id,p_before_at:null,p_before_type:null,p_before_id:null,p_limit:50});assert.ifError(foreign.error);assert.deepEqual(foreign.data,[]);const deniedCursor=await c.client.rpc('mark_collector_conversation_read',{p_peer_id:a.id,p_through_at:feed.data[0].occurred_at,p_through_type:feed.data[0].source_type,p_through_id:feed.data[0].source_id});assert.ok(deniedCursor.error);const denied=await c.client.rpc('send_exchange_case_message',{p_case_id:case1,p_body:'PR138 unauthorized fixture',p_idempotency_key:runId+':outsider'});assert.ok(denied.error);passed('Third collector has no foreign case history/composer; canonical message write denied');
  stage='complete canonical physical lifecycle';await personLifecycle({pa,pb,case1,a,b},detail=>{stage='canonical lifecycle '+detail});passed('Canonical accept, mutually agreed meetup, both safety/arrival/inspection/handoff and return confirmations; general chat after closure');
  assert.equal(diagnostics.deniedProduction,0);assert.equal(diagnostics.deniedSocket,0);report.transport={productionRequests:0,unexpectedSockets:0};report.ok=true;
 }catch{process.exitCode=1;report.failedStage=stage}
 finally{await browser?.close();await Promise.allSettled(clients.map(client=>client.auth.signOut({scope:'local'})));await mkdir('artifacts',{recursive:true});await writeFile('artifacts/hosted-pr138-browser.json',serializeRedactedReport(report));console.log(report.ok?'Hosted PR138 browser checks passed.':`Hosted PR138 browser checks failed at: ${stage}. Values withheld.`)}
}
export async function offlineBrowser(candidate){
 assert.ok(candidate,'An immutable candidate checkout is required');assertPublicBrowserEnvironment(process.env);
 const sdk=(await readFile('tests/isolated/fixtures/three-user-supabase-browser-mock.js','utf8')).replace('select(){query.selected=true;return query},','not(){return query},select(){query.selected=true;return query},');
 const uid='00000000-0000-4000-8000-000000000101',peer='00000000-0000-4000-8000-000000000102',stamp='2026-10-05T12:00:00Z';
 const fixture={profiles:[{id:uid,display_name:'Easwar'},{id:peer,display_name:'Ramya'}].map(p=>({...p,email:p.id+'@example.invalid',country:'India',city:'Bengaluru',adult_confirmed_at:stamp,created_at:stamp})),collection:[{id:'offline-a',user_id:uid,set_number:'42172-1'},{id:'offline-b',user_id:peer,set_number:'42143-1'}],wishlist:[],exchanges:['offline-case-one','offline-case-two'].map(id=>({id,user_a:uid,user_b:peer,proposer_id:uid,recipient_id:peer,item_a:'offline-a',item_b:'offline-b',duration_days:60,state:'ACCEPTED',state_version:2,created_at:stamp,updated_at:stamp})),messages:[],directMessages:[],events:[],notifications:[],reviews:[],issues:[],issueResponses:[],supportRequests:[],peerReviews:[]};
 const browser=await chromium.launch();
 try{
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}}),diagnostics={deniedSocket:0,deniedProduction:0,deniedExternal:0};
  await installTransport(context,{url:`https://${STAGING_REF}.supabase.co`,key:'offline-public-key'},candidate,diagnostics,sdk);
  await context.addInitScript(fixture=>{if(!sessionStorage.getItem('bc_three_user_initialized')){localStorage.setItem('bc_three_user_actor','easwar');localStorage.setItem('bc_three_user_db',JSON.stringify(fixture));sessionStorage.setItem('bc_three_user_initialized','1')}},fixture);
  const page=await context.newPage();await page.goto('http://127.0.0.1:4179/v2.html');
  await openConversation(page,`direct:${peer}`);await expect(page.locator('.bc-collector-case-chip')).toHaveCount(2);await expect(page.locator('[data-clear-reply-context]')).toHaveCount(0);
  await send(page,'Offline general message');assert.equal(await page.evaluate(()=>window.__bcThreeUser.data.directMessages.at(-1).body),'Offline general message');
  await explicitReply(page,'offline-case-two');await send(page,'Offline exact second case');assert.equal(await page.evaluate(()=>window.__bcThreeUser.data.messages.at(-1).case_id),'offline-case-two');
  await generalReply(page);await page.locator('#bc-msg-form textarea').fill('Offline general reload draft');await explicitReply(page,'offline-case-one');await page.locator('#bc-msg-form textarea').fill('Offline exact reload draft');
  await page.reload();await expect(page.locator('#bc-msg-form textarea')).toHaveValue('Offline general reload draft');await explicitReply(page,'offline-case-one');await expect(page.locator('#bc-msg-form textarea')).toHaveValue('Offline exact reload draft');
  await page.evaluate(()=>{const s=window.__bcThreeUser;s.data.exchanges[0].state='COMPLETED';s.persist()});await refresh(page);await expect(page.locator('#bc-msg-form button[type="submit"]')).toBeDisabled();await expect(page.locator('#bc-msg-form textarea')).toHaveValue('Offline exact reload draft');
  await generalReply(page);await send(page,'Offline general after closure');assert.equal(await page.evaluate(()=>window.__bcThreeUser.data.directMessages.at(-1).body),'Offline general after closure');
  await openDetails(page,'offline-case-one');await expect(page.locator('[data-reply-case="offline-case-one"]')).toHaveCount(0);await expect(page.getByRole('region',{name:'Exchange next step'})).toContainText('Closed');await page.locator('[data-close-collector-sheet]').click();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),true);assert.equal(diagnostics.deniedProduction,0);
  console.log('PR138 offline candidate browser interactions passed; no hosted execution.');
 }finally{await browser.close()}
}
async function offline(){
 assertPublicBrowserEnvironment(process.env);
 assert.equal(transportAllowed(`https://${PRODUCTION_REF}.supabase.co/rest/v1/profiles`),false);
 assert.equal(transportAllowed(`https://${STAGING_REF}.supabase.co/rest/v1/profiles`),true);
 assert.equal(transportAllowed('https://unauthorized.example.test/collect'),false);
 const candidate=await readFile(resolve(process.env.BC_HOSTED_CANDIDATE_PATH||'.','app-v3.js'),'utf8');
 const overridden=stagingApplication(candidate,`https://${STAGING_REF}.supabase.co`,'offline-public-key');
 assert.ok(!overridden.includes(`const SUPABASE_URL='https://${PRODUCTION_REF}.supabase.co';`));
 const fake={rpc:async(name)=>name==='mark_collector_conversation_read'?{error:{code:'42501',message:'Conversation cursor unavailable'}}:{data:[],error:null}};
 await assertReadModelReady(fake,'offline-peer');
 console.log('PR138 offline transport and required RPC contract checks passed; no hosted execution.');
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)(process.argv.includes('--offline-browser')?offlineBrowser(process.env.BC_HOSTED_CANDIDATE_PATH):process.argv.includes('--offline')?offline():run()).catch(()=>{console.error('PR138 browser harness failed; values withheld.');process.exitCode=1});
