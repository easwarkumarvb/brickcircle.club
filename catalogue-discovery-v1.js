/* BrickCircle catalogue discovery layer — broad liquidity, aspirational discovery. */
(()=>{
'use strict';

const ACTIVE_CATALOGUE_COUNT=28274;
const TOTAL_CATALOGUE_COUNT=28380;
const THEME_COUNT=423;

const ICONIC_SETS=[
  ['42143','Ferrari Daytona SP3','supercars'],
  ['42115','Lamborghini Sián FKP 37','supercars'],
  ['42083','Bugatti Chiron','supercars'],
  ['42056','Porsche 911 GT3 RS','supercars'],
  ['42172','McLaren P1','supercars'],
  ['42141','McLaren Formula 1 Race Car','supercars'],
  ['42171','Mercedes-AMG F1 W14','supercars'],
  ['42154','Ford GT','supercars'],
  ['42125','Ferrari 488 GTE','supercars'],
  ['42110','Land Rover Defender','supercars'],
  ['42131','Cat D11 Bulldozer','engineering'],
  ['42100','Liebherr R 9800 Excavator','engineering'],
  ['42146','Liebherr Crawler Crane LR 13000','engineering'],
  ['42145','Airbus H175 Rescue Helicopter','engineering'],
  ['42130','BMW M 1000 RR','engineering'],
  ['42159','Yamaha MT-10 SP','engineering'],
  ['42105','Catamaran','engineering'],
  ['42128','Heavy Duty Tow Truck','engineering'],
  ['10283','NASA Space Shuttle Discovery','space'],
  ['21309','NASA Apollo Saturn V','space'],
  ['10318','Concorde','space'],
  ['92176','NASA Apollo Saturn V (reissue)','space'],
  ['10341','NASA Artemis Space Launch System','space'],
  ['21321','International Space Station','space'],
  ['10266','NASA Apollo 11 Lunar Lander','space'],
  ['10294','Titanic','landmarks'],
  ['10316','The Lord of the Rings: Rivendell','landmarks'],
  ['10333','The Lord of the Rings: Barad-dûr','landmarks'],
  ['10307','Eiffel Tower','landmarks'],
  ['10276','Colosseum','landmarks'],
  ['10326','Natural History Museum','landmarks'],
  ['10255','Assembly Square','landmarks'],
  ['10312','Jazz Club','landmarks'],
  ['10297','Boutique Hotel','landmarks'],
  ['21061','Notre-Dame de Paris','landmarks'],
  ['75192','Millennium Falcon','stories'],
  ['75313','AT-AT','stories'],
  ['75367','Venator-Class Republic Attack Cruiser','stories'],
  ['75331','The Razor Crest','stories'],
  ['75355','X-Wing Starfighter','stories'],
  ['76178','Daily Bugle','stories'],
  ['76269','Avengers Tower','stories'],
  ['76240','Batmobile Tumbler','stories'],
  ['10300','Back to the Future Time Machine','stories'],
  ['10302','Optimus Prime','stories'],
  ['10327','Dune Atreides Royal Ornithopter','stories'],
  ['10323','PAC-MAN Arcade','stories'],
  ['10306','Atari 2600','stories'],
  ['21344','The Orient Express Train','stories'],
  ['21330','Home Alone','stories']
];

const DISCOVERY_GROUPS=[
  ['all','All 50'],
  ['supercars','Supercars'],
  ['engineering','Engineering'],
  ['space','Space & flight'],
  ['landmarks','Landmarks'],
  ['stories','Screen & display']
];

const GROUP_LABELS=Object.fromEntries(DISCOVERY_GROUPS.filter(([key])=>key!=='all'));
const IMAGE_BASE='https://images.brickset.com/sets/images/';
const ICONIC_EAGER_COUNT=6;

function esc(value){
  return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}

function directImage(number){return `${IMAGE_BASE}${encodeURIComponent(number)}-1.jpg`;}
function proxyImage(number){return `https://images.weserv.nl/?url=${encodeURIComponent(`images.brickset.com/sets/images/${number}-1.jpg`)}&w=640&h=420&fit=contain&output=webp`;}

function wireIconicImages(root){
  const images=[...root.querySelectorAll('[data-bc-iconic-image]')];
  const load=image=>{
    if(image.src||!image.dataset.src)return;
    image.src=image.dataset.src;
    delete image.dataset.src;
  };
  const fail=image=>{
    const stage=Number(image.dataset.stage||0);
    if(stage===0){image.dataset.stage='1';image.src=proxyImage(image.dataset.set);return;}
    const visual=image.closest('.bc-iconic-visual');
    if(visual)visual.innerHTML='<span class="bc-iconic-fallback" aria-hidden="true">🧱</span>';
  };
  images.forEach(image=>{
    if(image.dataset.imageBound)return;
    image.dataset.imageBound='1';
    image.addEventListener('error',()=>fail(image));
  });
  const pending=images.filter(image=>image.dataset.src);
  if(!pending.length)return;
  if(!('IntersectionObserver' in window)){pending.forEach(load);return;}
  const rail=root.querySelector('.bc-iconic-grid');
  const observer=new IntersectionObserver(entries=>{
    entries.forEach(entry=>{
      if(!entry.isIntersecting)return;
      load(entry.target);
      observer.unobserve(entry.target);
    });
  },{root:rail,rootMargin:'0px 360px'});
  pending.forEach(image=>observer.observe(image));
}

function styleOnce(){
  if(document.getElementById('bc-catalogue-discovery-style'))return;
  const style=document.createElement('style');
  style.id='bc-catalogue-discovery-style';
  style.textContent=`
    .bc-catalogue-positioning{margin:0 0 18px;padding:18px;border:1px solid #e5e7eb;border-radius:18px;background:linear-gradient(135deg,#fff 0%,#f8fafc 100%)}
    .bc-catalogue-positioning strong{display:block;font-size:1.05rem;margin-bottom:5px;color:#111827}.bc-catalogue-positioning p{margin:0;color:#667085;line-height:1.45}
    .bc-catalogue-stats{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.bc-catalogue-stat{padding:7px 10px;border-radius:999px;background:#111827;color:#fff;font-size:.82rem;font-weight:700}
    .bc-iconic-discovery{margin:18px 0}.bc-iconic-head{display:flex;align-items:end;justify-content:space-between;gap:14px;margin-bottom:10px}.bc-iconic-head h2{margin:0}.bc-iconic-head p{margin:3px 0 0;color:#667085;font-size:.9rem}.bc-iconic-count{white-space:nowrap;color:#475467;font-size:.8rem;font-weight:800}
    .bc-discovery-groups{display:flex;gap:7px;overflow-x:auto;margin:0 0 10px;padding:1px 1px 5px;scrollbar-width:none}.bc-discovery-groups::-webkit-scrollbar{display:none}.bc-discovery-group{flex:0 0 auto;border:1px solid #d0d5dd;background:#fff;border-radius:999px;padding:8px 11px;cursor:pointer;font-size:.82rem;font-weight:800;color:#344054}.bc-discovery-group[aria-pressed="true"]{background:#111827;border-color:#111827;color:#fff}
    .bc-iconic-grid{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(210px,240px);gap:11px;overflow-x:auto;overscroll-behavior-inline:contain;scroll-snap-type:inline mandatory;padding:2px 2px 10px;scrollbar-color:#cbd5e1 transparent}.bc-iconic-card{appearance:none;display:flex;flex-direction:column;min-width:0;padding:0;overflow:hidden;border:1px solid #e5e7eb;background:#fff;border-radius:16px;text-align:left;cursor:pointer;scroll-snap-align:start}.bc-iconic-card:hover,.bc-iconic-card:focus-visible{border-color:#111827;box-shadow:0 7px 22px #11182716}.bc-iconic-card[hidden]{display:none}.bc-iconic-visual{height:145px;display:grid;place-items:center;background:linear-gradient(145deg,#f8fafc,#fff);border-bottom:1px solid #eef1f5;overflow:hidden}.bc-iconic-visual img{width:100%;height:100%;object-fit:contain;padding:9px}.bc-iconic-fallback{font-size:42px}.bc-iconic-copy{display:block;padding:12px}.bc-iconic-copy b{display:block;color:#111827;font-size:.92rem;line-height:1.25;min-height:2.35em}.bc-iconic-copy span{display:block;color:#667085;font-size:.77rem;margin-top:5px}.bc-iconic-copy small{display:block;color:#98a2b3;font-size:.73rem;margin-top:3px}
    .bc-catalogue-missing{margin:16px 0;padding:15px;border:1px dashed #98a2b3;border-radius:15px;background:#fcfcfd}.bc-catalogue-missing b{display:block;margin-bottom:3px}.bc-catalogue-missing p{margin:0;color:#667085;font-size:.88rem}
    @media(max-width:560px){.bc-iconic-head{align-items:start;flex-direction:column}.bc-iconic-grid{grid-auto-columns:minmax(190px,76vw)}.bc-iconic-visual{height:138px}.bc-catalogue-positioning{padding:15px}}
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
  const cards=ICONIC_SETS.map(([number,name,group],index)=>{
    const sourceAttribute=index<ICONIC_EAGER_COUNT?`src="${directImage(number)}"`:`data-src="${directImage(number)}"`;
    const loading=index<ICONIC_EAGER_COUNT?'eager':'lazy';
    const priority=index<3?'high':'auto';
    return `<button class="bc-iconic-card" type="button" data-bc-iconic-set="${number}" data-bc-iconic-group="${group}" aria-label="Explore ${esc(name)}, LEGO set ${number}">
      <span class="bc-iconic-visual"><img ${sourceAttribute} data-bc-iconic-image data-set="${number}" data-stage="0" alt="${esc(name)} LEGO set ${number}" width="320" height="210" loading="${loading}" fetchpriority="${priority}" decoding="async"></span>
      <span class="bc-iconic-copy"><b>${esc(name)}</b><span>${esc(GROUP_LABELS[group])}</span><small>Set ${number}</small></span>
    </button>`;
  }).join('');
  return `<section class="bc-iconic-discovery" data-bc-iconic-discovery>
    <div class="bc-iconic-head"><div><h2>Iconic sets worth experiencing</h2><p>Swipe or scroll through 50 collector favourites, then choose one to search the full catalogue.</p></div><span class="bc-iconic-count">50 sets · images load as needed</span></div>
    <div class="bc-discovery-groups" aria-label="Filter iconic sets">${DISCOVERY_GROUPS.map(([key,label],index)=>`<button class="bc-discovery-group" type="button" data-bc-iconic-filter="${key}" aria-pressed="${index===0?'true':'false'}">${esc(label)}</button>`).join('')}</div>
    <div class="bc-iconic-grid" aria-label="Iconic LEGO set gallery">${cards}</div>
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
  wireIconicImages(page);

  if(!page.querySelector('[data-bc-catalogue-missing]')){
    const grid=page.querySelector('#bc-set-grid');
    grid?.insertAdjacentHTML('afterend',missingMarkup());
  }

  page.querySelectorAll('[data-bc-iconic-set]').forEach(button=>{
    if(button.dataset.bound)return;
    button.dataset.bound='1';
    button.addEventListener('click',()=>runSearch(button.dataset.bcIconicSet));
  });

  page.querySelectorAll('[data-bc-iconic-filter]').forEach(button=>{
    if(button.dataset.bound)return;
    button.dataset.bound='1';
    button.addEventListener('click',()=>{
      const group=button.dataset.bcIconicFilter||'all';
      page.querySelectorAll('[data-bc-iconic-filter]').forEach(filter=>filter.setAttribute('aria-pressed',String(filter===button)));
      page.querySelectorAll('[data-bc-iconic-group]').forEach(card=>{card.hidden=group!=='all'&&card.dataset.bcIconicGroup!==group;});
      page.querySelector('.bc-iconic-grid')?.scrollTo({left:0,behavior:'smooth'});
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

document.addEventListener('bc:render',scheduleEnhance);
window.addEventListener('hashchange',scheduleEnhance);
window.addEventListener('DOMContentLoaded',scheduleEnhance);
scheduleEnhance();
})();
