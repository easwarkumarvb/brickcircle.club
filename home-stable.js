/* BrickCircle Home: single-owner first-paint controller.
   The legacy app may render asynchronously. Keep Home invisible until the premium
   homepage exists and has been stable for one quiet frame. If the legacy renderer
   replaces Home later, hide immediately and let the premium renderer restore it. */
(()=>{
  const isHome=()=>((location.hash||'#home').slice(1)||'home')==='home';
  const app=()=>document.getElementById('app');
  const BOOT='bc-home-boot';
  let observer=null;
  let timer=null;
  let lastMutation=0;
  let revealed=false;
  const ensureBoot=()=>{
    if(!isHome()) return;
    document.documentElement.classList.add(BOOT);
    document.body?.classList.add(BOOT);
  };
  const premiumReady=()=>{
    const a=app();
    return isHome() && !!a && !!a.querySelector('.bc23');
  };
  const reveal=()=>{
    if(!premiumReady()) return false;
    revealed=true;
    document.documentElement.classList.remove(BOOT);
    document.body?.classList.remove(BOOT);
    return true;
  };
  const hide=()=>{
    if(!isHome()) return;
    revealed=false;
    ensureBoot();
  };
  const scheduleCheck=()=>{
    if(timer) clearTimeout(timer);
    timer=setTimeout(()=>{
      timer=null;
      if(!isHome()) return;
      if(premiumReady() && performance.now()-lastMutation>=80){
        requestAnimationFrame(()=>{
          if(premiumReady() && performance.now()-lastMutation>=80) reveal();
        });
      }
    },90);
  };
  const watch=()=>{
    const a=app();
    if(!a || observer) return;
    observer=new MutationObserver((records)=>{
      if(!isHome()) return;
      lastMutation=performance.now();
      // Any replacement of the Home tree is immediately hidden before the next paint.
      if(!a.querySelector('.bc23')) hide();
      scheduleCheck();
    });
    observer.observe(a,{childList:true});
  };
  const start=()=>{
    if(!isHome()) return;
    ensureBoot();
    watch();
    scheduleCheck();
  };
  window.addEventListener('hashchange',()=>{
    if(isHome()){
      revealed=false;
      ensureBoot();
      watch();
      scheduleCheck();
    }else{
      document.documentElement.classList.remove(BOOT);
      document.body?.classList.remove(BOOT);
    }
  });
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
