(()=>{
'use strict';
const STYLE_ID='bc-login-match-notice-style';
const STORAGE_PREFIX='bc_login_match_notice_seen:';
let timer=null;

function injectStyle(){
  if(document.getElementById(STYLE_ID))return;
  const s=document.createElement('style');
  s.id=STYLE_ID;
  s.textContent='.bc-match-login-notice{position:fixed;left:50%;top:82px;transform:translateX(-50%);z-index:9999;width:min(92vw,560px);background:#fff;border:1px solid #e5e7eb;border-radius:16px;box-shadow:0 18px 50px rgba(17,24,39,.18);padding:16px}.bc-match-login-notice h2{margin:0 0 6px;font:700 18px/1.25 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#111827}.bc-match-login-notice p{margin:0;color:#4b5563;font:14px/1.5 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.bc-match-login-actions{display:flex;gap:8px;margin-top:14px;flex-wrap:wrap}.bc-match-login-actions button{border-radius:10px;padding:9px 12px;font:600 13px/1 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;cursor:pointer}.bc-match-login-primary{border:1px solid #111827;background:#111827;color:#fff}.bc-match-login-secondary{border:1px solid #d1d5db;background:#fff;color:#111827}@media(max-width:640px){.bc-match-login-notice{top:68px;width:calc(100vw - 24px)}}';
  document.head.appendChild(s);
}
function esc(x){return String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function dismiss(){document.querySelector('.bc-match-login-notice')?.remove()}
function seenKey(userId){return STORAGE_PREFIX+userId}
function hasSeen(userId){try{return sessionStorage.getItem(seenKey(userId))==='1'}catch(_){return false}}
function markSeen(userId){try{sessionStorage.setItem(seenKey(userId),'1')}catch(_){}}
function clearSeen(userId){try{sessionStorage.removeItem(seenKey(userId))}catch(_){}}

async function memberName(db,userId){
  if(!userId)return 'a nearby member';
  try{
    const {data}=await db.from('public_profiles').select('display_name').eq('id',userId).maybeSingle();
    return data?.display_name||'a nearby member';
  }catch(_){return 'a nearby member'}
}
function show(userId,match,count,name){
  dismiss();injectStyle();
  const offered=match?.offered_name||match?.offered_set||'your set';
  const requested=match?.requested_name||match?.requested_set||'a set you want';
  const more=count>1?` You have ${count} local reciprocal matches in total.`:'';
  const n=document.createElement('section');
  n.className='bc-match-login-notice';
  n.setAttribute('role','status');
  n.setAttribute('aria-live','polite');
  n.innerHTML=`<h2>New local match found</h2><p><b>${esc(name)}</b> has <b>${esc(requested)}</b> available and wants <b>${esc(offered)}</b>.${esc(more)}</p><div class="bc-match-login-actions"><button class="bc-match-login-primary" type="button" data-view-match>View matches</button><button class="bc-match-login-secondary" type="button" data-dismiss-match>Not now</button></div>`;
  document.body.appendChild(n);
  markSeen(userId);
  n.querySelector('[data-view-match]').onclick=()=>{dismiss();location.hash='#matches'};
  n.querySelector('[data-dismiss-match]').onclick=dismiss;
}
async function check(user){
  if(!user?.id||hasSeen(user.id))return;
  const db=window.BC_SUPABASE;
  if(!db)return;
  try{
    const {data,error}=await db.rpc('find_matches',{p_user:user.id});
    if(error||!Array.isArray(data)||data.length===0)return;
    const first=data[0];
    const name=await memberName(db,first.match_user);
    show(user.id,first,data.length,name);
  }catch(_){ }
}
function schedule(user,delay=650){
  clearTimeout(timer);
  timer=setTimeout(()=>check(user),delay);
}
async function init(){
  const db=window.BC_SUPABASE;
  if(!db){setTimeout(init,50);return}
  try{const {data:{user}}=await db.auth.getUser();if(user)schedule(user,900)}catch(_){ }
  db.auth.onAuthStateChange((event,session)=>{
    const user=session?.user;
    if(event==='SIGNED_OUT'){dismiss();if(user?.id)clearSeen(user.id);return}
    if((event==='SIGNED_IN'||event==='INITIAL_SESSION')&&user)schedule(user,event==='SIGNED_IN'?500:900);
  });
}
init();
})();
