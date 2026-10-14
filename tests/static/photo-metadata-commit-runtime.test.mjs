import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('app-v3.js','utf8');
const helpers=source.slice(source.indexOf('function photoWriteDefinitelyRejected('),source.indexOf('function addOwnedSetWithPhoto('));
const ctx=vm.createContext({});vm.runInContext(helpers,ctx);
function fixture(){let clean=0,asserts=0;const owner={assert(){asserts++}};return {owner,clean:()=>clean,asserts:()=>asserts,save:write=>ctx.persistPhotoMetadata(owner,write,row=>row.id==='item'&&row.path==='new',async()=>{clean++})}}
for(const code of ['22001','23505','42501','40001','40P01'])test(`definitive ${code} rejection cleans candidate only`,async()=>{const f=fixture();await assert.rejects(f.save(async()=>({data:null,error:{code}})),/not saved/);assert.equal(f.clean(),1)});
for(const result of [{data:null,error:{status:503}},{data:null,error:{status:401}},{data:null,error:{code:'PGRST116'}},{data:null,error:null},{data:[{id:'wrong',path:'new'}],error:null},{data:[{id:'item',path:'new'},{id:'item',path:'new'}],error:null}])test(`unconfirmed response retains candidate ${JSON.stringify(result)}`,async()=>{const f=fixture();await assert.rejects(f.save(async()=>result),/could not be confirmed/);assert.equal(f.clean(),0)});
test('committed then lost response retains the new referenced object',async()=>{const f=fixture();let persisted='old';await assert.rejects(f.save(async()=>{persisted='new';throw new TypeError('lost transport')}),/could not be confirmed/);assert.equal(persisted,'new');assert.equal(f.clean(),0)});
test('successful zero-row representation cleans unused candidate',async()=>{const f=fixture();await assert.rejects(f.save(async()=>({data:[],error:null})),/no longer editable/);assert.equal(f.clean(),1)});
test('matching representation positively confirms commit',async()=>{const f=fixture();const row=await f.save(async()=>({data:[{id:'item',path:'new'}],error:null}));assert.equal(row.path,'new');assert.equal(f.clean(),0);assert.equal(f.asserts(),2)});
test('owner change before write cleans candidate without issuing metadata request',async()=>{const f=fixture();f.owner.assert=()=>{throw Error('changed')};let calls=0;await assert.rejects(f.save(async()=>{calls++;return {data:[],error:null}}),/changed/);assert.equal(calls,0);assert.equal(f.clean(),1)});
test('owner change after positive commit retains saved candidate',async()=>{const f=fixture();let calls=0;f.owner.assert=()=>{if(++calls===2)throw Error('changed')};await assert.rejects(f.save(async()=>({data:[{id:'item',path:'new'}],error:null})),/changed/);assert.equal(f.clean(),0)});
const avatarOwner=source.slice(source.indexOf('function avatarUploadOwner('),source.indexOf('async function uploadAvatar('));
for(const sequence of ['A-B','A-B-A','logout'])test(`captured avatar owner rejects ${sequence}`,async()=>{const context=vm.createContext({S:{user:{id:'A'}},ownerPhotoIdentityGeneration:1,logoutLocked:false,withTimeout:p=>p,db:{auth:{getUser:async()=>({data:{user:{id:'A'}},error:null})}}});vm.runInContext(avatarOwner,context);const owner=context.avatarUploadOwner();context.ownerPhotoIdentityGeneration++;context.S.user={id:sequence==='A-B'?'B':'A'};if(sequence==='logout')context.logoutLocked=true;await assert.rejects(owner.verify(),/session changed/);assert.equal(owner.id,'A')});
test('same-owner token refresh does not invalidate avatar owner',async()=>{const context=vm.createContext({S:{user:{id:'A'}},ownerPhotoIdentityGeneration:1,logoutLocked:false,withTimeout:p=>p,db:{auth:{getUser:async()=>({data:{user:{id:'A'}},error:null})}}});vm.runInContext(avatarOwner,context);const owner=context.avatarUploadOwner();context.S.user={id:'A',token:'refreshed'};await owner.verify()});

const avatarFunctions=source.slice(source.indexOf('function ownedAvatarStoragePath('),source.indexOf('async function signOut('));
function avatarFixture(){
 let resolveUpload,uploads=[],removals=[],updates=[],toasts=[];
 const context=vm.createContext({S:{user:{id:'A'},profile:{avatar_url:'A/old.jpg'}},ownerPhotoIdentityGeneration:1,logoutLocked:false,crypto:{randomUUID:()=> 'new'},withTimeout:p=>p,toast:t=>toasts.push(t),refreshCore:async()=>{},shell:()=>{},renderRoute:async()=>{},db:{auth:{getUser:async()=>({data:{user:{id:context.S.user.id}},error:null})},storage:{from:()=>({upload:async path=>{uploads.push(path);await new Promise(done=>resolveUpload=done);return {data:{path},error:null}},remove:async paths=>{removals.push(...paths);return {error:null}}})},from:()=>{const query={patch:null,filters:[],update(patch){this.patch=patch;return this},eq(k,v){this.filters.push([k,v]);return this},is(k,v){this.filters.push([k,v]);return this},select(){updates.push({patch:this.patch,filters:this.filters});return Promise.resolve({data:[{id:'A',...this.patch}],error:null})}};return query}}});
 vm.runInContext(helpers+'\n'+avatarFunctions,context);
 return {context,uploads,removals,updates,toasts,release:()=>resolveUpload(),start:()=>context.uploadAvatar({type:'image/jpeg',size:1})};
}
for(const sequence of ['A-B','A-B-A'])test(`avatar upload delayed across ${sequence} never writes the new account profile`,async()=>{
 const f=avatarFixture(),pending=f.start();await new Promise(done=>setImmediate(done));assert.equal(f.uploads.length,1);f.context.S.user={id:'B'};f.context.ownerPhotoIdentityGeneration++;if(sequence==='A-B-A'){f.context.S.user={id:'A'};f.context.ownerPhotoIdentityGeneration++}f.release();await pending;assert.equal(f.updates.length,0);assert.deepEqual(f.removals,['A/profile-new.jpg']);assert.ok(!f.toasts.includes('Profile photo updated.'));
});
test('delayed avatar upload survives same-owner token refresh and writes captured id',async()=>{
 const f=avatarFixture(),pending=f.start();await new Promise(done=>setImmediate(done));f.context.S.user={id:'A',token:'fresh'};f.release();await pending;assert.equal(f.updates.length,1);assert.deepEqual(f.updates[0].filters[0],['id','A']);assert.deepEqual(f.removals,['A/old.jpg']);assert.ok(f.toasts.includes('Profile photo updated.'));
});
