import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('app-v3.js','utf8');
const code=source.slice(source.indexOf('function saveSupplementalOwnerPhoto'),source.indexOf('async function hydrateOwnerGallery'));
async function run({result,oldPath='owner/old.webp',throws=false,stale=false}={}){
 let save,asserts=0;const removed=[],calls=[],ctx={S:{user:{id:'owner'}},ownerPhotoPicker:options=>save=options.onSave,supplementalOwnerPhotos:async()=>oldPath?[{angle:'side',owner_id:'owner',storage_path:oldPath}]:[],uploadOwnerPhoto:async()=>'owner/new.webp',cleanupOwnerPhoto:async path=>removed.push(path),ownerPhotoUrls:new Map(),renderSetsBody:()=>calls.push('render'),toast:()=>calls.push('toast')};
 const query={update:patch=>{calls.push(['update',patch]);return query},insert:patch=>{calls.push(['insert',patch]);return query},eq:(...filter)=>{calls.push(filter);return query},select:async()=>{if(throws)throw new Error('lost response');return result}};ctx.db={from:()=>query};vm.runInNewContext(code,ctx);ctx.saveSupplementalOwnerPhoto({id:'item',user_id:'owner',set_number:'set'},'side');let error;try{await save({}, {id:'owner',assert(){asserts++;if(stale&&asserts>=3)throw new Error('session changed')}})}catch(e){error=e}return {removed,calls,error};
}
const committed={data:[{item_id:'item',owner_id:'owner',angle:'side',storage_path:'owner/new.webp'}],error:null};
test('confirmed CAS update cleans old path and reports success',async()=>{const r=await run({result:committed});assert.deepEqual(r.removed,['owner/old.webp']);assert.ok(r.calls.some(c=>Array.isArray(c)&&c[0]==='storage_path'&&c[1]==='owner/old.webp'));assert.ok(r.calls.includes('toast'))});
test('empty slot uses INSERT rather than blind upsert',async()=>{const r=await run({result:committed,oldPath:''});assert.ok(r.calls.some(c=>Array.isArray(c)&&c[0]==='insert'));assert.deepEqual(r.removed,[])});
test('zero-row CAS race cleans candidate without old deletion',async()=>{const r=await run({result:{data:[],error:null}});assert.deepEqual(r.removed,['owner/new.webp']);assert.ok(r.error);assert.ok(!r.calls.includes('toast'))});
test('definite rejected insert cleans candidate',async()=>{const r=await run({result:{data:null,error:{code:'23505'}}});assert.deepEqual(r.removed,['owner/new.webp']);assert.ok(r.error)});
for(const [name,result] of [['server response lost',{data:null,error:{status:503}}],['unrecognized SQLSTATE',{data:null,error:{code:'08006'}}],['unexpected representation',{data:[{item_id:'other'}],error:null}]])test(name+' retains candidate and old object',async()=>{const r=await run({result});assert.deepEqual(r.removed,[]);assert.ok(r.error);assert.ok(!r.calls.includes('toast'))});
test('thrown network error retains both objects',async()=>{const r=await run({throws:true});assert.deepEqual(r.removed,[]);assert.ok(r.error)});
test('account changed after commit never cleans either object or reports success',async()=>{const r=await run({result:committed,stale:true});assert.deepEqual(r.removed,[]);assert.ok(r.error);assert.ok(!r.calls.includes('toast'))});

const hydration=source.slice(source.indexOf('async function hydrateOwnerGallery'),source.indexOf('async function hydrateCaseOwnerGalleries'));
async function hydrationRace(change){
 let release,started;const entered=new Promise(resolve=>started=resolve),signing=new Promise(resolve=>release=resolve),injections=[];
 const slot={querySelector:()=>null,insertAdjacentHTML:(position,html)=>injections.push(html)},host={isConnected:true,querySelector:()=>slot};
 const ctx={authEpoch:1,ownerPhotoIdentityGeneration:1,S:{user:{id:'owner'}},logoutLocked:false,supplementalOwnerPhotos:async()=>[],signedOwnerPhoto:()=>{started();return signing},attr:x=>String(x)};
 vm.runInNewContext(hydration,ctx);const pending=ctx.hydrateOwnerGallery(host,{id:'item',set_number:'set',owner_photo_path:'owner/front.webp'});await entered;change(ctx,host);release('https://example.test/private-photo');await pending;return injections;
}
test('gallery late signed URL cannot enter another account DOM',async()=>{assert.deepEqual(await hydrationRace(ctx=>{ctx.S.user={id:'other'};ctx.authEpoch++;ctx.ownerPhotoIdentityGeneration++}),[])});
test('gallery detached host receives no late signed URL',async()=>{assert.deepEqual(await hydrationRace((ctx,host)=>host.isConnected=false),[])});
test('same-account token refresh aborts pending hydration safely',async()=>{assert.deepEqual(await hydrationRace(ctx=>ctx.authEpoch++),[])});
test('same-account uninterrupted hydration renders the signed link',async()=>{const rows=await hydrationRace(()=>{});assert.equal(rows.length,1);assert.match(rows[0],/noopener noreferrer/);assert.match(rows[0],/Open full size front photo/)});
for(const code of ['40001','40P01'])test(code+' definitive transaction rollback cleans candidate only',async()=>{const r=await run({result:{data:null,error:{code}}});assert.deepEqual(r.removed,['owner/new.webp']);assert.ok(!r.calls.includes('toast'))});

