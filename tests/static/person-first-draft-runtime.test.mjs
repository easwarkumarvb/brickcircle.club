import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';

const source=readFileSync('app-v3.js','utf8');
const draftCode=source.slice(source.indexOf('const threadDrafts=new Map();'),source.indexOf('let threadCacheUid=null;'));
const operationCode=source.slice(source.indexOf('const canonicalOperationMemory=new Map();'),source.indexOf('async function canonicalRpc('));
function runtime(storage={}){
  const context=vm.createContext({S:{user:{id:'alice'}},crypto:{randomUUID},sessionStorage:Object.assign(storage,{
    getItem(key){return Object.hasOwn(this,key)?this[key]:null},setItem(key,value){this[key]=String(value)},removeItem(key){delete this[key]}
  }),Date});
  vm.runInContext(draftCode+'\n'+operationCode,context);
  return {context,run:code=>vm.runInContext(code,context),storage:context.sessionStorage};
}
test('persisted drafts are bounded by 4000 characters and the latest 50 destinations',()=>{
  const r=runtime();r.run("persistThreadDraft('alice:case:long','x'.repeat(6000));for(let i=0;i<60;i++)persistThreadDraft('alice:direct:'+i,'draft '+i)");
  assert.equal(r.run("threadDrafts.get('alice:case:long').length"),4000);
  const saved=JSON.parse(r.storage.getItem('bc_thread_drafts:alice'));
  assert.equal(saved.entries.length,50);assert.equal(saved.entries[0].key,'alice:direct:10');assert.equal(saved.entries.at(-1).key,'alice:direct:59');
});
test('draft and uncertain exact intent restore together after reload without crossing account boundaries',()=>{
  const first=runtime();first.run("uncertainThreadSends.set('alice:case:c1',{uid:'alice',key:'alice:case:c1',kind:'case',id:'c1',body:'Exact body',requestKey:'stable-key'});persistThreadDraft('alice:case:c1','Exact body');persistThreadDraft('bob:case:c1','Other account')");
  assert.equal(first.storage.getItem('bc_thread_drafts:bob'),null);
  const second=runtime({'bc_thread_drafts:alice':first.storage.getItem('bc_thread_drafts:alice'),'bc_thread_drafts:bob':'{}'});second.run("restoreThreadDrafts('alice')");
  assert.equal(second.run("threadDrafts.get('alice:case:c1')"),'Exact body');
  assert.equal(second.run("uncertainThreadSends.get('alice:case:c1').requestKey"),'stable-key');
  assert.equal(second.run("uncertainThreadSends.get('alice:case:c1').id"),'c1');
  assert.equal(second.storage.getItem('bc_thread_drafts:bob'),null);
});
test('expired and malformed draft stores cannot restore messages',()=>{
  const old={savedAt:Date.now()-25*60*60*1000,entries:[{key:'alice:direct:bob',body:'Expired private draft'}]};
  const r=runtime({'bc_thread_drafts:alice':JSON.stringify(old)});r.run("restoreThreadDrafts('alice')");
  assert.equal(r.run('threadDrafts.size'),0);assert.equal(r.storage.getItem('bc_thread_drafts:alice'),null);
  r.storage.setItem('bc_thread_drafts:alice','not json');assert.doesNotThrow(()=>r.run("restoreThreadDrafts('alice')"));assert.equal(r.run('threadDrafts.size'),0);
});
test('bounded draft storage prioritizes original uncertain intents even when current drafts are empty',()=>{
 const first=runtime();first.run("for(let i=0;i<4;i++){const key='alice:case:pending'+i;uncertainThreadSends.set(key,{uid:'alice',key,kind:'case',id:'pending'+i,body:'Original '+i,requestKey:'key-'+i});persistThreadDraft(key,'')}for(let i=0;i<60;i++)persistThreadDraft('alice:direct:other'+i,'New draft '+i)");
 const saved=JSON.parse(first.storage.getItem('bc_thread_drafts:alice'));assert.equal(saved.entries.length,50);assert.equal(saved.entries.filter(entry=>entry.uncertain).length,4);
 const second=runtime({'bc_thread_drafts:alice':JSON.stringify(saved)});second.run("restoreThreadDrafts('alice')");assert.equal(second.run('uncertainThreadSends.size'),4);assert.equal(second.run('threadDrafts.size'),46);
 saved.savedAt=Date.now()-25*60*60*1000;const expired=runtime({'bc_thread_drafts:alice':JSON.stringify(saved)});expired.run("restoreThreadDrafts('alice')");assert.equal(expired.run('uncertainThreadSends.size'),0);assert.equal(expired.run('threadDrafts.size'),0);
 const crowded=runtime();crowded.run("for(let i=0;i<60;i++){const key='alice:case:p'+i;uncertainThreadSends.set(key,{uid:'alice',key,kind:'case',id:'p'+i,body:'Original',requestKey:'key-'+i});persistThreadDraft(key,'')}");
 const bounded=JSON.parse(crowded.storage.getItem('bc_thread_drafts:alice'));assert.equal(bounded.entries.length,50);assert.equal(bounded.entries[0].key,'alice:case:p10');
});
test('restore rejects foreign drafts and foreign uncertain operations',()=>{
  const saved={savedAt:Date.now(),entries:[{key:'bob:case:c1',body:'foreign'},{key:'alice:case:c1',body:'own',uncertain:{uid:'bob',key:'alice:case:c1',body:'foreign operation',requestKey:'bad'}}]};
  const r=runtime({'bc_thread_drafts:alice':JSON.stringify(saved)});r.run("restoreThreadDrafts('alice')");
  assert.equal(r.run('threadDrafts.size'),1);assert.equal(r.run('uncertainThreadSends.size'),0);
});
test('same canonical intent retains its uncertainty key across reload; a different body or case gets a different key',()=>{
  const r=runtime();const first=r.run("canonicalOperationKey('send_exchange_case_message',{case_id:'c1',body:'hello'})");
  assert.equal(r.run("canonicalOperationKey('send_exchange_case_message',{body:'hello',case_id:'c1'})"),first);
  const reloaded=runtime({'bc_canonical_ops:alice':r.storage.getItem('bc_canonical_ops:alice')});
  assert.equal(reloaded.run("canonicalOperationKey('send_exchange_case_message',{case_id:'c1',body:'hello'})"),first);
  assert.notEqual(reloaded.run("canonicalOperationKey('send_exchange_case_message',{case_id:'c2',body:'hello'})"),first);
  assert.notEqual(reloaded.run("canonicalOperationKey('send_exchange_case_message',{case_id:'c1',body:'changed'})"),first);
  assert.notEqual(reloaded.run("canonicalOperationKey('send_exchange_case_message',{case_id:'c1',body:'hello'},'bob')"),first);
});
test('reconciliation releases only the exact confirmed operation and clears private draft storage',()=>{
  const r=runtime();const first=r.run("canonicalOperationKey('send_exchange_case_message',{case_id:'c1',body:'hello'})");const other=r.run("canonicalOperationKey('send_exchange_case_message',{case_id:'c2',body:'hello'})");
  r.run("reconcileCanonicalOperation('send_exchange_case_message',{case_id:'c1',body:'hello'})");
  assert.notEqual(r.run("canonicalOperationKey('send_exchange_case_message',{case_id:'c1',body:'hello'})"),first);
  assert.equal(r.run("canonicalOperationKey('send_exchange_case_message',{case_id:'c2',body:'hello'})"),other);
  r.run("persistThreadDraft('alice:case:c1','draft');scrubThreadStorage()");assert.equal(r.storage.getItem('bc_thread_drafts:alice'),null);
});

