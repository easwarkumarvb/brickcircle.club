(()=>{
'use strict';
const PROMO_ID='bc-install-promo';
const DISMISS_KEY='bc_install_promo_dismissed';
function dismissed(){try{return sessionStorage.getItem(DISMISS_KEY)==='1'}catch(_){return false}}
function rememberDismiss(){try{sessionStorage.setItem(DISMISS_KEY,'1')}catch(_){}}
function findInstallButton(){return [...document.querySelectorAll('button')].find(button=>button.textContent?.trim()==='Install BrickCircle')||null}
function remove(){document.getElementById(PROMO_ID)?.remove()}
function render(){
  const installButton=findInstallButton();
  const home=document.querySelector('.bc-welcome');
  if(!installButton||!home||dismissed()){remove();return}
  if(document.getElementById(PROMO_ID))return;
  installButton.style.display='none';
  const card=document.createElement('section');
  card.id=PROMO_ID;
  card.setAttribute('aria-label','Install BrickCircle');
  card.style.cssText='margin:18px 0;padding:18px;border:1px solid #dbe3ef;border-radius:18px;background:linear-gradient(135deg,#f8fbff,#fff);box-shadow:0 10px 30px rgba(15,23,42,.08);display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap';
  card.innerHTML='<div style="min-width:220px;flex:1"><div style="font-size:12px;font-weight:800;letter-spacing:.08em;color:#475569;text-transform:uppercase">Keep BrickCircle handy</div><h2 style="margin:5px 0 6px;font-size:22px;color:#0f172a">Add BrickCircle to your Home Screen</h2><p style="margin:0;color:#64748b;line-height:1.45">You have started your collection. Install BrickCircle for faster access to matches, exchanges and notifications.</p></div><div style="display:flex;gap:9px;align-items:center;flex-wrap:wrap"><button type="button" class="bc-btn" data-install-later>Not now</button><button type="button" class="bc-btn primary" data-install-now>Install BrickCircle</button></div>';
  const anchor=document.querySelector('.bc-guided-progress')||home.nextElementSibling;
  if(anchor?.parentNode)anchor.parentNode.insertBefore(card,anchor);else home.after(card);
  card.querySelector('[data-install-now]').onclick=()=>{installButton.click();remove()};
  card.querySelector('[data-install-later]').onclick=()=>{rememberDismiss();remove()};
}
const observer=new MutationObserver(()=>queueMicrotask(render));
observer.observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('beforeinstallprompt',()=>setTimeout(render,0));
window.addEventListener('appinstalled',remove);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',render,{once:true});else render();
})();
