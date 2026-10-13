import fs from 'node:fs';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
const source=fs.readFileSync(new URL('../../app-v3.js',import.meta.url),'utf8');
function region(start,end){const from=source.indexOf(start),through=source.indexOf(end,from);assert.ok(from>=0&&through>from);return source.slice(from,through)}
const runtimeCode=region('const threadDrafts=new Map();','let threadCacheUid=null;')
 +region('function bindThreadCompose(','function showThreadError(')
 +region('function activeThreadForm(','async function loadEarlierThreadMessages(');
 function runtime(kind='case',saved={}){
 const storage={...saved,getItem(k){return this[k]??null},setItem(k,v){this[k]=v},removeItem(k){delete this[k]}};
 const c={sessionStorage:storage,crypto:{randomUUID},Date};vm.createContext(c);
 vm.runInContext(`
 const S={user:{id:'alice'},renderToken:1,profiles:{}};
 let collectorFocus={uid:'alice',peerId:'bob',replyCaseId:${kind==='case'?"'c1'":'null'}};
 const row={id:'c1',state:'PROPOSED',user_a:'alice',user_b:'bob'};
 const messageIndexByUid=new Map([['alice',{cases:new Map([['c1',{case:row}]])}]]),terminalCaseStates=new Set(['COMPLETED','CANCELLED']);
 const makeForm=()=>{const input={value:'same exact body',disabled:false,focus(){}};return {input,button:{disabled:false},reset(){this.input.value=''}}};
 const form=makeForm();let liveForm=form;
 const chat={bcThread:{kind:'direct',id:'bob'}};
 const errors=[],requests=[],recoveryButtons=[];let resolveRpc,mode='pending',timelineUpdates=0,retryCallback;
 const errorBox={appendChild(button){recoveryButtons.push(button)}};
 const $=(selector,root)=>selector.startsWith('textarea')?(root||liveForm).input:selector.startsWith('button[type')?(root||liveForm).button:selector==='#bc-msg-form textarea'?liveForm.input:selector==='#bc-msg-form'?liveForm:selector==='#bc-msg-chat'?chat:selector==='#bc-msg-error'?errorBox:null;
 const FormData=class{constructor(f){this.form=f}get(){return this.form.input.value}};
 const messagesThreadGuard=()=>true,otherId=()=> 'bob';
 const showThreadError=(message,retry)=>{errors.push(message);retryCallback=retry},noop=()=>{},clearThreadError=noop,showThreadStatus=noop,clearThreadStatus=noop,showAuth=noop,toast=noop;
 const document={createElement:()=>({})};
 const setCollectorReplyContext=(peerId,id)=>{collectorFocus.replyCaseId=id;liveForm.input.value=''};
 const db={rpc:(name,args)=>{requests.push({name,args});return mode==='ok'?Promise.resolve({data:{ok:true}}):new Promise(resolve=>resolveRpc=resolve)}};
 const settledTimeout=p=>p,mergeThreadLatest=async()=>{},loadCollectorFeed=async()=>true,threadCache=()=>({});
 const updateThreadChat=()=>timelineUpdates++,reconcileMessageIndex=noop,advanceCollectorWatermarks=noop,advanceThreadWatermark=noop,updateMessageBadge=noop,updateCaseComposerState=noop;
 const CASE_THREAD_FALLBACK='',DIRECT_THREAD_FALLBACK='';
 `+runtimeCode,c);
 const run=s=>vm.runInContext(s,c),id=kind==='case'?'c1':'bob';
 run(`bindThreadCompose(form,'${kind}','${id}','Bob')`);
 return {run,storage,id,kind};
}
function start(r){return r.run('form.onsubmit({preventDefault(){}})')}
function replace(r,changeToken=true){r.run(`liveForm=makeForm();${changeToken?'S.renderToken++;':''}bindThreadCompose(liveForm,'${r.kind}','${r.id}','Bob')`)}

