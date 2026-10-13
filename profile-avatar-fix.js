/* BrickCircle profile avatar — stable, flicker-free implementation.
   The base V2 renderer owns #app. Do not observe #app with MutationObserver:
   doing so creates a render/mutation feedback loop. We initialize once after
   navigation and update the existing avatar element in place.
*/
(()=>{
  const SUPABASE_URL='https://nsxtromjdpdscknadxez.supabase.co';
  const SUPABASE_KEY='sb_publishable_JJhVbgjGblHrnKuPOsJkxQ_zRoQNlIL';
  const db=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
  let timer=0;
  let busy=false;

  const extFor=file=>({'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[file.type]||'jpg');
  const target=()=>document.querySelector('.profile .avatar');

  async function getUser(){
    const {data,error}=await db.auth.getUser();
    if(error) throw error;
    if(!data?.user) throw new Error('Please sign in before uploading a profile picture.');
    return data.user;
  }

  function showImage(box,url){
    if(!box||!url) return;
    let img=box.querySelector('img.bc-avatar-image');
    if(!img){
      img=document.createElement('img');
      img.className='bc-avatar-image';
      img.alt='Profile picture';
      img.style.cssText='width:68px;height:68px;border-radius:18px;object-fit:cover;display:block';
      box.textContent='';
      box.appendChild(img);
      box.style.cssText='width:68px;height:68px;border-radius:18px;overflow:hidden;background:#fff8d9;display:grid;place-items:center';
    }
    const next=url+(url.includes('?')?'&':'?')+'v='+Date.now();
    // Keep the existing image visible until the new image is loaded.
    const pre=new Image();
    pre.onload=()=>{img.src=next;};
    pre.src=next;
  }

  async function loadExisting(box){
    try{
      const u=await getUser();
      const {data:p}=await db.from('profiles').select('avatar_url').eq('id',u.id).single();
      if(!p?.avatar_url) return;
      const path=p.avatar_url.includes('/storage/v1/object/public/avatars/')
        ?p.avatar_url.split('/storage/v1/object/public/avatars/')[1].split('?')[0]
        :p.avatar_url;
      const {data}=db.storage.from('avatars').getPublicUrl(path);
      if(data?.publicUrl) showImage(box,data.publicUrl);
    }catch(e){console.warn('Avatar load:',e);}
  }

  async function upload(file,box){
    if(busy||!file) return;
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('Please choose a JPG, PNG or WebP image.');
    if(file.size>5*1024*1024) throw new Error('Profile pictures must be 5 MB or smaller.');
    busy=true;
    try{
      const u=await getUser();
      const {data:oldRow}=await db.from('profiles').select('avatar_url').eq('id',u.id).single();
      const old=oldRow?.avatar_url||null;
      const path=`${u.id}/${crypto.randomUUID()}.${extFor(file)}`;
      const {data,error}=await db.storage.from('avatars').upload(path,file,{contentType:file.type,cacheControl:'3600',upsert:false});
      if(error) throw new Error(`Storage upload failed: ${error.message}`);
      const {data:url}=db.storage.from('avatars').getPublicUrl(data.path);
      if(!url?.publicUrl) throw new Error('Storage upload succeeded but no public image URL was returned.');
      const {error:updateError}=await db.from('profiles').update({avatar_url:data.path,updated_at:new Date().toISOString()}).eq('id',u.id);
      if(updateError) throw new Error(`Profile update failed: ${updateError.message}`);
      showImage(box,url.publicUrl);
      if(old && !old.includes(data.path)){
        const oldPath=old.includes('/storage/v1/object/public/avatars/')?old.split('/storage/v1/object/public/avatars/')[1].split('?')[0]:old;
        if(oldPath.startsWith(`${u.id}/`)) await db.storage.from('avatars').remove([oldPath]);
      }
    }finally{busy=false;}
  }

  function install(){
    if(location.hash.slice(1)!=='profile') return;
    const box=target();
    if(!box||box.dataset.bcAvatarInstalled==='1') return;
    box.dataset.bcAvatarInstalled='1';

    const label=document.createElement('label');
    label.className='button primary';
    label.textContent='Change profile picture';
    label.style.cssText='cursor:pointer;display:inline-block;margin-top:8px';
    const input=document.createElement('input');
    input.type='file'; input.accept='image/jpeg,image/png,image/webp'; input.style.display='none';
    input.addEventListener('change',async e=>{
      try{await upload(e.target.files?.[0],box);}
      catch(err){console.error(err);alert(err.message||'Profile picture upload failed.');}
      finally{input.value='';}
    });
    label.appendChild(input);
    // Insert control without wrapping/reparenting the avatar. Reparenting was
    // another source of visible layout movement/flicker.
    box.insertAdjacentElement('afterend',label);
    loadExisting(box);
  }

  function schedule(delay=120){
    clearTimeout(timer);
    timer=setTimeout(()=>{timer=0;install()},delay);
  }
  window.addEventListener('hashchange',()=>schedule(120));
  window.addEventListener('load',()=>schedule(180));
  schedule(180);
})();
