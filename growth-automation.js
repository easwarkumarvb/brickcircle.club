/* BrickCircle Growth Automation V1: member nudges, notification center and referrals. */
(()=>{
  const URL='https://nsxtromjdpdscknadxez.supabase.co';
  const KEY='sb_publishable_JJhVbgjGblHrnKuPOsJkxQ_zRoQNlIL';
  const db=window.supabase?.createClient(URL,KEY);
  if(!db) return;

  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const style=document.createElement('style');
  style.textContent=`
    .bc-growth-badge{display:inline-grid;place-items:center;min-width:20px;height:20px;padding:0 6px;border-radius:999px;background:#dc2626;color:#fff;font-size:11px;font-weight:900;margin-left:5px}
    .bc-growth-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:14px 0 20px}.bc-growth-kpi{background:#fff;border:1px solid #e5e7eb;border-radius:15px;padding:17px}.bc-growth-kpi b{display:block;font-size:28px;margin-top:5px}
    .bc-growth-progress{height:12px;background:#eef2f7;border-radius:999px;overflow:hidden}.bc-growth-progress>span{display:block;height:100%;background:#111827;border-radius:999px}
    .bc-growth-note{background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:15px;margin:10px 0}.bc-growth-note.unread{border-left:4px solid #dc2626}.bc-growth-note h3{margin:0 0 5px}.bc-growth-note p{margin:0;color:#667085}.bc-growth-note .actions{margin-top:10px}
    .bc-ref{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.bc-ref input{flex:1;min-width:220px;padding:10px;border:1px solid #d9dee7;border-radius:9px}
    @media(max-width:800px){.bc-growth-grid{grid-template-columns:1fr 1fr}}`;
  document.head.appendChild(style);

  let snapshot=null;
  async function getUser(){const {data:{user}}=await db.auth.getUser();return user||null}
  async function getSnapshot(){const {data,error}=await db.rpc('bc_member_growth_snapshot');if(error) throw error;snapshot=data?.[0]||{collection_count:0,available_count:0,wishlist_count:0,unread_count:0,referral_code:null};return snapshot}
  async function getNotes(){const {data,error}=await db.from('member_notifications').select('*').order('created_at',{ascending:false}).limit(30);if(error) throw error;return data||[]}
  const completeness=s=>Math.min(100,(s.collection_count>0?30:0)+(s.available_count>0?30:0)+(s.wishlist_count>0?40:0));

  function injectTab(){
    const tabs=document.querySelector('.tabs');
    if(!tabs||tabs.querySelector('[data-bc-growth]')) return;
    const b=document.createElement('button');b.dataset.bcGrowth='1';b.textContent='Growth';b.onclick=()=>window.bcGrowthOpen();tabs.appendChild(b);
    refreshBadge();
  }
  async function refreshBadge(){try{const user=await getUser();if(!user)return;const s=await getSnapshot();document.querySelectorAll('[data-bc-growth]').forEach(b=>{b.innerHTML=`Growth${Number(s.unread_count)>0?` <span class="bc-growth-badge">${Number(s.unread_count)}</span>`:''}`})}catch(_){}}

  window.bcGrowthRead=async(id,hash)=>{await db.from('member_notifications').update({read_at:new Date().toISOString()}).eq('id',id);if(hash){location.hash=hash;setTimeout(()=>window.bcNav?.(hash.replace('#','')),20)}else window.bcGrowthOpen()};
  window.bcGrowthReadAll=async()=>{const user=await getUser();if(!user)return;await db.from('member_notifications').update({read_at:new Date().toISOString()}).eq('user_id',user.id).is('read_at',null);window.bcGrowthOpen()};
  window.bcCopyReferral=async()=>{const el=document.querySelector('#bc-ref-link');if(!el)return;try{await navigator.clipboard.writeText(el.value);alert('Referral link copied.')}catch(_){el.select();document.execCommand('copy');alert('Referral link copied.')}};

  window.bcGrowthOpen=async()=>{
    const user=await getUser();if(!user){window.bcAuth?.();return}
    location.hash='growth';
    const app=document.querySelector('#app');if(!app)return;
    app.innerHTML='<div class="wrap"><div class="card"><h2>Growth & notifications</h2><p class="muted">Loading your BrickCircle growth loop…</p></div></div>';
    try{
      const [s,notes]=await Promise.all([getSnapshot(),getNotes()]);
      const pct=completeness(s),code=s.referral_code||'',ref=`${location.origin}/?ref=${encodeURIComponent(code)}`;
      app.innerHTML=`<div class="wrap"><div class="tabs"><button onclick="bcNav('home')">Home</button><button onclick="bcNav('catalogue')">Catalogue</button><button onclick="bcNav('collection')">My collection</button><button onclick="bcNav('wishlist')">Wishlist</button><button onclick="bcNav('matches')">Matches</button><button class="on" data-bc-growth>Growth${Number(s.unread_count)>0?` <span class="bc-growth-badge">${Number(s.unread_count)}</span>`:''}</button></div>
      <div class="card"><h2>Your exchange readiness</h2><p class="muted">The more complete this loop is, the more useful BrickCircle's reciprocal matching becomes.</p><div class="bc-growth-progress"><span style="width:${pct}%"></span></div><p><b>${pct}% ready</b> · Add a collection item, make at least one set available, and add something to your wishlist.</p></div>
      <div class="bc-growth-grid"><div class="bc-growth-kpi">Collection<b>${Number(s.collection_count)}</b></div><div class="bc-growth-kpi">Exchangeable<b>${Number(s.available_count)}</b></div><div class="bc-growth-kpi">Wishlist<b>${Number(s.wishlist_count)}</b></div><div class="bc-growth-kpi">Unread nudges<b>${Number(s.unread_count)}</b></div></div>
      <div class="card"><h2>Invite another collector</h2><p class="muted">A larger local inventory creates more reciprocal matches for everyone.</p><div class="bc-ref"><input id="bc-ref-link" readonly value="${esc(ref)}"><button class="primary" onclick="bcCopyReferral()">Copy invite link</button></div></div>
      <div style="height:14px"></div><div class="card"><div style="display:flex;justify-content:space-between;gap:10px;align-items:center"><div><h2 style="margin-bottom:5px">Next best actions</h2><p class="muted" style="margin-top:0">Triggered automatically from your BrickCircle activity.</p></div>${Number(s.unread_count)>0?'<button onclick="bcGrowthReadAll()">Mark all read</button>':''}</div></div>
      ${notes.map(n=>`<div class="bc-growth-note ${n.read_at?'':'unread'}"><h3>${esc(n.title)}</h3><p>${esc(n.body)}</p><div class="actions">${n.cta_hash?`<button class="primary" onclick="bcGrowthRead('${esc(n.id)}','${esc(n.cta_hash)}')">Open</button>`:''}${n.read_at?'':'<button onclick="bcGrowthRead(\''+esc(n.id)+'\',null)">Mark read</button>'}</div></div>`).join('')||'<div class="notice">No growth nudges yet.</div>'}</div>`;
      injectTab();
    }catch(e){app.innerHTML=`<div class="wrap"><div class="notice">Unable to load growth automation: ${esc(e.message)}</div></div>`}
  };

  const originalNav=window.bcNav;
  if(originalNav) window.bcNav=p=>p==='growth'?window.bcGrowthOpen():originalNav(p);
  window.addEventListener('hashchange',()=>{if(location.hash==='#growth')window.bcGrowthOpen();else setTimeout(injectTab,30)});
  new MutationObserver(()=>injectTab()).observe(document.body,{subtree:true,childList:true});
  setTimeout(()=>{injectTab();if(location.hash==='#growth')window.bcGrowthOpen()},400);
})();