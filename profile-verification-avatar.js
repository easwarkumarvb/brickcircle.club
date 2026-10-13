/* BrickCircle profile verification + avatar module. */
(()=>{
  const getDb=()=>window.supabase;
  const style=document.createElement('style');
  style.textContent='.bc-avatar-wrap{display:flex;align-items:center;gap:16px;margin:18px 0}.bc-avatar{width:88px;height:88px;border-radius:50%;object-fit:cover;background:#fff8d9;border:1px solid #e5e7eb}.bc-avatar-empty{display:grid;place-items:center;font-size:36px}.bc-avatar-controls{display:grid;gap:7px}.bc-avatar-controls input{max-width:260px}.bc-avatar-status{font-size:13px;color:#667085}';
  document.head.appendChild(style);

  async function syncVerification(){
    const db=getDb(); if(!db?.auth) return;
    const {data:{user}}=await db.auth.getUser();
    if(!user) return;
    const verified=!!user.email_confirmed_at;
    await db.from('profiles').update({email_verified:verified,updated_at:new Date().toISOString()}).eq('id',user.id);
  }

  async function refreshProfile(){
    const db=getDb(); if(!db?.auth) return;
    const {data:{user}}=await db.auth.getUser(); if(!user) return;
    await syncVerification();
    const {data:p}=await db.from('profiles').select('*').eq('id',user.id).single();
    const profile=document.querySelector('.profile');
    if(!profile || !p) return;
    const verified=!!user.email_confirmed_at;
    const badges=profile.querySelectorAll('.pill');
    if(badges[0]){badges[0].className='pill '+(verified?'ok':'');badges[0].textContent=verified?'✓ Email verified':'Email verification pending';}
    if(!document.querySelector('#bc-avatar-editor')){
      const wrap=document.createElement('div');wrap.id='bc-avatar-editor';wrap.className='bc-avatar-wrap';
      const avatar=document.createElement('img');avatar.className='bc-avatar';avatar.alt='Profile picture';
      avatar.src=p.avatar_url?db.storage.from('avatars').getPublicUrl(p.avatar_url).data.publicUrl:'';
      if(!avatar.src) {avatar.classList.add('bc-avatar-empty');avatar.alt='🧱';}
      const controls=document.createElement('div');controls.className='bc-avatar-controls';
      controls.innerHTML='<b>Profile picture</b><input id="bc-avatar-file" type="file" accept="image/jpeg,image/png,image/webp"/><span class="bc-avatar-status">JPG, PNG or WebP · max 5 MB</span>';
      wrap.append(avatar,controls);
      profile.parentNode.insertBefore(wrap,profile.nextSibling);
      document.querySelector('#bc-avatar-file').addEventListener('change',uploadAvatar);
    }
  }

  async function uploadAvatar(e){
    const db=getDb(); const file=e.target.files?.[0]; if(!db||!file) return;
    const status=document.querySelector('.bc-avatar-status');
    if(file.size>5*1024*1024){status.textContent='Please choose an image under 5 MB.';return;}
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)){status.textContent='Please choose JPG, PNG or WebP.';return;}
    const {data:{user}}=await db.auth.getUser(); if(!user) return;
    status.textContent='Uploading…';
    const ext=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg';
    const path=`${user.id}/avatar.${ext}`;
    const {error}=await db.storage.from('avatars').upload(path,file,{contentType:file.type,upsert:true});
    if(error){status.textContent=error.message;return;}
    const {error:pe}=await db.from('profiles').update({avatar_url:path,updated_at:new Date().toISOString()}).eq('id',user.id);
    if(pe){status.textContent=pe.message;return;}
    const url=db.storage.from('avatars').getPublicUrl(path).data.publicUrl+'?v='+Date.now();
    const img=document.querySelector('.bc-avatar');if(img)img.src=url;
    status.textContent='Profile picture updated.';
  }

  function hook(){
    syncVerification();
    if(location.hash.slice(1)==='profile') refreshProfile();
  }
  window.addEventListener('hashchange',()=>setTimeout(hook,50));
  const oldRender=window.render;
  if(typeof oldRender==='function'){
    window.render=function(){oldRender();setTimeout(hook,30)};
  }
  setTimeout(hook,400);
})();