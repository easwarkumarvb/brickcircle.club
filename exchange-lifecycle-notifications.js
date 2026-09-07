(()=>{
'use strict';
const db=window.BC_SUPABASE;
if(!db)return;
const KINDS=new Set(['exchange_accepted','exchange_declined','exchange_cancelled','exchange_created']);
let user=null,channel=null,activeId='';
const seenKey=id=>`bc_exchange_lifecycle_seen:${user?.id||'anon'}:${id}`;
const seen=id=>{try{return sessionStorage.getItem(seenKey(id))==='1'}catch(_){return false}};
const remember=id=>{try{sessionStorage.setItem(seenKey(id),'1')}catch(_){}};
function esc(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function eligible(row){return !!row&&!row.read_at&&KINDS.has(row.kind)}
async function markRead(row){
  if(!user?.id||!row?.id||row.read_at)return;
  const readAt=new Date().toISOString();
  await db.from('notifications').update({read_at:readAt}).eq('id',row.id).eq('user_id',user.id);
}
function remove(){document.getElementById('bc-exchange-lifecycle-notice')?.remove();activeId=''}
function show(row){
  if(!eligible(row)||seen(row.id)||activeId===row.id)return false;
  remember(row.id);remove();activeId=row.id;
  const root=document.createElement('div');root.id='bc-exchange-lifecycle-notice';root.setAttribute('role','dialog');root.setAttribute('aria-modal','false');
  root.style.cssText='position:fixed;z-index:10030;right:16px;top:82px;width:min(420px,calc(100vw - 32px));background:#fff;border:1px solid #e5e7eb;border-radius:16px;box-shadow:0 20px 60px rgba(17,24,39,.25);padding:18px;font-family:system-ui;color:#111827';
  const label=row.kind==='exchange_accepted'?'Exchange accepted':row.kind==='exchange_declined'?'Proposal declined':row.kind==='exchange_cancelled'?'Proposal cancelled':'Exchange created';
  root.innerHTML=`<div style="font-size:12px;font-weight:800;letter-spacing:.06em;color:#7c3aed;text-transform:uppercase">${esc(label)}</div><h2 style="font-size:19px;margin:6px 0 6px">${esc(row.title||label)}</h2><p style="margin:0;color:#4b5563;line-height:1.45">${esc(row.body||'Your BrickCircle exchange has been updated.')}</p><div style="display:flex;justify-content:flex-end;gap:8px;margin-top:15px"><button type="button" data-life-later style="border:1px solid #d1d5db;background:#fff;border-radius:9px;padding:9px 12px;font-weight:650">Not now</button><button type="button" data-life-open style="border:1px solid #111827;background:#111827;color:#fff;border-radius:9px;padding:9px 12px;font-weight:650">Open exchanges</button></div>`;
  document.body.appendChild(root);
  root.querySelector('[data-life-later]').onclick=remove;
  root.querySelector('[data-life-open]').onclick=async()=>{await markRead(row);remove();location.hash='#exchanges'};
  return true;
}
async function showUnread(){
  if(!user?.id)return;
  const {data}=await db.from('notifications').select('id,user_id,kind,title,body,read_at,created_at').eq('user_id',user.id).is('read_at',null).in('kind',[...KINDS]).order('created_at',{ascending:false}).limit(10);
  const row=(data||[]).find(item=>eligible(item)&&!seen(item.id));if(row)show(row);
}
function stop(){if(channel){try{db.removeChannel?.(channel)}catch(_){try{channel.unsubscribe?.()}catch(__){}}channel=null}remove()}
function start(){
  stop();if(!user?.id||typeof db.channel!=='function')return;
  const uid=user.id;
  channel=db.channel(`exchange-lifecycle:${uid}`).on('postgres_changes',{event:'INSERT',schema:'public',table:'notifications',filter:`user_id=eq.${uid}`},payload=>{if(eligible(payload?.new))show(payload.new)}).subscribe(status=>{if(status==='SUBSCRIBED')showUnread().catch(()=>{})});
}
async function sync(){const {data}=await db.auth.getUser();user=data?.user||null;if(user)start();else stop()}
db.auth.onAuthStateChange((_event,session)=>{user=session?.user||null;if(user)start();else stop()});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>sync().catch(()=>{}),{once:true});else sync().catch(()=>{});
})();
