import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('local-account-logout.js','utf8');
function create(signOut){
  const timers=new Map();let id=0;
  const context={window:{},setTimeout:fn=>{timers.set(++id,fn);return id},clearTimeout:id=>timers.delete(id)};
  vm.runInNewContext(source,context);
  return {logout:context.window.bcCreateLocalLogout({signOut}),timers};
}
test('successful local SDK result is required, with no global fallback',async()=>{
  const calls=[];const {logout,timers}=create(async options=>{calls.push(options.scope);return {error:null}});
  await logout.run();assert.deepEqual(calls,['local']);assert.equal(logout.pending,false);assert.equal(timers.size,0);
});
test('returned errors, thrown failures, and missing results never become success',async()=>{
  for(const fail of [()=>({error:new Error('returned')}),()=>{throw new Error('thrown')},()=>undefined,()=>({})]){
    let calls=0;const {logout,timers}=create(()=>{calls++;return fail()});
    await assert.rejects(logout.run());assert.equal(calls,1);assert.equal(logout.pending,false);assert.equal(timers.size,0);
  }
});
test('timeout stays pending; no duplicate or implicit late-success continuation',async()=>{
  let resolve,calls=0;const {logout,timers}=create(()=>{calls++;return new Promise(done=>resolve=done)});
  const result=logout.run();await Promise.resolve();
  [...timers.values()][0]();await assert.rejects(result,/not confirmed/);
  assert.equal(logout.pending,true);await assert.rejects(logout.run(),/still pending/);assert.equal(calls,1);
  resolve({error:null});await new Promise(done=>setImmediate(done));assert.equal(logout.pending,false);assert.equal(timers.size,0);
});
