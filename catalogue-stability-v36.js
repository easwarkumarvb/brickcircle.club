/* BrickCircle catalogue stability hotfix v3.6.
   Owns non-empty Browse searches so a mobile request can never leave the catalogue
   on the initial spinner. Stale responses are ignored; the newest query always wins. */
(()=>{
'use strict';
const U='https://nsxtromjdpdscknadxez.supabase.co';
const K='sb_publishable_JJhVbgjGblHrnKuPOsJkxQ_zRoQNlIL';
const db=window.supabase?.createClient?.(U,K);if(!db)return;
const state={seq:0,timer:null,query:'',rows:[],user:null,owned:new Set(),wanted:new Set(),flagsAt:0};
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=x=>Number(x)>0?'$'+Number(x).toLocaleString():'Value not listed';
const route=()=>decodeURIComponent((location.hash||'#home').slice(1).split('/')[0]||'home');
const browse=()=>route()==='browse'||route()==='catalogue';
const setKey=set=>/-\d+$/.test(String(set||''))?String(set):`${String(set||'')}-1`;
const img=set=>`https://images.brickset.com/sets/images/${encodeURIComponent(setKey(set))}.jpg`;
const loading=label=>`<div class="bc-loading" style="grid-column:1/-1"><div><div class="bc-spinner"></div>${esc(label)}</div></div>`;

async function withTimeout(promise,ms=7000){
  let timer;
  try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Catalogue request timed out')),ms)})])}
  finally{clearTimeout(timer)}
}
async function loadFlags(force=false){
  if(!force&&Date.now()-state.flagsAt<15000)return;
  const {data:{user}}=await db.auth.getUser();state.user=user||null;state.owned.clear();state.wanted.clear();
  if(user){
    const [c,w]=await Promise.all([
      db.from('collection_items').select('set_number').eq('user_id',user.id),
      db.from('wishlists').select('set_number').eq('user_id',user.id)
    ]);
    (c.data||[]).forEach(x=>state.owned.add(x.set_number));(w.data||[]).forEach(x=>state.wanted.add(x.set_number));
  }
  state.flagsAt=Date.now();
}
function card(s,index){
  const own=state.owned.has(s.set_number),want=state.wanted.has(s.set_number),priority=index<6;
  return `<article class="bc-set-card" data-v36-set="${esc(s.set_number)}"><div class="bc-set-image"><img src="${esc(img(s.set_number))}" alt="LEGO ${esc(s.name)} — set ${esc(s.set_number)}" loading="${priority?'eager':'lazy'}" ${priority?'fetchpriority="high"':''} decoding="async" data-set-image="${esc(s.set_number)}"><div class="bc-set-placeholder" hidden>🧱</div></div><div style="margin-top:9px"><span class="bc-pill">${esc(s.theme||'LEGO')}</span></div><h3>${esc(s.name||s.set_number)}</h3><div class="bc-set-meta">Set ${esc(s.set_number)}${s.year?' · '+esc(s.year):''}${s.piece_count?' · '+Number(s.piece_count).toLocaleString()+' pieces':''}</div><div class="bc-small" style="margin-top:6px">${money(s.estimated_value)}</div><div class="bc-set-actions"><button class="${own?'on':''}" data-v36-own ${own?'disabled':''}>${own?'✓ I own this':'○ I own this'}</button><button class="want ${want?'on':''}" data-v36-want ${want?'disabled':''}>${want?'♥ Wishlist':'♡ I want this'}</button></div></article>`;
}
function wire(root){
  root.querySelectorAll('[data-v36-own]').forEach(b=>b.onclick=()=>addOwned(b.closest('[data-v36-set]').dataset.v36Set,b));
  root.querySelectorAll('[data-v36-want]').forEach(b=>b.onclick=()=>addWanted(b.closest('[data-v36-set]').dataset.v36Set,b));
  window.dispatchEvent(new CustomEvent('bc:catalogue-rendered',{detail:{query:state.query,count:state.rows.length}}));
}
function render(rows,q){
  if(!browse()||q!==state.query)return;
  const input=document.getElementById('bc-q'),grid=document.getElementById('bc-set-grid'),status=document.getElementById('bc-cat-status');
  if(!grid||!input||input.value.trim()!==q)return;
  grid.dataset.catalogueStability='v36';grid.removeAttribute('aria-busy');
  grid.innerHTML=rows.length?rows.map(card).join(''):`<div class="bc-empty" style="grid-column:1/-1"><div class="bc-empty-icon">🔎</div><h2>No matching sets</h2><p>Try a different set number, name, theme or year.</p></div>`;
  if(status)status.textContent=rows.length?`${rows.length} product${rows.length===1?'':'s'} matching “${q}”`:`No matching sets for “${q}”`;
  const pager=document.querySelector('.bc-pager');if(pager)pager.style.display='none';const size=document.getElementById('bc-cat-page-size');if(size)size.textContent='Up to 60 matches';
  wire(grid);
  // A route-start catalogue request may have begun before this hotfix took ownership.
  // Re-assert the newest completed result if that older request paints late.
  [120,500,1500,3000].forEach(ms=>setTimeout(()=>{
    const g=document.getElementById('bc-set-grid'),i=document.getElementById('bc-q');
    if(browse()&&i?.value.trim()===q&&state.query===q&&g?.dataset.catalogueStability!=='v36')render(state.rows,q);
  },ms));
}
async function search(raw){
  const q=String(raw||'').trim();if(!q)return;state.query=q;const seq=++state.seq;
  const grid=document.getElementById('bc-set-grid'),status=document.getElementById('bc-cat-status');
  if(grid){grid.dataset.catalogueStability='v36';grid.setAttribute('aria-busy','true');grid.innerHTML=loading('Searching LEGO catalogue…')}
  if(status)status.textContent=`Searching for “${q}”…`;
  const theme=document.getElementById('bc-theme')?.value||null,yearRaw=document.getElementById('bc-year')?.value||'',year=yearRaw?Number(yearRaw):null;
  try{
    const [result]=await Promise.all([
      withTimeout(db.rpc('bc_search_lego_sets',{p_query:q,p_theme:theme,p_year:year,p_limit:60}),7000),
      loadFlags()
    ]);
    if(seq!==state.seq||q!==state.query)return;if(result.error)throw result.error;
    state.rows=result.data||[];render(state.rows,q);
  }catch(error){
    if(seq!==state.seq||q!==state.query)return;console.error('BrickCircle catalogue v36',error);
    if(status)status.textContent='Catalogue temporarily unavailable.';
    if(grid){grid.removeAttribute('aria-busy');grid.innerHTML='<div class="bc-empty" style="grid-column:1/-1"><div class="bc-empty-icon">🧱</div><h2>Catalogue did not finish loading</h2><p>Please retry — your search is preserved.</p><button class="bc-btn primary" data-v36-retry>Retry</button></div>';grid.querySelector('[data-v36-retry]')?.addEventListener('click',()=>search(state.query))}
  }
}
function schedule(q,delay=180){clearTimeout(state.timer);state.query=String(q||'').trim();const seq=++state.seq;if(!state.query)return;state.timer=setTimeout(()=>{if(seq===state.seq)search(state.query)},delay)}

async function restoreAfterAdd(q){
  state.flagsAt=0;try{if(typeof window.bcV3Refresh==='function')await window.bcV3Refresh()}catch(_){ }
  setTimeout(()=>{const input=document.getElementById('bc-q');if(input&&q){input.value=q;schedule(q,0)}},60);
}
async function addOwned(set,button){
  const {data:{user}}=await db.auth.getUser();if(!user){window.bcAuth?.();return}button.disabled=true;button.textContent='Adding…';
  const {error}=await db.from('collection_items').insert({user_id:user.id,set_number:set});
  if(error&&error.code!=='23505'){button.disabled=false;button.textContent='○ I own this';alert(error.message);return}
  state.owned.add(set);await restoreAfterAdd(state.query);
}
async function addWanted(set,button){
  const {data:{user}}=await db.auth.getUser();if(!user){window.bcAuth?.();return}button.disabled=true;button.textContent='Adding…';
  const {error}=await db.from('wishlists').insert({user_id:user.id,set_number:set,priority:3});
  if(error&&error.code!=='23505'){button.disabled=false;button.textContent='♡ I want this';alert(error.message);return}
  state.wanted.add(set);await restoreAfterAdd(state.query);
}

document.addEventListener('input',e=>{
  if(e.target?.id!=='bc-q')return;const q=e.target.value.trim();
  if(!q){state.query='';state.rows=[];state.seq++;clearTimeout(state.timer);return}
  e.preventDefault();e.stopImmediatePropagation();schedule(q);
},true);
document.addEventListener('change',e=>{
  if(!['bc-theme','bc-year'].includes(e.target?.id))return;const q=document.getElementById('bc-q')?.value.trim();if(!q)return;
  e.preventDefault();e.stopImmediatePropagation();schedule(q,0);
},true);
document.addEventListener('click',e=>{
  const b=e.target.closest?.('[data-pop]');if(!b||!browse())return;
  e.preventDefault();e.stopImmediatePropagation();const input=document.getElementById('bc-q');if(!input)return;input.value=b.dataset.pop||'';schedule(input.value,0);
},true);
})();