test('uncertain acknowledgment follows the same destination replacement with warning and original retry UUID',async()=>{
 for(const kind of ['case','direct'])for(const changeToken of [false,true]){
  const r=runtime(kind),operation=start(r);replace(r,changeToken);
  r.run("resolveRpc({error:{message:'Response lost after commit'}})");await operation;
  assert.match(r.run('errors[0]'),/Retry the same message safely/);assert.equal(r.run('liveForm.input.value'),'same exact body');
  assert.equal(r.run('pendingSends.size'),0);assert.equal(r.run('uncertainThreadSends.size'),1);assert.equal(r.run('timelineUpdates'),0);
  const first=JSON.parse(r.run('JSON.stringify(requests[0])'));r.run("mode='ok'");await r.run('liveForm.onsubmit({preventDefault(){}})');
  assert.deepEqual(JSON.parse(r.run('JSON.stringify(requests[1])')),first);
 }
});
test('positive acknowledgment clears matching replacement text so another submit cannot accidentally duplicate it',async()=>{
 for(const kind of ['case','direct'])for(const changeToken of [false,true]){
  const r=runtime(kind),operation=start(r);replace(r,changeToken);r.run("resolveRpc({data:{ok:true}})");await operation;
  assert.equal(r.run('liveForm.input.value'),'');assert.equal(r.run('liveForm.input.disabled'),false);
  assert.equal(r.run('uncertainThreadSends.size'),0);assert.equal(r.run('threadDrafts.size'),0);assert.equal(r.run('timelineUpdates'),0);
  r.run("mode='ok'");await r.run('liveForm.onsubmit({preventDefault(){}})');assert.equal(r.run('requests.length'),1);
 }
});
test('positive acknowledgment preserves different edited replacement text and its saved draft',async()=>{
 const r=runtime(),operation=start(r);replace(r);
 r.run("liveForm.input.value='new edited message';liveForm.input.oninput();resolveRpc({data:{ok:true}})");await operation;
 assert.equal(r.run('liveForm.input.value'),'new edited message');assert.equal(r.run("threadDrafts.get('alice:case:c1')"),'new edited message');assert.equal(r.run('errors.length'),0);
});
test('other account or reply destination never receives stale acknowledgment text or errors',async()=>{
 for(const destination of ['case','general','account'])for(const ack of ["{data:{ok:true}}","{error:{message:'Unknown delivery'}}"]){
  const r=runtime(),operation=start(r);r.run("liveForm=makeForm();liveForm.input.value='other conversation text';S.renderToken++");
  if(destination==='account')r.run("S.user={id:'charlie'};collectorFocus.uid='charlie'");else r.run(`collectorFocus.replyCaseId=${destination==='case'?"'c2'":'null'}`);
  r.run('resolveRpc('+ack+')');await operation;
  assert.equal(r.run('liveForm.input.value'),'other conversation text');assert.equal(r.run('errors.length'),0);assert.equal(r.run('timelineUpdates'),0);
 }
});
test('definite closed-case rejection preserves original text and explicit copy-to-general recovery on replacement',async()=>{
 const r=runtime(),operation=start(r);replace(r);
 r.run("row.state='COMPLETED';resolveRpc({error:{code:'22023',message:'Exchange closed'}})");await operation;
 assert.equal(r.run('uncertainThreadSends.size'),0);assert.equal(r.run("threadDrafts.get('alice:case:c1')"),'same exact body');
 assert.match(r.run('errors[0]'),/exchange closed/);assert.equal(r.run('recoveryButtons[0].textContent'),'Copy to general chat');
 r.run('recoveryButtons[0].onclick()');assert.equal(r.run('collectorFocus.replyCaseId'),null);
 assert.equal(r.run('liveForm.input.value'),'same exact body');assert.equal(r.run("threadDrafts.get('alice:direct:bob')"),'same exact body');
});
test('invalid acknowledgment keeps uncertainty and edited replacement text until the original message is retried',async()=>{
 const r=runtime(),operation=start(r);replace(r);
 r.run("liveForm.input.value='different text';liveForm.input.oninput();resolveRpc({data:{}})");await operation;
 assert.equal(r.run('liveForm.input.value'),'different text');assert.equal(r.run('uncertainThreadSends.size'),1);
 assert.match(r.run('errors[0]'),/Retry the same message safely/);
 r.run("mode='ok'");await r.run('liveForm.onsubmit({preventDefault(){}})');assert.equal(r.run('requests.length'),1);
 assert.match(r.run('errors.at(-1)'),/Retry the same message safely/);
});