test('restore rejects invalid timestamps and malformed uncertain delivery payloads',()=>{
  for(const savedAt of [undefined,'yesterday',Date.now()+60000]){
    const r=runtime({'bc_thread_drafts:alice':JSON.stringify({savedAt,entries:[{key:'alice:case:c1',body:'draft'}]})});r.run("restoreThreadDrafts('alice')");assert.equal(r.run('threadDrafts.size'),0);
  }
  for(const patch of [{kind:'wrong'},{id:'foreign'},{uid:'bob'},{key:'alice:case:other'},{body:''},{body:123},{body:'x'.repeat(4001)},{requestKey:''},{requestKey:'x'.repeat(201)}]){
    const uncertain={uid:'alice',key:'alice:case:c1',kind:'case',id:'c1',body:'draft',requestKey:'safe-key',...patch};
    const r=runtime({'bc_thread_drafts:alice':JSON.stringify({savedAt:Date.now(),entries:[{key:'alice:case:c1',body:'draft',uncertain}]})});r.run("restoreThreadDrafts('alice')");
    assert.equal(r.run("threadDrafts.get('alice:case:c1')"),'draft');assert.equal(r.run('uncertainThreadSends.size'),0);
  }
});

const composeCode=source.slice(source.indexOf('function bindThreadCompose('),source.indexOf('function showClosedReplyRecovery('));
function composeRuntime(storage={}){
  const r=runtime(storage);
  vm.runInContext(`
    S.renderToken=1;S.profiles={};
    let collectorFocus={uid:'alice',peerId:'bob',replyCaseId:'c1'};
    const caseRow={id:'c1',state:'ACCEPTED',user_a:'alice',user_b:'bob'};
    const messageIndexByUid=new Map([['alice',{cases:new Map([['c1',{case:caseRow}]])}]]);
    const terminalCaseStates=new Set(['COMPLETED','CANCELLED']);
    const input={value:'same exact body',disabled:false,focus(){}};
    const button={disabled:false};const form={reset(){input.value=''}};
    const $=(selector,root)=>selector.startsWith('textarea')?input:button;
    const messagesThreadGuard=()=>true,activeThreadForm=()=>form,otherId=()=> 'bob';
    const FormData=class{get(){return input.value}};
    const errors=[],requests=[];let loseResponse=true;
    const showThreadError=message=>errors.push(message);
    const showThreadStatus=()=>{},clearThreadError=()=>{},clearThreadStatus=()=>{},showAuth=()=>{},toast=()=>{};
    const db={rpc:async(name,args)=>{requests.push({name,args});return loseResponse?{error:{message:'Response lost after commit'}}:{data:{ok:true}}}};
    const settledTimeout=p=>p,mergeThreadLatest=async()=>{},updateThreadChat=()=>{},threadCache=()=>({}),reconcileMessageIndex=()=>{},advanceCollectorWatermarks=()=>{},advanceThreadWatermark=()=>{},updateMessageBadge=()=>{},updateCaseComposerState=()=>{},showClosedReplyRecovery=()=>{};
    const CASE_THREAD_FALLBACK='',DIRECT_THREAD_FALLBACK='';
  `+composeCode,r.context);
  return r;
}
test('actual composer retries original request key and exact case after uncertainty, reload and case closure',async()=>{
  const first=composeRuntime();first.run("bindThreadCompose(form,'case','c1','Bob')");await first.run('form.onsubmit({preventDefault(){}})');
  const original=JSON.parse(first.run('JSON.stringify(requests[0])'));
  assert.equal(original.name,'send_exchange_case_message');assert.equal(original.args.p_case_id,'c1');assert.equal(original.args.p_body,'same exact body');
  assert.equal(first.run('pendingSends.size'),0);assert.equal(first.run('input.value'),'same exact body');
  const reloaded=composeRuntime({'bc_thread_drafts:alice':first.storage.getItem('bc_thread_drafts:alice')});
  reloaded.run("restoreThreadDrafts('alice');caseRow.state='CANCELLED';loseResponse=false;bindThreadCompose(form,'case','c1','Bob')");
  await reloaded.run('form.onsubmit({preventDefault(){}})');
  const retried=JSON.parse(reloaded.run('JSON.stringify(requests[0])'));
  assert.deepEqual(retried,original);assert.equal(reloaded.run('uncertainThreadSends.size'),0);assert.equal(reloaded.run('threadDrafts.size'),0);assert.equal(reloaded.run('input.value'),'');
});
test('actual composer refuses edited uncertain text and rejects a fresh closed case send',async()=>{
  const r=composeRuntime();r.run("bindThreadCompose(form,'case','c1','Bob')");await r.run('form.onsubmit({preventDefault(){}})');
  r.run("input.value='edited uncertain text'");await r.run('form.onsubmit({preventDefault(){}})');assert.equal(r.run('requests.length'),1);assert.match(r.run('errors.at(-1)'),/Retry the same message safely/);
  r.run("uncertainThreadSends.clear();caseRow.state='COMPLETED';input.value='fresh closed message'");await r.run('form.onsubmit({preventDefault(){}})');assert.equal(r.run('requests.length'),1);assert.match(r.run('errors.at(-1)'),/exchange is closed/);
});
