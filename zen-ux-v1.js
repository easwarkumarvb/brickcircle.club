/* BrickCircle Zen UX v1 — progressive disclosure without changing exchange logic. */
(()=>{
'use strict';
const root=()=>document.getElementById('bc-main');
const route=()=>decodeURIComponent((location.hash||'#home').slice(1).split('/')[0]||'home');
const setText=(el,text)=>{if(el&&el.textContent!==text)el.textContent=text};

function relabelNavigation(){
  document.querySelectorAll('[data-nav="browse"]').forEach(el=>{
    if(el.closest('.bc-mobile-nav')) return;
    if(el.tagName==='BUTTON') setText(el,'Find sets');
  });
  document.querySelectorAll('[data-nav="sets"]').forEach(el=>{
    if(el.closest('.bc-mobile-nav')) return;
    if(el.tagName==='BUTTON' && el.closest('.bc-desktop-nav')) setText(el,'My LEGO');
  });
}

function collapseDashboardEducation(){
  if(route()!=='home')return;
  const main=root();
  if(!main || !document.querySelector('.bc-dashboard-hero') || main.querySelector('.bc-zen-more'))return;
  const workflow=main.querySelector('.bc-workflow');
  const reassurance=main.querySelector('.bc-reassurance');
  const dashboard=main.querySelector('.bc-dashboard-grid');
  const nodes=[workflow,reassurance,dashboard].filter(Boolean);
  if(!nodes.length)return;
  const details=document.createElement('details');
  details.className='bc-zen-more';
  details.innerHTML='<summary>More about BrickCircle</summary><div class="bc-zen-more-body"></div>';
  const body=details.querySelector('.bc-zen-more-body');
  nodes.forEach(node=>body.appendChild(node));
  const progress=main.querySelector('.bc-guided-progress');
  (progress||main.lastElementChild)?.insertAdjacentElement('afterend',details);
}

function collapseBrowseDiscovery(){
  if(!['browse','catalogue'].includes(route()))return;
  const main=root();
  const popular=main?.querySelector('.bc-popular');
  if(!popular || popular.closest('.bc-zen-discovery'))return;
  const details=document.createElement('details');
  details.className='bc-zen-discovery';
  details.innerHTML='<summary>Need inspiration? Browse iconic sets</summary>';
  popular.parentNode.insertBefore(details,popular);
  details.appendChild(popular);
}

function simplifyHeadings(){
  const main=root();if(!main)return;
  if(['browse','catalogue'].includes(route())){
    setText(main.querySelector('.bc-page-head h1'),'Find a LEGO set');
    setText(main.querySelector('.bc-page-head p'),'Search once, then choose: I own it or I want it.');
  }
  if(route()==='sets'){
    setText(main.querySelector('.bc-page-head h1'),'My LEGO');
    setText(main.querySelector('.bc-page-head p'),'Your collection and the sets you want next.');
  }
  if(route()==='matches'){
    setText(main.querySelector('.bc-page-head h1'),'Matches');
    setText(main.querySelector('.bc-page-head p'),'Only mutual matches appear here.');
  }
  if(route()==='exchanges'){
    setText(main.querySelector('.bc-page-head h1'),'Exchanges');
    setText(main.querySelector('.bc-page-head p'),'One place for proposals, active exchanges and returns.');
  }
}

function removeRedundantLandingSections(){
  if(route()!=='home' || document.querySelector('.bc-dashboard-hero'))return;
  const main=root();if(!main)return;
  // Hero + one workflow + trust + CTA is enough for first-time comprehension.
  main.querySelector('.bc-story')?.setAttribute('hidden','');
  main.querySelector('.bc-landing-match-example')?.setAttribute('hidden','');
}

function apply(){
  document.documentElement.classList.add('bc-zen');
  relabelNavigation();
  simplifyHeadings();
  collapseDashboardEducation();
  collapseBrowseDiscovery();
  removeRedundantLandingSections();
}

let queued=false;
const schedule=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;apply()})};
new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('hashchange',schedule);
document.addEventListener('DOMContentLoaded',schedule,{once:true});
schedule();
})();
