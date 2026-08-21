/* BrickCircle profile avatar fix v2.
   The base V2 profile renderer uses .profile .avatar and does not expose a data attribute.
   This module augments that real DOM element instead of depending on a placeholder selector.
*/
(()=>{
  const SUPABASE_URL='https://nsxtromjdpdscknadxez.supabase.co';
  const SUPABASE_KEY='sb_publishable_JJhVbgjGblHrnKuPOsJkxQ_zRoQNlIL';
  const db=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
  let busy=false;

  const extFor=file=>({'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[file.type]||'jpg');

  async function user(){
    const {data,error}=await db.auth.getUser();
    if(error) throw error;
    if(!data?.user) throw new Error('Please sign in before uploading a profile picture.');
    return data.user;
  }

  function target(){ return document.querySelector('.profile .avatar'); }

  function setImage(url){
    const box=target(); if(!box) return;
    box.innerHTML=`<img src="${url}${url.includes('?')?'&':'?'}v=${Date.now()}" alt="Profile picture" style="width:68px;height:68px;border-radius:18px;object-fit:cover;display:block">`;
    box.style.cssText='width:68px;height:68px;border-radius:18px;overflow:hidden;background:#fff8d9;display:grid;place-items:center';
  }

  async function loadExisting(){
    try{
      const u=await user();
      const {data:p,error}=await db.from('profiles').select('avatar_url').eq('id',u.id).single();
      if(error || !p?.avatar_url) return;
      const path=p.avatar_url.includes('/storage/v1/object/public/avatars/')
        ? p.avatar_url.split('/storage/v1/object/public/avatars/')[1].split('?')[0]
        : p.avatar_url;
      const {data}=db.storage.from('avatars').getPublicUrl(path);
      if(data?.publicUrl) setImage(data.publicUrl);
    }catch(e){ console.warn('Avatar load:',e); }
  }

  async function upload(file){
    if(busy||!file) return;
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('Please choose a JPG, PNG or WebP image.');
    if(file.size>5*1024*1024) throw new Error('Profile pictures must be 5 MB or smaller.');
    const u=await user(); busy=true;
    try{
      const old=(await db.from('profiles').select('avatar_url').eq('id',u.id).single()).data?.avatar_url||null;
      const path=`${u.id}/${crypto.randomUUID()}.${extFor(file)}`;
      const {data,error}=await db.storage.from('avatars').upload(path,file,{contentType:file.type,cacheControl:'3600',upsert:false});
      if(error) throw new Error(`Storage upload failed: ${error.message}`);
      const {data:url}=db.storage.from('avatars').getPublicUrl(data.path);
      if(!url?.publicUrl) throw new Error('Storage upload succeeded but no public image URL was returned.');
      const {error:updateError}=await db.from('profiles').update({avatar_url:data.path,updated_at:new Date().toISOString()}).eq('id',u.id);
      if(updateError) throw new Error(`Profile update failed: ${updateError.message}`);
      if(old && !old.includes(data.path)){
        const oldPath=old.includes('/storage/v1/object/public/avatars/')?old.split('/storage/v1/object/public/avatars/')[1].split('?')[0]:old;
        if(oldPath.startsWith(`${u.id}/`)) await db.storage.from('avatars').remove([oldPath]);
      }
      setImage(url.publicUrl);
      alert('Profile picture updated successfully.');
    }finally{busy=false;}
  }

  function install(){
    if(location.hash.slice(1)!=='profile') return;
    const box=target(); if(!box) return;
    if(box.dataset.bcAvatarInstalled==='1') return;
    box.dataset.bcAvatarInstalled='1';
    const wrap=document.createElement('div');
    wrap.style.cssText='display:flex;flex-direction:column;gap:8px;align-items:flex-start';
    box.parentNode.insertBefore(wrap,box); wrap.appendChild(box);
    const label=document.createElement('label');
    label.className='button primary'; label.textContent='Change profile picture'; label.style.cssText='cursor:pointer;display:inline-block';
    const input=document.createElement('input');
    input.type='file'; input.accept='image/jpeg,image/png,image/webp'; input.style.display='none';
    input.addEventListener('change',async e=>{try{await upload(e.target.files?.[0]);}catch(err){console.error(err);alert(err.message||'Profile picture upload failed.');}finally{input.value='';}});
    label.appendChild(input); wrap.appendChild(label);
    loadExisting();
  }

  let timer=null;
  const schedule=()=>{clearTimeout(timer);timer=setTimeout(install,150);};
  window.addEventListener('load',schedule);
  window.addEventListener('hashchange',schedule);
  new MutationObserver(schedule).observe(document.querySelector('#app')||document.body,{childList:true,subtree:true});
  schedule();
})();
