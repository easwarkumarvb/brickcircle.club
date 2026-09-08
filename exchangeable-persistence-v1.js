/* BrickCircle — verified persistence for Available to Exchange toggles. */
(()=>{
'use strict';

function toast(message){
  try{window.bcPushToast?.(message)}catch(_){ }
}

async function persistExchangeable(input){
  const db=window.BC_SUPABASE;
  if(!db)return;
  const id=String(input.dataset.exchangeable||'');
  if(!id)return;

  const next=!!input.checked;
  const previous=!next;
  input.disabled=true;

  try{
    const {data:{user},error:userError}=await db.auth.getUser();
    if(userError||!user)throw userError||new Error('Your sign-in session expired. Please sign in again.');

    const {data,error}=await db
      .from('collection_items')
      .update({available_for_exchange:next,updated_at:new Date().toISOString()})
      .eq('id',id)
      .eq('user_id',user.id)
      .select('id,available_for_exchange')
      .maybeSingle();

    if(error)throw error;
    if(!data||data.id!==id)throw new Error('BrickCircle could not confirm that this set was updated. Please try again.');
    if(Boolean(data.available_for_exchange)!==next)throw new Error('BrickCircle could not verify the saved exchange setting. Please try again.');

    // Rehydrate from Supabase so the in-memory collection, match readiness,
    // and checkbox all reflect the persisted database value.
    await window.bcV3Refresh?.();
    toast(next?'This set is saved as Available to Exchange.':'This set is saved as Not Available.');
  }catch(error){
    console.error('Exchangeable persistence failed',error);
    input.checked=previous;
    input.disabled=false;
    toast(error?.message||'Could not save this exchange setting. Please try again.');
  }
}

// Capture before app-v3's target-level onchange handler. The canonical handler
// currently treats a zero-row UPDATE as success; this guard requires Supabase
// to return the updated row before the UI confirms the change.
document.addEventListener('change',event=>{
  const input=event.target?.closest?.('input[data-exchangeable]');
  if(!input)return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  persistExchangeable(input);
},true);
})();
