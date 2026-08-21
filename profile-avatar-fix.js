/* BrickCircle profile avatar production fix.
   Uses Supabase Storage bucket `avatars` with per-user folders and public reads.
*/
(()=>{
  const SUPABASE_URL='https://nsxtromjdpdscknadxez.supabase.co';
  const SUPABASE_KEY='sb_publishable_JJhVbgjGblHrnKuPOsJkxQ_zRoQNlIL';
  const db=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
  let busy=false;

  const esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const extFor=(file)=>{
    const map={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
    return map[file.type] || (file.name.split('.').pop()||'jpg').toLowerCase();
  };

  async function currentUser(){
    const {data,error}=await db.auth.getUser();
    if(error) throw error;
    if(!data?.user) throw new Error('Please sign in before uploading a profile picture.');
    return data.user;
  }

  async function upload(file){
    if(busy) return;
    if(!file) return;
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('Please choose a JPG, PNG or WebP image.');
    if(file.size>5*1024*1024) throw new Error('Profile pictures must be 5 MB or smaller.');
    const user=await currentUser();
    busy=true;
    const path=`${user.id}/${crypto.randomUUID()}.${extFor(file)}`;
    try{
      const {data,error}=await db.storage.from('avatars').upload(path,file,{contentType:file.type,cacheControl:'3600',upsert:false});
      if(error) throw error;
      const {data:urlData}=db.storage.from('avatars').getPublicUrl(data.path);
      const {data:profile,error:profileError}=await db.from('profiles').select('avatar_url').eq('id',user.id).single();
      if(profileError) throw profileError;
      const {error:updateError}=await db.from('profiles').update({avatar_url:data.path,updated_at:new Date().toISOString()}).eq('id',user.id);
      if(updateError) throw updateError;
      if(profile?.avatar_url && profile.avatar_url!==data.path && profile.avatar_url.startsWith(user.id+'/')){
        await db.storage.from('avatars').remove([profile.avatar_url]);
      }
      renderAvatar(urlData.publicUrl);
      alert('Profile picture updated successfully.');
    }finally{busy=false;}
  }

  function renderAvatar(url){
    const box=document.querySelector('[data-bc-avatar]');
    if(!box) return;
    box.innerHTML=`<img src="${esc(url)}?v=${Date.now()}" alt="Profile picture" style="width:68px;height:68px;border-radius:18px;object-fit:cover;display:block">`;
  }

  async function loadExisting(){
    try{
      const user=await currentUser();
      const {data,error}=await db.from('profiles').select('avatar_url').eq('id',user.id).single();
      if(error || !data?.avatar_url) return;
      const {data:urlData}=db.storage.from('avatars').getPublicUrl(data.avatar_url);
      renderAvatar(urlData.publicUrl);
    }catch(e){}
  }

  function install(){
    if(location.hash.slice(1)!=='profile') return;
    const app=document.querySelector('#app');
    if(!app) return;
    const old=app.querySelector('[data-bc-avatar]');
    if(old && app.querySelector('[data-bc-avatar-input]')) return;
    if(old) old.outerHTML='<div data-bc-avatar style="width:68px;height:68px;border-radius:18px;background:#fff8d9;display:grid;place-items:center;font-size:35px">🧱</div>';
    const avatar=app.querySelector('[data-bc-avatar]');
    if(!avatar) return;
    const wrap=document.createElement('div');
    wrap.style.cssText='display:flex;flex-direction:column;gap:8px;align-items:flex-start';
    avatar.parentNode.insertBefore(wrap,avatar);
    wrap.appendChild(avatar);
    const label=document.createElement('label');
    label.className='button primary';
    label.textContent='Change profile picture';
    label.style.cssText='cursor:pointer;display:inline-block';
    const input=document.createElement('input');
    input.type='file'; input.accept='image/jpeg,image/png,image/webp'; input.setAttribute('data-bc-avatar-input','1');
    input.style.display='none';
    input.addEventListener('change',async e=>{
      try{await upload(e.target.files?.[0]);}catch(err){console.error('Avatar upload failed',err);alert(err.message||'Profile picture upload failed.');}finally{input.value='';}
    });
    label.appendChild(input); wrap.appendChild(label);
    loadExisting();
  }

  let timer=null;
  const schedule=()=>{clearTimeout(timer);timer=setTimeout(install,120);};
  window.addEventListener('hashchange',schedule);
  window.addEventListener('load',schedule);
  new MutationObserver(schedule).observe(document.querySelector('#app')||document.body,{childList:true,subtree:true});
  schedule();
})();
