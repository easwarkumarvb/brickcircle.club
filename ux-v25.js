/* BrickCircle V2.5 UX layer — activation, navigation, empty states, accessibility. */
(()=>{
  'use strict';
  const U='https://nsxtromjdpdscknadxez.supabase.co',K='sb_publishable_JJhVbgjGblHrnKuPOsJkxQ_zRoQNlIL';
  const db=window.supabase?.createClient?window.supabase.createClient(U,K):null;
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let state={user:null,profile:null,collection:0,wishlist:0,matches:0,returns:0};
  const css=`
  :root{--bc25-ink:#111827;--bc25-gold:#f4c542;--bc25-line:#e5e7eb;--bc25-muted:#667085}
  .bc25-skip{position:fixed;left:12px;top:-60px;z-index:99999;background:#111827;color:#fff;padding:10px 14px;border-radius:10px;text-decoration:none;font-weight:800}.bc25-skip:focus{top:12px}
  .bc25-activation{max-width:1180px;margin:16px auto 0;padding:0 18px}.bc25-panel{background:#fff;border:1px solid var(--bc25-line);border-radius:20px;padding:18px 20px;box-shadow:0 10px 32px #1118270d}.bc25-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.bc25-head h2{font-size:18px;margin:0}.bc25-progress{font-size:12px;font-weight:900;color:#475467}.bc25-bar{height:8px;background:#eef2f6;border-radius:999px;overflow:hidden;margin:11px 0 14px}.bc25-bar i{display:block;height:100%;background:linear-gradient(90deg,#d6a900,#f4c542);border-radius:999px}.bc25-steps{display:grid;grid-template-columns:repeat(4,1fr);gap:9px}.bc25-step{border:1px solid var(--bc25-line);border-radius:14px;padding:12px;background:#fff;min-height:92px}.bc25-step.done{background:#f0fdf4;border-color:#bbf7d0}.bc25-step b{display:block;font-size:13px;margin-bottom:4px}.bc25-step span{font-size:12px;color:var(--bc25-muted);line-height:1.35}.bc25-step button{margin-top:9px;border:0;background:none;padding:0;color:#175cd3;font-weight:850;cursor:pointer;font-size:12px}.bc25-next{display:flex;align-items:center;justify-content:space-between;gap:15px;margin-top:14px;padding:13px 14px;background:#111827;color:#fff;border-radius:14px}.bc25-next strong{display:block}.bc25-next small{color:#cbd5e1}.bc25-next button{min-height:42px;border:0;border-radius:10px;background:#f4c542;color:#111827;padding:8px 13px;font-weight:900;cursor:pointer;white-space:nowrap}
  .bc25-empty{padding:26px!important;text-align:center!important;border:1px dashed #cfd6df!important;background:linear-gradient(180deg,#fff,#fbfcfe)!important}.bc25-empty h3{margin:0 0 7px!important;font-size:20px}.bc25-empty p{max-width:520px;margin:0 auto 14px!important;color:#667085!important;line-height:1.5}.bc25-empty button{min-height:44px;border:0;border-radius:11px;background:#111827;color:#fff;padding:10px 15px;font-weight:850;cursor:pointer}
  @media(min-width:761px){.toolbar{position:sticky;top:76px;z-index:20;background:#fff;padding:10px 0;border-bottom:1px solid #eef1f5}.bcprof-nav,.xnav{scrollbar-width:thin}}
  @media(max-width:760px){body{padding-bottom:calc(72px + env(safe-area-inset-bottom,0px))}.bc-mobilebar{grid-template-columns:repeat(5,1fr)!important}.bc-mobilebar button{font-size:10px!important}.bc-mobilebar button span{font-size:20px!important}.bc25-activation{padding:0 10px;margin-top:10px}.bc25-panel{padding:15px}.bc25-steps{grid-template-columns:1fr 1fr}.bc25-next{align-items:flex-start;flex-direction:column}.bc25-next button{width:100%;min-height:46px}.nav{box-shadow:0 2px 12px #11182712}.modalbox,.bc-field-sheet{border-radius:20px!important}.toolbar{position:sticky;top:64px;z-index:35;background:#fff;padding:10px 0!important;margin-top:0!important}.sets{gap:10px!important}.sets .card{padding:14px!important}.sets .actions{display:grid!important;grid-template-columns:1fr!important}.sets .actions button{width:100%!important;min-height:46px!important}}
  `;
  function install(){if(!document.getElementById('bc25-style')){const s=document.createElement('style');s.id='bc25-style';s.textContent=css;document.head.appendChild(s)}if(!document.querySelector('.bc25-skip')){const a=document.createElement('a');a.className='bc25-skip';a.href='#app';a.textContent='Skip to main content';document.body.prepend(a)}}
  const nav=p=>typeof window.bcNav==='function'?window.bcNav(p):(location.hash=p);
  async function refreshState(){
    if(!db)return state;
    try{
      const {data:{user}}=await db.auth.getUser();state.user=user||null;if(!user){state={user:null,profile:null,collection:0,wishlist:0,matches:0,returns:0};return state}
      const [p,c,w,r]=await Promise.all([
        db.from('profiles').select('display_name,city,country').eq('id',user.id).maybeSingle(),
        db.from('collection_items').select('id',{count:'exact',head:true}).eq('user_id',user.id),
        db.from('wishlists').select('id',{count:'exact',head:true}).eq('user_id',user.id),
        db.from('exchanges').select('id',{count:'exact',head:true}).or(`user_a.eq.${user.id},user_b.eq.${user.id}`).eq('state','swap_active')
      ]);
      state.profile=p.data||{};state.collection=c.count||0;state.wishlist=w.count||0;state.returns=r.count||0;
      try{const m=await db.rpc('find_matches',{p_user:user.id});state.matches=(m.data||[]).length}catch(_){state.matches=0}
    }catch(e){console.warn('bc25 state',e)}return state;
  }
  function activationData(){const p=state.profile||{},profile=!!(p.display_name&&p.city&&p.country),items=[
    {done:profile,title:'Complete profile',desc:'Name + home city',go:'profile'},
    {done:state.collection>0,title:'Add your first set',desc:state.collection?`${state.collection} in collection`:'Unlock matching',go:'catalogue'},
    {done:state.wishlist>0,title:'Build your wishlist',desc:state.wishlist?`${state.wishlist} wanted`:'Tell us what you want',go:'catalogue'},
    {done:state.matches>0,title:'Find a reciprocal match',desc:state.matches?`${state.matches} match${state.matches===1?'':'es'}`:'Matches appear automatically',go:'matches'}
  ];return {items,done:items.filter(x=>x.done).length}}
  function renderActivation(){
    document.querySelectorAll('.bc25-activation').forEach(x=>x.remove());
    if(!state.user||((location.hash||'#home')!=='#home'))return;
    const host=document.querySelector('#app .wrap')||document.querySelector('#app');if(!host)return;
    const d=activationData();if(d.done===4&&state.returns===0)return;
    const next=d.items.find(x=>!x.done);const box=document.createElement('section');box.className='bc25-activation';box.setAttribute('aria-label','Getting started');
    box.innerHTML=`<div class="bc25-panel"><div class="bc25-head"><h2>${d.done===4?'You’re exchange-ready':'Get exchange-ready'}</h2><div class="bc25-progress">${d.done}/4 complete</div></div><div class="bc25-bar"><i style="width:${d.done*25}%"></i></div><div class="bc25-steps">${d.items.map(x=>`<div class="bc25-step ${x.done?'done':''}"><b>${x.done?'✓ ':''}${esc(x.title)}</b><span>${esc(x.desc)}</span>${!x.done?`<button data-go="${x.go}">Do this →</button>`:''}</div>`).join('')}</div>${state.returns?`<div class="bc25-next"><div><strong>↩ ${state.returns} active return${state.returns===1?'':'s'}</strong><small>Your swap is not complete until both collectors finish the return workflow.</small></div><button data-go="returns">Open Returns</button></div>`:next?`<div class="bc25-next"><div><strong>Next best action: ${esc(next.title)}</strong><small>${esc(next.desc)}</small></div><button data-go="${next.go}">Continue</button></div>`:''}</div>`;
    host.insertBefore(box,host.firstChild);box.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>nav(b.dataset.go));
  }
  function mobileNav(){const b=document.querySelector('.bc-mobilebar');if(!b)return;const cur=(location.hash||'#home').slice(1);const items=[['home','⌂','Home'],['catalogue','🔎','Browse'],['collection','🧱','My Sets'],['matches','🔄','Matches'],['returns','↩','Returns']];b.innerHTML=items.map(([p,i,l])=>`<button data-page="${p}" class="${cur===p?'active':''}" aria-label="${l}" ${cur===p?'aria-current="page"':''}><span>${i}</span>${l}${p==='returns'&&state.returns?`<i class="bc24-return-count" style="position:absolute;margin:0;transform:translate(13px,-15px)">${state.returns}</i>`:''}</button>`).join('');b.querySelectorAll('button').forEach(x=>{x.style.position='relative';x.onclick=()=>nav(x.dataset.page)})}
  function improveEmptyStates(){
    document.querySelectorAll('.notice,.bc24-empty').forEach(el=>{
      const t=(el.textContent||'').toLowerCase();if(el.dataset.bc25)return;
      if(t.includes('collection is empty')){el.dataset.bc25='1';el.classList.add('bc25-empty');el.innerHTML='<h3>Start with one LEGO set</h3><p>Add a set you already own. That single action is what makes reciprocal matching possible.</p><button data-go="catalogue">Browse catalogue</button>'}
      else if(t.includes('wishlist is empty')){el.dataset.bc25='1';el.classList.add('bc25-empty');el.innerHTML='<h3>What would you love to build next?</h3><p>Add a few wanted sets so BrickCircle can look for collectors whose wishlist complements yours.</p><button data-go="catalogue">Build wishlist</button>'}
      else if(t.includes('no reciprocal matches')){el.dataset.bc25='1';el.classList.add('bc25-empty');el.innerHTML='<h3>No reciprocal match yet</h3><p>Matching needs both an available set in your collection and wanted sets in your wishlist. Adding 3–5 wishlist items improves your chances.</p><button data-go="catalogue">Explore more sets</button>'}
      else if(t.includes('no active returns')){el.dataset.bc25='1';el.classList.add('bc25-empty');el.innerHTML='<h3>No returns due</h3><p>When an exchange becomes active, its return date and step-by-step hand-back workflow will appear here.</p><button data-go="matches">Find matches</button>'}
    });document.querySelectorAll('.bc25-empty [data-go]').forEach(b=>b.onclick=()=>nav(b.dataset.go));
  }
  async function refresh(){install();await refreshState();renderActivation();mobileNav();improveEmptyStates()}
  let timer;const schedule=(ms=120)=>{clearTimeout(timer);timer=setTimeout(refresh,ms)};
  document.addEventListener('DOMContentLoaded',()=>{install();schedule(200);const app=document.querySelector('#app');if(app)new MutationObserver(()=>{improveEmptyStates();if(matchMedia('(max-width:760px)').matches)mobileNav()}).observe(app,{childList:true,subtree:true})});
  addEventListener('load',()=>schedule(300));addEventListener('hashchange',()=>schedule(100));addEventListener('focus',()=>schedule(80));document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule(80)});
})();
