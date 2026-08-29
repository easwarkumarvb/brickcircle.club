/* BrickCircle V3.1 membership policy layer: Founding 100 + Early Members through #1000. */
(()=>{
'use strict';
const URL='https://nsxtromjdpdscknadxez.supabase.co';
const KEY='sb_publishable_JJhVbgjGblHrnKuPOsJkxQ_zRoQNlIL';
const db=window.supabase?.createClient?.(URL,KEY);if(!db)return;
let status=null,scheduled=false;
const route=()=>decodeURIComponent((location.hash||'#home').slice(1).split('/')[0]||'home');
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const style=document.createElement('style');style.id='bc-membership-v31-style';style.textContent=`
.bc-membership-policy{margin-top:16px;padding:12px 14px;border:1px solid #e7d47b;background:#fff9dc;border-radius:13px;color:#5f4a00;font-size:13px;line-height:1.5}
.bc-membership-policy b{color:#342800}.bc-membership-city{margin-top:12px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:12px;line-height:1.5;color:#667085}.bc-membership-city strong{color:#111827}.bc-pill.early{background:#eaf2ff;color:#174ea6;border-color:#c8daf8}
`;document.head.appendChild(style);

async function loadStatus(){
  try{const {data,error}=await db.rpc('bc_membership_status');if(error)throw error;status=Array.isArray(data)?data[0]:data;apply()}catch(e){console.warn('Membership status unavailable',e)}
}
function scheduleApply(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;apply()})}
function policyCopy(){
  if(!status)return null;
  const f=Number(status.founding_remaining||0),e=Number(status.early_remaining||0);
  if(f>0)return {pill:`Founding 100 · ${f} spots remain · Free lifetime`,cta:'Join the Founding 100',body:`The first 100 members receive complimentary marketplace membership for life. Members #101–#1000 become Early Members and use BrickCircle free throughout beta.`};
  if(e>0)return {pill:`Early Member program · ${e} spots remain`,cta:'Join free during beta',body:`The Founding 100 is complete. Members #101–#1000 are Early Members with complimentary access throughout beta while local BrickCircles build liquidity.`};
  return {pill:'BrickCircle Beta · Local liquidity first',cta:'Join BrickCircle',body:'Membership remains free during beta. Paid membership will be introduced city-by-city only after local marketplace liquidity is strong enough to deliver real value.'};
}
function memberBadge(){
  if(!status?.my_tier)return '';
  if(status.my_tier==='founding')return `★ Founding Member #${status.my_number}`;
  if(status.my_tier==='early')return `Early Member #${status.my_number} · Free during beta`;
  return status.beta_free?'Beta Member · Free during beta':'BrickCircle Member';
}
function cityCopy(){
  if(!status?.my_city)return '';
  const ready=!!status.city_pricing_eligible,enabled=!!status.city_pricing_enabled;
  const gate=`${Number(status.city_members||0)}/${Number(status.city_min_members||0)} members · ${Number(status.city_exchangeable_sets||0)}/${Number(status.city_min_exchangeable_sets||0)} exchangeable sets · ${Number(status.city_wishlist_items||0)}/${Number(status.city_min_wishlist_items||0)} wishlist signals`;
  if(status.my_tier==='founding')return `<strong>Your membership is complimentary for life.</strong> ${esc(status.my_city)} liquidity gate: ${esc(gate)}.`;
  if(status.beta_free)return `<strong>Your membership is free during beta.</strong> ${esc(status.my_city)} liquidity gate: ${esc(gate)}. Paid launch is disabled during beta.`;
  if(!ready)return `<strong>Pricing is not ready in ${esc(status.my_city)}.</strong> ${esc(gate)}.`;
  if(!enabled)return `<strong>${esc(status.my_city)} has reached the liquidity threshold, but paid launch is still disabled.</strong> Pricing requires an explicit launch decision.`;
  return `<strong>Paid membership is enabled for ${esc(status.my_city)}.</strong>`;
}
function applyGuestHome(){
  const hero=document.querySelector('#bc-main .bc-hero');if(!hero||!status)return;
  const copy=policyCopy(),pill=hero.querySelector('.bc-pill.gold'),cta=hero.querySelector('.bc-hero-actions .bc-btn.primary[data-auth]');
  if(pill&&pill.textContent!==copy.pill)pill.textContent=copy.pill;if(cta&&cta.textContent!==copy.cta)cta.textContent=copy.cta;
  const host=hero.firstElementChild;if(host){let note=host.querySelector('.bc-membership-policy');if(!note){note=document.createElement('div');note.className='bc-membership-policy';host.appendChild(note)}const html=`<b>Membership launch policy:</b> ${esc(copy.body)}`;if(note.innerHTML!==html)note.innerHTML=html;}
}
function applyMemberHome(){
  const welcome=document.querySelector('#bc-main .bc-welcome');if(!welcome||!status)return;
  const badge=welcome.querySelector('.bc-pill.gold');const text=memberBadge();if(badge&&text&&badge.textContent!==text){badge.textContent=text;badge.classList.toggle('early',status.my_tier==='early')}
  const cards=[...document.querySelectorAll('#bc-main .bc-dash-card')];const cityCard=cards.find(c=>/BrickCircle/i.test(c.querySelector('h3')?.textContent||''));if(cityCard){let note=cityCard.querySelector('.bc-membership-city');if(!note){note=document.createElement('div');note.className='bc-membership-city';cityCard.appendChild(note)}const html=cityCopy();if(note.innerHTML!==html)note.innerHTML=html;}
}
function applyProfile(){
  const badges=document.querySelector('#bc-main .bc-profile-badges');if(!badges||!status?.my_tier)return;
  badges.querySelector('[data-membership-v31]')?.remove();
  if(status.my_tier==='early'){const s=document.createElement('span');s.className='bc-pill early';s.dataset.membershipV31='1';s.textContent=`Early Member #${status.my_number} · Free during beta`;badges.prepend(s)}
  const section=document.querySelector('#bc-main .bc-profile-hero');if(section){let note=section.querySelector('.bc-membership-city');if(!note){note=document.createElement('div');note.className='bc-membership-city';section.appendChild(note)}const html=cityCopy();if(note.innerHTML!==html)note.innerHTML=html;}
}
function apply(){if(!status)return;const r=route();if(r==='home'){if(status.my_tier)applyMemberHome();else applyGuestHome()}else if(r==='profile')applyProfile()}
async function dynamicInvite(){
  const {data:{user}}=await db.auth.getUser();if(!user)return;
  try{const {data,error}=await db.rpc('bc_my_referral_code');if(error)throw error;const code=String(data||'').trim();if(!code)throw new Error('No referral code');const url=`${location.origin}/v2.html?ref=${encodeURIComponent(code)}`;const f=Number(status?.founding_remaining||0),e=Number(status?.early_remaining||0);const text=f>0?'Join me on BrickCircle. The first 100 members receive complimentary lifetime marketplace membership; members #101–#1000 are Early Members with free access during beta.':e>0?'Join me on BrickCircle as an Early Member — free during beta while our local collector circle grows.':'Join me on BrickCircle — a local LEGO set exchange community for adult collectors.';if(navigator.share)await navigator.share({title:'Join BrickCircle',text,url});else if(navigator.clipboard){await navigator.clipboard.writeText(url);alert('BrickCircle invite link copied.')}else prompt('Copy your BrickCircle invite link',url)}catch(e){if(e?.name!=='AbortError')console.warn('Invite failed',e)}
}
document.addEventListener('click',e=>{const b=e.target.closest?.('[data-invite],[data-ready="invite"]');if(!b)return;e.preventDefault();e.stopImmediatePropagation();dynamicInvite()},true);
document.addEventListener('DOMContentLoaded',()=>{loadStatus();const root=document.getElementById('bc-root');if(root)new MutationObserver(scheduleApply).observe(root,{childList:true,subtree:true})});
window.addEventListener('hashchange',()=>{loadStatus()});window.addEventListener('focus',()=>loadStatus());db.auth.onAuthStateChange(()=>setTimeout(loadStatus,80));setTimeout(loadStatus,250);
})();