const supplemental=source.slice(source.indexOf('async function supplementalOwnerPhotos'),source.indexOf('function saveSupplementalOwnerPhoto'));
test('supplemental query error exposes fixed product message without provider detail',async()=>{const query={select:()=>query,eq:async()=>({data:null,error:{message:'secret provider diagnostic'}})},ctx={db:{from:()=>query}};vm.runInNewContext(supplemental,ctx);await assert.rejects(ctx.supplementalOwnerPhotos('item'),error=>error.message==='Photos are unavailable right now. Refresh your sets and try again.')});

const deletion=source.slice(source.indexOf('async function deleteOwnerGalleryPhoto'),source.indexOf('async function hydrateOwnerGallery'));
async function removePhoto({angle='side',available=false,result,photos,authUser='owner',switchAfterWrite=false}={}){
 const calls=[],removed=[],events=[];let currentUser='owner';
 const query={delete(){calls.push(['delete']);return query},update(patch){calls.push(['update',patch]);return query},eq:(...filter)=>{calls.push(filter);return query},select:async()=>{calls.push(['select']);if(switchAfterWrite)currentUser='other';return result}};
 const ctx={S:{user:{id:'owner'}},ownerPhotoIdentityGeneration:3,authEpoch:7,logoutLocked:false,confirm:()=>true,withTimeout:promise=>promise,workflowForItem:()=>null,photoPreviousPathFilter:(query,column,path)=>path==null?query.is(column,null):query.eq(column,path),db:{auth:{getUser:async()=>({data:{user:{id:currentUser}},error:null})},from:table=>{calls.push(['from',table]);return query}},supplementalOwnerPhotos:async()=>photos||[{item_id:'item',owner_id:'owner',angle,storage_path:'owner/old.webp'}],cleanupOwnerPhoto:async path=>removed.push(path),ownerPhotoUrls:new Map([['owner/old.webp',{url:'expired'}]]),refreshCore:async()=>events.push('refresh'),renderSetsBody:()=>events.push('render'),toast:message=>events.push(message),fail:(_error,message)=>events.push(message)};
 const button={textContent:'Remove photo',disabled:false};vm.runInNewContext(deletion,ctx);await ctx.deleteOwnerGalleryPhoto({id:'item',user_id:'owner',set_number:'set',owner_photo_path:'owner/front.webp',available_for_exchange:available},angle,button);
 return {calls,removed,events,button,cache:ctx.ownerPhotoUrls};
}
test('confirmed supplemental deletion uses owner/item/angle/path CAS before cleanup',async()=>{const r=await removePhoto({result:{data:[{item_id:'item',owner_id:'owner',angle:'side',storage_path:'owner/old.webp'}],error:null}});assert.deepEqual(r.removed,['owner/old.webp']);assert.ok(r.calls.some(call=>call[0]==='delete'));assert.ok(r.calls.some(call=>Array.isArray(call)&&call[0]==='storage_path'&&call[1]==='owner/old.webp'));assert.ok(r.events.includes('Side photo removed.'));assert.equal(r.cache.size,0)});
for(const [name,result] of [['zero rows',{data:[],error:null}],['lost response',{data:null,error:{status:503}}],['foreign row representation',{data:[{item_id:'other',owner_id:'owner',angle:'side',storage_path:'owner/old.webp'}],error:null}]])test(`supplemental deletion ${name} retains the object`,async()=>{const r=await removePhoto({result});assert.deepEqual(r.removed,[]);assert.ok(!r.events.includes('Side photo removed.'))});
test('front deletion compare-and-swaps the path only while unavailable',async()=>{const r=await removePhoto({angle:'front',result:{data:[{id:'item',user_id:'owner',owner_photo_path:null}],error:null}});assert.deepEqual(r.removed,['owner/front.webp']);assert.ok(r.calls.some(call=>Array.isArray(call)&&call[0]==='available_for_exchange'&&call[1]===false));assert.ok(r.calls.some(call=>Array.isArray(call)&&call[0]==='owner_photo_path'&&call[1]==='owner/front.webp'))});
test('front deletion cannot clean an available set photo',async()=>{const r=await removePhoto({angle:'front',available:true,result:{data:[],error:null}});assert.deepEqual(r.removed,[]);assert.ok(!r.events.includes('Front photo removed.'));assert.equal(r.calls.some(call=>call[0]==='update'),false)});
test('account switch after metadata delete prevents cross-account storage cleanup',async()=>{const r=await removePhoto({result:{data:[{item_id:'item',owner_id:'owner',angle:'side',storage_path:'owner/old.webp'}],error:null},switchAfterWrite:true});assert.deepEqual(r.removed,[]);assert.ok(!r.events.includes('Side photo removed.'))});
