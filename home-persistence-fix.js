/* BrickCircle stable-home guard. Prevents the legacy renderer from ever becoming visible on Home. */
(()=>{
  const app=()=>document.getElementById('app');
  const isHome=()=>((location.hash||'#home').slice(1)||'home')==='home';
  const style=()=>{
    if(document.getElementById('bc-home-stable-style')) return;
    const s=document.createElement('style');
    s.id='bc-home-stable-style';
    s.textContent=`#app.bc-home-booting{visibility:hidden!important}#app.bc-home-live{visibility:visible!important}`;
    document.head.appendChild(s);
  };
  const sync=(rerender=true)=>{
    style();
    const a=app(); if(!a) return;
    if(!isHome()){
      a.classList.remove('bc-home-booting','bc-home-live');
      return;
    }
    if(a.querySelector('.bc23')){
      a.classList.remove('bc-home-booting');
      a.classList.add('bc-home-live');
    }else{
      a.classList.add('bc-home-booting');
      a.classList.remove('bc-home-live');
      if(rerender) window.dispatchEvent(new Event('bc23:render'));
    }
  };
  const start=()=>{
    style();
    sync(false);
    const a=app();
    if(!a) return;
    // Observe ONLY direct children of #app. We never mutate the observed DOM here,
    // so there is no observer feedback loop.
    const observer=new MutationObserver(()=>sync(true));
    observer.observe(a,{childList:true});
    window.addEventListener('hashchange',()=>setTimeout(()=>sync(true),0));
    window.addEventListener('bc23:ready',()=>sync(false));
    // Auth/profile initialization can finish later and replace the app shell.
    // Keep watching while the user remains on Home.
    setInterval(()=>{if(isHome()) sync(true);},500);
  };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
