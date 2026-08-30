/* BrickCircle: allow collectors to remove mistakenly added sets from My Collection. */
(()=>{
'use strict';

const SUPABASE_URL='https://nsxtromjdpdscknadxez.supabase.co';
const SUPABASE_KEY='sb_publishable_JJhVbgjGblHrnKuPOsJkxQ_zRoQNlIL';
const db=window.supabase?.createClient?.(SUPABASE_URL,SUPABASE_KEY);
if(!db)return;

function toast(msg){
  document.querySelector('.bc-toast')?.remove();
  const el=document.createElement('div');
  el.className='bc-toast';
  el.textContent=msg;
  document.body.appendChild(el);
  setTimeout(()=>el.remove(),4200);
}

async function removeCollectionItem(id,name,button){
  if(!id)return;
  const confirmed=window.confirm(
    `Remove ${name||'this set'} from My Collection?\n\n`+
    'Pending proposals involving this set will be withdrawn. '+
    'Sets used in an accepted or completed exchange must remain in your collection history.'
  );
  if(!confirmed)return;

  button.disabled=true;
  const oldText=button.textContent;
  button.textContent='Removing…';

  try{
    const {data:{user},error:userError}=await db.auth.getUser();
    if(userError||!user)throw userError||new Error('Please sign in again before removing this set.');

    const {data,error}=await db
      .from('collection_items')
      .delete()
      .eq('id',id)
      .eq('user_id',user.id)
      .select('id')
      .maybeSingle();

    if(error)throw error;
    if(!data)throw new Error('This set was not found in your collection. Refresh the page and try again.');

    document.getElementById('bc-overlay')?.remove();
    toast(`${name||'Set'} removed from My Collection.`);
    setTimeout(()=>window.location.reload(),450);
  }catch(error){
    console.error('BrickCircle collection removal failed',error);
    const message=error?.code==='23503'
      ?'This set is part of an accepted or completed exchange and must remain in your collection history.'
      :(error?.message||'Could not remove this set. Please try again.');
    toast(message);
    button.disabled=false;
    button.textContent=oldText;
  }
}

function enhanceDetailsButton(editButton){
  const id=editButton?.dataset?.editSet;
  if(!id)return;

  setTimeout(()=>{
    const form=document.getElementById('bc-edit-item');
    if(!form||form.dataset.removeEnhanced==='1')return;
    form.dataset.removeEnhanced='1';

    const actions=form.querySelector('.bc-form-actions');
    if(!actions)return;

    const modal=document.getElementById('bc-overlay');
    const name=modal?.querySelector('.bc-modal-head h2')?.textContent?.trim()||'this set';
    const remove=document.createElement('button');
    remove.type='button';
    remove.className='bc-btn';
    remove.dataset.removeCollectionItem=id;
    remove.textContent='Remove set';
    remove.style.color='#b42318';
    remove.style.borderColor='#f0b4ae';
    remove.setAttribute('aria-label',`Remove ${name} from My Collection`);
    remove.addEventListener('click',()=>removeCollectionItem(id,name,remove));
    actions.insertBefore(remove,actions.firstChild);
  },0);
}

document.addEventListener('click',event=>{
  const editButton=event.target.closest?.('[data-edit-set]');
  if(editButton)enhanceDetailsButton(editButton);
},true);
})();
