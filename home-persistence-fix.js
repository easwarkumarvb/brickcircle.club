/* BrickCircle Home guard. One-way recovery only; never continuously re-renders a stable Home. */
(()=>{
  const isHome=()=>((location.hash||'#home').slice(1)||'home')==='home';
  let observer=null, recovering=false;
  const hide=()=>{if(!isHome())return;document.documentElement.classList.add('bc-home-boot');document.body?.classList.add('bc-home-boot')};
  const show=()=>{document.documentElement.classList.remove('bc-home-boot');document.body?.classList.remove('bc-home-boot')};
  const recover=()=>{
    if(!isHome()||recovering)return;
    const app=document.getElementById('app');
    if(!app)return;
    if(app.querySelector('.bc23')){show();return;}
    recovering=true;hide();
    requestAnimationFrame(()=>{
      try{if(window.bc23Render)window.bc23Render();}finally{
        setTimeout(()=>{recovering=false;if(isHome()&&document.querySelector('#app .bc23'))show();},40);
      }
    });
  };
  const start=()=>{
    if(!isHome()){show();return;}
    hide();
    const app=document.getElementById('app');
    if(!app)return;
    if(!observer){
      observer=new MutationObserver(()=>{
        if(!isHome())return;
        if(!app.querySelector('.bc23'))recover();
      });
      observer.observe(app,{childList:true});
    }
    requestAnimationFrame(()=>{if(isHome()&&window.bc23Render)window.bc23Render();});
  };
  document.addEventListener('DOMContentLoaded',start);
  window.addEventListener('load',start);
  window.addEventListener('hashchange',start);
  start();
})();
