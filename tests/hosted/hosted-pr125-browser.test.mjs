import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transportAllowed, stagingApplication, browserFixtureSets, withDesktopNotifications, assertUnreservedPhysicalItems, physicalPairCard, canonicalArchiveEvents } from '../../scripts/hosted-pr125-browser.mjs';
import { insertOwnedItem, serializeRedactedReport } from '../../scripts/hosted-exchange-smoke.mjs';
import { STAGING_REF, PRODUCTION_REF } from '../../scripts/validate-hosted-pr125.mjs';
import { assertOutboxOnly } from '../../scripts/audit-hosted-pr125-outbox.mjs';
const url=`https://${STAGING_REF}.supabase.co`;
function catalogueClient(sets, error=null) {
  return {from(table){
    assert.equal(table,'lego_sets');
    return {select(column){
      assert.equal(column,'set_number');
      return {
        in(column, configured){assert.equal(column,'set_number');return {data:sets.filter(set=>configured.includes(set)).map(set_number=>({set_number})),error};},
        not(column, operator, excluded){
          assert.equal(column,'set_number');assert.equal(operator,'in');
          return {order(column){assert.equal(column,'set_number');return {limit(count){assert.equal(count,1);return {data:sets.filter(set=>!excluded.slice(1,-1).split(',').includes(set)).sort().slice(0,count).map(set_number=>({set_number})),error};}};}};
        }
      };
    }};
  }};
}
test('exactly three catalogue sets support browser and server owner/set uniqueness',async()=>{
  const sets=await browserFixtureSets(catalogueClient(['SET_A','SET_B','THIRD']),'SET_A','SET_B');
  assert.deepEqual(sets,['SET_B','SET_A','THIRD','THIRD']);
  const owned=new Set(),items=[];
  const session=label=>({label,id:label,client:{from(table){
    assert.equal(table,'collection_items');
    return {insert(payload){
      const key=payload.user_id+':'+payload.set_number;
      assert.equal(owned.has(key),false,'No duplicate owner/set insert, including server smoke');owned.add(key);
      assert.equal('id' in payload,false);
      return {select:()=>({single:async()=>({data:{...payload,id:`generated-${owned.size}`},error:null})})};
    }};
  }}});
  const a=session('A'),b=session('B');
  for(const [index,owner] of [a,b,a,b].entries())items.push(await insertOwnedItem(owner,sets[index],'offline-browser'));
  assert.equal(new Set(items.map(item=>item.id)).size,4);
  assert.notEqual(items[0].set_number,items[1].set_number);
  assert.equal(items[2].set_number,items[3].set_number);
  assert.equal(owned.has('A:SET_A'),false);assert.equal(owned.has('B:SET_B'),false);
  // Exactly the unmodified server smoke's subsequent inserts, on the same users.
  items.push(await insertOwnedItem(a,'SET_A','offline-server'),await insertOwnedItem(b,'SET_B','offline-server'));
  assert.equal(owned.size,6);assert.equal(new Set(items.map(item=>item.id)).size,6);
});
test('catalogue prerequisites fail closed on missing configured or third sets and read errors',async()=>{
  for(const sets of [[],['SET_A','THIRD'],['SET_B','THIRD'],['SET_A','SET_B']]){
    await assert.rejects(()=>browserFixtureSets(catalogueClient(sets),'SET_A','SET_B'));
  }
  await assert.rejects(()=>browserFixtureSets(catalogueClient(['SET_A','SET_B','THIRD'],new Error('offline read failure')),'SET_A','SET_B'));
  for(const [a,b] of [['','SET_B'],['SET_A',undefined],['SET_A','set_a']])await assert.rejects(()=>browserFixtureSets(catalogueClient([]),a,b));
});
test('only staging public data/Auth/storage routes can leave browser',()=>{
  for(const path of ['/auth/v1/token','/rest/v1/rpc/send_collector_message','/storage/v1/object/public/avatars/a.jpg'])assert.equal(transportAllowed(url+path),true);
  for(const target of [`https://${PRODUCTION_REF}.supabase.co/rest/v1/profiles`,url+'/functions/v1/send-notifications',url+'/auth/v10/token',url+'/unknown',url.replace('https','http')+'/auth/v1/token',url.replace('.co','.co.evil.test')+'/auth/v1/token',url.replace('https://','https://user:password@')+'/auth/v1/token',url+':444/rest/v1/profiles'])assert.equal(transportAllowed(target),false);
});
test('WebSocket allowlist is exact staging Realtime only',()=>{
  assert.equal(transportAllowed(`wss://${STAGING_REF}.supabase.co/realtime/v1/websocket?apikey=offline`,true),true);
  for(const target of [`wss://${PRODUCTION_REF}.supabase.co/realtime/v1/websocket`,`ws://${STAGING_REF}.supabase.co/realtime/v1/websocket`,`wss://${STAGING_REF}.supabase.co/other`,`wss://${STAGING_REF}.supabase.co.evil.test/realtime/v1/websocket`])assert.equal(transportAllowed(target,true),false);
});
test('configuration override changes exactly two constants, safely encodes key',()=>{
  const source=`const SUPABASE_URL='https://${PRODUCTION_REF}.supabase.co';\nconst SUPABASE_KEY='public';\nconst behavior='unchanged';`;
  const patched=stagingApplication(source,url,"safe'key$&");
  assert.equal(patched,`const SUPABASE_URL=${JSON.stringify(url)};\nconst SUPABASE_KEY=${JSON.stringify("safe'key$&")};\nconst behavior='unchanged';`);
  assert.throws(()=>stagingApplication(source+source,url,'offline'));
  assert.throws(()=>stagingApplication('missing constants',url,'offline'));
});
test('browser evidence is secret-free and never invokes candidate Node scripts',()=>{
  const source=readFileSync('scripts/hosted-pr125-browser.mjs','utf8');
  assert.doesNotMatch(source,/\.screenshot\(|\.tracing\.|storageState\(|console\.(log|error)\(error|spawn\(|exec\(/);
  assert.match(source,/Server secret forbidden in browser process/);
  assert.match(source,/serializeRedactedReport\(report\)/);
  assert.match(source,/assert\.equal\(diagnostics.deniedProduction,0\)/);
  assert.match(source,/response=await route.fetch\(\)/);
  assert.match(source,/available_for_exchange/);
});
test('outbox-only means zero attempts, not merely a queued record',()=>{
  assertOutboxOnly([{status:'pending',attempt_count:0}]);
  for(const rows of [[],[{status:'pending',attempt_count:1}],[{status:'sent',attempt_count:1}],[{status:'processing',attempt_count:1}],[{status:'skipped',attempt_count:0}]])assert.throws(()=>assertOutboxOnly(rows));
});
test('notification viewport is desktop only during interaction and restores mobile even on failure',async()=>{
  for(const fail of [false,true]){
    let viewport={width:390,height:844};
    const page={viewportSize:()=>viewport,setViewportSize:async value=>{viewport=value}};
    const operation=withDesktopNotifications(page,async()=>{
      assert.deepEqual(viewport,{width:1280,height:844});
      if(fail)throw new Error('synthetic interaction failure');
    });
    if(fail)await assert.rejects(operation,/synthetic interaction failure/);else await operation;
    assert.deepEqual(viewport,{width:390,height:844});
  }
});
test('login uses real form, exact browser identity and mobile-visible profile, with fixed diagnostics',()=>{
  const source=readFileSync('scripts/hosted-pr125-browser.mjs','utf8');
  const login=source.split('export async function browserLogin')[1].split('export async function withDesktopNotifications')[0];
  assert.match(login,/data-auth-tab="signin"/);
  assert.match(login,/BC_SUPABASE\.auth\.getUser\(\)/);
  assert.match(login,/result\.data\.user\.id===id/);
  assert.match(login,/result\.data\.user\?\.email===email/);
  assert.match(login,/\.bc-avatar-btn'\)\)\.toBeVisible/);
  assert.doesNotMatch(login,/notifications|force:|localStorage|addInitScript|console\./);
  assert.match(source,/sessions\[index\]\.id/);
  assert.match(source,/scrollWidth<=document\.documentElement\.clientWidth/);
  for(const match of login.matchAll(/substage\((.*?)\)/g)){
    assert.match(match[1],/^'[A-Za-z -]+'$/);
    for(const actor of ['A','B','C']){
      const failedStage=`browser collector ${actor} authentication: ${match[1].slice(1,-1)}`;
      assert.equal(JSON.parse(serializeRedactedReport({ok:false,failedStage})).failedStage,failedStage);
    }
  }
  const offline=readFileSync('scripts/offline-pr125-login.mjs','utf8');
  assert.match(offline,/installTransport\(context,\{url,key:'offline'\},candidate,diagnostics\)/);
  assert.match(offline,/context\.route\(url\+'\/\*\*'/);
  assert.match(offline,/context\.routeWebSocket\('\*\*\/\*',ws=>ws\.close\(\)\)/);
  assert.doesNotMatch(offline,/addInitScript|storageState|readFile|route\.continue|route\.fetch/);
});
test('no reservation requires all four exact physical copies, including both requested B copies',()=>{
  const items=['a-offer','b-request','a-third','b-third'].map(id=>({id}));
  const rows=items.map(item=>({...item,available_for_exchange:true}));
  assertUnreservedPhysicalItems(items,[...rows].reverse());
  for(let index=0;index<4;index++){
    assert.throws(()=>assertUnreservedPhysicalItems(items,rows.filter((_,i)=>i!==index)));
    assert.throws(()=>assertUnreservedPhysicalItems(items,rows.map((row,i)=>i===index?{...row,available_for_exchange:false}:row)));
  }
  assert.throws(()=>assertUnreservedPhysicalItems(items,[...rows.slice(0,3),{id:'unrelated-copy',available_for_exchange:true}]));
  assert.throws(()=>assertUnreservedPhysicalItems(items,[...rows,rows[0]]));
  assert.throws(()=>assertUnreservedPhysicalItems([items[0],items[0],...items.slice(2)],rows));
});
test('proposal retains fixed serializable diagnostics, captured physical IDs and exact same-peer second case',()=>{
  const source=readFileSync('scripts/hosted-pr125-browser.mjs','utf8');
  const proposal=source.split('export async function browserProposal')[1].split('export async function browserLifecycle')[0];
  for(const match of proposal.matchAll(/substage\((.*?)\)/g)){
    assert.match(match[1],/^'[A-Za-z -]+'$/);
    const failedStage=`inline proposal: ${match[1].slice(1,-1)}`;
    assert.equal(JSON.parse(serializeRedactedReport({ok:false,failedStage})).failedStage,failedStage);
  }
  assert.match(proposal,/physicalPairCard\(page,b\.id,sets\[0\],sets\[1\]\)/);
  assert.match(proposal,/assertUnreservedPhysicalItems\(items,unlocked\.data\)/);
  assert.match(proposal,/proposalArgs\.p_offered_item_id,items\[0\]\.id/);
  assert.match(proposal,/proposalArgs\.p_requested_item_id,items\[1\]\.id/);
  assert.match(proposal,/second\.data\.case\.user_b,b\.id/);
  assert.match(proposal,/page\.off\('request',capture\)/);
  assert.doesNotMatch(proposal,/\.first\(|force:|hasText|console\./);
  assert.match(source,/reproduceProposal\(page,fixture,browserProposal,physicalPairCard,url\)/);
  for(const values of [['bad"peer','10307-1','75192-1'],['peer','bad[set','75192-1'],['peer','10307-1','']])
    assert.throws(()=>physicalPairCard(null,...values));
});
test('canonical archive binds exact event identities, actor/state completion and full ordered action sequence',()=>{
  const types=['proposal_created','accept','propose_meetup','accept_meetup',...['safety_ack','arrive','inspect','handoff'].flatMap(name=>[name,name]),'propose_return','accept_return',...['return_arrive','return_inspect','return_confirm'].flatMap(name=>[name,name])];
  const rows=types.map((event_type,i)=>({id:'event-'+i,case_id:'case-one',event_type,actor_user_id:i%2?'B':'A',resulting_state:i===19?'COMPLETED':'RETURN_INSPECTION',state_version:i+1,created_at:new Date(1700000000000+i*1000).toISOString()}));
  const check=events=>canonicalArchiveEvents(events,'case-one','A','B',20);
  const labels=check([...rows].reverse());assert.equal(labels.length,20);assert.deepEqual(labels.slice(-2),['Return confirm','Return confirm']);
  for(const patch of [{id:rows[18].id},{case_id:'other-case'},{event_type:'exchange_completed'},{actor_user_id:'A'},{resulting_state:'RETURN_INSPECTION'},{state_version:19}])
    assert.throws(()=>check(rows.map((row,i)=>i===19?{...row,...patch}:row)));
  assert.throws(()=>check(rows.slice(1)));
  assert.throws(()=>check([...rows,rows[19]]));
  assert.throws(()=>check(rows.map((row,i)=>i===18?{...row,resulting_state:'COMPLETED'}:row)));
  assert.throws(()=>check(rows.map((row,i)=>i===4?{...row,actor_user_id:'B'}:row)));
  assert.throws(()=>check(rows.map((row,i)=>i===4?{...row,state_version:6}:row)));
});
test('lifecycle keeps strict closed composer, guide, archived body and safe fixed substages without reselect workaround',()=>{
  const source=readFileSync('scripts/hosted-pr125-browser.mjs','utf8');
  const lifecycle=source.split('export async function browserLifecycle')[1].split('export async function browserFixtureSets')[0];
  assert.match(lifecycle,/#bc-msg-form'\)\)\.toBeHidden\(\)/);
  assert.match(lifecycle,/toContainText\('Closed'\)/);
  assert.match(lifecycle,/toContainText\('Browser case one second'\)/);
  assert.match(lifecycle,/canonicalArchiveEvents\(events.data,case1,a.id,b.id,state.data.state_version\)/);
  assert.match(lifecycle,/toHaveCount\(labels.length\)/);
  assert.match(lifecycle,/toEqual\(labels\)/);
  assert.doesNotMatch(lifecycle,/selectOption|hasText:'Completed'|force:|console\./);
  for(const label of ['closed composer','canonical completion event identity','exact rendered lifecycle event sequence',...['safety_ack','arrive','inspect','handoff','return_arrive','return_inspect','return_confirm'].flatMap(name=>[name+' A',name+' B'])]){
    const failedStage='guided lifecycle: '+label;
    assert.equal(JSON.parse(serializeRedactedReport({ok:false,failedStage})).failedStage,failedStage);
  }
  const offline=readFileSync('scripts/offline-pr125-lifecycle.mjs','utf8');
  assert.match(offline,/event_type:name/);
  assert.match(offline,/actor_user_id:actor/);
  assert.doesNotMatch(offline,/route\.continue|route\.fetch|addInitScript|storageState|readFile/);
});
