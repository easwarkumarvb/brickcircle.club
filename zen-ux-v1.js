/* BrickCircle Zen UX — presentation-only progressive disclosure for first-time clarity. */
(()=>{
'use strict';

const ROUTE_CLASSES=['home','browse','catalogue','sets','collection','wishlist','matches','exchanges','requests','returns','meetup','exchange','profile'];
let queued=false;

function route(){return decodeURIComponent((location.hash||'#home').slice(1).split('/')[0]||'home')}
function text(el,value){if(el&&el.textContent!==value)el.textContent=value}
function nav(go){if(window.bcNav)window.bcNav(go);else location.hash='#'+go}
function button(label,go){return `<button class="bc-btn primary" type="button" data-zen-nav="${go}">${label}</button>`}
function bind(root=document){root.querySelectorAll('[data-zen-nav]').forEach(el=>{if(el.dataset.zenBound)return;el.dataset.zenBound='1';el.addEventListener('click',()=>nav(el.dataset.zenNav))})}

function markRoute(){
  document.body.classList.add('bc-zen');
  ROUTE_CLASSES.forEach(name=>document.body.classList.remove(`bc-zen-route-${name}`));
  document.body.classList.remove('bc-zen-home-incomplete','bc-zen-home-ready');
  document.body.classList.add(`bc-zen-route-${route()}`);
}

function signedOutHome(page){return !!page.querySelector('.bc-landing-hero')}

function simplifyLanding(page){
  const hero=page.querySelector('.bc-landing-hero');if(!hero)return;
  const pill=hero.querySelector('.bc-landing-hero-copy .bc-pill');
  const h1=hero.querySelector('.bc-landing-hero-copy h1');
  const p=hero.querySelector('.bc-landing-hero-copy p');
  const actions=hero.querySelectorAll('.bc-hero-actions .bc-btn');
  text(pill,'OWN A SET · WANT A SET · BRICKCIRCLE FINDS THE OVERLAP');
  if(h1)h1.innerHTML='Own a set. Want another. <em>Find the collector who wants yours.</em>';
  text(p,'BrickCircle connects nearby LEGO collectors when the interest works both ways. Meet locally, inspect the sets and exchange them temporarily.');
  text(actions[0],'Add a set I own');text(actions[1],'See how it works');
  const link=hero.querySelector('.bc-showcase-link');if(link)link.innerHTML='When both sides want the exchange, it’s a match <b>⇄</b>';

  page.querySelector('.bc-story')?.classList.add('bc-zen-hidden');
  page.querySelector('#landing-workflow-title')?.closest('.bc-landing-section')?.classList.add('bc-zen-hidden');
  page.querySelector('.bc-example-match')?.classList.add('bc-zen-hidden');
  page.querySelector('.bc-trust')?.classList.add('bc-zen-hidden');

  if(!page.querySelector('.bc-zen-explainer')){
    hero.insertAdjacentHTML('afterend',`<section class="bc-zen-explainer" aria-labelledby="bc-zen-how-title"><h2 id="bc-zen-how-title">Three things. That’s the whole idea.</h2><div class="bc-zen-steps"><article class="bc-zen-step"><small>01 · OWN</small><strong>Add LEGO you already have</strong><p>Your collection is the starting point. You decide which physical sets can be exchanged.</p></article><article class="bc-zen-step"><small>02 · WANT</small><strong>Choose what you want to experience</strong><p>Save sets you would genuinely like to build next.</p></article><article class="bc-zen-step"><small>03 · EXCHANGE</small><strong>BrickCircle finds the mutual match</strong><p>If another nearby collector wants yours and you want theirs, you can start an exchange.</p></article></div><div class="bc-zen-trustline" aria-label="BrickCircle exchange principles"><span>Local meetup</span><span>Inspect before handoff</span><span>Temporary exchange</span></div></section>`);
  }
  if(actions[1])actions[1].onclick=()=>page.querySelector('.bc-zen-explainer')?.scrollIntoView({behavior:'smooth',block:'start'});
  const final=page.querySelector('.bc-landing-final');if(final){text(final.querySelector('span'),'START WITH WHAT YOU OWN');text(final.querySelector('h2'),'Your first set is enough to begin.');text(final.querySelector('button'),'Add a set I own')}
}

function checkByTitle(page,needle){return [...page.querySelectorAll('.bc-guided-progress .bc-check')].find(x=>x.querySelector('b')?.textContent.includes(needle))}
function done(el){return !!el?.classList.contains('done')}

function homeStage(page){
  const owned=checkByTitle(page,'My Sets'),wanted=checkByTitle(page,'Sets I Want'),available=checkByTitle(page,'Available to Exchange'),match=checkByTitle(page,'Reciprocal match');
  if(!owned||!wanted||!available||!match)return null;
  if(!done(owned))return {index:0,kicker:'YOUR NEXT STEP',title:'Add the LEGO you already own.',copy:'Start with your real collection. Search for a set, add it, and BrickCircle will guide you from there.',label:'Find my set',go:'browse',ready:false};
  if(!done(wanted))return {index:1,kicker:'YOUR NEXT STEP',title:'Choose what you want to experience next.',copy:'Save LEGO sets you would genuinely like to build. BrickCircle uses those choices to look for mutual interest.',label:'Find a set I want',go:'browse',ready:false};
  if(!done(available))return {index:2,kicker:'YOUR NEXT STEP',title:'Choose a set you are comfortable exchanging.',copy:'Only the sets you explicitly make available can participate in a mutual match.',label:'Choose an available set',go:'sets',ready:false};
  if(!done(match))return {index:3,kicker:'YOU ARE READY',title:'Now BrickCircle looks for the overlap.',copy:'When a nearby collector wants one of your available sets and you want one of theirs, the mutual match appears automatically.',label:'See mutual matches',go:'matches',ready:true};
  return {index:3,kicker:'MUTUAL INTEREST FOUND',title:'You have a match worth opening.',copy:'Both sides want the exchange. Review the two sets and start only if it feels right.',label:'Open matches',go:'matches',ready:true,matched:true};
}

function simplifySignedInHome(page){
  const stage=homeStage(page);if(!stage)return;
  document.body.classList.toggle('bc-zen-home-incomplete',!stage.ready);
  document.body.classList.toggle('bc-zen-home-ready',stage.ready);
  let focus=page.querySelector('.bc-zen-focus');
  const markup=`<div><div class="bc-zen-focus-kicker">${stage.kicker}</div><h1>${stage.title}</h1><p>${stage.copy}</p><div class="bc-zen-progress" aria-label="First match setup progress"><span class="${stage.index>=0?'done':''}"></span><span class="${stage.index>=1?'done':''}"></span><span class="${stage.index>=2?'done':''}"></span><span class="${stage.index>=3?'current':''}"></span></div></div><div>${button(stage.label,stage.go)}</div>`;
  if(!focus){focus=document.createElement('section');focus.className='bc-zen-focus';page.prepend(focus)}
  const stageKey=String(stage.index)+String(!!stage.matched);
  if(focus.dataset.stage!==stageKey){focus.dataset.stage=stageKey;focus.innerHTML=markup}
  bind(focus);
}

function simplifyBrowse(page){
  const head=page.querySelector('.bc-page-head');if(!head)return;
  text(head.querySelector('h1'),'Find a LEGO set');
  text(head.querySelector('p'),'Search first. On any set, choose only what is true: you own it, or you want to experience it.');
  if(!page.querySelector('.bc-zen-context'))head.insertAdjacentHTML('afterend','<div class="bc-zen-context">Your catalogue can stay large. Your decision stays small.</div>');
  const tools=page.querySelector('.bc-catalogue-tools');
  if(tools&&!page.querySelector('.bc-zen-discovery-toggle')){
    tools.insertAdjacentHTML('afterend','<div class="bc-zen-discovery-toggle"><button class="bc-btn" type="button" data-zen-discovery aria-expanded="false">Explore iconic sets</button></div>');
  }
  const toggle=page.querySelector('[data-zen-discovery]');
  if(toggle&&!toggle.dataset.zenBound){toggle.dataset.zenBound='1';toggle.addEventListener('click',()=>{const open=page.classList.toggle('bc-zen-discovery-open');toggle.setAttribute('aria-expanded',String(open));toggle.textContent=open?'Hide inspiration':'Explore iconic sets'})}
  page.querySelectorAll('.bc-set-actions [data-own]').forEach(b=>{if(!b.classList.contains('on'))text(b,'I own this')});
  page.querySelectorAll('.bc-set-actions [data-want]').forEach(b=>{if(!b.classList.contains('on'))text(b,'I want this')});
}

function countFrom(label){return (label.match(/(\d+)\s*$/)||[])[1]||'0'}
function simplifySets(page){
  const head=page.querySelector('.bc-page-head');if(!head)return;
  text(head.querySelector('h1'),'Your LEGO');
  text(head.querySelector('p'),'Two simple lists: what you own, and what you want to experience.');
  page.querySelectorAll('[data-settab]').forEach(tab=>{const n=countFrom(tab.textContent||'');text(tab,`${tab.dataset.settab==='collection'?'Owned':'Wanted'} · ${n}`)});
  const notice=page.querySelector('#bc-sets-body .bc-notice.warn');if(notice)notice.innerHTML='<b>Ready to exchange one?</b> Switch on only the set you are comfortable offering. Everything else stays out of matching.';
  page.querySelectorAll('.bc-toggle').forEach(label=>{const input=label.querySelector('input');if(input){[...label.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE).forEach(n=>n.textContent=' Offer for exchange')}});
}

function simplifyMatches(page){
  const head=page.querySelector('.bc-page-head');if(!head)return;
  text(head.querySelector('h1'),'Mutual matches');
  text(head.querySelector('p'),'You want their available set. They want yours. That mutual interest is the match.');
  page.querySelectorAll('[data-propose]').forEach(b=>text(b,'Start exchange'));
  page.querySelectorAll('.bc-match .bc-notice.good').forEach(n=>n.innerHTML='<b>Mutual interest confirmed.</b> Review the sets and continue only if you want to exchange with this collector.');
}

function simplifyExchanges(page){
  const head=page.querySelector('.bc-page-head');if(!head)return;
  text(head.querySelector('h1'),'Your exchanges');
  text(head.querySelector('p'),'Requests first. Then meetup, handoff and return — all in one place.');
  page.querySelectorAll('[data-extab]').forEach(tab=>{const n=countFrom(tab.textContent||'');const name=tab.dataset.extab==='active'?'Current':tab.dataset.extab==='completed'?'History':'Requests';text(tab,`${name} · ${n}`)});
}

function simplifyProposalModal(){
  const form=document.querySelector('#bc-proposal');if(!form)return;
  const modal=form.closest('.bc-modal');if(!modal||modal.dataset.zenProposal)return;modal.dataset.zenProposal='1';
  const h2=modal.querySelector('.bc-modal-head h2');if(h2)text(h2,'Start this exchange?');
  const intro=modal.querySelector('.bc-modal-head p');if(intro)text(intro,'Choose a duration and send the proposal. Nothing is handed over until both collectors agree and inspect the sets in person.');
  const labels=modal.querySelectorAll('.bc-field label');if(labels[0])text(labels[0],'Exchange period');if(labels[1])text(labels[1],'Message (optional)');
  const note=form.querySelector('.bc-notice.warn');if(note)note.innerHTML='<b>After they accept:</b> choose a public meetup → inspect both sets → confirm the handoff.';
  text(form.querySelector('button[type="submit"]'),'Send proposal');
}

function apply(){
  markRoute();
  const page=document.querySelector('#bc-main .bc-page');
  if(page){
    if(signedOutHome(page))simplifyLanding(page);
    else if(route()==='home')simplifySignedInHome(page);
    if(route()==='browse'||route()==='catalogue')simplifyBrowse(page);
    if(['sets','collection','wishlist'].includes(route()))simplifySets(page);
    if(route()==='matches')simplifyMatches(page);
    if(['exchanges','requests','returns','meetup'].includes(route()))simplifyExchanges(page);
  }
  simplifyProposalModal();
  bind(document);
}

function schedule(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;apply()})}
new MutationObserver(schedule).observe(document.documentElement,{subtree:true,childList:true});
window.addEventListener('hashchange',schedule);
window.addEventListener('bc:v3',schedule);
window.addEventListener('DOMContentLoaded',schedule);
schedule();
})();
