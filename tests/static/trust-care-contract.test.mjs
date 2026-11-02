import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source=readFileSync(new URL('../../app-v3.js',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const start=source.indexOf('async function trustCareAvailabilityReady(item){');
const end=source.indexOf('\n}\nfunction addOwnedSetWithPhoto',start);
assert.ok(start>=0&&end>start,'live trust readiness function exists');

function gate(photos){
  const messages=[];
  const factory=new Function('supplementalOwnerPhotos','toast',source.slice(start,end+2)+'\nreturn trustCareAvailabilityReady;');
  const check=factory(async()=>photos,text=>messages.push(text));
  return {check,messages};
}

test('availability gate requires all three real-owner photo slots',async()=>{
  const front={id:'item1',owner_photo_path:'owner/front.jpg'};
  const photo=(angle)=>({angle,storage_path:'owner/'+angle+'.jpg'});
  for(const [item,photos,expected] of [
    [{...front,owner_photo_path:null},[photo('side'),photo('rear')],false],
    [front,[photo('rear')],false],
    [front,[photo('side')],false],
    [front,[photo('side'),photo('rear')],true]
  ]){
    const {check,messages}=gate(photos);
    assert.equal(await check(item),expected);
    assert.equal(messages.length,expected?0:1);
  }
});

test('both availability entry points use the three-photo readiness gate',()=>{
  assert.match(source,/async function setExchangeable[\s\S]*?await trustCareAvailabilityReady\(item\)/);
  assert.match(source,/function editCollectionItem[\s\S]*?await trustCareAvailabilityReady\(c\)/);
});

test('copy warns about unverified completeness and guides handoff and return',()=>{
  assert.match(source,/Owner-estimated completeness/);
  assert.match(source,/owner photographs/);
  assert.match(source,/handoff photos/);
  for(const stage of ['availability','match','meetup','return']){
    assert.ok(source.includes("trustCareNudge('"+stage+"'"),'missing nudge '+stage);
  }
  assert.match(source,/lego\.com\/en-in\/service\/replacement-parts/);
});
