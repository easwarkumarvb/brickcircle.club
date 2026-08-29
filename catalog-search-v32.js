/* BrickCircle V3.2 catalogue search — product-name first, case-insensitive, token aware. */
(()=>{
  'use strict';
  const U='https://nsxtromjdpdscknadxez.supabase.co';
  const K='sb_publishable_JJhVbgjGblHrnKuPOsJkxQ_zRoQNlIL';
  const db=window.supabase?.createClient?.(U,K);
  if(!db)return;

  const state={query:'',rows:[],owned:new Set(),wanted:new Set(),user:null,seq:0,timer:null};
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
  const money=x=>Number(x)>0?'$'+Number(x).toLocaleString():'Value not listed';
  const route=()=>decodeURIComponent((location.hash||'#home').slice(1).split('/')[0]||'home');
  const browse=()=>route()==='browse'||route()==='catalogue';
  const setKey=set=>/-\d+$/.test(String(set||''))?String(set):`${String(set||'')}-1`;
  const bricksetUrl=set=>`https://images.brickset.com/sets/images/${encodeURIComponent(setKey(set))}.jpg`;
  const proxyUrl=set=>`https://images.weserv.nl/?url=${encodeURIComponent(`images.brickset.com/sets/images/${setKey(set)}.jpg`)}&w=700&fit=contain&output=jpg`;

  function decorate(){
    if(!browse())return;
    const q=document.getElementById('bc-q');if(!q)return;
    q.placeholder='Search product name, set number or theme — e.g. McLaren, Ferrari, Saturn V';
    q.setAttribute('aria-label','Search LEGO products by product name, set number or theme');
    const tools=q.closest('.bc-catalogue-tools')||q.parentElement;
    if(tools&&!tools.querySelector('.bc-name-search-help')){
      const help=document.createElement('div');help.className='bc-name-search-help bc-small';help.style.cssText='margin-top:7px;color:#667085';
      help.textContent='Tip: type any part of the LEGO product name. “McLaren” will show every McLaren set in the catalogue.';
      tools.appendChild(help);
    }
  }

  async function loadUserFlags(){
    const {data:{user}}=await db.auth.getUser();state.user=user||null;state.owned.clear();state.wanted.clear();
    if(!user)return;
    const [c,w]=await Promise.all([
      db.from('collection_items').select('set_number').eq('user_id',user.id),
      db.from('wishlists').select('set_number').eq('user_id',user.id)
    ]);
    (c.data||[]).forEach(x=>state.owned.add(x.set_number));
    (w.data||[]).forEach(x=>state.wanted.add(x.set_number));
  }

  function image(row,index=99){
    const direct=bricksetUrl(row.set_number);
    const alternate=/^https?:\/\//i.test(row.image_url||'')?String(row.image_url):'';
    const priority=index<8;
    return `<div class="bc-set-image"><img src="${esc(direct)}" alt="LEGO ${esc(row.name)} — set ${esc(row.set_number)}" loading="${priority?'eager':'lazy'}" ${priority?'fetchpriority="high"':''} decoding="async" data-cs-image="1" data-cs-set-number="${esc(row.set_number)}" data-cs-alternate="${esc(alternate)}"><div class="bc-set-placeholder" hidden>🧱</div></div>`;
  }

  function card(row,index=99){
    const owned=state.owned.has(row.set_number),wanted=state.wanted.has(row.set_number);
    return `<article class="bc-set-card bc-name-search-card" data-cs-set="${esc(row.set_number)}">
      ${image(row,index)}
      <div style="margin-top:9px"><span class="bc-pill">${esc(row.theme||'LEGO')}</span></div>
      <h3>${esc(row.name||row.set_number)}</h3>
      <div class="bc-set-meta">Set ${esc(row.set_number)}${row.year?' · '+esc(row.year):''}${row.piece_count?' · '+Number(row.piece_count).toLocaleString()+' pieces':''}</div>
      <div class="bc-small" style="margin-top:6px">${money(row.estimated_value)}</div>
      <div class="bc-set-actions">
        <button data-cs-own ${owned?'disabled':''} class="${owned?'on':''}">${owned?'✓ In My Sets':'＋ Add to My Sets'}</button>
        <button data-cs-want ${wanted?'disabled':''} class="want ${wanted?'on':''}">${wanted?'♥ Wishlisted':'♡ Add to Wishlist'}</button>
      </div>
    </article>`;
  }

  function wireSearchImages(root=document){
    root.querySelectorAll?.('img[data-cs-image]').forEach(img=>{
      if(img.dataset.csImageBound)return;
      img.dataset.csImageBound='1';
      img.dataset.csStage='brickset';
      img.addEventListener('error',()=>{
        const set=img.dataset.csSetNumber||'';
        const alternate=img.dataset.csAlternate||'';
        if(img.dataset.csStage==='brickset'&&alternate&&alternate!==img.src){
          img.dataset.csStage='alternate';img.src=alternate;return;
        }
        if(img.dataset.csStage!=='proxy'){
          img.dataset.csStage='proxy';img.src=proxyUrl(set);return;
        }
        img.hidden=true;img.nextElementSibling?.removeAttribute('hidden');
      });
    });
  }

  function render(rows,q){
    if(!browse()||q!==state.query)return;
    const grid=document.getElementById('bc-set-grid'),status=document.getElementById('bc-cat-status');if(!grid)return;
    grid.dataset.catalogSearch='name';
    grid.innerHTML=rows.length?rows.map((row,index)=>card(row,index)).join(''):`<div class="bc-empty" style="grid-column:1/-1"><div class="bc-empty-icon">⌕</div><h2>No products found for “${esc(q)}”</h2><p>Try a shorter product name, model name, set number or theme.</p></div>`;
    if(status)status.textContent=rows.length?`${rows.length} product${rows.length===1?'':'s'} matching “${q}”`:`No catalogue products match “${q}”`;
    const pager=document.querySelector('.bc-pager');if(pager)pager.style.display='none';
    wireSearchImages(grid);
    grid.querySelectorAll('[data-cs-own]').forEach(b=>b.onclick=()=>addOwned(b.closest('[data-cs-set]').dataset.csSet,b));
    grid.querySelectorAll('[data-cs-want]').forEach(b=>b.onclick=()=>addWanted(b.closest('[data-cs-set]').dataset.csSet,b));
  }

  async function runSearch(raw){
    const q=String(raw||'').trim();state.query=q;if(!q)return;
    const seq=++state.seq,grid=document.getElementById('bc-set-grid'),status=document.getElementById('bc-cat-status');
    if(grid)grid.innerHTML='<div class="bc-loading" style="grid-column:1/-1"><div><div class="bc-spinner"></div>Searching LEGO products…</div></div>';
    if(status)status.textContent=`Searching for “${q}”…`;
    const theme=document.getElementById('bc-theme')?.value||null,yearRaw=document.getElementById('bc-year')?.value||'',year=yearRaw?Number(yearRaw):null;
    try{
      const [searchResult]=await Promise.all([
        db.rpc('bc_search_lego_sets',{p_query:q,p_theme:theme,p_year:year,p_limit:80}),
        loadUserFlags()
      ]);
      if(seq!==state.seq||q!==state.query)return;
      if(searchResult.error)throw searchResult.error;
      state.rows=searchResult.data||[];render(state.rows,q);
      try{window.bcProductAnalytics?.track?.('catalogue_product_name_search',{query:q,result_count:state.rows.length})}catch(_){ }
    }catch(error){
      console.error('BrickCircle catalogue search',error);
      if(status)status.textContent='Search is temporarily unavailable.';
      if(grid)grid.innerHTML='<div class="bc-empty" style="grid-column:1/-1"><div class="bc-empty-icon">⚠️</div><h2>Could not search the catalogue</h2><p>Please try again in a moment.</p></div>';
    }
  }

  function schedule(raw){
    clearTimeout(state.timer);
    state.query=String(raw||'').trim();
    const q=state.query;
    state.timer=setTimeout(()=>runSearch(q),220);
  }

  async function restoreAfterAdd(){
    const q=state.query;
    try{if(typeof window.bcV3Refresh==='function')await window.bcV3Refresh();}catch(_){ }
    setTimeout(()=>{
      decorate();
      const input=document.getElementById('bc-q');
      // Do not overwrite a newer search the collector typed while the add/refresh was finishing.
      if(input&&q&&state.query===q){input.value=q;schedule(q)}
    },40);
  }

  async function addOwned(set,button){
    const {data:{user}}=await db.auth.getUser();if(!user){window.bcAuth?.();return}
    button.disabled=true;button.textContent='Adding…';
    const {error}=await db.from('collection_items').insert({user_id:user.id,set_number:set});
    if(error&&error.code!=='23505'){button.disabled=false;button.textContent='＋ Add to My Sets';alert(error.message);return}
    state.owned.add(set);try{window.bcProductAnalytics?.track?.('catalogue_search_collection_added',{set_number:set,query:state.query})}catch(_){ }
    await restoreAfterAdd();
  }

  async function addWanted(set,button){
    const {data:{user}}=await db.auth.getUser();if(!user){window.bcAuth?.();return}
    button.disabled=true;button.textContent='Adding…';
    const {error}=await db.from('wishlists').insert({user_id:user.id,set_number:set,priority:3});
    if(error&&error.code!=='23505'){button.disabled=false;button.textContent='♡ Add to Wishlist';alert(error.message);return}
    state.wanted.add(set);try{window.bcProductAnalytics?.track?.('catalogue_search_wishlist_added',{set_number:set,query:state.query})}catch(_){ }
    await restoreAfterAdd();
  }

  document.addEventListener('input',event=>{
    if(event.target?.id!=='bc-q')return;
    const q=event.target.value.trim();
    if(!q){state.query='';state.rows=[];state.seq++;clearTimeout(state.timer);const pager=document.querySelector('.bc-pager');if(pager)pager.style.display='';return}
    event.stopImmediatePropagation();event.preventDefault();schedule(q);
  },true);

  document.addEventListener('change',event=>{
    if(!['bc-theme','bc-year'].includes(event.target?.id))return;
    const q=document.getElementById('bc-q')?.value.trim();if(!q)return;
    event.stopImmediatePropagation();event.preventDefault();schedule(q);
  },true);

  // Beta reliability guard: the proposal form handler explicitly queries a
  // button[type="submit"]. HTML defaults an untyped button to submit, but the
  // selector does not. Normalize the primary proposal action as soon as the
  // modal is inserted so both browser behavior and the handler agree.
  function normalizeProposalSubmit(root=document){
    const form=root?.matches?.('#bc-proposal')?root:root?.querySelector?.('#bc-proposal');
    if(!form)return;
    const button=form.querySelector('.bc-form-actions .bc-btn.primary');
    if(button&&!button.hasAttribute('type'))button.setAttribute('type','submit');
  }
  const proposalObserver=new MutationObserver(mutations=>{
    for(const mutation of mutations){
      for(const node of mutation.addedNodes){
        if(node.nodeType!==1)continue;
        normalizeProposalSubmit(node);
      }
    }
  });
  proposalObserver.observe(document.documentElement,{childList:true,subtree:true});
  normalizeProposalSubmit();

  window.addEventListener('hashchange',()=>{[40,180].forEach(ms=>setTimeout(decorate,ms));});
  document.addEventListener('DOMContentLoaded',()=>{[40,180,500].forEach(ms=>setTimeout(decorate,ms));});
  [100,400].forEach(ms=>setTimeout(decorate,ms));
})();
