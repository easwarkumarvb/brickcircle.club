/* BrickCircle collection-removal safety layer.
   Prevents raw FK errors, protects active exchanges, and cleans up owner photos.
*/
(()=>{
'use strict';
const db=()=>window.BC_SUPABASE;
const activeStates=new Set(['accepted','swap_active','disputed']);

function toast(message){
  if(window.bcPushToast)return window.bcPushToast(message);
  alert(message);
}
function activeMessage(exchange){
  if(exchange.state==='accepted')return 'This set is part of an accepted exchange. Cancel that exchange before removing the set from My Sets.';
  if(exchange.state==='swap_active')return 'This set is currently in a temporary exchange. Complete the return before removing it from My Sets.';
  if(exchange.state==='disputed')return 'This set is tied to an exchange with an open issue. Resolve the exchange before removing it from My Sets.';
  return 'This set is part of an active exchange and cannot be removed yet.';
}
async function currentUser(){
  const client=db();
  if(!client)throw new Error('BrickCircle is still loading. Please try again.');
  const {data,error}=await client.auth.getUser();
  if(error||!data?.user)throw error||new Error('Please sign in again.');
  return data.user;
}
async function itemRecord(itemId,userId){
  const {data,error}=await db().from('collection_items')
    .select('id,set_number,owner_photo_path')
    .eq('id',itemId)
    .eq('user_id',userId)
    .maybeSingle();
  if(error)throw error;
  if(!data)throw new Error('This set is no longer in your collection. Refresh and try again.');
  return data;
}
async function exchangeRefs(itemId){
  const {data,error}=await db().from('exchanges')
    .select('id,state,created_at')
    .or(`item_a.eq.${itemId},item_b.eq.${itemId}`)
    .order('created_at',{ascending:false});
  if(error)throw error;
  return data||[];
}
async function cleanupPhoto(path){
  if(!path)return;
  try{await db().storage.from('collection-photos').remove([path])}catch(_){ }
}
async function refresh(){
  try{await window.bcV3Refresh?.()}catch(_){location.reload()}
}
async function removeItem(itemId,name,button){
  const original=button?.textContent||'Remove';
  if(button){button.disabled=true;button.textContent='Checking…'}
  try{
    const user=await currentUser();
    const item=await itemRecord(itemId,user.id);
    const refs=await exchangeRefs(itemId);
    const active=refs.find(row=>activeStates.has(row.state)||!['completed','cancelled'].includes(row.state));
    if(active){
      const message=activeMessage(active);
      if(button){button.disabled=false;button.textContent=original}
      const open=confirm(`${message}\n\nOpen the exchange now?`);
      if(open){window.bcClose?.();location.hash=`#exchange/${encodeURIComponent(active.id)}`}
      return;
    }

    if(!confirm(`Remove ${name||'this set'} from My Sets?\n\nCompleted or cancelled exchange history will be preserved.`)){
      if(button){button.disabled=false;button.textContent=original}
      return;
    }

    if(button)button.textContent='Removing…';
    const {data,error}=await db().from('collection_items')
      .delete()
      .eq('id',itemId)
      .eq('user_id',user.id)
      .select('id');
    if(error)throw error;
    if(!data?.length)throw new Error('The set was not removed. Refresh and try again.');
    await cleanupPhoto(item.owner_photo_path);
    window.bcClose?.();
    toast(`${name||'Set'} removed from My Sets.`);
    await refresh();
  }catch(error){
    console.error(error);
    const raw=String(error?.message||'');
    const message=/foreign key constraint|exchanges_item_[ab]_fkey|exchanges_request_id_fkey/i.test(raw)
      ?'This set is still linked to an exchange. Open Exchanges and resolve or cancel it before trying again.'
      :(error?.message||'Could not remove this set. Please try again.');
    toast(message);
    if(button){button.disabled=false;button.textContent=original}
  }
}
async function itemIdForSet(setNumber){
  const user=await currentUser();
  const {data,error}=await db().from('collection_items')
    .select('id')
    .eq('user_id',user.id)
    .eq('set_number',setNumber)
    .maybeSingle();
  if(error)throw error;
  return data?.id||'';
}

document.addEventListener('click',async event=>{
  const detailsRemove=event.target.closest?.('[data-remove-collection-item]');
  if(detailsRemove){
    event.preventDefault();event.stopImmediatePropagation();
    const itemId=detailsRemove.dataset.removeCollectionItem;
    const name=detailsRemove.closest('.bc-modal')?.querySelector('h2')?.textContent?.trim()||'this set';
    await removeItem(itemId,name,detailsRemove);
    return;
  }

  const ownButton=event.target.closest?.('.bc-set-card [data-own].on');
  if(!ownButton)return;
  event.preventDefault();event.stopImmediatePropagation();
  const card=ownButton.closest('[data-set]');
  const setNumber=card?.dataset.set;
  const name=card?.querySelector('h3')?.textContent?.trim()||'this set';
  try{
    const itemId=await itemIdForSet(setNumber);
    if(!itemId)throw new Error('This set is no longer in your collection. Refresh and try again.');
    await removeItem(itemId,name,ownButton);
  }catch(error){
    console.error(error);toast(error?.message||'Could not remove this set. Please try again.');ownButton.disabled=false;
  }
},true);
})();
