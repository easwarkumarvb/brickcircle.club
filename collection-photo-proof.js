(()=>{
'use strict';

const BUCKET='collection-photos';
const MAX_BYTES=8*1024*1024;
const SUPPORTED=new Set(['image/jpeg','image/png','image/webp']);
const db=window.BC_SUPABASE;
if(!db)return;

const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function toast(message){
  $('.bc-photo-toast')?.remove();
  const el=document.createElement('div');
  el.className='bc-toast bc-photo-toast';
  el.textContent=message;
  document.body.appendChild(el);
  setTimeout(()=>el.remove(),3500);
}

function publicPhoto(path){
  if(!path)return '';
  return db.storage.from(BUCKET).getPublicUrl(path).data?.publicUrl||'';
}

async function currentUser(){
  const {data,error}=await db.auth.getUser();
  if(error||!data?.user)throw error||new Error('Please sign in again.');
  return data.user;
}

function closePhotoModal(){document.getElementById('bc-photo-proof-overlay')?.remove()}

async function compressImage(file){
  if(!file)throw new Error('Choose a photo of your finished LEGO set.');
  if(!SUPPORTED.has(file.type))throw new Error('Please use a JPEG, PNG or WebP photo.');
  if(file.size>MAX_BYTES)throw new Error('Photo must be 8 MB or smaller.');
  const url=URL.createObjectURL(file);
  try{
    const img=new Image();
    img.decoding='async';
    img.src=url;
    await img.decode();
    const max=1600,scale=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight));
    const w=Math.max(1,Math.round(img.naturalWidth*scale));
    const h=Math.max(1,Math.round(img.naturalHeight*scale));
    const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
    canvas.getContext('2d',{alpha:false}).drawImage(img,0,0,w,h);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.86));
    if(!blob)throw new Error('Could not prepare this photo. Please choose another image.');
    return blob;
  } finally {URL.revokeObjectURL(url)}
}

async function uploadPhoto(file,userId){
  const blob=await compressImage(file);
  const id=crypto.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const path=`${userId}/${id}.jpg`;
  const {error}=await db.storage.from(BUCKET).upload(path,blob,{contentType:'image/jpeg',upsert:false,cacheControl:'3600'});
  if(error)throw error;
  return path;
}

function showPhotoModal({setNumber='',setName='',existingId=null,onSaved=null}={}){
  closePhotoModal();
  const overlay=document.createElement('div');
  overlay.id='bc-photo-proof-overlay';overlay.className='bc-overlay';
  overlay.innerHTML=`<section class="bc-modal" role="dialog" aria-modal="true" aria-labelledby="bc-photo-title">
    <div class="bc-modal-head"><div><h2 id="bc-photo-title">${existingId?'Add finished-set photo':'Add to My Sets'}</h2><p class="bc-muted">${esc(setName||setNumber||'Your LEGO set')}</p></div><button type="button" class="bc-close" data-photo-close>×</button></div>
    <form class="bc-form" id="bc-photo-proof-form">
      <div class="bc-notice"><b>Photo required</b><br>Upload a clear photo of your assembled set. This helps the other collector understand the set’s visible condition and completeness.</div>
      <div class="bc-field"><label for="bc-owner-photo">Photo of your finished LEGO set</label><input class="bc-input" id="bc-owner-photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp" required><div class="bc-small">JPEG, PNG or WebP · maximum 8 MB. On mobile you can use your camera or photo library.</div></div>
      <div id="bc-photo-preview-wrap" hidden><img id="bc-photo-preview" alt="Preview of your assembled LEGO set" style="width:100%;max-height:320px;object-fit:contain;border-radius:12px;background:#f3f4f6"><div class="bc-small" style="margin-top:6px">This photo shows visible condition; BrickCircle still recommends checking completeness in person.</div></div>
      <div class="bc-form-actions"><button type="button" class="bc-btn" data-photo-close>Cancel</button><button type="submit" class="bc-btn primary" id="bc-photo-save" disabled>${existingId?'Save photo':'Add to My Sets'}</button></div>
    </form>
  </section>`;
  document.body.appendChild(overlay);
  $$('[data-photo-close]',overlay).forEach(b=>b.onclick=closePhotoModal);
  overlay.addEventListener('click',e=>{if(e.target===overlay)closePhotoModal()});
  const input=$('#bc-owner-photo',overlay),preview=$('#bc-photo-preview',overlay),wrap=$('#bc-photo-preview-wrap',overlay),save=$('#bc-photo-save',overlay);
  let objectUrl='';
  input.onchange=()=>{
    if(objectUrl)URL.revokeObjectURL(objectUrl);
    const file=input.files?.[0];
    if(!file){wrap.hidden=true;save.disabled=true;return}
    if(!SUPPORTED.has(file.type)||file.size>MAX_BYTES){toast(!SUPPORTED.has(file.type)?'Please use a JPEG, PNG or WebP photo.':'Photo must be 8 MB or smaller.');input.value='';wrap.hidden=true;save.disabled=true;return}
    objectUrl=URL.createObjectURL(file);preview.src=objectUrl;wrap.hidden=false;save.disabled=false;
  };
  $('#bc-photo-proof-form',overlay).onsubmit=async e=>{
    e.preventDefault();
    const file=input.files?.[0];if(!file)return;
    save.disabled=true;save.textContent='Uploading…';
    let path='';
    try{
      const user=await currentUser();
      path=await uploadPhoto(file,user.id);
      if(existingId){
        const {error}=await db.from('collection_items').update({owner_photo_path:path,updated_at:new Date().toISOString()}).eq('id',existingId).eq('user_id',user.id);
        if(error)throw error;
      }else{
        const {error}=await db.from('collection_items').insert({user_id:user.id,set_number:setNumber,owner_photo_path:path});
        if(error)throw error;
        try{window.bcProductAnalytics?.track?.('collection_item_added',{set_number:setNumber,owner_photo:true})}catch(_){ }
      }
      if(objectUrl)URL.revokeObjectURL(objectUrl);
      closePhotoModal();
      toast(existingId?'Finished-set photo saved.':'Added to My Sets with your finished-set photo.');
      if(typeof onSaved==='function')await onSaved(path);
      setTimeout(()=>location.reload(),350);
    }catch(error){
      console.error(error);
      if(path)try{await db.storage.from(BUCKET).remove([path])}catch(_){ }
      toast(error?.message||'Could not save the photo. Please try again.');
      save.disabled=false;save.textContent=existingId?'Save photo':'Add to My Sets';
    }
  };
}

