/* BrickCircle Founding 100 + marketplace liquidity UX */
(()=>{
  const U='https://nsxtromjdpdscknadxez.supabase.co';
  const K='sb_publishable_JJhVbgjGblHrnKuPOsJkxQ_zRoQNlIL';
  const db=window.supabase?.createClient?window.supabase.createClient(U,K):null;
  if(!db)return;
  let state={founder:null,liquidity:null,session:null};
  let loading=false;

  const css=`
  .bc-f100{max-width:1240px;margin:22px auto 0;padding:0 20px;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
  .bc-f100in{background:linear-gradient(135deg,#111827,#24344f);color:#fff;border-radius:22px;padding:26px;box-shadow:0 16px 40px #11182722;display:grid;grid-template-columns:1fr auto;gap:22px;align-items:center}
  .bc-f100-kicker{color:#f4c542;font-size:12px;font-weight:950;letter-spacing:.12em;text-transform:uppercase}.bc-f100 h3{font-size:27px;line-height:1.1;margin:6px 0 8px;letter-spacing:-.03em}.bc-f100 p{margin:0;color:#d5dbe6;line-height:1.5;font-size:14px}.bc-f100 strong{color:#fff}
  .bc-f100-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.bc-f100 button{min-height:44px;border-radius:12px;border:1px solid #ffffff38;background:#fff;color:#111827;padding:10px 14px;font-weight:850;cursor:pointer}.bc-f100 button.secondary{background:transparent;color:#fff}
  .bc-f100-meter{height:8px;background:#ffffff24;border-radius:999px;overflow:hidden;margin:14px 0 7px}.bc-f100-meter span{display:block;height:100%;background:#f4c542;border-radius:999px}.bc-f100-small{font-size:12px!important;color:#aeb8ca!important}
  .bc-founder-badge{display:inline-flex;align-items:center;gap:6px;background:#fff3b8;color:#6f5000;border:1px solid #efd36a;border-radius:999px;padding:6px 10px;font-size:12px;font-weight:900;margin-top:9px}
  .bc-liquidity{max-width:1240px;margin:18px auto 0;padding:0 20px;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}.bc-liquidity-in{border:1px solid #e5e7eb;border-radius:20px;padding:22px;background:#fff}.bc-liquidity-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}.bc-liquidity h3{margin:0 0 4px;font-size:21px;color:#111827}.bc-liquidity p{margin:0;color:#667085;font-size:13px;line-height:1.45}.bc-liquidity-score{font-weight:950;color:#111827;white-space:nowrap}.bc-liquidity-progress{height:9px;background:#eef0f3;border-radius:999px;overflow:hidden;margin:14px 0}.bc-liquidity-progress span{height:100%;display:block;background:#111827;border-radius:999px}.bc-liquidity-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px}.bc-liquidity-stat{background:#f8fafc;border-radius:12px;padding:11px}.bc-liquidity-stat b{display:block;font-size:18px;color:#111827}.bc-liquidity-stat span{font-size:11px;color:#667085}.bc-liquidity-next{display:flex;align-items:center;justify-content:space-between;gap:12px;background:#fff9df;border:1px solid #f0df93;border-radius:13px;padding:12px}.bc-liquidity-next b{font-size:13px;color:#111827}.bc-liquidity-next button{min-height:40px;border:0;border-radius:10px;background:#111827;color:#fff;padding:8px 12px;font-weight:850}
  .bc-f100-toast{position:fixed;z-index:100002;left:50%;bottom:max(92px,calc(14px + env(safe-area-inset-bottom)));transform:translateX(-50%);background:#111827;color:#fff;border-radius:999px;padding:9px 14px;font:750 12px/1.2 system-ui;box-shadow:0 10px 30px #0004;white-space:nowrap}
  @media(max-width:700px){.bc-f100,.bc-liquidity{padding:0 10px}.bc-f100in{grid-template-columns:1fr;padding:20px}.bc-f100 h3{font-size:23px}.bc-f100-actions{justify-content:flex-start}.bc-f100-actions button{flex:1}.bc-liquidity-in{padding:17px}.bc-liquidity-stats{grid-template-columns:repeat(3,1fr)}.bc-liquidity-stat{padding:9px 7px}.bc-liquidity-stat b{font-size:16px}.bc-liquidity-next{align-items:flex-start;flex-direction:column}.bc-liquidity-next button{width:100%}}
  `;
  const s=document.createElement('style');s.id='bc-founding-100-style';s.textContent=css;document.head.appendChild(s);

  const currentPage=()=>((location.hash||'#home').slice(1)||'home').split('?')[0];
  const nav=p=>{if(typeof window.bcNav==='function')window.bcNav(p);else location.hash=p;};
  function toast(msg){document.querySelector('.bc-f100-toast')?.remove();const e=document.createElement('div');e.className='bc-f100-toast';e.textContent=msg;document.body.appendChild(e);setTimeout(()=>e.remove(),2600);}
  function scheduleRender(){[40,180,500,1100].forEach(ms=>setTimeout(render,ms));}

  async function load(){
    if(loading)return;loading=true;
    try{
      const [{data:fd},{data:sd}]=await Promise.all([db.rpc('bc_founder_status'),db.auth.getSession()]);
      state.founder=Array.isArray(fd)?fd[0]:fd;
      state.session=sd?.session||null;
      state.liquidity=null;
      if(state.session){const {data:ld}=await db.rpc('bc_liquidity_status');state.liquidity=Array.isArray(ld)?ld[0]:ld;}
    }catch(err){console.warn('Founding 100 status unavailable',err);}finally{loading=false;scheduleRender();}
  }

  function founderCopy(){
    const f=state.founder;if(!f)return null;
    const claimed=Number(f.founding_slots_claimed||0),remaining=Math.max(0,Number(f.founding_slots_remaining||0));
    if(f.my_is_founder&&f.my_number)return {title:`You’re Founding Member #${f.my_number}`,body:'Your BrickCircle marketplace membership is complimentary as a Founding Member. Help build liquidity by adding sets, wishlisting sets and inviting collectors in your city.',remaining,claimed};
    if(remaining>0)return {title:`${remaining} Founding 100 spots remain`,body:'The first 100 BrickCircle members receive complimentary marketplace membership. Join now, build your collection and help your city reach exchange-ready liquidity.',remaining,claimed};
    return {title:'The Founding 100 is complete',body:'BrickCircle’s first 100 collectors helped seed the marketplace. New membership pricing will be introduced separately before any charge applies.',remaining:0,claimed:100};
  }

  function renderFounder(){
    const copy=founderCopy();if(!copy)return;
    const home=currentPage()==='home';
    if(!home){document.querySelector('.bc-f100')?.remove();return;}
    const host=document.querySelector('#app .bc23')||document.querySelector('#app');if(!host)return;
    let el=host.querySelector('.bc-f100');if(!el){el=document.createElement('section');el.className='bc-f100';const first=host.firstElementChild;first?.after?first.after(el):host.prepend(el);}
    const progress=Math.min(100,Math.round(copy.claimed));
    const sig=[copy.title,copy.claimed,!!state.session].join('|');if(el.dataset.sig===sig)return;el.dataset.sig=sig;
    el.innerHTML=`<div class="bc-f100in"><div><div class="bc-f100-kicker">Founding 100</div><h3>${copy.title}</h3><p>${copy.body}</p><div class="bc-f100-meter"><span style="width:${progress}%"></span></div><p class="bc-f100-small">${copy.claimed} of 100 founding memberships claimed</p></div><div class="bc-f100-actions">${state.session?'<button type="button" data-f100-invite>Invite an AFOL</button>':'<button type="button" data-f100-join>Join free</button>'}<button type="button" class="secondary" data-f100-collection>${state.session?'Build collection':'How it works'}</button></div></div>`;
    el.querySelector('[data-f100-join]')?.addEventListener('click',()=>window.bcAuth?.());
    el.querySelector('[data-f100-collection]')?.addEventListener('click',()=>{if(state.session)nav('collection');else document.querySelector('.bc23-section')?.scrollIntoView({behavior:'smooth'});});
    el.querySelector('[data-f100-invite]')?.addEventListener('click',shareInvite);
  }

  function nextAction(l){
    if(!l)return null;
    if(!l.city||!l.country)return {label:'Add your city',page:'profile'};
    if(Number(l.collection_count)<3)return {label:`Add ${3-Number(l.collection_count)} more set${3-Number(l.collection_count)===1?'':'s'}`,page:'collection'};
    if(Number(l.exchangeable_count)<2)return {label:'Mark 2 sets exchangeable',page:'collection'};
    if(Number(l.wishlist_count)<3)return {label:`Add ${3-Number(l.wishlist_count)} wishlist set${3-Number(l.wishlist_count)===1?'':'s'}`,page:'wishlist'};
    if(Number(l.referral_claims)<1)return {label:'Invite one local collector',invite:true};
    return {label:'Check your matches',page:'matches'};
  }

  function renderLiquidity(){
    const home=currentPage()==='home';
    if(!home||!state.session||!state.liquidity){document.querySelector('.bc-liquidity')?.remove();return;}
    const host=document.querySelector('#app .bc23')||document.querySelector('#app');if(!host)return;
    let el=host.querySelector('.bc-liquidity');if(!el){el=document.createElement('section');el.className='bc-liquidity';const founder=host.querySelector('.bc-f100');founder?.after?founder.after(el):host.prepend(el);}
    const l=state.liquidity,score=Math.max(0,Math.min(100,Number(l.liquidity_readiness||0))),next=nextAction(l),place=l.city?`${l.city}${l.country?`, ${l.country}`:''}`:'Your city';
    const sig=[score,l.city_members,l.city_exchangeable_sets,l.city_wishlist_items,next.label].join('|');if(el.dataset.sig===sig)return;el.dataset.sig=sig;
    el.innerHTML=`<div class="bc-liquidity-in"><div class="bc-liquidity-head"><div><h3>Make ${place} exchange-ready</h3><p>Marketplace liquidity improves when members add exchangeable sets, wishlists and nearby collectors.</p></div><div class="bc-liquidity-score">${score}% ready</div></div><div class="bc-liquidity-progress"><span style="width:${score}%"></span></div><div class="bc-liquidity-stats"><div class="bc-liquidity-stat"><b>${Number(l.city_members||0)}</b><span>local members</span></div><div class="bc-liquidity-stat"><b>${Number(l.city_exchangeable_sets||0)}</b><span>exchangeable sets</span></div><div class="bc-liquidity-stat"><b>${Number(l.city_wishlist_items||0)}</b><span>wishlist signals</span></div></div><div class="bc-liquidity-next"><b>Best next step: ${next.label}</b><button type="button" data-liquidity-next>${next.invite?'Invite collector':'Do this now'}</button></div></div>`;
    el.querySelector('[data-liquidity-next]')?.addEventListener('click',()=>next.invite?shareInvite():nav(next.page));
  }

  function renderBadge(){
    if(!state.founder?.my_is_founder||!state.founder?.my_number){document.querySelector('.bc-founder-badge')?.remove();return;}
    const hero=document.querySelector('.bcprof-hero');if(!hero)return;
    const text=`★ Founding Member #${state.founder.my_number}`;
    let badge=hero.querySelector('.bc-founder-badge');if(!badge){badge=document.createElement('div');badge.className='bc-founder-badge';hero.appendChild(badge);}if(badge.textContent!==text)badge.textContent=text;
  }

  async function shareInvite(){
    if(!state.session){window.bcAuth?.();return;}
    try{
      const {data,error}=await db.rpc('bc_my_referral_code');if(error)throw error;
      const code=String(data||'').trim();if(!code)throw new Error('No referral code');
      const url=`${location.origin}/v2.html?ref=${encodeURIComponent(code)}`;
      const text='Join me on BrickCircle — a local LEGO set exchange community. The first 100 members receive complimentary marketplace membership.';
      if(navigator.share){await navigator.share({title:'Join BrickCircle',text,url});}
      else if(navigator.clipboard){await navigator.clipboard.writeText(url);toast('Invite link copied');}
      else{prompt('Copy your BrickCircle invite link',url);}
      try{window.bcProductAnalytics?.track?.('founding_100_invite_shared',{code});}catch(_){ }
    }catch(err){if(err?.name!=='AbortError'){console.warn(err);toast('Could not create invite link');}}
  }

  function render(){renderFounder();renderLiquidity();renderBadge();}
  document.addEventListener('DOMContentLoaded',load);
  window.addEventListener('load',()=>setTimeout(load,350));
  window.addEventListener('hashchange',scheduleRender);
  db.auth.onAuthStateChange(()=>setTimeout(load,100));
})();
