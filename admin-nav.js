(()=>{
'use strict';
const OWNER_USER_ID='388ee0a7-2b93-4505-a70c-f4766d7ad50a';
const STYLE_ID='bc-owner-admin-nav-style';
let currentUserId='';
let observer=null;

function ensureStyle(){
  if(document.getElementById(STYLE_ID))return;
  const s=document.createElement('style');s.id=STYLE_ID;s.textContent='.bc-owner-admin-link{display:inline-flex;align-items:center;justify-content:center;min-height:38px;padding:8px 11px;border:1px solid #d1d5db;border-radius:10px;background:#fff;color:#111827;text-decoration:none;font:600 13px/1 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;white-space:nowrap}.bc-owner-admin-link:hover{background:#f9fafb}.bc-owner-admin-link:focus-visible{outline:3px solid rgba(59,130,246,.35);outline-offset:2px}@media(max-width:720px){.bc-owner-admin-link{min-height:36px;padding:7px 9px;font-size:12px}}';document.head.appendChild(s)
}
function syncLink(){
  const existing=[...document.querySelectorAll('.bc-owner-admin-link')];
  if(currentUserId!==OWNER_USER_ID){existing.forEach(el=>el.remove());return}
  const actions=document.querySelector('.bc-top-actions');
  if(!actions)return;
  const inCurrentActions=existing.find(el=>el.parentElement===actions);
  existing.filter(el=>el!==inCurrentActions).forEach(el=>el.remove());
  if(inCurrentActions)return;
  ensureStyle();
  const a=document.createElement('a');a.className='bc-owner-admin-link';a.href='/admin.html';a.textContent='Admin';a.setAttribute('aria-label','Open BrickCircle admin dashboard');
  const avatar=actions.querySelector('.bc-avatar-btn');
  if(avatar)actions.insertBefore(a,avatar);else actions.appendChild(a);
}
async function resolveUser(){
  const db=window.BC_SUPABASE;
  if(!db)return;
  try{const {data:{user}}=await db.auth.getUser();currentUserId=user?.id||''}catch(_){currentUserId=''}
  syncLink();
}
function watchDom(){
  if(observer)return;
  observer=new MutationObserver(()=>syncLink());
  observer.observe(document.documentElement,{childList:true,subtree:true});
}
function init(){
  const db=window.BC_SUPABASE;
  if(!db){setTimeout(init,50);return}
  resolveUser();watchDom();
  db.auth.onAuthStateChange((_event,session)=>{currentUserId=session?.user?.id||'';syncLink()});
}
init();
})();