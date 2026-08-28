/* BrickCircle V2.9 — robust sign-out and account switching. */
(()=>{'use strict';
const URL='https://nsxtromjdpdscknadxez.supabase.co',KEY='sb_publishable_JJhVbgjGblHrnKuPOsJkxQ_zRoQNlIL';
const db=window.supabase?.createClient(URL,KEY);if(!db)return;
let signingOut=false;
function clearBrickCircleSessionHints(){
  try{
    Object.keys(localStorage).filter(k=>/^bc_(?!pending_referral)/.test(k)).forEach(k=>localStorage.removeItem(k));
    Object.keys(sessionStorage).filter(k=>/^bc_/.test(k)).forEach(k=>sessionStorage.removeItem(k));
  }catch(_){ }
}
async function robustSignOut(){
  if(signingOut)return;signingOut=true;
  const btns=[...document.querySelectorAll('[data-bc-signout]')];btns.forEach(b=>{b.disabled=true;b.textContent='Signing out…'});
  try{
    const {error}=await db.auth.signOut({scope:'local'});
    if(error)throw error;
  }catch(err){
    console.warn('BrickCircle sign-out retry',err);
    try{await db.auth.signOut()}catch(_){ }
  }
  clearBrickCircleSessionHints();
  try{await caches.delete('brickcircle-catalogue-v1')}catch(_){ }
  history.replaceState({},'',location.pathname+'#home');
  location.reload();
}
function addSignOutButton(){
  const nav=document.querySelector('#authnav');if(!nav)return;
  const hasUser=!!nav.querySelector('button')&&!/sign in/i.test(nav.textContent||'');
  if(!hasUser||nav.querySelector('[data-bc-signout]'))return;
  const b=document.createElement('button');b.type='button';b.dataset.bcSignout='1';b.textContent='Sign out';b.title='Sign out and use a different BrickCircle account';b.style.marginLeft='8px';b.onclick=robustSignOut;nav.appendChild(b);
}
window.signOut=robustSignOut;
window.bcSignOut=robustSignOut;
const nav=document.querySelector('#authnav');if(nav)new MutationObserver(addSignOutButton).observe(nav,{childList:true,subtree:true});
db.auth.onAuthStateChange((event)=>{if(event==='SIGNED_IN')setTimeout(addSignOutButton,0);if(event==='SIGNED_OUT')clearBrickCircleSessionHints()});
[0,100,500,1200].forEach(ms=>setTimeout(addSignOutButton,ms));
})();