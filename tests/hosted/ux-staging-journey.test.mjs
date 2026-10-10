import test from 'node:test';
import assert from 'node:assert/strict';
import { assertCancelledFixture, verifyCollectorPermissions } from '../../scripts/ux-staging-journey.mjs';

const sessions = (admin = false, eligible = true) => ['a','b','c'].map(id => ({ id, client: {
  rpc: async name => { assert.equal(name,'is_exchange_admin');return {data:admin,error:null}; },
  from: table => { assert.equal(table,'profiles');return {select: () => ({eq: (key,value) => {
    assert.equal(key,'id');assert.equal(value,id);
    return {single: async () => ({data:{id,adult_confirmed_at:eligible?'2026-10-10':null,country:'India',city:'Bengaluru'},error:null})};
  }})}; }
}}));
test('three ordinary eligible collectors pass read-only permission checks',async()=>{
  await verifyCollectorPermissions(sessions());
});
test('admin privilege, missing eligibility and duplicate actors fail closed',async()=>{
  await assert.rejects(()=>verifyCollectorPermissions(sessions(true)));
  await assert.rejects(()=>verifyCollectorPermissions(sessions(false,false)));
  const duplicate=sessions();duplicate[2].id='a';
  await assert.rejects(()=>verifyCollectorPermissions(duplicate));
});
test('cancelled fixture releases only its exact two physical items',()=>{
  const row={state:'CANCELLED',item_a:'a',item_b:'b'};
  const items=[{id:'a',available_for_exchange:true},{id:'b',available_for_exchange:true}];
  assertCancelledFixture(row,items,['a','b']);
  for(const changed of [[{...items[0],available_for_exchange:false},items[1]],[items[0],{...items[1],id:'real-item'}],[items[0],items[0]]]){
    assert.throws(()=>assertCancelledFixture(row,changed,['a','b']));
  }
  assert.throws(()=>assertCancelledFixture({...row,state:'ACTIVE'},items,['a','b']));
});
