/* BrickCircle catalogue discovery layer — broad liquidity, aspirational discovery. */
(()=>{
'use strict';

const ACTIVE_CATALOGUE_COUNT=28274;
const TOTAL_CATALOGUE_COUNT=28380;
const THEME_COUNT=423;

const ICONIC_SETS=[
  ['42143','Ferrari Daytona SP3','Technic supercar'],
  ['42115','Lamborghini Sián FKP 37','Technic supercar'],
  ['42083','Bugatti Chiron','Technic supercar'],
  ['42056','Porsche 911 GT3 RS','Technic supercar'],
  ['42141','McLaren Formula 1 Race Car','Technic F1'],
  ['42131','Cat D11 Bulldozer','Technic construction'],
  ['42100','Liebherr R 9800 Excavator','Technic construction'],
  ['42105','Catamaran','Technic marine'],
  ['42145','Airbus H175 Rescue Helicopter','Technic aircraft'],
  ['42130','BMW M 1000 RR','Technic motorcycle'],
  ['10283','NASA Space Shuttle Discovery','Icons / Space'],
  ['21309','NASA Apollo Saturn V','Ideas / Space'],
  ['10318','Concorde','Icons / Aircraft'],
  ['10294','Titanic','Icons'],
  ['10316','The Lord of the Rings: Rivendell','Icons'],
  ['75192','Millennium Falcon','Star Wars']
];

const DISCOVERY_GROUPS=[
  ['Supercars',['42143','42115','42083','42056','42141']],
  ['Machines',['42131','42100']],
  ['Aircraft',['42145','10318']],
  ['Space',['10283','21309']],
  ['Big builds',['10294','10316','75192']],
  ['Marine',['42105']]
];

function esc(value){
  return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}

function styleOnce(){
  if(document.getElementById('bc-catalogue-discovery-style'))return;
  const style=document.createElement('style');
  style.id='bc-catalogue-discovery-style';
  style.textContent=`
    .bc-catalogue-positioning{margin:0 0 18px;padding:18px;border:1px solid #e5e7eb;border-radius:18px;background:linear-gradient(135deg,#fff 0%,#f8fafc 100%)}
    .bc-catalogue-positioning strong{display:block;font-size:1.05rem;margin-bottom:5px;color:#111827}.bc-catalogue-positioning p{margin:0;color:#667085;line-height:1.45}
    .bc-catalogue-stats{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.bc-catalogue-stat{padding:7px 10px;border-radius:999px;background:#111827;color:#fff;font-size:.82rem;font-weight:700}
    .bc-iconic-discovery{margin:18px 0}.bc-iconic-head{display:flex;align-items:end;justify-content:space-between;gap:14px;margin-bottom:10px}.bc-iconic-head h2{margin:0}.bc-iconic-head p{margin:3px 0 0;color:#667085;font-size:.9rem}
    .bc-iconic-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px}.bc-iconic-chip{appearance:none;border:1px solid #e5e7eb;background:#fff;border-radius:14px;padding:11px;text-align:left;cursor:pointer;min-height:74px}.bc-iconic-chip:hover,.bc-iconic-chip:focus-visible{border-color:#111827;box-shadow:0 4px 16px #11182712}.bc-iconic-chip b{display:block;color:#111827;font-size:.9rem;line-height:1.25}.bc-iconic-chip span{display:block;color:#667085;font-size:.76rem;margin-top:4px}.bc-iconic-chip small{display:block;color:#98a2b3;font-size:.72rem;margin-top:3px}
    .bc-discovery-groups{display:flex;gap:7px;flex-wrap:wrap;margin:10px 0 0}.bc-discovery-group{border:1px solid #d0d5dd;background:#f9fafb;border-radius:999px;padding:7px 10px;cursor:pointer;font-size:.82rem;font-weight:700;color:#344054}
    .bc-catalogue-missing{margin:16px 0;padding:15px;border:1px dashed #98a2b3;border-radius:15px;background:#fcfcfd}.bc-catalogue-missing b{display:block;margin-bottom:3px}.bc-catalogue-missing p{margin:0;color:#667085;font-size:.88rem}
    @media(max-width:900px){.bc-iconic-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:560px){.bc-iconic-grid{grid-template-columns:1fr}.bc-iconic-head{align-items:start;flex-direction:column}.bc-catalogue-positioning{padding:15px}}
  `;
  document.head.appendChild(style);
}

function findSet(number){return ICONIC_SETS.find(set=>set[0]===number);}

function runSearch(query){
  const input=document.getElementById('bc-q');
  if(!input)return;
  input.value=query;
  input.dispatchEvent(new Event('input',{bubbles:true}));
  input.focus({preventScroll:true});
  document.querySelector('.bc-catalogue-tools')?.scrollIntoView({behavior:'smooth',block:'start'});
}

function positioningMarkup(){
  return `<section class="bc-catalogue-positioning" data-bc-catalogue-positioning>
    <strong>Almost every LEGO set belongs in BrickCircle.</strong>
    <p>Search the full catalogue by set number, model name or theme. We highlight iconic and complex builds because they create great exchange experiences — but membership is not limited to Technic.</p>
    <div class="bc-catalogue-stats" aria-label="Catalogue coverage">
      <span class="bc-catalogue-stat">${ACTIVE_CATALOGUE_COUNT.toLocaleString()} active sets</span>
      <span class="bc-catalogue-stat">${THEME_COUNT.toLocaleString()} themes</span>
      <span class="bc-catalogue-stat">Any legitimate LEGO set welcome</span>
    </div>
  </section>`;
}

function iconicMarkup(){
  return `<section class="bc-iconic-discovery" data-bc-iconic-discovery>
    <div class="bc-iconic-head"><div><h2>Iconic sets worth experiencing</h2><p>Aspirational discovery without restricting the catalogue.</p></div></div>
    <div class="bc-iconic-grid">${ICONIC_SETS.map(([number,name,kind])=>`<button class="bc-iconic-chip" type="button" data-bc-iconic-set="${number}"><b>${esc(name)}</b><span>${esc(kind)}</span><small>Set ${number}</small></button>`).join('')}</div>
    <div class="bc-discovery-groups" aria-label="Browse iconic groups">${DISCOVERY_GROUPS.map(([name,sets])=>`<button class="bc-discovery-group" type="button" data-bc-group="${sets.join(',')}">${esc(name)}</button>`).join('')}</div>
  </section>`;
}

function missingMarkup(){
  return `<section class="bc-catalogue-missing" data-bc-catalogue-missing><b>Can’t find your set?</b><p>First search the exact LEGO set number. BrickCircle currently carries ${TOTAL_CATALOGUE_COUNT.toLocaleString()} catalogue records, so most official sets should already be here. A dedicated “request a missing set” submission path is the next catalogue step.</p></section>`;
}

function enhanceBrowse(){
  if(!['#browse','#catalogue'].some(prefix=>(location.hash||'').startsWith(prefix)))return;
  const page=document.querySelector('#bc-main .bc-page');
  const tools=page?.querySelector('.bc-catalogue-tools');
  if(!page||!tools)return;
  styleOnce();

  if(!page.querySelector('[data-bc-catalogue-positioning]')){
    const head=page.querySelector('.bc-page-head');
    if(head)head.insertAdjacentHTML('afterend',positioningMarkup());
  }

  const popular=page.querySelector('.bc-popular');
  if(popular&&!page.querySelector('[data-bc-iconic-discovery]')){
    popular.insertAdjacentHTML('afterend',iconicMarkup());
  }

  if(!page.querySelector('[data-bc-catalogue-missing]')){
    const grid=page.querySelector('#bc-set-grid');
    grid?.insertAdjacentHTML('afterend',missingMarkup());
  }

  page.querySelectorAll('[data-bc-iconic-set]').forEach(button=>{
    if(button.dataset.bound)return;
    button.dataset.bound='1';
    button.addEventListener('click',()=>runSearch(button.dataset.bcIconicSet));
  });

  page.querySelectorAll('[data-bc-group]').forEach(button=>{
    if(button.dataset.bound)return;
    button.dataset.bound='1';
    button.addEventListener('click',()=>{
      const first=String(button.dataset.bcGroup||'').split(',')[0];
      const set=findSet(first);
      if(set)runSearch(set[2].split(' ')[0]);
    });
  });

  const input=document.getElementById('bc-q');
  if(input){
    input.placeholder='Search any LEGO set — number, model or theme (e.g. 42143, Ferrari, Catamaran)';
    input.setAttribute('aria-label','Search the BrickCircle LEGO catalogue by set number, model name or theme');
  }
}

let scheduled=false;
function scheduleEnhance(){
  if(scheduled)return;
  scheduled=true;
  requestAnimationFrame(()=>{scheduled=false;enhanceBrowse();});
}

new MutationObserver(scheduleEnhance).observe(document.documentElement,{subtree:true,childList:true});
window.addEventListener('hashchange',scheduleEnhance);
window.addEventListener('DOMContentLoaded',scheduleEnhance);
scheduleEnhance();
})();