test('edited or cleared drafts survive reload independently of the original uncertain body and retry UUID',async()=>{
 for(const kind of ['case','direct'])for(const edited of ['edited next message','']){
  const first=runtime(kind),operation=start(first);first.run("resolveRpc({error:{message:'Acknowledgment lost'}})");await operation;
  const original=JSON.parse(first.run('JSON.stringify(requests[0])'));
  first.run(`form.input.value=${JSON.stringify(edited)};form.input.oninput()`);
  const next=runtime(kind,{'bc_thread_drafts:alice':first.storage['bc_thread_drafts:alice']});
  next.run(`restoreThreadDrafts('alice');form.input.value='';bindThreadCompose(form,'${kind}','${next.id}','Bob');mode='ok'`);
  assert.equal(next.run('form.input.value'),edited);assert.match(next.run('errors.at(-1)'),/Retry the same message safely/);
  await next.run('retryCallback()');
  assert.deepEqual(JSON.parse(next.run('JSON.stringify(requests[0])')),original);
  assert.equal(next.run('form.input.value'),edited);assert.equal(next.run('uncertainThreadSends.size'),0);
  assert.equal(next.run(`threadDrafts.get('alice:${kind}:${next.id}')||''`),edited);
  const saved=JSON.parse(next.storage['bc_thread_drafts:alice']);assert.ok(saved.entries.every(entry=>entry.uncertain===null));
 }
});
test('stale retry buttons cannot replay into a different account, destination or replacement operation',async()=>{
 for(const change of ["S.user={id:'charlie'}","collectorFocus.replyCaseId='other-case'","uncertainThreadSends.set('alice:case:c1',{uid:'alice',key:'alice:case:c1',kind:'case',id:'c1',body:'new operation',requestKey:'different-key'})"]){
  const r=runtime(),operation=start(r);r.run("resolveRpc({error:{message:'Unknown delivery'}})");await operation;
  r.run(change);await r.run('retryCallback()');assert.equal(r.run('requests.length'),1);
 }
});
test('stale closed-case copy buttons cannot copy private text into another account or case with the same peer',async()=>{
 for(const change of ["S.user={id:'charlie'};collectorFocus.uid='charlie'","collectorFocus.replyCaseId='c2'","collectorFocus.peerId='other-peer'"]){
  const r=runtime(),operation=start(r);replace(r);r.run("row.state='COMPLETED';resolveRpc({error:{code:'22023',message:'Closed'}})");await operation;
  r.run("liveForm.input.value='current private draft'");r.run(change);r.run('recoveryButtons[0].onclick()');
  assert.equal(r.run('liveForm.input.value'),'current private draft');assert.equal(r.run("threadDrafts.has('charlie:direct:bob')"),false);assert.equal(r.run("threadDrafts.has('alice:direct:bob')"),false);
 }
});
test('binding an old destination does not place its retry warning in the currently selected conversation',async()=>{
 const r=runtime(),operation=start(r);r.run("resolveRpc({error:{message:'Unknown delivery'}})");await operation;
 const previous=r.run('errors.length');r.run("collectorFocus.replyCaseId='c2';bindThreadCompose(form,'case','c1','Bob')");
 assert.equal(r.run('errors.length'),previous);
});
test('definitive closed rejection after original retry keeps the separate edited draft and copies that text',async()=>{
 for(const replaced of [false,true]){
  const r=runtime(),first=start(r);r.run("resolveRpc({error:{message:'Original outcome unknown'}})");await first;
  const original=JSON.parse(r.run('JSON.stringify(requests[0])'));
  r.run("form.input.value='edited next draft';form.input.oninput()");
  const retry=r.run('retryCallback()');if(replaced)replace(r);
  r.run("row.state='COMPLETED';resolveRpc({error:{code:'22023',message:'Closed before commit'}})");await retry;
  assert.equal(r.run('requests.length'),2);assert.deepEqual(JSON.parse(r.run('JSON.stringify(requests[1])')),original);
  assert.equal(r.run('uncertainThreadSends.size'),0);assert.equal(r.run("threadDrafts.get('alice:case:c1')"),'edited next draft');
  assert.equal(r.run('liveForm.input.value'),'edited next draft');r.run('recoveryButtons[0].onclick()');
  assert.equal(r.run('liveForm.input.value'),'edited next draft');assert.equal(r.run("threadDrafts.get('alice:direct:bob')"),'edited next draft');
 }
});
