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
  let scheduled=false;
  const requestRender=()=>{
    if(scheduled) return;
    scheduled=true;
    setTimeout(()=>{
      scheduled=false;
      if(isHome()) window.dispatchEvent(new Event('hashchange'));
    },0);
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
      if(rerender) requestRender();
    }
  };
  const start=()=>{
    style();
    sync(false);
    const a=app();
    if(!a) return;
    // Only observe direct child replacement. We do not mutate the observed tree
    // from the observer callback, preventing the previous feedback-loop bug.
    const observer=new MutationObserver(()=>sync(true));
    observer.observe(a,{childList:true});
    window.addEventListener('hashchange',()=>setTimeout(()=>sync(true),0));
    setInterval(()=>{if(isHome()) sync(true);},500);
  };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
