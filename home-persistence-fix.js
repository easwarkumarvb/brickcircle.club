/* BrickCircle homepage persistence guard. Keeps the premium homepage stable while the legacy app finishes its async initial render. */
(()=>{
  const app=()=>document.querySelector('#app');
  const home=()=>((location.hash||'#home').slice(1)||'home')==='home';
  const style=()=>{
    if(document.getElementById('bc-home-persistence-style')) return;
    const s=document.createElement('style');
    s.id='bc-home-persistence-style';
    s.textContent='#app.bc-home-loading{visibility:hidden!important}#app.bc-home-ready{visibility:visible!important}';
    document.head.appendChild(s);
  };
  const sync=()=>{
    style();
    const a=app();
    if(!a) return;
    if(!home()){
      a.classList.remove('bc-home-loading','bc-home-ready');
      return;
    }
    if(!a.querySelector('.bc23')){
      a.classList.add('bc-home-loading');
      a.classList.remove('bc-home-ready');
      // Ask the already-loaded homepage module to render again after the legacy shell changes.
      window.dispatchEvent(new Event('hashchange'));
    }else{
      a.classList.remove('bc-home-loading');
      a.classList.add('bc-home-ready');
    }
  };
  document.addEventListener('DOMContentLoaded',sync);
  window.addEventListener('load',sync);
  window.addEventListener('hashchange',()=>setTimeout(sync,50));
  // The legacy production renderer is asynchronous and can replace #app after initial page load.
  // Keep the page hidden during that transition and reveal it only after .bc23 is present.
  const timer=setInterval(()=>{
    sync();
    if(!home() || document.querySelector('#app .bc23')){
      if(document.querySelector('#app .bc23')) clearInterval(timer);
    }
  },100);
})();
