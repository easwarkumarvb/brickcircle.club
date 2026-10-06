import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHandler} from '../../supabase/functions/admin-dashboard/handler.mjs';

const validID = '12345678-1234-1234-1234-123456789012';
function fixture(options = {}) {
  const calls = [];
  const client = {auth:{getUser:async()=>{calls.push('auth');return {data:{user:options.noUser?null:{id:validID,user_metadata:{admin:true}}},error:options.authError};}},
    rpc:async(name,args)=>{calls.push({name,args});
      if(name==='is_exchange_admin')return {data:options.allowed!==false,error:options.accessError};
      return {data:{rows:[],total:0},error:options.dbError};
    }};
  const handler=createHandler((...args)=>{calls.push({client:args});return client;},name=>({SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'public-key'}[name]));
  const request=(body,init={})=>new Request('https://example.supabase.co/functions/v1/admin-dashboard',{method:'POST',headers:{Authorization:'Bearer test-user-token','Content-Type':'application/json',Origin:'https://www.brickcircle.club',...init.headers},body:JSON.stringify(body),...init});
  return {calls,handler,request};
}
test('anonymous request never initializes database client',async()=>{
  const f=fixture();const r=await f.handler(new Request('https://example.com',{method:'GET'}));assert.equal(r.status,401);assert.equal(f.calls.length,0);
});
test('untrusted origins and unsupported methods are rejected',async()=>{
  const f=fixture();assert.equal((await f.handler(f.request({operation:'read'},{headers:{Origin:'https://evil.example'}}))).status,403);
  assert.equal((await f.handler(new Request('https://example.com',{method:'DELETE'}))).status,405);assert.equal(f.calls.length,0);
});
test('preflight permits only explicit origins and no wildcard',async()=>{
  const f=fixture();const r=await f.handler(new Request('https://example.com',{method:'OPTIONS',headers:{Origin:'https://www.brickcircle.club'}}));assert.equal(r.status,204);assert.equal(r.headers.get('Access-Control-Allow-Origin'),'https://www.brickcircle.club');assert.equal(f.calls.length,0);
});
for(const options of [{noUser:true},{authError:{message:'invalid',status:401}}])test(`invalid Auth user is denied ${JSON.stringify(options)}`,async()=>{
  const f=fixture(options);assert.equal((await f.handler(f.request({operation:'read'}))).status,401);assert.equal(f.calls.some(c=>c.name),false);
});
test('ordinary member with forged metadata cannot access data or mutations',async()=>{
  const f=fixture({allowed:false});for(const body of [{operation:'read'},validChange()])assert.equal((await f.handler(f.request(body))).status,403);
  assert.equal(f.calls.some(c=>c.name==='admin_marketplace_read'||c.name==='admin_marketplace_mutate'),false);
});
test('authorization failure fails closed',async()=>{
  const f=fixture({accessError:{message:'unavailable'}});assert.equal((await f.handler(f.request({operation:'read'}))).status,503);assert.equal(f.calls.some(c=>c.name==='admin_marketplace_read'),false);
});
test('Auth transport failure is unavailable, not logout, and runs no RPC',async()=>{
  const f=fixture({authError:{status:503,message:'upstream unavailable'}});
  const r=await f.handler(f.request({operation:'read'}));assert.equal(r.status,503);assert.equal((await r.json()).code,'unavailable');assert.equal(f.calls.some(c=>c.name),false);
});
test('authorized read preserves user credentials and applies bounded pagination',async()=>{
  const f=fixture();const r=await f.handler(f.request({operation:'read',section:'members',page:2,query:'City'}));assert.equal(r.status,200);
  const last=f.calls.at(-1);assert.deepEqual(last,{name:'admin_marketplace_read',args:{p_section:'members',p_query:'City',p_page:2,p_id:null}});
  const factory=f.calls.find(c=>c.client).client;assert.equal(factory[1],'public-key');assert.equal(factory[2].global.headers.Authorization,'Bearer test-user-token');
  assert.equal(r.headers.get('Cache-Control'),'no-store');assert.equal(r.headers.get('Vary'),'Origin');
});
for(const body of [{operation:'read',section:'auth_users'},{operation:'read',page:-1},{operation:'read',page:0.5},{operation:'read',page:100001},{operation:'read',query:'x'.repeat(101)},{operation:'read',section:'member_detail',id:'injection'},{operation:'force_handoff'}])test(`invalid operation values ${JSON.stringify(body).slice(0,70)}`,async()=>{
  const f=fixture();assert.equal((await f.handler(f.request(body))).status,400);assert.equal(f.calls.some(c=>c.name==='admin_marketplace_read'||c.name==='admin_marketplace_mutate'),false);
});
function validChange(){return {operation:'mutate',entity:'catalogue',id:'42115-1',value:'hidden',revision:0,reason:'Duplicate catalogue entry',request_id:validID};}
test('audited mutation forwards immutable request and expected revision',async()=>{
  const f=fixture();assert.equal((await f.handler(f.request(validChange()))).status,200);assert.deepEqual(f.calls.at(-1),{name:'admin_marketplace_mutate',args:{p_entity:'catalogue',p_id:'42115-1',p_value:'hidden',p_revision:0,p_reason:'Duplicate catalogue entry',p_request:validID}});
});
for(const edit of [{entity:'members'},{value:'delete'},{revision:-1},{revision:0.5},{reason:'short'},{request_id:'bad'}])test(`unsafe mutation rejected ${JSON.stringify(edit)}`,async()=>{
  const f=fixture();assert.equal((await f.handler(f.request({...validChange(),...edit}))).status,400);assert.equal(f.calls.some(c=>c.name==='admin_marketplace_mutate'),false);
});
for(const [code,status] of [['PT403',403],['42501',403],['40001',409],['22023',400],['22P02',400],['P0002',404],['XX000',503]])test(`database error ${code} is safe`,async()=>{
  const f=fixture({dbError:{code,message:'sensitive DB internals'}});const r=await f.handler(f.request(validChange()));assert.equal(r.status,status);assert.doesNotMatch(await r.text(),/sensitive/);
});
test('oversized and malformed JSON are rejected without executing data RPC',async()=>{
  const f=fixture();for(const body of ['{','"scalar"','['+(' '.repeat(9000))+']']){
    const r=await f.handler(new Request('https://example.com',{method:'POST',headers:{Authorization:'Bearer test','Content-Type':'application/json'},body}));assert.ok([400,413].includes(r.status));
  }assert.equal(f.calls.some(c=>c.name==='admin_marketplace_read'),false);
});
