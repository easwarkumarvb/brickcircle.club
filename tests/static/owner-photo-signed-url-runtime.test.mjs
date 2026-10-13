import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('app-v3.js','utf8');
const start=source.indexOf('async function signedOwnerPhoto('),end=source.indexOf('\nasync function hydrateOwnerPhotos(',start);
assert.ok(start>=0&&end>start,'extract the actual application helper');
const helper=source.slice(start,end);
function fixture(){
 let now=0,calls=0,sign=async()=>({data:{signedUrl:`signed-${calls}`},error:null});
 const context=vm.createContext({authEpoch:1,logoutLocked:false,ownerPhotoUrls:new Map(),Date:{now:()=>now},db:{storage:{from:bucket=>{
  assert.equal(bucket,'collection-photos');return {createSignedUrl:async(path,ttl)=>{assert.equal(path,'owner/photo.jpg');assert.equal(ttl,900);calls++;return sign()}};
 }}}});
 vm.runInContext(helper,context);
 return {context,call:()=>context.signedOwnerPhoto('owner/photo.jpg'),time:value=>now=value,sign:value=>sign=value,calls:()=>calls};
}
test('valid cached photo URL is reused but refreshes before its 15-minute expiry',async()=>{
 const f=fixture();assert.equal(await f.call(),'signed-1');f.time(839999);assert.equal(await f.call(),'signed-1');assert.equal(f.calls(),1);
 f.time(840000);assert.equal(await f.call(),'signed-2');assert.equal(f.calls(),2);
 f.time(1800001);assert.equal(await f.call(),'signed-3');assert.equal(f.calls(),3);
});
for(const action of ['account-switch','logout'])test(`pending signing after ${action} cannot return or cache another account's URL`,async()=>{
 const f=fixture();let resolve;f.sign(()=>new Promise(done=>resolve=done));const pending=f.call();
 if(action==='account-switch')f.context.authEpoch++;else f.context.logoutLocked=true;
 resolve({data:{signedUrl:'retired-account-photo'},error:null});assert.equal(await pending,'');assert.equal(f.context.ownerPhotoUrls.size,0);
});
test('signing failure removes expired cache and does not poison the next request',async()=>{
 const f=fixture();assert.equal(await f.call(),'signed-1');f.time(901000);f.sign(async()=>({data:null,error:new Error('Synthetic signing failure')}));
 await assert.rejects(f.call(),/Synthetic signing failure/);assert.equal(f.context.ownerPhotoUrls.size,0);
 f.sign(async()=>({data:{signedUrl:'fresh-after-retry'},error:null}));assert.equal(await f.call(),'fresh-after-retry');assert.equal(f.calls(),3);
});
test('expiry is anchored before signing and a response beyond the safe lifetime is discarded',async()=>{
 const f=fixture();f.time(10000);f.sign(async()=>{f.time(70000);return {data:{signedUrl:'signed-slow'},error:null}});
 assert.equal(await f.call(),'signed-slow');assert.equal(f.context.ownerPhotoUrls.get('owner/photo.jpg').expiresAt,850000);
 f.time(850000);f.sign(async()=>{f.time(1690001);return {data:{signedUrl:'already-stale'},error:null}});
 assert.equal(await f.call(),'');assert.equal(f.context.ownerPhotoUrls.size,0);
});
test('missing signed URL and locked or missing-path requests never populate cache',async()=>{
 const f=fixture();f.sign(async()=>({data:null,error:null}));assert.equal(await f.call(),'');assert.equal(f.context.ownerPhotoUrls.size,0);
 assert.equal(await f.context.signedOwnerPhoto(''),'');f.context.logoutLocked=true;assert.equal(await f.call(),'');assert.equal(f.calls(),1);
});