// Intercept only the add-owned action. Existing removal continues through app-v3.
document.addEventListener('click',event=>{
  const button=event.target.closest?.('[data-own]');
  if(!button||button.classList.contains('on'))return;
  const card=button.closest('[data-set]');if(!card)return;
  event.preventDefault();event.stopImmediatePropagation();
  const setNumber=card.dataset.set||'';
  const setName=card.querySelector('h3')?.textContent?.trim()||setNumber;
  showPhotoModal({setNumber,setName});
},true);

// Legacy beta items remain visible, but cannot newly become exchangeable without a photo.
document.addEventListener('change',async event=>{
  const checkbox=event.target.closest?.('[data-exchangeable]');
  if(!checkbox||!checkbox.checked)return;
  const id=checkbox.dataset.exchangeable;if(!id)return;
  event.preventDefault();event.stopImmediatePropagation();
  checkbox.disabled=true;
  try{
    const {data,error}=await db.from('collection_items').select('id,set_number,owner_photo_path,lego_sets(name)').eq('id',id).maybeSingle();
    if(error)throw error;
    if(data?.owner_photo_path){checkbox.disabled=false;checkbox.dispatchEvent(new Event('change',{bubbles:true}));return}
    checkbox.checked=false;checkbox.disabled=false;
    showPhotoModal({existingId:id,setNumber:data?.set_number,setName:data?.lego_sets?.name||data?.set_number});
    toast('Add a finished-set photo before making this set available to exchange.');
  }catch(error){checkbox.checked=false;checkbox.disabled=false;toast(error?.message||'Could not check this set. Please try again.')}
},true);

let decorating=false;
async function decorateOwnedRows(){
  if(decorating)return;decorating=true;
  try{
    const rows=$$('.bc-myset [data-edit-set]');if(!rows.length)return;
    const ids=rows.map(b=>b.dataset.editSet).filter(Boolean);
    const {data,error}=await db.from('collection_items').select('id,set_number,owner_photo_path').in('id',ids);
    if(error)return;
    const byId=new Map((data||[]).map(x=>[String(x.id),x]));
    for(const button of rows){
      const item=byId.get(String(button.dataset.editSet));if(!item)return;
      const card=button.closest('.bc-myset');if(!card)return;
      if(item.owner_photo_path){
        const img=card.querySelector('.bc-myset-visual img');
        const url=publicPhoto(item.owner_photo_path);
        if(img&&url&&img.dataset.ownerPhoto!=='1'){img.src=url;img.removeAttribute('data-set-image');img.dataset.ownerPhoto='1';img.alt=`Owner photo of LEGO set ${item.set_number}`}
        if(!card.querySelector('.bc-owner-photo-label')){
          const label=document.createElement('div');label.className='bc-small bc-owner-photo-label';label.textContent='📷 Owner photo';card.querySelector('.bc-myset-visual')?.appendChild(label);
        }
      }else if(!card.querySelector('.bc-photo-required-action')){
        const action=document.createElement('button');action.type='button';action.className='bc-btn ghost bc-photo-required-action';action.style.marginTop='8px';action.textContent='Add required photo';
        action.onclick=()=>showPhotoModal({existingId:item.id,setNumber:item.set_number,setName:card.querySelector('h3')?.textContent?.trim()||item.set_number});
        button.parentElement?.appendChild(action);
      }
    }
  } finally {decorating=false}
}

let decorateTimer=0;
const observer=new MutationObserver(()=>{clearTimeout(decorateTimer);decorateTimer=setTimeout(decorateOwnedRows,120)});
observer.observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('hashchange',()=>setTimeout(decorateOwnedRows,150));
setTimeout(decorateOwnedRows,500);
})();
