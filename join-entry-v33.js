/* BrickCircle V3.3 join-entry reliability.
   Makes /v2.html?join=1 responsive immediately, before remote session/profile
   hydration finishes, and provides one delegated fallback for all [data-auth] CTAs. */
(()=>{
  'use strict';
  const params=new URLSearchParams(location.search);
  const joinIntent=params.get('join')==='1';
  let opened=false;

  function showStartingState(){
    if(!joinIntent)return;
    const root=document.getElementById('bc-root');
    if(!root||root.children.length||root.textContent.trim())return;
    root.innerHTML='<main class="bc-main"><div class="bc-page"><div class="bc-loading"><div><div class="bc-spinner"></div>Opening BrickCircle sign-up…</div></div></div></main>';
  }

  function clearJoinIntent(){
    try{
      const u=new URL(location.href);
      u.searchParams.delete('join');
      const query=u.searchParams.toString();
      history.replaceState({},'',u.pathname+(query?'?'+query:'')+(u.hash||'#home'));
    }catch(_){ }
  }

  function openAuth(){
    if(opened&&document.getElementById('bc-overlay'))return true;
    if(typeof window.bcAuth!=='function')return false;
    try{
      window.bcAuth();
      opened=!!document.getElementById('bc-overlay');
      if(opened)clearJoinIntent();
      return opened;
    }catch(error){
      console.error('BrickCircle join entry failed',error);
      return false;
    }
  }

  function showRetry(){
    if(document.getElementById('bc-overlay')||typeof window.bcAuth==='function')return;
    const root=document.getElementById('bc-root');if(!root)return;
    root.innerHTML='<main class="bc-main"><div class="bc-page"><div class="bc-empty"><div class="bc-empty-icon">↻</div><h2>Sign-up did not start</h2><p>BrickCircle could not finish loading the join screen.</p><button class="bc-btn primary" id="bc-join-retry">Retry</button></div></div></main>';
    document.getElementById('bc-join-retry')?.addEventListener('click',()=>location.reload());
  }

  // A capture-phase fallback means dynamically rendered Join / Sign in buttons
  // remain reliable even if a later UI render missed its local onclick binding.
  document.addEventListener('click',event=>{
    const button=event.target.closest?.('[data-auth]');
    if(!button||button.closest('#bc-overlay'))return;
    if(typeof window.bcAuth!=='function')return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openAuth();
  },true);

  if(joinIntent){
    showStartingState();
    if(!openAuth()){
      [30,100,250,600,1200].forEach(ms=>setTimeout(()=>{
        if(!document.getElementById('bc-overlay'))openAuth();
      },ms));
      setTimeout(showRetry,2500);
    }
  }
})();
