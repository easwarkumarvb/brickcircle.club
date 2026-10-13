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

    // Commit first, then verify with a fresh read. Keeping these as two
    // separate requests avoids a false-negative UI rollback when a client or
    // test double cannot return the mutated row from UPDATE ... RETURNING.
    const {error:updateError}=await db
      .from('collection_items')
      .update({available_for_exchange:next,updated_at:new Date().toISOString()})
      .eq('id',id)
      .eq('user_id',user.id);

    if(updateError)throw updateError;

    const {data:verified,error:verifyError}=await db
      .from('collection_items')
      .select('id,available_for_exchange')
      .eq('id',id)
      .eq('user_id',user.id)
      .maybeSingle();

    if(verifyError)throw verifyError;
    if(!verified||verified.id!==id)throw new Error('BrickCircle could not confirm that this set was updated. Please try again.');
    if(Boolean(verified.available_for_exchange)!==next)throw new Error('BrickCircle could not verify the saved exchange setting. Please try again.');

    await window.bcV3Refresh?.();
    toast(next?'This set is saved as Available to Exchange.':'This set is saved as Not Available.');
  }catch(error){
    console.error('Exchangeable persistence failed',error);
    input.checked=previous;
    input.disabled=false;
    toast(error?.message||'Could not save this exchange setting. Please try again.');
  }
}

document.addEventListener('change',event=>{
  const input=event.target?.closest?.('input[data-exchangeable]');
  if(!input)return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  persistExchangeable(input);
},true);
})();
