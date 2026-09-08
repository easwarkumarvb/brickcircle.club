/* BrickCircle owner-photo trust layer.
   Intercepts only NEW "I own this" actions and legacy exchangeability without a photo.
*/
(()=>{
'use strict';
const MAX_BYTES=8*1024*1024;
const TYPES=new Set(['image/jpeg','image/png','image/webp']);
const db=()=>window.BC_SUPABASE;
const $=(s,r=document)=>r.querySelector(s);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function toast(message){
  document.querySelector('.bc-toast')?.remove();
  const el=document.createElement('div');el.className='bc-toast';el.textContent=message;document.body.appendChild(el);setTimeout(()=>el.remove(),3200);
}
function overlay(html){
  document.getElementById('bc-owner-photo-overlay')?.remove();
  const o=document.createElement('div');o.className='bc-overlay';o.id='bc-owner-photo-overlay';
  o.innerHTML=`<section class="bc-modal" role="dialog" aria-modal="true">${html}</section>`;
  document.body.appendChild(o);o.addEventListener('click',e=>{if(e.target===o)o.remove()});return o;
}
function extFor(file){return file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg'}
function validate(file){
  if(!file)return 'Choose a photo first.';
  if(!TYPES.has(file.type))return 'Please use a JPEG, PNG or WebP image.';
  if(file.size>MAX_BYTES)return 'Photo must be 8 MB or smaller.';
  return '';
}
async function currentUser(){
  const client=db();if(!client)throw new Error('BrickCircle is still loading. Please try again.');
  const {data,error}=await client.auth.getUser();if(error||!data?.user)throw error||new Error('Please sign in again.');return data.user;
}
async function uploadPhoto(file,user){
  const path=`${user.id}/${crypto.randomUUID()}.${extFor(file)}`;
  const {error}=await db().storage.from('collection-photos').upload(path,file,{contentType:file.type,upsert:false});
  if(error)throw error;return path;
}
async function cleanup(path){try{await db().storage.from('collection-photos').remove([path])}catch(_){}}
async function signedUrl(path){
  if(!path)return '';
  const {data,error}=await db().storage.from('collection-photos').createSignedUrl(path,900);
  if(error)throw error;return data?.signedUrl||'';
}
async function collectionPhotoRow(itemId){
  const {data,error}=await db().from('collection_items').select('id,set_number,owner_photo_path').eq('id',itemId).limit(1);
  if(error)throw error;return data?.[0]||null;
}
function refreshAfterPhoto(){if(!window.__bcIsolated)setTimeout(()=>location.reload(),350)}

function photoPicker({title,copy,onSave,saveLabel='Add to My Sets'}){
  const o=overlay(`<div class="bc-modal-head"><div><h2>${esc(title)}</h2><p class="bc-muted">${esc(copy)}</p></div><button class="bc-close" type="button" data-photo-close>×</button></div>
    <form class="bc-form" id="bc-owner-photo-form">
      <div class="bc-field"><label>Photo of your finished LEGO set <b>(required)</b></label>
        <input class="bc-input" id="bc-owner-photo-input" type="file" accept="image/jpeg,image/png,image/webp" required>
        <div class="bc-small">Use your phone camera or gallery. JPEG, PNG or WebP · max 8 MB.</div>
      </div>
      <div id="bc-owner-photo-preview" style="display:none"><img alt="Selected assembled LEGO set" style="width:100%;max-height:330px;object-fit:contain;border-radius:12px"></div>
      <div class="bc-notice"><b>Why this is required</b><br>This photo helps the other collector understand the visible condition and apparent completeness of your physical set. Final inspection still happens in person.</div>
      <div class="bc-form-actions"><button type="button" class="bc-btn" data-photo-close>Cancel</button><button class="bc-btn primary" type="submit" disabled>${esc(saveLabel)}</button></div>
    </form>`);
  o.querySelectorAll('[data-photo-close]').forEach(b=>b.onclick=()=>o.remove());
  const input=$('#bc-owner-photo-input',o),preview=$('#bc-owner-photo-preview',o),img=$('img',preview),submit=$('button[type="submit"]',o);
  let objectUrl='';
  input.onchange=()=>{
    if(objectUrl)URL.revokeObjectURL(objectUrl);objectUrl='';
    const file=input.files?.[0],error=validate(file);submit.disabled=!!error;
    if(error){preview.style.display='none';if(file)toast(error);return}
    objectUrl=URL.createObjectURL(file);img.src=objectUrl;preview.style.display='block';
  };
  $('#bc-owner-photo-form',o).onsubmit=async e=>{
    e.preventDefault();const file=input.files?.[0],error=validate(file);if(error){toast(error);return}
    submit.disabled=true;const original=submit.textContent;submit.textContent='Uploading…';
    try{await onSave(file);if(objectUrl)URL.revokeObjectURL(objectUrl);o.remove()}
    catch(err){console.error(err);toast(err?.message||'Could not save the photo. Please try again.');submit.disabled=false;submit.textContent=original}
  };
}

async function addOwnedSet(setNumber){
  const card=document.querySelector(`[data-set="${CSS.escape(setNumber)}"]`),name=card?.querySelector('h3')?.textContent?.trim()||`Set ${setNumber}`;
  photoPicker({title:`Add ${name} to My Sets`,copy:'Upload a clear photo of your assembled set. This helps the other collector understand the set’s visible condition and completeness.',onSave:async file=>{
    const user=await currentUser();const path=await uploadPhoto(file,user);
    const {error}=await db().from('collection_items').insert({user_id:user.id,set_number:setNumber,owner_photo_path:path});
    if(error){await cleanup(path);throw error}
    try{window.bcProductAnalytics?.track?.('collection_item_added',{set_number:setNumber,owner_photo:true})}catch(_){ }
    toast('Added to My Sets with your owner photo.');refreshAfterPhoto();
  }});
}

async function ensureLegacyPhoto(itemId){
  const data=await collectionPhotoRow(itemId);
  if(data?.owner_photo_path)return true;
  photoPicker({title:`Add a photo for set ${data?.set_number||''}`,copy:'This legacy set needs a photo of the assembled model before it can be made available to exchange.',saveLabel:'Upload photo',onSave:async file=>{
    const user=await currentUser();const path=await uploadPhoto(file,user);
    const {error:updateError}=await db().from('collection_items').update({owner_photo_path:path,updated_at:new Date().toISOString()}).eq('id',itemId).eq('user_id',user.id);
    if(updateError){await cleanup(path);throw updateError}
    toast('Photo added. You can now make this set available to exchange.');refreshAfterPhoto();
  }});return false;
}

document.addEventListener('click',e=>{
  const button=e.target.closest?.('[data-own]');if(!button||button.classList.contains('on'))return;
  const card=button.closest('[data-set]');if(!card)return;
  e.preventDefault();e.stopImmediatePropagation();
  addOwnedSet(card.dataset.set).catch(err=>toast(err?.message||'Could not start photo upload.'));
},true);

document.addEventListener('change',async e=>{
  const input=e.target.closest?.('[data-exchangeable]');if(!input||!input.checked)return;
  try{
    const data=await collectionPhotoRow(input.dataset.exchangeable);
    if(data?.owner_photo_path)return;
    e.preventDefault();e.stopImmediatePropagation();input.checked=false;await ensureLegacyPhoto(input.dataset.exchangeable);
  }catch(err){console.error(err);input.checked=false;toast(err?.message||'Could not verify the set photo.')}
},true);

document.addEventListener('submit',async e=>{
  const form=e.target.closest?.('#bc-edit-item');if(!form)return;
  const exchangeable=form.querySelector('input[name="exchangeable"]');if(!exchangeable?.checked)return;
  const itemId=form.querySelector('[data-remove-collection-item]')?.dataset.removeCollectionItem;if(!itemId)return;
  try{
    const data=await collectionPhotoRow(itemId);
    if(data?.owner_photo_path)return;
    e.preventDefault();e.stopImmediatePropagation();exchangeable.checked=false;await ensureLegacyPhoto(itemId);
  }catch(err){e.preventDefault();e.stopImmediatePropagation();exchangeable.checked=false;toast(err?.message||'Could not verify the set photo.')}
},true);

async function hydrateOwnerPhotos(){
  const client=db();if(!client)return;let user;try{user=await currentUser()}catch(_){return}
  const rows=[...document.querySelectorAll('.bc-myset')];if(!rows.length)return;
  for(const row of rows){
    if(row.dataset.ownerPhotoHydrated)return;
    const itemId=row.querySelector('[data-edit-set]')?.dataset.editSet;if(!itemId)continue;
    try{
      const {data}=await client.from('collection_items').select('owner_photo_path').eq('id',itemId).eq('user_id',user.id).limit(1);
      const path=data?.[0]?.owner_photo_path;if(!path)continue;
      const url=await signedUrl(path),img=row.querySelector('.bc-myset-visual img');
      if(img&&url){img.src=url;img.removeAttribute('data-set-image');img.alt='Owner photo of assembled LEGO set';row.dataset.ownerPhotoHydrated='1'}
    }catch(_){ }
  }
}

async function hydrateCounterpartyPhotos(){
  const client=db();if(!client)return;try{await currentUser()}catch(_){return}
  const cards=[...document.querySelectorAll('.bc-match')];
  for(const card of cards){
    if(card.dataset.counterpartyPhotoHydrated)return;
    const userId=card.querySelector('[data-message-person]')?.dataset.messagePerson;
    const sides=[...card.querySelectorAll('.bc-match-side')],requested=sides[1];
    const text=requested?.querySelector('.bc-small')?.textContent||'';
    const setNumber=(text.match(/Set\s+([^\s·]+)/i)||[])[1];
    if(!userId||!setNumber)continue;
    try{
      const {data,error}=await client.from('collection_items')
        .select('owner_photo_path')
        .eq('user_id',userId)
        .eq('set_number',setNumber)
        .eq('available_for_exchange',true)
        .limit(1);
      const path=data?.[0]?.owner_photo_path;if(error||!path)continue;
      const url=await signedUrl(path);if(!url)continue;
      const wrap=document.createElement('div');wrap.className='bc-owner-proof';wrap.style.marginTop='10px';
      wrap.innerHTML=`<img src="${esc(url)}" alt="Owner photo of assembled LEGO set ${esc(setNumber)}" loading="lazy" style="width:100%;max-height:220px;object-fit:contain;border-radius:12px"><div class="bc-small" style="margin-top:5px">Owner photo · inspect the physical set in person before exchange</div>`;
      requested.appendChild(wrap);card.dataset.counterpartyPhotoHydrated='1';
    }catch(_){ }
  }
}

async function hydratePhotos(){await hydrateOwnerPhotos();await hydrateCounterpartyPhotos()}
let timer=0;const observer=new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(hydratePhotos,120)});observer.observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('load',hydratePhotos);
})();
