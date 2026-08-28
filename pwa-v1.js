/* BrickCircle PWA install + offline UX */
(()=>{
  const DISMISS_KEY='bc_pwa_install_dismissed_v1';
  let deferredPrompt=null;
  const standalone=()=>window.matchMedia?.('(display-mode: standalone)')?.matches||window.navigator.standalone===true;
  const isiOS=()=>/iphone|ipad|ipod/i.test(navigator.userAgent||'');
  const mobile=()=>window.matchMedia?.('(max-width: 760px)')?.matches;
  const track=(event,meta={})=>{try{window.bcProductAnalytics?.track?.(event,meta)}catch(_){}};

  const css=`
  .bc-pwa-install{appearance:none;border:1px solid #f4c542;background:#f4c542;color:#111827;border-radius:999px;padding:8px 12px;font:800 12px/1 system-ui;min-height:36px;white-space:nowrap;cursor:pointer}
  .bc-pwa-install[hidden]{display:none!important}
  .bc-pwa-sheet{position:fixed;inset:0;z-index:100000;background:#0009;display:grid;align-items:end;padding:12px;font-family:system-ui,-apple-system,Segoe UI,sans-serif}
  .bc-pwa-sheetin{width:min(560px,100%);margin:0 auto max(4px,env(safe-area-inset-bottom));background:#fff;color:#111827;border-radius:22px;padding:22px;box-shadow:0 24px 80px #0007}
  .bc-pwa-sheet h2{margin:0 0 8px;font-size:24px}.bc-pwa-sheet p{margin:0 0 12px;color:#667085;line-height:1.5}.bc-pwa-sheet ol{margin:10px 0 18px;padding-left:22px;color:#344054}.bc-pwa-sheet li{margin:8px 0}.bc-pwa-sheet button{width:100%;min-height:48px;border:0;border-radius:12px;background:#111827;color:#fff;font-weight:850}
  .bc-net-status{position:fixed;left:50%;transform:translateX(-50%);top:max(8px,env(safe-area-inset-top));z-index:100001;background:#111827;color:#fff;border-radius:999px;padding:7px 12px;font:750 12px/1.2 system-ui;box-shadow:0 8px 28px #0003}
  @media(max-width:760px){body{overscroll-behavior-y:none}.bc-beta-inner{flex-wrap:wrap}.bc-beta-inner .bc-pwa-install{margin-left:auto}}
  `;
  const style=document.createElement('style');style.id='bc-pwa-v1-style';style.textContent=css;document.head.appendChild(style);

  function installButtons(){return [...document.querySelectorAll('[data-pwa-install]')];}
  function eligible(){return !standalone()&&(!!deferredPrompt||isiOS());}
  function refreshButtons(){installButtons().forEach(b=>{b.hidden=!eligible();b.classList.add('bc-pwa-install');});}
  function showIOSHelp(){
    document.querySelector('.bc-pwa-sheet')?.remove();
    const el=document.createElement('div');el.className='bc-pwa-sheet';
    el.innerHTML=`<div class="bc-pwa-sheetin"><h2>Install BrickCircle</h2><p>Add BrickCircle to your Home Screen so it opens like an app.</p><ol><li>Tap the <b>Share</b> button in Safari.</li><li>Choose <b>Add to Home Screen</b>.</li><li>Tap <b>Add</b>.</li></ol><button type="button">Got it</button></div>`;
    document.body.appendChild(el);el.querySelector('button').onclick=()=>el.remove();el.onclick=e=>{if(e.target===el)el.remove()};track('pwa_ios_instructions');
  }
  async function requestInstall(){
    if(standalone())return;
    if(isiOS()&&!deferredPrompt){showIOSHelp();return;}
    if(!deferredPrompt)return;
    const p=deferredPrompt;deferredPrompt=null;refreshButtons();
    try{await p.prompt();const choice=await p.userChoice;track('pwa_install_choice',{outcome:choice?.outcome||'unknown'});if(choice?.outcome==='dismissed')localStorage.setItem(DISMISS_KEY,String(Date.now()));}catch(_){deferredPrompt=p;refreshButtons();}
  }
  document.addEventListener('click',e=>{const b=e.target.closest?.('[data-pwa-install]');if(!b)return;e.preventDefault();requestInstall();});
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;refreshButtons();track('pwa_install_available');});
  window.addEventListener('appinstalled',()=>{deferredPrompt=null;refreshButtons();track('pwa_installed');});

  function status(text){
    document.querySelector('.bc-net-status')?.remove();
    if(!text)return;
    const el=document.createElement('div');el.className='bc-net-status';el.textContent=text;document.body.appendChild(el);setTimeout(()=>el.remove(),2600);
  }
  window.addEventListener('offline',()=>status('You’re offline — cached BrickCircle pages remain available.'));
  window.addEventListener('online',()=>status('Back online'));

  async function registerSW(){
    if(!('serviceWorker' in navigator))return;
    try{
      const reg=await navigator.serviceWorker.register('/catalogue-cache-sw.js',{scope:'/'});
      if(reg.waiting)reg.waiting.postMessage({type:'SKIP_WAITING'});
      reg.addEventListener('updatefound',()=>{const w=reg.installing;if(!w)return;w.addEventListener('statechange',()=>{if(w.state==='installed'&&navigator.serviceWorker.controller){status('BrickCircle updated');w.postMessage({type:'SKIP_WAITING'});}})});
    }catch(err){console.warn('BrickCircle service worker registration failed',err);}
  }

  function addAppInstallButton(){
    if(document.querySelector('[data-pwa-install]'))return;
    const beta=document.querySelector('.bc-beta-inner');
    if(beta){const b=document.createElement('button');b.type='button';b.dataset.pwaInstall='1';b.textContent='Install BrickCircle';b.hidden=true;beta.appendChild(b);refreshButtons();}
  }

  document.addEventListener('DOMContentLoaded',()=>{registerSW();addAppInstallButton();refreshButtons();});
  window.addEventListener('load',()=>{addAppInstallButton();refreshButtons();});
  new MutationObserver(()=>{if(mobile()){addAppInstallButton();refreshButtons();}}).observe(document.documentElement,{childList:true,subtree:true});
})();
