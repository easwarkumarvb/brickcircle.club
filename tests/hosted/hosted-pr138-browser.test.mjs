import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assertFeedPage,assertRequestBounds,assertVisibleReadCursors,assertReadModelReady,assertPublicBrowserEnvironment,compareTuple} from '../../scripts/hosted-pr138-browser.mjs';
import {assertOutboxOnly} from '../../scripts/audit-hosted-pr138-outbox.mjs';
import {transportAllowed,stagingApplication,canonicalArchiveEvents} from '../../scripts/hosted-pr125-browser.mjs';
import {PR138_SHA,STAGING_REF,PRODUCTION_REF} from '../../scripts/validate-hosted-pr138.mjs';
const at='2026-10-05T12:00:00.000Z';
const row=(id='source-2',type='direct_message',caseId=null)=>({occurred_at:at,source_type:type,source_id:id,case_id:caseId,payload:{id,case_id:caseId,sender_id:'A',recipient_id:'B',exchange_id:null}});
const calls=()=>[
 {name:'list_collector_conversations',args:{p_limit:30}},
 {name:'collector_conversation_feed',args:{p_peer_id:'B',p_limit:50,p_before_at:null,p_before_type:null,p_before_id:null}},
 {name:'mark_collector_conversation_read',args:{p_peer_id:'B',p_through_at:at,p_through_type:'direct_message',p_through_id:'source-2'}}
];
test('browser process rejects server credentials before any authenticated work',()=>{
 assert.doesNotThrow(()=>assertPublicBrowserEnvironment({}));assert.throws(()=>assertPublicBrowserEnvironment({BC_STAGING_SUPABASE_SECRET_KEY:'server-only-credential'}));
});
test('trusted transport excludes production external and credentialed URLs while permitting only staging data surfaces',()=>{
 for(const url of [`https://${PRODUCTION_REF}.supabase.co/rest/v1/profiles`,`https://user:pass@${STAGING_REF}.supabase.co/rest/v1/profiles`,'https://other.example.test/collect',`https://${STAGING_REF}.supabase.co/functions/v1/worker`])assert.equal(transportAllowed(url),false);
 assert.equal(transportAllowed(`https://${STAGING_REF}.supabase.co/rest/v1/rpc/collector_conversation_feed`),true);
 assert.equal(transportAllowed(`wss://${STAGING_REF}.supabase.co/realtime/v1/websocket`,true),true);
 assert.equal(transportAllowed(`wss://${PRODUCTION_REF}.supabase.co/realtime/v1/websocket`,true),false);
});
test('candidate override changes only the known production URL and public key literals',()=>{
 const source=readFileSync('app-v3.js','utf8'),url=`https://${STAGING_REF}.supabase.co`,modified=stagingApplication(source,url,'offline-key');
 assert.ok(modified.includes(`const SUPABASE_URL=${JSON.stringify(url)};`));assert.equal((modified.match(/const SUPABASE_KEY=/g)||[]).length,1);
 assert.throws(()=>stagingApplication(source.replace('const SUPABASE_KEY=','const ALTERED_KEY='),url,'offline-key'));
});
test('authenticated schema preflight requires all three callable RPCs and server cursor validation',async()=>{
 const seen=[],client={rpc:async(name,args)=>{seen.push({name,args});return name==='mark_collector_conversation_read'?{error:{code:'42501',message:'Conversation cursor unavailable'}}:{data:[],error:null}}};
 await assertReadModelReady(client,'B');assert.deepEqual(seen.map(row=>row.name),['list_collector_conversations','collector_conversation_feed','mark_collector_conversation_read']);assert.equal(seen[0].args.p_limit,30);assert.equal(seen[1].args.p_limit,50);
 for(const missing of ['list_collector_conversations','collector_conversation_feed','mark_collector_conversation_read'])await assert.rejects(assertReadModelReady({rpc:async(name)=>name===missing?{data:null,error:{code:'PGRST202'}}:name==='mark_collector_conversation_read'?{error:{code:'42501',message:'Conversation cursor unavailable'}}:{data:[],error:null}},'B'));
 await assert.rejects(assertReadModelReady({rpc:async()=>({data:[],error:null})},'B'));
 await assert.rejects(assertReadModelReady({rpc:async()=>({data:null,error:null})},'B'));
});
test('feed evidence requires bounded reverse tuple order distinct source identities and exact participants',()=>{
 const rows=[row('same','direct_message'),row('same','case_message','case1'),row('same','case_event','case1')];assert.doesNotThrow(()=>assertFeedPage(rows,'B','A'));
 assert.throws(()=>assertFeedPage([...rows].reverse(),'B','A'));assert.throws(()=>assertFeedPage([rows[0],rows[0]],'B','A'));assert.throws(()=>assertFeedPage(Array.from({length:51},(_,i)=>row('id-'+i)),'B','A'));
 assert.throws(()=>assertFeedPage([{...row(),payload:{...row().payload,sender_id:'C'}}],'B','A'));
 assert.throws(()=>assertFeedPage([{...row('id','case_event','case1'),payload:{id:'id',case_id:'foreign-case'}}],'B','A'));
 assert.throws(()=>assertFeedPage([{...row(),occurred_at:'not-a-date'}],'B','A'));
 assert.equal(compareTuple([1,'direct_message','id'],[2,'case_message','id'])<0,true);
});
test('captured browser RPC evidence rejects missing enabled read model, unbounded pages and incomplete cursors',()=>{
 assert.doesNotThrow(()=>assertRequestBounds(calls()));
 for(const index of [0,1,2])assert.throws(()=>assertRequestBounds(calls().filter((_,i)=>i!==index)));
 for(const patch of [{p_limit:500},{p_before_at:at},{p_before_type:'direct_message'},{p_before_id:'id'}]){const modified=calls();modified[1].args={...modified[1].args,...patch};assert.throws(()=>assertRequestBounds(modified))}
});
test('read evidence must name actual authorized loaded feed tuples and the intended peer',()=>{
 assert.doesNotThrow(()=>assertVisibleReadCursors(calls(),[row()],'B'));
 for(const patch of [{p_through_id:'unseen-id'},{p_through_at:'2027-01-01T00:00:00Z'},{p_through_type:'case_event'}]){const modified=calls();modified[2].args={...modified[2].args,...patch};assert.throws(()=>assertVisibleReadCursors(modified,[row()],'B'))}
 assert.throws(()=>assertVisibleReadCursors(calls(),[row()],'C'));assert.throws(()=>assertVisibleReadCursors(calls(),[],'B'));
});
test('canonical full archive rejects missing or duplicate transitions and requires both final return confirmations',()=>{
 const names=['proposal_created','accept','propose_meetup','accept_meetup',...['safety_ack','arrive','inspect','handoff'].flatMap(name=>[name,name]),'propose_return','accept_return',...['return_arrive','return_inspect','return_confirm'].flatMap(name=>[name,name])];
 const events=names.map((name,i)=>({id:'event-'+i,case_id:'case1',event_type:name,actor_user_id:i%2?'B':'A',state_version:i+1,created_at:new Date(Date.parse(at)+i*1000).toISOString(),resulting_state:i===names.length-1?'COMPLETED':name==='return_confirm'?'RETURN_INSPECTION':'ACTIVE'}));
 assert.doesNotThrow(()=>canonicalArchiveEvents(events,'case1','A','B',names.length));assert.throws(()=>canonicalArchiveEvents(events.slice(1),'case1','A','B',names.length));assert.throws(()=>canonicalArchiveEvents([...events,events[0]],'case1','A','B',names.length));assert.throws(()=>canonicalArchiveEvents(events.map((e,i)=>i===names.length-2?{...e,resulting_state:'COMPLETED'}:e),'case1','A','B',names.length));
});
test('outbox evidence requires pending status zero attempts and retained rows',()=>{
 assert.doesNotThrow(()=>assertOutboxOnly([{status:'pending',attempt_count:0}]));for(const rows of [[],[{status:'sent',attempt_count:0}],[{status:'pending',attempt_count:1}]])assert.throws(()=>assertOutboxOnly(rows));
});
test('PR138 runner pins identity and emits only redacted fixed artifacts without screenshots traces or worker calls',()=>{
 assert.match(PR138_SHA,/^[a-f0-9]{40}$/);const source=readFileSync('scripts/hosted-pr138-browser.mjs','utf8'),audit=readFileSync('scripts/audit-hosted-pr138-outbox.mjs','utf8');
 assert.match(source,/testedPullRequestNumber:138,testedHeadSha:PR138_SHA/);assert.match(source,/serializeRedactedReport\(report\)/);assert.match(source,/artifacts\/hosted-pr138-browser\.json/);assert.doesNotMatch(source,/\.screenshot\(|tracing\.start|console\.log\(.*(?:password|email|args)/);
 assert.match(audit,/artifacts\/hosted-pr138-outbox\.json/);assert.match(audit,/from\('notification_email_deliveries'\)/);assert.doesNotMatch(audit,/functions\.invoke|fetch\(|\.rpc\(/);
});
