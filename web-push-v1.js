(()=>{
'use strict';
const DISMISS_PREFIX='bc_push_prompt_dismissed:';
const STYLE_ID='bc-web-push-style';
let promptedUser='';

function supported(){return 'serviceWorker'in navigator&&'PushManager'in window&&'Notification'in window}
function dismissed(userId){try{return Number(localStorage.getItem(DISMISS_PREFIX+userId)||0)>Date.now()-30*864e5}catch(_){return false}}
function rememberDismissal(userId){try{localStorage.setItem(DISMISS_PREFIX+userId,String(Date.now()))}catch(_){} }
function bytes(value){const padding='='.repeat((4-value.length%4)%4),base64=(value+padding).replace(/-/g,'+').replace(/_/g,'/'),raw=atob(base64);return Uint8Array.from(raw,char=>char.charCodeAt(0))}
function injectStyle(){
  if(document.getElementById(STYLE_ID))return;
  const style=document.createElement('style');style.id=STYLE_ID;
  style.textContent='.bc-push-prompt{position:fixed;inset:0;z-index:10020;background:rgba(17,24,39,.54);display:grid;place-items:center;padding:20px}.bc-push-card{width:min(100%,460px);background:#fff;border:1px solid #e5e7eb;border-radius:18px;box-shadow:0 24px 70px rgba(17,24,39,.24);padding:22px}.bc-push-card h2{margin:0 0 8px;font:750 21px/1.25 system-ui;color:#111827}.bc-push-card p{margin:0;color:#4b5563;font:15px/1.5 system-ui}.bc-push-actions{display:flex;justify-content:flex-end;gap:9px;margin-top:18px;flex-wrap:wrap}.bc-push-actions button{border-radius:10px;padding:10px 14px;font:650 14px/1 system-ui;cursor:pointer}.bc-push-later{border:1px solid #d1d5db;background:#fff;color:#111827}.bc-push-enable{border:1px solid #111827;background:#111827;color:#fff}.bc-push-enable:disabled{opacity:.6;cursor:wait}@media(max-width:520px){.bc-push-prompt{align-items:end;padding:12px}.bc-push-card{border-radius:18px 18px 14px 14px;padding:20px}.bc-push-actions button{min-height:44px;flex:1}}';
  document.head.appendChild(style);
}
function close(){document.querySelector('.bc-push-prompt')?.remove()}
async function registration(){
  const existing=await navigator.serviceWorker.getRegistration('/');if(existing)return existing;
  return Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(new Error('The BrickCircle service worker is not ready.')),8000))]);
}
async function save(user,subscription){
  const json=subscription.toJSON();
  if(!json.endpoint||!json.keys?.p256dh||!json.keys?.auth)throw new Error('Push subscription is incomplete.');
  const {error}=await window.BC_SUPABASE.from('push_subscriptions').upsert({
    user_id:user.id,endpoint:json.endpoint,p256dh:json.keys.p256dh,auth:json.keys.auth,
    user_agent:String(navigator.userAgent||'').slice(0,1000),updated_at:new Date().toISOString(),disabled_at:null
  },{onConflict:'endpoint'});
  if(error)throw error;
}
async function enable(user,button){
  if(!supported())throw new Error('Web Push is not supported in this browser.');
  const publicKey=window.BC_WEB_PUSH_CONFIG?.vapidPublicKey;
  if(!publicKey)throw new Error('Push notifications are not configured.');
  button.disabled=true;button.textContent='Enabling…';
  try{
    const permission=Notification.permission==='granted'?'granted':await Notification.requestPermission();
    if(permission!=='granted'){rememberDismissal(user.id);throw new Error(permission==='denied'?'Notifications are blocked in your browser settings.':'Notification permission was not granted.');}
    const worker=await registration();
    let subscription=await worker.pushManager.getSubscription();
    if(!subscription)subscription=await worker.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes(publicKey)});
    await save(user,subscription);close();window.bcPushToast?.('Notifications enabled for new matches and proposals.');return true;
  }finally{button.disabled=false;button.textContent='Enable notifications'}
}
function open(user,{automatic=false}={}){
  if(!user?.id||!supported())return false;
  if(automatic&&(Notification.permission==='denied'||dismissed(user.id)))return false;
  close();injectStyle();
  const root=document.createElement('div');root.className='bc-push-prompt';root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-labelledby','bc-push-title');
  root.innerHTML='<div class="bc-push-card"><h2 id="bc-push-title">Never miss a BrickCircle match</h2><p>Get notified when a local match or exchange proposal arrives—even when BrickCircle is closed.</p><div class="bc-push-actions"><button class="bc-push-later" type="button" data-push-later>Not now</button><button class="bc-push-enable" type="button" data-push-enable>Enable notifications</button></div></div>';
  document.body.appendChild(root);
  root.querySelector('[data-push-later]').onclick=()=>{rememberDismissal(user.id);close()};
  const button=root.querySelector('[data-push-enable]');button.onclick=()=>enable(user,button).catch(error=>window.bcPushToast?.(error?.message||'Could not enable notifications.'));
  return true;
}
function consider(user,{meaningful=false}={}){
  if(!user?.id||!meaningful||promptedUser===user.id||!supported()||Notification.permission!=='default')return;
  promptedUser=user.id;
  setTimeout(()=>{if(!document.querySelector('.bc-modal-overlay,.bc-drawer-overlay,.bc-match-login-notice'))open(user,{automatic:true})},1800);
}
async function signOut(user){
  if(!user?.id||!supported())return;
  try{
    const worker=await navigator.serviceWorker.getRegistration('/'),subscription=await worker?.pushManager.getSubscription();
    if(worker&&subscription){
      await window.BC_SUPABASE.from('push_subscriptions').delete().eq('user_id',user.id).eq('endpoint',subscription.endpoint);
      await subscription.unsubscribe();
    }
  }catch(_){ }
  promptedUser='';close();
}
window.bcWebPush={consider,open,signOut,supported};
})();
