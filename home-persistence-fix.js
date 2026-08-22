/* BrickCircle Home first-paint controller. This is the only Home visibility controller. */
(()=>{
  const isHome=()=>((location.hash||'#home').slice(1)||'home')==='home';
  const getApp=()=>document.getElementById('app');
  const ensureStyle=()=>{
    if(document.getElementById('bc-home-firstpaint-style')) return;
    const s=document.createElement('style');
    s.id='bc-home-firstpaint-style';
    s.textContent=`html.bc-home-boot #app,body.bc-home-boot #app{visibility:hidden!important}html.bc-home-boot #app{min-height:calc(100vh - 64px)}`;
    document.head.appendChild(s);
  };
  let observer=null, timer=null, lastChange=performance.now();
  const hide=()=>{ if(isHome()){document.documentElement.classList.add('bc-home-boot');document.body?.classList.add('bc-home-boot');} };
  const show=()=>{document.documentElement.classList.remove('bc-home-boot');document.body?.classList.remove('bc-home-boot');};
  const ready=()=>{const a=getApp();return isHome()&&!!a&&!!a.querySelector('.bc23');};
  const settle=()=>{
    if(timer) clearTimeout(timer);
    timer=setTimeout(()=>{
      timer=null;
      if(!isHome()) return;
      if(ready() && performance.now()-lastChange>=100){
        requestAnimationFrame(()=>{ if(ready() && performance.now()-lastChange>=100) show(); });
      }
    },110);
  };
  const attach=()=>{
    const a=getApp();
    if(!a || observer) return;
    observer=new MutationObserver(()=>{
      if(!isHome()) return;
      lastChange=performance.now();
      // If the legacy renderer replaces the premium tree, hide it before the next paint.
      if(!a.querySelector('.bc23')) hide();
      settle();
    });
    observer.observe(a,{childList:true});
  };
  const start=()=>{
    ensureStyle();
    if(!isHome()){show();return;}
    hide();
    attach();
    lastChange=performance.now();
    settle();
  };
  // This script executes after the legacy renderer and homepage script, so it can
  // establish the final first-paint gate synchronously before their requestAnimationFrame callbacks.
  ensureStyle();
  start();
  window.addEventListener('hashchange',()=>{
    if(isHome()){ hide(); lastChange=performance.now(); attach(); settle(); }
    else show();
  });
})();
