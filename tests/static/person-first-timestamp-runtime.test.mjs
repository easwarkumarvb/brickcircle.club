import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';

const source=fs.readFileSync(new URL('../../app-v3.js',import.meta.url),'utf8');
function extract(start,end){
  const from=source.indexOf(start),through=source.indexOf(end,from);
  assert.ok(from>=0&&through>from,`Missing runtime region ${start}`);
  return source.slice(from,through);
}
const code=extract('function collectorRpcAbsent(','async function hydrateCollectorCases(')
  +extract('async function loadMessageIndex(','function currentConversationKey(')
  +extract('function filteredConversationGroups(','function messagesFilterBarMarkup(')
  +extract('async function markCollectorDisplayedRead(','function renderMessagesListPane(');
const uid='00000000-0000-0000-0000-000000000010',peer='00000000-0000-0000-0000-000000000020';
const low='00000000-0000-0000-0000-000000000001',high='ffffffff-ffff-ffff-ffff-ffffffffffff';
const early='2026-10-12T12:00:00.123001+00:00',floorAt='2026-10-12T12:00:00.123500+00:00',late='2026-10-12T12:00:00.123999+00:00';
const direct=(at,id)=>({occurred_at:at,source_type:'direct_message',source_id:id,case_id:null,payload:{id,sender_id:uid,recipient_id:peer,exchange_id:null}});
function runtime(){
  const index={readModel:true,feeds:new Map(),summaries:new Map(),cases:new Map(),direct:new Map()};
  let response=[],calls=[];
  const c={S:{user:{id:uid},renderToken:1,profiles:{}},messageIndex:()=>index,messageIndexByUid:new Map([[uid,index]]),
    db:{rpc:(name,args)=>{calls.push({name,args});return Promise.resolve({data:name==='mark_collector_conversation_read'?{ok:true}:response,error:null})}},
    settledTimeout:p=>p,hydrateCollectorCases:async()=>true,collectorFocus:null,terminalCaseStates:new Set(),otherId:()=>null,
    messagesFilter:'all',messagesSearch:'',document:{visibilityState:'visible'},
    $:()=>({scrollHeight:500,clientHeight:500,scrollTop:0}),renderMessagesListPane:()=>{}};
  vm.createContext(c);vm.runInContext(code,c);
  return {c,index,calls,setResponse:rows=>{response=rows;rows.forEach(row=>{if(row.peer_id)c.S.profiles[row.peer_id]={}})}};
}

test('timestamp comparison preserves microseconds and normalizes UTC offsets and fractions',()=>{
  const {c}=runtime();
  assert.equal(c.collectorTimestampCompare(early,late),-1);
  assert.equal(c.collectorTimestampCompare('2026-10-12T17:30:00.123001+05:30',early),0);
  assert.equal(c.collectorTimestampCompare('2026-10-12T05:00:00.123001-07:00',early),0);
  assert.equal(c.collectorTimestampCompare('2026-10-12T12:00:00.1Z','2026-10-12T12:00:00.100000+00:00'),0);
  assert.equal(c.collectorTimestampCompare('1969-12-31T23:59:59.123001Z','1969-12-31T23:59:59.123999Z'),-1);
  for(const value of [null,undefined,123,'','not a date','2026-10-12T12:00:00','2026-10-12T12:00:00.1234567Z','2026-10-12T12:00:00+99:00']){
    assert.equal(c.collectorTimestampMicros(value),null);
    assert.doesNotThrow(()=>c.collectorTimestampCompare(value,early));
  }
});

test('feed chronology precedes source tuple tie-breaks at submillisecond precision',()=>{
  const {c}=runtime(),earlier=direct(early,high),later=direct(late,low);
  assert.deepEqual([later,earlier].sort(c.collectorFeedCompare),[earlier,later]);
  const equal=[direct(early,high),{...direct(early,low),source_type:'case_event'},direct(early,low)];
  assert.deepEqual(equal.sort(c.collectorFeedCompare).map(row=>row.source_type+':'+row.source_id),['case_event:'+low,'direct_message:'+low,'direct_message:'+high]);
});

test('full feed refresh retains loaded older rows and purges missing current-page rows within one millisecond',async()=>{
  const {c,index,setResponse}=runtime(),older=direct(early,high),deleted=direct(late,low),floor=direct(floorAt,low);
  index.feeds.set(peer,{rows:[older,deleted],cursor:older,hasOlder:true});
  setResponse([...Array.from({length:49},(_,i)=>direct(`2026-10-12T12:00:01.${String(i).padStart(6,'0')}Z`,'page-'+i)),floor]);
  await c.loadCollectorFeed(peer,uid,1);
  const feed=index.feeds.get(peer);
  assert.ok(feed.rows.includes(older));assert.ok(!feed.rows.includes(deleted));
  assert.equal(feed.rows.length,51);assert.equal(feed.cursor,older);
});

test('full summary refresh preserves older collectors, removes vanished current-page collectors and sorts by exact time',async()=>{
  const {c,index,setResponse}=runtime(),older={peer_id:high,last_at:early},deleted={peer_id:low,last_at:late},floor={peer_id:peer,last_at:floorAt};
  index.summaries.set(high,older);index.summaries.set(low,deleted);
  setResponse([...Array.from({length:29},(_,i)=>({peer_id:'page-'+i,last_at:`2026-10-12T12:00:01.${String(i).padStart(6,'0')}Z`})),floor]);
  await c.loadMessageIndex(uid,1);
  assert.equal(index.summaries.get(high),older);assert.ok(!index.summaries.has(low));
  index.summaries.clear();index.summaries.set(high,older);index.summaries.set(low,deleted);
  assert.deepEqual(Array.from(c.filteredConversationGroups(),row=>row.peerId),[low,high]);
  index.summaries.set(peer,{peer_id:peer,last_at:late});
  assert.deepEqual(Array.from(c.filteredConversationGroups(),row=>row.peerId),[peer,low,high]);
});

test('bottom-visible read acknowledgment uses the chronologically latest source, including its original precision',async()=>{
  const {c,index,calls}=runtime();
  index.feeds.set(peer,{rows:[direct(late,low),direct(early,high)].sort(c.collectorFeedCompare)});
  c.collectorFocus={uid,peerId:peer};c.loadMessageIndex=async()=>index;
  await c.markCollectorDisplayedRead(peer,uid);
  const call=calls.find(row=>row.name==='mark_collector_conversation_read');
  assert.equal(call.args.p_through_at,late);assert.equal(call.args.p_through_id,low);
});

test('malformed feed and summary timestamps are excluded rather than throwing or acknowledging invalid cursors',async()=>{
  const {c,index,setResponse,calls}=runtime();
  setResponse([direct('malformed',low),direct(early,high)]);await c.loadCollectorFeed(peer,uid,1);
  assert.deepEqual(Array.from(index.feeds.get(peer).rows,row=>row.source_id),[high]);
  setResponse([{peer_id:low,last_at:'malformed'},{peer_id:peer,last_at:early}]);await c.loadMessageIndex(uid,1);
  assert.equal(index.summaries.size,1);assert.equal(index.partial,true);
  c.collectorFocus={uid,peerId:peer};c.loadMessageIndex=async()=>index;await c.markCollectorDisplayedRead(peer,uid);
  assert.equal(calls.find(row=>row.name==='mark_collector_conversation_read').args.p_through_at,early);
});
