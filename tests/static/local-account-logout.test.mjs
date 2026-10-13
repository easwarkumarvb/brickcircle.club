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
  const result=logout.run();await new Promise(done=>setImmediate(done));
  [...timers.values()][0]();await assert.rejects(result,/not confirmed/);
  assert.equal(logout.pending,true);await assert.rejects(logout.run(),/still pending/);assert.equal(calls,1);
  resolve({error:null});await new Promise(done=>setImmediate(done));assert.equal(logout.pending,false);assert.equal(timers.size,0);
});

test('SDK session writes drain before local logout, and timeout never runs a late automatic logout',async()=>{
  let finish,session='A',calls=0;
  const {logout,timers}=create(async()=>{calls++;assert.equal(session,'OLD_WRITE');session=null;return {error:null}});
  const writes=new Promise(done=>finish=()=>{session='OLD_WRITE';done()});
  const result=logout.run(()=>writes);await new Promise(done=>setImmediate(done));assert.equal(calls,0);assert.equal(logout.pending,true);
  [...timers.values()][0]();await assert.rejects(result,/not confirmed/);await assert.rejects(logout.run(),/still pending/);
  finish();await new Promise(done=>setImmediate(done));assert.equal(calls,0);assert.equal(session,'OLD_WRITE');assert.equal(logout.pending,false);
  await logout.run(()=>writes);assert.equal(calls,1);assert.equal(session,null);
});

test('settled interactive storage overwrite is cleared before successful logout confirmation',async()=>{
  let finish,session=null;const order=[];
  const {logout}=create(async()=>{order.push('logout:local');session=null;return {error:null}});
  const writes=new Promise(done=>finish=()=>{session='A';order.push('save:A');done()});
  const result=logout.run(()=>writes);await new Promise(done=>setImmediate(done));assert.deepEqual(order,[]);
  finish();await result;assert.deepEqual(order,['save:A','logout:local']);assert.equal(session,null);
});
