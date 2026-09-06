/* Phase 2F — adaptive first-match conversion coach. Frontend-only; no new data contracts. */
(()=>{
'use strict';
const ROOT_ID='bc-first-match-coach';
const style=document.createElement('style');
style.textContent=`
.bc-first-match-coach{margin:0 0 16px;padding:15px 16px;border:1px solid #dbe3ef;border-radius:18px;background:linear-gradient(135deg,#fff,#f7f9fc);box-shadow:0 8px 24px rgba(15,23,42,.06)}
.bc-first-match-head{display:flex;align-items:center;justify-content:space-between;gap:14px}.bc-first-match-head h2{margin:3px 0 0;font-size:18px}.bc-first-match-kicker{font-size:11px;font-weight:800;letter-spacing:.08em;color:#667085}.bc-first-match-steps{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-top:12px}.bc-first-match-step{padding:9px 10px;border-radius:12px;background:#eef2f7;color:#667085;font-size:12px;font-weight:700}.bc-first-match-step.done{background:#e9f8ef;color:#18794e}.bc-first-match-step.current{outline:2px solid #111827;background:#fff;color:#111827}.bc-first-match-copy{margin:10px 0 0;color:#667085;font-size:13px}.bc-first-match-action{white-space:nowrap}
@media(max-width:700px){.bc-first-match-head{align-items:flex-start;flex-direction:column}.bc-first-match-action{width:100%}.bc-first-match-steps{grid-template-columns:1fr 1fr}}
`;
document.head.appendChild(style);

const labels=['OWN','WANT','EXCHANGEABLE','MATCH'];
const guidance={
  own:'Add 3 LEGO sets you own so BrickCircle has enough supply signals to work with.',
  want:'Add 3 sets you genuinely want to experience.',
  exchangeable:'Make 2 owned sets available so they can participate in reciprocal matching.',
  match:'Your collection is ready. Explore more sets while BrickCircle looks for reciprocal overlap.'
};
const actionLabel={own:'Add owned sets',want:'Add wanted sets',exchangeable:'Choose exchangeable sets',match:'Explore more sets'};
const route={own:'browse',want:'browse',exchangeable:'sets',match:'browse'};

function signedIn(){return !document.querySelector('.bc-signin')&&!!document.querySelector('#bc-main .bc-page')}
function homeState(){
  const checks=[...document.querySelectorAll('.bc-guided-progress .bc-check')];
  if(!checks.length)return null;
  const byTitle=title=>checks.find(x=>x.querySelector('b')?.textContent.includes(title));
  const own=!!byTitle('My Sets')?.classList.contains('done');
  const want=!!byTitle('Sets I Want')?.classList.contains('done');
  const available=!!byTitle('Available to Exchange')?.classList.contains('done');
  const match=!!byTitle('Reciprocal match')?.classList.contains('done');
  return {own,want,available,match};
}
function inferStage(){
  const h=homeState();
  if(h){if(!h.own)return 'own';if(!h.want)return 'want';if(!h.available)return 'exchangeable';return 'match'}
  const hash=(location.hash||'#home').split('/')[0];
  if(hash==='#sets'||hash==='#collection'||hash==='#wishlist'){
    const collection=Number((document.querySelector('[data-settab="collection"]')?.textContent.match(/(\d+)\s*$/)||[])[1]||0);
    const wanted=Number((document.querySelector('[data-settab="wishlist"]')?.textContent.match(/(\d+)\s*$/)||[])[1]||0);
    const available=document.querySelectorAll('[data-exchangeable]:checked').length;
    if(collection<3)return 'own';if(wanted<3)return 'want';if(available<2)return 'exchangeable';return 'match';
  }
  if(hash==='#browse'||hash==='#catalogue'){
    const text=document.querySelector('.bc-head-actions')?.textContent||'';
    const owned=Number((text.match(/(\d+)\s*owned/)||[])[1]||0);
    const wanted=Number((text.match(/(\d+)\s*wanted/)||[])[1]||0);
    if(owned<3)return 'own';if(wanted<3)return 'want';return 'exchangeable';
  }
  return 'match';
}
function navigate(go){if(window.bcNav)window.bcNav(go);else location.hash='#'+go}
function render(){
  const page=document.querySelector('#bc-main .bc-page');
  const existing=document.getElementById(ROOT_ID);
  if(!page||!signedIn()||document.querySelector('.bc-landing-hero')){existing?.remove();return}
  const stage=inferStage(),index={own:0,want:1,exchangeable:2,match:3}[stage];
  if(existing&&existing.parentElement===page&&existing.dataset.stage===stage)return;
  existing?.remove();
  const el=document.createElement('section');el.id=ROOT_ID;el.dataset.stage=stage;el.className='bc-first-match-coach';el.setAttribute('aria-label','Path to your first reciprocal match');
  el.innerHTML=`<div class="bc-first-match-head"><div><div class="bc-first-match-kicker">YOUR FASTEST PATH TO A FIRST MATCH</div><h2>Next: ${actionLabel[stage]}</h2></div><button class="bc-btn primary bc-first-match-action" type="button">${actionLabel[stage]}</button></div><div class="bc-first-match-steps">${labels.map((label,i)=>`<div class="bc-first-match-step ${i<index?'done':i===index?'current':''}">${i<index?'✓ ':''}${label}</div>`).join('')}</div><p class="bc-first-match-copy">${guidance[stage]}</p>`;
  el.querySelector('button').onclick=()=>navigate(route[stage]);
  page.prepend(el);
}
let queued=false;const schedule=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;render()})};
new MutationObserver(schedule).observe(document.documentElement,{subtree:true,childList:true});
window.addEventListener('hashchange',schedule);window.addEventListener('bc:v3',schedule);schedule();
})();
