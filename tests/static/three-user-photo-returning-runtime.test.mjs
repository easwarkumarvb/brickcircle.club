import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('tests/isolated/fixtures/three-user-supabase-browser-mock.js','utf8');
function fixture(){const storage=new Map(),context=vm.createContext({URLSearchParams,location:{search:'',href:'http://127.0.0.1/'},localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},window:{},queueMicrotask});vm.runInContext(source,context);return {db:context.window.supabase.createClient(),state:context.window.__bcThreeUser}}
for(const [table,key] of [['collection_items','collection'],['wishlists','wishlist']]){
 test(`${table} duplicate stored key rejects an entire batch without partial writes`,async()=>{
  const {db,state}=fixture(),id=state.actors.easwar.id;
  await db.from(table).insert({user_id:id,set_number:'42172-1'});
  const before=JSON.stringify(state.data[key]);
  const result=await db.from(table).insert([{user_id:id,set_number:'42143-1'},{user_id:id,set_number:'42172-1'}]).select();
  assert.equal(result.data,null);assert.equal(result.error.code,'23505');assert.equal(JSON.stringify(state.data[key]),before);
 });
 test(`${table} duplicate keys inside one batch reject atomically`,async()=>{
  const {db,state}=fixture(),id=state.actors.easwar.id,before=JSON.stringify(state.data[key]);
  const result=await db.from(table).insert([{user_id:id,set_number:'42172-1'},{user_id:id,set_number:'42172-1'}]);
  assert.equal(result.data,null);assert.equal(result.error.code,'23505');assert.equal(JSON.stringify(state.data[key]),before);
 });
}
test('three-user collection insert is lazy and returns the actual owner and photo representation',async()=>{
 const {db,state}=fixture(),id=state.actors.easwar.id,path=`${id}/owner-photo.jpg`;
 const query=db.from('collection_items').insert({user_id:id,set_number:'42172-1',owner_photo_path:path});assert.equal(state.data.collection.length,0);
 const result=await query.select('id,user_id,set_number,owner_photo_path');assert.equal(result.error,null);assert.equal(result.data.length,1);assert.equal(result.data[0].id,state.data.collection[0].id);assert.equal(result.data[0].user_id,id);assert.equal(result.data[0].owner_photo_path,path);assert.equal(result.data[0].set_number,'42172-1');
});
test('three-user insert without returning preserves the default null representation',async()=>{
 const {db,state}=fixture(),id=state.actors.easwar.id;const result=await db.from('wishlists').insert({user_id:id,set_number:'42143-1'});assert.equal(result.data,null);assert.equal(result.error,null);assert.equal(state.data.wishlist.length,1);
});
test('previous-path compare-and-set returns the changed row and stale replacement returns zero rows',async()=>{
 const {db,state}=fixture(),id=state.actors.easwar.id;const {data}=await db.from('collection_items').insert({user_id:id,set_number:'42172-1',owner_photo_path:`${id}/old.jpg`}).select();const item=data[0];
 const changed=await db.from('collection_items').update({owner_photo_path:`${id}/new.jpg`}).eq('id',item.id).eq('user_id',id).eq('owner_photo_path',item.owner_photo_path).select('id,user_id,owner_photo_path');assert.equal(changed.data.length,1);assert.equal(changed.data[0].owner_photo_path,`${id}/new.jpg`);
 const stale=await db.from('collection_items').update({owner_photo_path:`${id}/stale.jpg`}).eq('id',item.id).eq('owner_photo_path',item.owner_photo_path).select();assert.equal(stale.data.length,0);assert.equal(state.data.collection[0].owner_photo_path,`${id}/new.jpg`);
});
test('IS NULL previous-path predicate faithfully permits attaching a legacy photo',async()=>{
 const {db,state}=fixture(),id=state.actors.easwar.id;const {data}=await db.from('collection_items').insert({user_id:id,set_number:'42172-1'}).select();const result=await db.from('collection_items').update({owner_photo_path:`${id}/legacy.jpg`}).eq('id',data[0].id).eq('user_id',id).is('owner_photo_path',null).select();assert.equal(result.data.length,1);assert.equal(result.data[0].owner_photo_path,`${id}/legacy.jpg`);
});
