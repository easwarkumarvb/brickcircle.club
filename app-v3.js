/* BrickCircle V3 — one router, one Supabase client, one navigation system. */
(()=>{
'use strict';
const SUPABASE_URL='https://nsxtromjdpdscknadxez.supabase.co';
const SUPABASE_KEY='sb_publishable_JJhVbgjGblHrnKuPOsJkxQ_zRoQNlIL';
const SUPPORT_EMAIL='support@brickcircle.club';
let lastHiddenAt=0,lastVisibleAt=Date.now(),lastRoute='';
async function resilientAuthLock(name,acquireTimeout,fn){
  const locks=navigator?.locks;if(!locks?.request)return fn();
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),acquireTimeout>0?Math.min(acquireTimeout,3500):3500);
  try{return await locks.request(name,{mode:'exclusive',signal:controller.signal},()=>fn())}
  catch(error){if(error?.name!=='AbortError')throw error;console.warn('BrickCircle recovered a stalled cross-tab auth lock.');return fn()}
  finally{clearTimeout(timer)}
}
const db=window.supabase?.createClient?.(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,lock:resilientAuthLock}});
if(!db){document.body.innerHTML='<main style="padding:30px;font-family:system-ui">BrickCircle could not start. Please refresh. If the problem continues, email <a href="mailto:support@brickcircle.club">support@brickcircle.club</a>.</main>';return;}
window.BC_SUPABASE=db;
window.BC_V3=true;

const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const attr=esc;
const fmtDate=x=>x?new Date(x).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'}):'';
const fmtDateTime=x=>x?new Date(x).toLocaleString(undefined,{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}):'';
const money=x=>Number(x)>0?'$'+Number(x).toLocaleString():'Value not listed';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const withTimeout=(promise,ms=12000)=>Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(new Error('This is taking longer than expected. Please check your connection and try again.')),ms))]);
const safeDecode=value=>{try{return decodeURIComponent(value)}catch(_){return value}};
const routeName=()=>{const name=safeDecode((location.hash||'#home').slice(1).split('/')[0]||'home');return name==='inbox'?'messages':name};
const routeId=()=>safeDecode((location.hash||'').slice(1).split('/')[1]||'');
const isSignedIn=()=>!!S.user;
const betaPWAEnabled=()=>window.BC_BETA_FLAGS?.pwaEnabled===true;
const LOC=()=>window.BC_LOCATIONS||{};
const countries=()=>Object.keys(LOC()).sort((a,b)=>a.localeCompare(b));
const popularSets=['42143','42115','42083','42056','42141','42172','10283','21309','10318','10307'];
const desktopRoutes=[['home','⌂','Home'],['browse','⌕','Find Sets'],['sets','🧱','My LEGO'],['matches','⇄','Matches'],['exchanges','🤝','Exchanges'],['messages','💬','Messages']];
const mobileRoutes=[['home','⌂','Home'],['browse','⌕','Find Sets'],['sets','🧱','My LEGO'],['matches','⇄','Matches'],['messages','💬','Messages']];

const CATALOGUE_SEARCH_LIMIT=100;
const CATALOGUE_TIMEOUT_MS=8000;
// Editorial selections: full builds only. See docs/curated-catalogue.md.
const CURATED_CATEGORY_LISTS=Object.freeze([
  {id:'technic',label:'Technic',sets:Object.freeze([
    '42143-1', // Ferrari Daytona SP3
    '42115-1', // Lamborghini Sián FKP 37
    '42083-1', // Bugatti Chiron
    '42056-1', // Porsche 911 GT3 RS
    '42172-1', // McLaren P1
    '42171-1', // Mercedes-AMG F1 W14 E Performance
    '42141-1', // McLaren Formula 1 Team 2022 (First Edition)
    '42100-1', // Liebherr R 9800 Excavator
    '42131-1', // Cat D11 Bulldozer
    '42146-1', // Liebherr Crawler Crane LR 13000
    '42055-1', // Bucket Wheel Excavator
    '42082-1', // Rough Terrain Crane
    '42043-1', // Mercedes-Benz Arocs 3245
    '42145-1', // Airbus H175 Rescue Helicopter
    '42158-1', // NASA Mars Rover Perseverance
    '42110-1', // Land Rover Defender
    '42114-1', // 6x6 Volvo Articulated Hauler
    '42128-1', // Heavy Duty Tow Truck
    '42129-1', // 4x4 Mercedes-Benz Zetros Trial Truck
    '42030-1', // Remote-Controlled Volvo L350F Wheel Loader
    '42099-1', // 4x4 X-treme Off-Roader
    '42154-1', // 2022 Ford GT
    '42156-1', // Peugeot 9X8 Le Mans Hybrid Hypercar
    '42161-1', // Lamborghini Huracán Tecnica
    '42125-1', // Ferrari 488 GTE "AF Corse #51"
  ])},
  {id:'supercars',label:'Supercars',sets:Object.freeze([
    '42143-1', // Ferrari Daytona SP3
    '42115-1', // Lamborghini Sián FKP 37
    '42083-1', // Bugatti Chiron
    '42056-1', // Porsche 911 GT3 RS
    '42172-1', // McLaren P1
    '42125-1', // Ferrari 488 GTE "AF Corse #51"
    '42154-1', // 2022 Ford GT
    '42156-1', // Peugeot 9X8 Le Mans Hybrid Hypercar
    '42161-1', // Lamborghini Huracán Tecnica
    '76918-1', // McLaren Solus GT & McLaren F1 LM
    '76914-1', // Ferrari 812 Competizione
    '76915-1', // Pagani Utopia
    '76908-1', // Lamborghini Countach
    '76916-1', // Porsche 963
    '76896-1', // Nissan GT-R NISMO
  ])},
  {id:'f1',label:'F1',sets:Object.freeze([
    '42141-1', // McLaren Formula 1 Team 2022 (First Edition)
    '42171-1', // Mercedes-AMG F1 W14 E Performance
    '10330-1', // McLaren MP4/4 & Ayrton Senna
    '76919-1', // 2023 McLaren Formula 1 Car
    '76909-1', // Mercedes-AMG F1 W12 E Performance & Mercedes-AMG Project One
  ])},
  {id:'space',label:'Space',sets:Object.freeze([
    '10283-1', // NASA Space Shuttle Discovery
    '10341-1', // NASA Artemis Space Launch System
    '21309-1', // NASA Apollo Saturn V
    '10266-1', // NASA Apollo 11 Lunar Lander
    '21321-1', // International Space Station
    '42158-1', // NASA Mars Rover Perseverance
    '42179-1', // Planet Earth and Moon in Orbit
  ])},
  {id:'engineering',label:'Engineering',sets:Object.freeze([
    '42146-1', // Liebherr Crawler Crane LR 13000
    '42100-1', // Liebherr R 9800 Excavator
    '42131-1', // Cat D11 Bulldozer
    '42055-1', // Bucket Wheel Excavator
    '42082-1', // Rough Terrain Crane
    '42043-1', // Mercedes-Benz Arocs 3245
    '42030-1', // Remote-Controlled Volvo L350F Wheel Loader
    '42128-1', // Heavy Duty Tow Truck
    '42145-1', // Airbus H175 Rescue Helicopter
    '10318-1', // Concorde
    '10294-1', // Titanic
    '10277-1', // Crocodile Locomotive
    '10233-1', // Horizon Express
    '10219-1', // Maersk Container Train
    '21344-1', // The Orient Express Train
  ])},
  {id:'landmarks',label:'Landmarks',sets:Object.freeze([
    '10307-1', // Eiffel Tower
    '10276-1', // Colosseum
    '10214-1', // Tower Bridge
    '10253-1', // Big Ben
    '21061-1', // Notre-Dame de Paris
    '21060-1', // Himeji Castle
    '21058-1', // Great Pyramid of Giza
    '21042-1', // Statue of Liberty
    '21046-1', // Empire State Building
    '21034-1', // London
    '21028-1', // New York City
    '21044-1', // Paris
    '21054-1', // The White House
    '21056-1', // Taj Mahal
  ])},
  {id:'city',label:'City',sets:Object.freeze([
    '60380-1', // Downtown
    '60337-1', // Express Passenger Train
    '60336-1', // Freight Train
    '60271-1', // Main Square
    '60423-1', // Downtown Streetcar and Station
  ])},
  {id:'friends',label:'Friends',sets:Object.freeze([
    '42639-1', // Andrea's Modern Mansion
    '41748-1', // Heartlake City Community Center
    '41704-1', // Main Street Building
    '42604-1', // Heartlake City Shopping Mall
    '41732-1', // Downtown Flower and Design Stores
  ])},
  {id:'icons',label:'Icons',sets:Object.freeze([
    '10305-1', // Lion Knights' Castle
    '10316-1', // Lord of the Rings: Rivendell
    '10333-1', // The Lord of the Rings: Barad-dûr
    '10323-1', // PAC-MAN Arcade
    '10326-1', // Natural History Museum
    '10355-1', // Blacktron Renegade
    '10300-1', // Back to the Future Time Machine
    '10303-1', // Loop Coaster
    '10261-1', // Roller Coaster
    '10273-1', // Haunted House
    '10295-1', // Porsche 911 Turbo & 911 Targa
    '10265-1', // Ford Mustang
    '10262-1', // James Bond Aston Martin DB5
    '10279-1', // Volkswagen T2 Camper Van
    '10252-1', // Volkswagen Beetle
    '10220-1', // Volkswagen T1 Camper Van
    '10242-1', // MINI Cooper
    '10248-1', // Ferrari F40
    '10271-1', // Fiat 500
    '10290-1', // Pickup Truck
    '10304-1', // Chevrolet Camaro Z/28 1969
    '10317-1', // Land Rover Classic Defender 90
    '10321-1', // Corvette
    '10330-1', // McLaren MP4/4 & Ayrton Senna
    '10337-1', // Lamborghini Countach 5000 Quattrovalvole
    '10294-1', // Titanic
    '10318-1', // Concorde
  ])},
  {id:'star-wars',label:'Star Wars',sets:Object.freeze([
    '75192-1', // Millennium Falcon
    '75313-1', // AT-AT
    '75367-1', // Venator-Class Republic Attack Cruiser
    '75252-1', // Imperial Star Destroyer
    '75331-1', // The Razor Crest
    '75355-1', // X-Wing Starfighter
    '10240-1', // Red Five X-Wing Starfighter
  ])},
  {id:'disney',label:'Disney',sets:Object.freeze([
    '43222-1', // Disney Castle
    '71044-1', // Disney Train and Station
    '43242-1', // Snow White and the Seven Dwarfs' Cottage
    '43230-1', // Walt Disney Tribute Camera
    '43217-1', // Up House​
    '21326-1', // Winnie the Pooh
    '43202-1', // The Madrigal House
    '71040-1', // Disney Castle
  ])}
]);
const CURATED_DEFAULT_IDS=(()=>{
  const ordered=[],seen=new Set();
  const longest=Math.max(...CURATED_CATEGORY_LISTS.map(category=>category.sets.length));
  for(let index=0;index<longest&&ordered.length<CATALOGUE_SEARCH_LIMIT;index++){
    for(const category of CURATED_CATEGORY_LISTS){
      const id=category.sets[index];
      if(id&&!seen.has(id)){seen.add(id);ordered.push(id)}
      if(ordered.length===CATALOGUE_SEARCH_LIMIT)break;
    }
  }
  return Object.freeze(ordered);
})();
const CURATED_CATEGORIES=Object.freeze([{id:'all',label:'All favourites',sets:CURATED_DEFAULT_IDS},...CURATED_CATEGORY_LISTS]);
const OWNER_USER_ID='388ee0a7-2b93-4505-a70c-f4766d7ad50a';
const ADULT_CONFIRMATION_VERSION='2026-09-11';
const ADULT_ATTESTATION='I confirm that I am at least 18 years old and legally able to participate in BrickCircle exchanges.';
const LIFECYCLE_NOTIFICATION_KINDS=new Set(['exchange_proposed','exchange_countered','exchange_accepted','exchange_declined','exchange_withdrawn','exchange_expired','exchange_cancelled','meetup_proposed','meetup_accepted','meetup_arrival','inspection_approved','handoff_confirmation_required','exchange_activated','early_return_requested','return_meetup_proposed','return_meetup_accepted','return_arrival','return_inspection_approved','return_confirmation_required','exchange_disputed','exchange_completed','exchange_message','exchange_issue_reported','exchange_issue_response','reciprocal_match']);
let catalogueSequence=0;
let catalogueController=null;
let catalogueTimer=null;
const exchangeabilityOperations=new Map();
const exchangeabilityQueues=new Map();
const ownerPhotoUrls=new Map();
const OWNER_PHOTO_TYPES=new Set(['image/jpeg','image/png','image/webp']);
const OWNER_PHOTO_MAX_BYTES=8*1024*1024;
const canonicalOperationMemory=new Map();

function stableOperationValue(value){if(Array.isArray(value))return value.map(stableOperationValue);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stableOperationValue(value[key])]));return value}
function canonicalOperationFingerprint(name,intent){return JSON.stringify(stableOperationValue({operation:name,intent}))}
function canonicalOperationStore(){return `bc_canonical_ops:${S.user?.id||'anonymous'}`}
function canonicalOperationEntries(){try{return JSON.parse(sessionStorage.getItem(canonicalOperationStore())||'{}')}catch(_){return {}}}
function canonicalOperationKey(name,intent){const fingerprint=canonicalOperationFingerprint(name,intent),memoryKey=`${canonicalOperationStore()}:${fingerprint}`,stored=canonicalOperationEntries(),existing=stored[fingerprint]||canonicalOperationMemory.get(memoryKey);if(existing)return existing;const key=crypto.randomUUID();stored[fingerprint]=key;canonicalOperationMemory.set(memoryKey,key);try{sessionStorage.setItem(canonicalOperationStore(),JSON.stringify(stored))}catch(_){}return key}
function reconcileCanonicalOperation(name,intent){const fingerprint=canonicalOperationFingerprint(name,intent),memoryKey=`${canonicalOperationStore()}:${fingerprint}`,stored=canonicalOperationEntries();delete stored[fingerprint];canonicalOperationMemory.delete(memoryKey);try{sessionStorage.setItem(canonicalOperationStore(),JSON.stringify(stored))}catch(_){}}
async function canonicalRpc(name,args,intent){const key=canonicalOperationKey(name,intent),result=await db.rpc(name,{...args,p_idempotency_key:key});if(!result.error&&result.data?.ok!==false)reconcileCanonicalOperation(name,intent);return result}

const S={
  user:null,profile:null,liquidity:null,membership:null,collection:[],wishlist:[],matches:[],
  requests:[],exchanges:[],notifications:[],messages:[],reviews:[],profiles:{},items:{},sets:{},
  reputation:{},caseOverdue:{},submittedPeerReviews:new Set(),
  exchangeCapabilities:{checked:true,releaseItem:true,contractVersion:2},
  browse:{page:0,q:'',theme:'',year:'',rows:[],busy:false,lastCount:0,category:'all'},
  setTab:'collection',exchangeTab:'active',providers:{google:true,apple:false},
  booted:false,installPrompt:null,renderToken:0,refreshWarning:''
};
let pendingAuthChange=null;
let notificationChannel=null;
let notificationPollTimer=null;
let notificationRealtimeGeneration=0;
let refreshGeneration=0;
let a11ySequence=0;

function rememberRoute(){const hash=location.hash||'#home';if(hash&&hash!=='#home')lastRoute=hash;try{sessionStorage.setItem('bc_last_route',hash)}catch(_){}}
function isResumeWindow(){const now=Date.now();return document.hidden||now-lastHiddenAt<6000||now-lastVisibleAt<2500}
async function recoverSession(){
  try{const current=await db.auth.getSession();if(current?.data?.session?.user)return current.data.session}catch(_){}
  try{const refreshed=await db.auth.refreshSession?.();if(refreshed?.data?.session?.user)return refreshed.data.session}catch(_){}
  return null;
}
async function validateResume(){
  if(document.hidden)return;const session=await recoverSession();if(!session)return;
  const remembered=lastRoute||(()=>{try{return sessionStorage.getItem('bc_last_route')||''}catch(_){return ''}})();
  if((location.hash||'#home')==='#home'&&remembered&&remembered!=='#home')location.hash=remembered;
  await refreshRoute();
}

function track(event,properties={}){
  try{window.bcProductAnalytics?.track?.(event,properties)}catch(_){ }
  try{window.dispatchEvent(new CustomEvent('bc:v3',{detail:{event,properties}}))}catch(_){ }
}
function announceRender(root=document){queueMicrotask(()=>{try{document.dispatchEvent(new CustomEvent('bc:render',{detail:{root,route:routeName()}}))}catch(_){}})}
function applyA11y(root=document){
  $$('.bc-field',root).forEach(field=>{const label=$(':scope > label',field),control=$(':scope > input, :scope > select, :scope > textarea',field);if(!label||!control)return;if(!control.id)control.id=`bc-a11y-${++a11ySequence}`;if(!label.htmlFor)label.htmlFor=control.id});
  $$('[role="dialog"]',root).forEach(dialog=>{if(dialog.getAttribute('aria-label')||dialog.getAttribute('aria-labelledby'))return;const title=$('h1,h2,h3',dialog);if(title){if(!title.id)title.id=`bc-a11y-${++a11ySequence}`;dialog.setAttribute('aria-labelledby',title.id)}});
  $$('.bc-close',root).forEach(button=>{if(!button.getAttribute('aria-label'))button.setAttribute('aria-label','Close dialog')});
  const theme=$('#bc-theme',root);if(theme&&!theme.getAttribute('aria-label'))theme.setAttribute('aria-label','Filter LEGO sets by theme');const year=$('#bc-year',root);if(year&&!year.getAttribute('aria-label'))year.setAttribute('aria-label','Filter LEGO sets by year');
  $$('textarea[placeholder]:not([aria-label]),input[placeholder]:not([aria-label])',root).forEach(control=>control.setAttribute('aria-label',control.getAttribute('placeholder')||'Input'));
}
function toast(msg){
  $('.bc-toast')?.remove();const el=document.createElement('div');el.className='bc-toast';el.textContent=msg;document.body.appendChild(el);announceRender(el);setTimeout(()=>el.remove(),2800);
}
function fail(error,fallback='Something went wrong. Please try again.'){
  console.error(error);toast(error?.message||fallback);
}
function modal(html,wide=false){
  closeOverlay();const opener=document.activeElement,o=document.createElement('div');o.className='bc-overlay';o.id='bc-overlay';o.innerHTML=`<section class="bc-modal ${wide?'wide':''}" role="dialog" aria-modal="true">${html}</section>`;o.bcReturnFocus=opener;document.body.appendChild(o);
  const controls=()=>$$('a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',o).filter(el=>el.getClientRects().length);
  o.addEventListener('click',e=>{if(e.target===o)closeOverlay()});
  o.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();closeOverlay();return}
    if(event.key!=='Tab')return;
    const items=controls(),first=items[0],last=items[items.length-1];
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}
  });
  applyA11y(o);controls()[0]?.focus();announceRender(o);return o;
}
function closeOverlay(){const overlay=document.getElementById('bc-overlay'),opener=overlay?.bcReturnFocus;overlay?.remove();if(opener?.isConnected)opener.focus()}
function drawer(html){
  document.getElementById('bc-drawer-overlay')?.remove();const o=document.createElement('div');o.className='bc-drawer-overlay';o.id='bc-drawer-overlay';o.innerHTML=`<aside class="bc-drawer">${html}</aside>`;document.body.appendChild(o);o.addEventListener('click',e=>{if(e.target===o)o.remove()});applyA11y(o);announceRender(o);return o;
}
function loading(label='Loading BrickCircle…'){return `<div class="bc-loading"><div><div class="bc-spinner"></div>${esc(label)}</div></div>`}
function empty(icon,title,copy,button='',action=''){return `<div class="bc-empty"><div class="bc-empty-icon">${icon}</div><h2>${esc(title)}</h2><p>${esc(copy)}</p>${button?`<button class="bc-btn primary" data-action="${attr(action)}">${esc(button)}</button>`:''}</div>`}
function pill(text,type=''){return `<span class="bc-pill ${type}">${esc(text)}</span>`}
function initials(name){return String(name||'B').trim().slice(0,1).toUpperCase()||'B'}
function avatar(p,size='mini'){
  const initial=initials(p?.display_name),url=p?.avatar_url?publicAvatar(p.avatar_url):'';
  return `<span class="bc-avatar-media" data-avatar-media><span class="bc-avatar-initial" aria-hidden="true">${esc(initial)}</span>${url?`<img src="${attr(url)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-avatar-image>`:''}</span>`;
}
function publicAvatar(path){
  const value=String(path||'').trim();if(!value)return '';
  if(/^https:\/\//i.test(value))return value;
  if(/^[a-z][a-z0-9+.-]*:/i.test(value))return '';
  return db.storage.from('avatars').getPublicUrl(value).data?.publicUrl||'';
}
function wireAvatars(root=document){
  $$('[data-avatar-media]',root).forEach(media=>{
    const image=$('[data-avatar-image]',media);if(!image||image.dataset.bcAvatarBound)return;
    image.dataset.bcAvatarBound='1';
    const ready=()=>media.classList.add('bc-avatar-ready');
    const failed=()=>{media.classList.remove('bc-avatar-ready');image.remove()};
    image.addEventListener('load',ready,{once:true});
    image.addEventListener('error',failed,{once:true});
    if(image.complete){if(image.naturalWidth>0)ready();else failed()}
  });
}
function imageSetNumber(set){return /-\d+$/.test(String(set||''))?String(set):`${String(set||'')}-1`}
function setImage(set,name='',priority=false){
  const src=`https://images.brickset.com/sets/images/${encodeURIComponent(imageSetNumber(set))}.jpg`;
  return `<div class="bc-set-image"><img src="${src}" alt="LEGO set ${attr(set)}${name?' — '+attr(name):''}" loading="${priority?'eager':'lazy'}" ${priority?'fetchpriority="high"':''} decoding="async" data-set-image="${attr(set)}"><div class="bc-set-placeholder" hidden>🧱</div></div>`;
}
function wireImages(root=document){
  $$('img[data-set-image]',root).forEach(img=>{
    if(img.dataset.bound)return;img.dataset.bound='1';let retry=false;
    img.addEventListener('error',()=>{if(!retry){retry=true;const s=imageSetNumber(img.dataset.setImage);img.src=`https://images.weserv.nl/?url=${encodeURIComponent(`images.brickset.com/sets/images/${s}.jpg`)}&w=700&fit=contain&output=jpg`;return}img.hidden=true;img.nextElementSibling?.removeAttribute('hidden')});
  });
}

function parseJoinIntent(){return new URLSearchParams(location.search).get('join')==='1'}
function captureReferral(){const ref=new URLSearchParams(location.search).get('ref');if(ref)try{localStorage.setItem('bc_pending_referral',ref.slice(0,80))}catch(_){}}
function clearQueryParam(name){
  try{const u=new URL(location.href);u.searchParams.delete(name);const query=u.searchParams.toString();history.replaceState({},'',u.pathname+(query?'?'+query:'')+(u.hash||'#home'))}catch(_){ }
}
function cleanOAuthQuery(){
  try{const u=new URL(location.href);['oauth','code','error','error_code','error_description'].forEach(name=>u.searchParams.delete(name));const query=u.searchParams.toString();history.replaceState({},'',u.pathname+(query?'?'+query:'')+(u.hash||'#home'))}catch(_){ }
}
function cleanRecoveryUrl(){
  try{
    const u=new URL(location.href);['code','token_hash','type','error','error_code','error_description'].forEach(name=>u.searchParams.delete(name));
    const fragment=new URLSearchParams(u.hash.replace(/^#/,'')),recoveryHash=['access_token','refresh_token','expires_in','token_type','type'].some(name=>fragment.has(name));
    const query=u.searchParams.toString(),hash=recoveryHash||!u.hash?'#profile':u.hash;
    history.replaceState({},'',u.pathname+(query?'?'+query:'')+hash);
  }catch(_){ }
}

function navigate(page,id=''){
  const next='#'+page+(id?'/'+encodeURIComponent(id):'');
  if(location.hash===next){renderRoute();return}
  location.hash=next;
}

function shell(){
  let root=document.getElementById('bc-root');if(!root){root=document.createElement('div');root.id='bc-root';document.body.appendChild(root)}
  const nav=desktopRoutes.map(([p,i,l])=>`<button data-nav="${p}" class="${routeName()===p?'active':''}">${l}</button>`).join('');
  const mobile=mobileRoutes.map(([p,i,l])=>`<button data-nav="${p}" class="${routeName()===p?'active':''}" aria-label="${l}" ${routeName()===p?'aria-current="page"':''}><span>${i}</span>${l}</button>`).join('');
  const unread=S.notifications.filter(n=>!n.read_at).length;
  const identity=S.profile||{};
  root.innerHTML=`<header class="bc-topbar"><div class="bc-topbar-in"><button class="bc-logo" data-nav="home" aria-label="BrickCircle home"><img src="/assets/brickcircle-logo.png?v=20260913-logo" alt=""><span class="bc-brand-copy"><strong>BrickCircle</strong><small>Buy Less. Build More.</small></span></button><nav class="bc-desktop-nav" aria-label="Primary navigation">${nav}</nav><div class="bc-top-actions">${S.user?`<button class="bc-icon-btn" data-open="inbox" aria-label="Messages">💬</button><button class="bc-icon-btn" data-open="notifications" aria-label="Notifications">🔔${unread?`<span class="bc-badge">${unread>9?'9+':unread}</span>`:''}</button>${S.user.id===OWNER_USER_ID?'<a class="bc-owner-admin-link" href="/admin.html" aria-label="Open BrickCircle admin dashboard">Admin</a>':''}<button class="bc-avatar-btn" data-nav="profile" aria-label="Profile and account controls">${avatar(identity)}</button><button class="bc-top-signout" type="button" data-signout-top>Log out</button>`:`<button class="bc-signin" data-auth>Join / Sign in</button>`}</div></div></header><main id="bc-main" class="bc-main">${loading()}</main><nav class="bc-mobile-nav" aria-label="Mobile navigation">${mobile}</nav>`;
  wireAvatars(root);bindShell(root);
}
function bindShell(root=document){
  $$('[data-nav]',root).forEach(b=>b.onclick=()=>navigate(b.dataset.nav));
  $$('[data-auth]',root).forEach(b=>b.onclick=showAuth);
  $$('[data-signout-top]',root).forEach(b=>b.onclick=signOut);
  $$('[data-open="notifications"]',root).forEach(b=>b.onclick=showNotifications);
  $$('[data-open="inbox"]',root).forEach(b=>b.onclick=()=>navigate('messages'));
}
function syncNav(){
  $$('[data-nav]').forEach(b=>{const active=b.dataset.nav===routeName();b.classList.toggle('active',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')});
}
function app(){return document.getElementById('bc-main')}
function page(html){const a=app();if(!a)return;const warning=S.refreshWarning?`<div class="bc-notice warn bc-refresh-warning" role="status" style="margin-bottom:14px"><b>Some information could not refresh.</b> Your last confirmed view is still shown. <button class="bc-btn ghost" data-refresh-retry>Retry</button></div>`:'';a.innerHTML=`<div class="bc-page">${S.user&&routeName()!=='messages'?firstMatchCoach():''}${warning}${html}</div>`;wireImages(a);wireAvatars(a);applyA11y(a);bindCommon(a);syncNav();announceRender(a);window.scrollTo({top:0,behavior:'instant'})}
function bindCommon(root=document){
  $$('[data-action="browse"]',root).forEach(b=>b.onclick=()=>navigate('browse'));
  $$('[data-action="sets"]',root).forEach(b=>b.onclick=()=>navigate('sets'));
  $$('[data-action="matches"]',root).forEach(b=>b.onclick=()=>navigate('matches'));
  $$('[data-action="exchanges"]',root).forEach(b=>b.onclick=()=>navigate('exchanges'));
  $$('[data-action="messages"]',root).forEach(b=>b.onclick=()=>navigate('messages'));
  $$('[data-open-exchange]',root).forEach(b=>b.onclick=()=>navigate('exchange',b.dataset.openExchange));
  $$('[data-auth]',root).forEach(b=>b.onclick=showAuth);
  $$('[data-refresh-retry]',root).forEach(b=>b.onclick=async()=>{b.disabled=true;await refreshRoute()});
}

async function providerSettings(){
  try{const r=await fetch(`${SUPABASE_URL}/auth/v1/settings`,{headers:{apikey:SUPABASE_KEY}});if(r.ok)S.providers=(await r.json())?.external||S.providers}catch(_){ }
}
async function oauth(provider,button){
  const original=button?.textContent||'';if(button){button.disabled=true;button.textContent=`Opening ${provider==='google'?'Google':provider}…`}
  try{
    const {data,error}=await withTimeout(db.auth.signInWithOAuth({provider,options:{redirectTo:`${location.origin}/v2.html`,skipBrowserRedirect:true,...(provider==='google'?{queryParams:{prompt:'select_account'}}:{})}}),10000);
    if(error)throw error;if(!data?.url)throw new Error(`${provider==='google'?'Google':provider} sign-in is temporarily unavailable. Please try again.`);location.assign(data.url);
  }catch(error){fail(error,`${provider} sign-in is unavailable.`);if(button){button.disabled=false;button.textContent=original}}
}
document.addEventListener('click',event=>{const button=event.target.closest?.('[data-auth]');if(!button||button.closest('#bc-overlay'))return;event.preventDefault();event.stopImmediatePropagation();showAuth()},true);
function showAuth(){
  const google=S.providers.google!==false,apple=!!S.providers.apple;
  const o=modal(`<div class="bc-modal-head"><div><h2>Join BrickCircle</h2><p class="bc-muted">Google sign-in is the fastest way to start. Your collection and exchanges stay tied to one BrickCircle account.</p></div><button class="bc-close" data-close>×</button></div><div class="bc-form"><button class="bc-auth-provider google" data-oauth="google" ${google?'':'disabled'}>Continue with Google</button>${apple?'<button class="bc-auth-provider apple" data-oauth="apple">Continue with Apple</button>':''}<div class="bc-auth-sep">or use email</div><div class="bc-tabs"><button class="bc-tab active" data-auth-tab="signin">Sign in</button><button class="bc-tab" data-auth-tab="signup">Create account</button></div><div id="bc-auth-email"></div><div class="bc-small">By continuing, you agree to our <a href="/terms.html">Terms of Use</a> and acknowledge our <a href="/privacy.html">Privacy Policy</a>. Please use BrickCircle responsibly, meet in safe public places and inspect sets before exchanging.</div></div>`);
  $('[data-close]',o).onclick=closeOverlay;$$('[data-oauth]',o).forEach(b=>b.onclick=()=>oauth(b.dataset.oauth,b));$$('[data-auth-tab]',o).forEach(b=>b.onclick=()=>{const mode=b.dataset.authTab;$$('[data-auth-tab]',o).forEach(x=>x.classList.toggle('active',x===b));renderEmailAuth(mode,o)});renderEmailAuth('signin',o);track('auth_opened');
}
function renderEmailAuth(mode,o=document){
  const host=$('#bc-auth-email',o);if(!host)return;
  host.innerHTML=mode==='signin'?`<form class="bc-form" id="bc-email-signin"><div class="bc-field"><label>Email</label><input class="bc-input" name="email" type="email" autocomplete="email" required></div><div class="bc-field"><label>Password</label><input class="bc-input" name="password" type="password" autocomplete="current-password" minlength="6" required></div><button class="bc-btn primary" type="submit">Sign in</button><button class="bc-btn ghost" type="button" data-forgot>Forgot password?</button></form>`:`<form class="bc-form" id="bc-email-signup"><div class="bc-field"><label>Collector name</label><input class="bc-input" name="name" autocomplete="name" required></div><div class="bc-field"><label>Email</label><input class="bc-input" name="email" type="email" autocomplete="email" required></div><div class="bc-field"><label>Password</label><input class="bc-input" name="password" type="password" autocomplete="new-password" minlength="6" required></div><label class="bc-consent"><input name="adult_confirmation" type="checkbox" required><span>${esc(ADULT_ATTESTATION)}</span></label><button class="bc-btn primary" type="submit">Create account</button></form>`;
  applyA11y(host);
  const signin=$('#bc-email-signin',host);if(signin)signin.onsubmit=async e=>{e.preventDefault();const f=new FormData(signin),btn=$('button:not([type="button"])',signin);btn.disabled=true;btn.textContent='Signing in…';const {error}=await db.auth.signInWithPassword({email:String(f.get('email')),password:String(f.get('password'))});if(error){fail(error);btn.disabled=false;btn.textContent='Sign in'}else closeOverlay()};
  $('[data-forgot]',host)?.addEventListener('click',async()=>{const email=prompt('Enter your BrickCircle email');if(!email)return;const {error}=await db.auth.resetPasswordForEmail(email,{redirectTo:`${location.origin}/v2.html#profile`});toast(error?error.message:'Password reset email sent.')});
  const signup=$('#bc-email-signup',host);if(signup)signup.onsubmit=async e=>{e.preventDefault();const f=new FormData(signup);if(f.get('adult_confirmation')!=='on')return toast('Please confirm that you are at least 18 years old.');const btn=$('button',signup);btn.disabled=true;btn.textContent='Creating account…';const {data,error}=await db.auth.signUp({email:String(f.get('email')),password:String(f.get('password')),options:{data:{full_name:String(f.get('name')),adult_confirmation_version:ADULT_CONFIRMATION_VERSION,adult_attestation:ADULT_ATTESTATION},emailRedirectTo:`${location.origin}/v2.html`}});if(error){fail(error);btn.disabled=false;btn.textContent='Create account';return}closeOverlay();toast(data.session?'Account created.':'Account created — check your email to confirm.');};
}
function showPasswordRecovery(){
  if($('#bc-password-recovery'))return;
  const o=modal(`<div class="bc-modal-head"><div><h2>Set new password</h2><p class="bc-muted">Choose a new password for your BrickCircle account.</p></div></div><form class="bc-form" id="bc-password-recovery"><div class="bc-field"><label>New password</label><input class="bc-input" name="password" type="password" autocomplete="new-password" minlength="6" required></div><div class="bc-field"><label>Confirm password</label><input class="bc-input" name="confirm" type="password" autocomplete="new-password" minlength="6" required></div><button class="bc-btn primary" type="submit">Save new password</button></form>`);
  const form=$('#bc-password-recovery',o);form.onsubmit=async e=>{e.preventDefault();const f=new FormData(form),password=String(f.get('password')||''),confirmPassword=String(f.get('confirm')||''),btn=$('button[type="submit"]',form);if(password.length<6)return toast('Password must be at least 6 characters.');if(password!==confirmPassword)return toast('Passwords do not match.');btn.disabled=true;btn.textContent='Saving…';try{const {error}=await withTimeout(db.auth.updateUser({password}),10000);if(error)throw error;closeOverlay();cleanRecoveryUrl();await refreshCore();shell();navigate('profile');toast('Password updated. You are still signed in.')}catch(error){fail(error,'Could not update your password. Please try again.');btn.disabled=false;btn.textContent='Save new password'}};
  $('[name="password"]',form)?.focus();
}
async function claimReferralAndProvider(){
  if(!S.user)return;try{const code=localStorage.getItem('bc_pending_referral');if(code){await db.rpc('bc_claim_referral',{p_code:code});localStorage.removeItem('bc_pending_referral')}}catch(_){ }
  try{const provider=S.user.app_metadata?.provider||S.user.identities?.[0]?.provider||'unknown';await db.rpc('bc_record_auth_provider',{p_provider:provider})}catch(_){ }
}
function locationOptions(selected=''){return '<option value="">Select country</option>'+countries().map(c=>`<option value="${attr(c)}" ${c===selected?'selected':''}>${esc(c)}</option>`).join('')}
function cityOptions(country,selected=''){const xs=LOC()[country]||[];return '<option value="">'+(country?'Select city':'Select country first')+'</option>'+xs.map(c=>`<option value="${attr(c)}" ${c===selected?'selected':''}>${esc(c)}</option>`).join('')}
async function onboardingIfNeeded(){
  if(!S.user)return false;let p=S.profile;
  if(!p){await wait(250);const x=await db.from('profiles').select('*').eq('id',S.user.id).maybeSingle();p=S.profile=x.data||null}
  if(p?.display_name&&p?.country&&p?.city&&p?.adult_confirmed_at)return false;
  showOnboarding();return true;
}
function showOnboarding(){
  const p=S.profile||{},name=p.display_name||S.user?.user_metadata?.full_name||S.user?.user_metadata?.name||'';
  const o=modal(`<div class="bc-modal-head"><div><span class="bc-pill gold">Step 1 of 5 · Match setup</span><h2 style="margin-top:8px">Where do you collect?</h2><p class="bc-muted">BrickCircle matches collectors locally. Choose the city where you can meet another adult collector in person.</p></div></div><form class="bc-form" id="bc-onboard"><div class="bc-field"><label>Collector name</label><input class="bc-input" name="name" value="${attr(name)}" required></div><div class="bc-field"><label>Country</label><select class="bc-select" name="country" required>${locationOptions(p.country||'')}</select></div><div class="bc-field"><label>City</label><select class="bc-select" name="city" required>${cityOptions(p.country||'',p.city||'')}</select></div>${p.adult_confirmed_at?'<div class="bc-notice good"><b>18+ confirmed</b> Your adult status is already recorded.</div>':`<label class="bc-consent"><input name="adult_confirmation" type="checkbox" required><span>${esc(ADULT_ATTESTATION)}</span></label>`}<button class="bc-btn primary">Continue to add my LEGO sets</button><div class="bc-small">Your exact address is never required for matching. BrickCircle uses your city only to find local exchange opportunities.</div></form>`);
  const form=$('#bc-onboard',o),country=$('[name="country"]',form),city=$('[name="city"]',form);country.onchange=()=>{city.innerHTML=cityOptions(country.value);city.disabled=!country.value};form.onsubmit=async e=>{e.preventDefault();if(form.dataset.bcSaving==='1')return;form.dataset.bcSaving='1';const f=new FormData(form),needsAdultConfirmation=!p.adult_confirmed_at,btn=$('button',form),original=btn.textContent;if(needsAdultConfirmation&&f.get('adult_confirmation')!=='on'){form.dataset.bcSaving='0';return toast('Please confirm that you are at least 18 years old.');}btn.disabled=true;btn.textContent='Saving…';try{const {data:{user},error:userError}=await withTimeout(db.auth.getUser(),8000);if(userError||!user)throw userError||new Error('Your sign-in session expired. Please sign in again.');const patch={id:user.id,display_name:String(f.get('name')||'').trim(),country:String(f.get('country')||'').trim(),city:String(f.get('city')||'').trim(),updated_at:new Date().toISOString()};if(!patch.display_name||!patch.country||!patch.city)throw new Error('Please choose your name, country and city.');const {error}=await withTimeout(db.from('profiles').upsert(patch,{onConflict:'id'}),12000);if(error)throw error;if(needsAdultConfirmation){const confirmation=await withTimeout(db.rpc('confirm_adult_status',{p_attestation:ADULT_ATTESTATION,p_version:ADULT_CONFIRMATION_VERSION}),12000);if(confirmation.error)throw confirmation.error;patch.adult_confirmed_at=confirmation.data||new Date().toISOString();patch.adult_confirmation_version=ADULT_CONFIRMATION_VERSION}S.profile={...(S.profile||{}),...patch};closeOverlay();await refreshCore();S.setTab='collection';navigate('browse');toast('Great — now add at least 3 LEGO sets you own.');track('onboarding_location_completed',patch)}catch(error){fail(error,'Could not save your profile. Please retry.');form.dataset.bcSaving='0';btn.disabled=false;btn.textContent=original}};
}

function clearProtectedState(){S.user=null;S.profile=null;S.collection=[];S.wishlist=[];S.matches=[];S.requests=[];S.exchanges=[];S.notifications=[];S.messages=[];S.reviews=[];S.liquidity=null;S.membership=null;S.exchangeCapabilities={checked:true,releaseItem:true,contractVersion:2};S.profiles={};S.items={};S.sets={};threadCaches.direct.clear();threadCaches.case.clear();threadDrafts.clear();pendingSends.clear();messageIndexByUid.clear();messageIndexUid=null;}
async function refreshMembership(){const result=await settledTimeout(db.rpc('bc_membership_status'));if(!result.error)S.membership=Array.isArray(result.data)?result.data[0]:result.data;return result}
const settled=promise=>Promise.resolve(promise).catch(error=>({data:null,error}));
const settledTimeout=(promise,ms=10000)=>settled(withTimeout(promise,ms));
const missingAuthSession=error=>error?.name==='AuthSessionMissingError'||/auth session missing/i.test(String(error?.message||''));
async function refreshCore(){
  const generation=++refreshGeneration;
  const auth=await settledTimeout(db.auth.getUser()),authError=auth.error||null,user=auth.data?.user||null;
  if(generation!==refreshGeneration)return;
  if(authError){
    if(missingAuthSession(authError)){clearProtectedState();S.refreshWarning='';return}
    const status=Number(authError.status||0);
    S.refreshWarning=authError.message||'Your session could not be refreshed.';
    if(status===401||status===403){clearProtectedState();return}
    if(!S.user)return;
  }else{
    S.user=user;
    if(!S.user){clearProtectedState();S.refreshWarning='';return}
  }
  const uid=S.user.id;
  const [p,c,w,ex,n,caseMsg,directMsg,liq,membership]=await Promise.all([
    settledTimeout(db.from('profiles').select('*').eq('id',uid).maybeSingle()),
    settledTimeout(db.from('collection_items').select('*,lego_sets(*)').eq('user_id',uid).order('created_at',{ascending:false})),
    settledTimeout(db.from('wishlists').select('*,lego_sets(*)').eq('user_id',uid).order('created_at',{ascending:false})),
    settledTimeout(db.from('exchange_cases').select('*').or(`user_a.eq.${uid},user_b.eq.${uid}`).order('created_at',{ascending:false}).limit(80)),
    settledTimeout(db.from('notifications').select('*').eq('user_id',uid).order('created_at',{ascending:false}).limit(50)),
    settledTimeout(db.from('exchange_case_messages').select('*').or(`sender_id.eq.${uid},recipient_id.eq.${uid}`).order('created_at',{ascending:false}).limit(100)),
    settledTimeout(db.from('messages').select('*').or(`sender_id.eq.${uid},recipient_id.eq.${uid}`).is('exchange_id',null).order('created_at',{ascending:false}).limit(100)),
    settledTimeout(db.rpc('bc_liquidity_status')),
    settledTimeout(db.rpc('bc_membership_status'))
  ]);
  if(generation!==refreshGeneration||S.user?.id!==uid)return;
  const failures=[p,c,w,ex,n,caseMsg,directMsg,liq,membership].filter(result=>result.error);
  if(!p.error)S.profile=p.data||null;if(!c.error)S.collection=c.data||[];if(!w.error)S.wishlist=w.data||[];if(!ex.error){S.exchanges=ex.data||[];S.requests=S.exchanges.filter(row=>row.state==='PROPOSED')}if(!n.error)S.notifications=n.data||[];if(!caseMsg.error&&!directMsg.error)S.messages=[...(caseMsg.data||[]).map(row=>({...row,conversation_kind:'case'})),...(directMsg.data||[]).map(row=>({...row,conversation_kind:'direct'}))];
  if(!liq.error)S.liquidity=Array.isArray(liq.data)?liq.data[0]:liq.data;
  if(!membership.error)S.membership=Array.isArray(membership.data)?membership.data[0]:membership.data;
  const m=await settledTimeout(db.rpc('find_matches',{p_user:uid}));if(generation!==refreshGeneration||S.user?.id!==uid)return;if(!m.error)S.matches=m.data||[];else failures.push(m);
  S.refreshWarning=failures.length?(failures[0].error?.message||'Some BrickCircle information could not refresh.'):(authError?S.refreshWarning:'');
  S.collection.forEach(i=>{S.items[i.id]=i;if(i.lego_sets)S.sets[i.set_number]=i.lego_sets});S.wishlist.forEach(i=>{if(i.lego_sets)S.sets[i.set_number]=i.lego_sets});
  window.bcWebPush?.consider(S.user,{meaningful:S.collection.length+S.wishlist.length>0});
  const people=new Set();S.exchanges.forEach(e=>{people.add(e.user_a);people.add(e.user_b)});S.matches.forEach(m=>people.add(m.match_user));S.messages.forEach(m=>{people.add(m.sender_id);people.add(m.recipient_id)});people.delete(uid);if(people.size){const result=await settledTimeout(db.from('public_profiles').select('id,display_name,country,city,bio,avatar_url,rating,review_count,identity_verified,member_since').in('id',[...people]));if(generation!==refreshGeneration||S.user?.id!==uid)return;if(result.error)S.refreshWarning=S.refreshWarning||result.error.message||'Collector details could not refresh.';else(result.data||[]).forEach(p=>S.profiles[p.id]=p)}
}
async function refreshRoute(){await refreshCore();shell();await renderRoute()}

function isProposalNotification(notification){return notification?.kind==='exchange_proposed'}
function isReciprocalMatchNotification(notification){return notification?.kind==='reciprocal_match'&&notification?.entity_type==='reciprocal_match'}
function notificationRequestId(notification){return notification?.exchange_case_id||notification?.metadata?.exchange_case_id||''}
function isCurrentNotificationRecipient(notification){return !!S.user?.id&&notification?.user_id===S.user.id}
function isPendingProposalNotification(notification){
  if(!isCurrentNotificationRecipient(notification)||!isProposalNotification(notification))return false;
  const requestId=notificationRequestId(notification),request=S.exchanges.find(item=>item.id===requestId);
  return !!request&&request.state==='PROPOSED';
}
function notificationPresentationActive(){return !!document.querySelector('[data-bc-notification-presentation],#bc-exchange-lifecycle-notice,.bc-match-login-notice')}
function clearNotificationPresentation(){
  window.BC_PROPOSAL_NOTICE_ACTIVE=false;
  document.querySelectorAll('[data-bc-notification-presentation],#bc-exchange-lifecycle-notice,.bc-match-login-notice').forEach(element=>element.remove());
}
function updateNotificationBadge(){
  const button=$('[data-open="notifications"]');if(!button)return;
  const unread=S.notifications.filter(notification=>!notification.read_at).length;
  let badge=$('.bc-badge',button);
  if(!unread){badge?.remove();return}
  if(!badge){badge=document.createElement('span');badge.className='bc-badge';button.appendChild(badge)}
  badge.textContent=unread>9?'9+':String(unread);
}
async function markNotificationRead(notification){
  if(!notification||notification.read_at)return true;
  const readAt=new Date().toISOString();
  const {error}=await db.from('notifications').update({read_at:readAt}).eq('id',notification.id).eq('user_id',S.user.id);
  if(error){fail(error,'Could not mark this notification as read.');return false}
  notification.read_at=readAt;updateNotificationBadge();return true;
}
async function openNotification(notification){
  if(!notification)return;
  if(!await markNotificationRead(notification))return;
  document.getElementById('bc-drawer-overlay')?.remove();
  if(isProposalNotification(notification)){
    await refreshCore();
    navigate('exchange',notificationRequestId(notification));
    return;
  }
  if(isReciprocalMatchNotification(notification)){navigate('matches');return}
  if(notification?.kind==='message_received'&&!notificationExchangeId(notification)){
    const actor=notification?.metadata?.actor_user_id||notification?.actor_user_id||notification?.sender_id;
    navigate('messages',actor?`direct:${actor}`:'');
    return;
  }
  if(notification?.kind==='exchange_message'){
    const caseId=notification?.exchange_case_id||notification?.metadata?.exchange_case_id;
    if(caseId){navigate('messages',`case:${caseId}`);return}
  }
  const exchangeId=notification?.exchange_case_id||notification?.metadata?.exchange_case_id||notification?.metadata?.exchange_id;
  if(exchangeId){navigate('exchange',exchangeId);return}
  shell();await renderRoute();
}
function stopNotificationRealtime(){
  notificationRealtimeGeneration++;
  clearInterval(notificationPollTimer);notificationPollTimer=null;
  if(!notificationChannel)return;
  try{db.removeChannel?.(notificationChannel)}catch(_){try{notificationChannel.unsubscribe?.()}catch(__){}}
  notificationChannel=null;
}
function applyNotificationChange(payload){
  const row=payload?.new||payload?.old;if(!row?.id||!isCurrentNotificationRecipient(row))return;
  if(payload.eventType==='DELETE')S.notifications=S.notifications.filter(notification=>notification.id!==row.id);
  else{
    const index=S.notifications.findIndex(notification=>notification.id===row.id);
    if(index>=0)S.notifications[index]={...S.notifications[index],...row};else S.notifications.unshift(row);
  }
  updateNotificationBadge();
  if(payload.eventType==='INSERT'&&!row.read_at){if(isProposalNotification(row))toast(row.body||'You have a new exchange proposal.');else showLifecycleNotification(row)}
}
async function reconcileNotifications(){
  const uid=S.user?.id;if(!uid)return;
  const result=await settledTimeout(db.from('notifications').select('*').eq('user_id',uid).order('created_at',{ascending:false}).limit(50));
  if(result.error||S.user?.id!==uid)return;
  S.notifications=result.data||[];updateNotificationBadge();
  showNextUnreadNotificationNotice();
}
async function startNotificationRealtime(){
  stopNotificationRealtime();
  if(!S.user?.id)return;
  const userId=S.user.id,generation=notificationRealtimeGeneration;
  const stillCurrent=()=>notificationRealtimeGeneration===generation&&S.user?.id===userId;
  const verified=await db.auth.getUser();
  if(verified.error||verified.data?.user?.id!==userId||!stillCurrent())return;
  notificationPollTimer=setInterval(()=>reconcileNotifications().catch(()=>{}),30000);
  if(typeof db.channel!=='function'||typeof db.realtime?.setAuth!=='function')return;
  try{await db.realtime.setAuth()}catch(_){return}
  if(!stillCurrent())return;
  const afterAuth=await db.auth.getUser();
  if(afterAuth.error||afterAuth.data?.user?.id!==userId||!stillCurrent())return;
  const channel=db.channel(`notifications:${userId}`)
    .on('postgres_changes',{event:'*',schema:'public',table:'notifications',filter:`user_id=eq.${userId}`},applyNotificationChange)
    .subscribe(status=>{if(!stillCurrent()){try{db.removeChannel?.(channel)}catch(_){};return}if(status==='SUBSCRIBED')reconcileNotifications().catch(()=>{})});
  if(!stillCurrent()){try{db.removeChannel?.(channel)}catch(_){};return}
  notificationChannel=channel;
}
function proposalNoticeSeen(notification){try{return sessionStorage.getItem(`bc_proposal_notice_seen:${S.user.id}:${notification.id}`)==='1'}catch(_){return false}}
function markProposalNoticeSeen(notification){try{sessionStorage.setItem(`bc_proposal_notice_seen:${S.user.id}:${notification.id}`,'1')}catch(_){}}
function showUnreadProposalNotice(){
  if(!S.user?.id||notificationPresentationActive())return false;
  const notification=S.notifications.find(item=>!item.read_at&&isPendingProposalNotification(item));
  if(!notification||proposalNoticeSeen(notification))return false;
  markProposalNoticeSeen(notification);window.BC_PROPOSAL_NOTICE_ACTIVE=true;
  const close=()=>{window.BC_PROPOSAL_NOTICE_ACTIVE=false;closeOverlay()};
  const o=modal(`<div class="bc-modal-head"><div><span class="bc-pill gold">New proposal</span><h2 style="margin-top:8px">You have a new exchange proposal</h2><p class="bc-muted">${esc(notification.body||'A collector proposed an exchange with you.')}</p></div><button class="bc-close" data-close>×</button></div><div class="bc-form-actions"><button class="bc-btn" data-close>Not now</button><button class="bc-btn primary" data-view-proposal>View proposal</button></div>`);
  o.dataset.bcNotificationPresentation='proposal';
  o.querySelectorAll('[data-close]').forEach(button=>button.onclick=close);
  $('[data-view-proposal]',o).onclick=async()=>{window.BC_PROPOSAL_NOTICE_ACTIVE=false;closeOverlay();await openNotification(notification)};
  return true;
}

function notificationExchangeId(notification){return notification?.exchange_case_id||notification?.metadata?.exchange_case_id||notification?.metadata?.exchange_id}
function lifecyclePresentation(notification){
  if(notification.kind==='reciprocal_match')return {label:'New local match',fallback:'A nearby collector has a reciprocal LEGO match with you.',action:'View matches',route:'matches'};
  if(notification.kind==='exchange_accepted')return {label:'Exchange accepted',fallback:'Your BrickCircle exchange has been accepted.',action:'Open exchanges',route:'exchanges'};
  if(notification.kind==='exchange_declined')return {label:'Proposal declined',fallback:'Your BrickCircle proposal was declined.',action:'Open exchanges',route:'exchanges'};
  if(notification.kind==='exchange_cancelled')return {label:'Proposal cancelled',fallback:'Your BrickCircle exchange was cancelled.',action:'Open exchanges',route:'exchanges'};
  if(notification.kind==='message_received'){
    const actor=notification?.metadata?.actor_user_id||notification?.actor_user_id||notification?.sender_id;
    if(!notificationExchangeId(notification)&&actor)return {label:'New message',fallback:'A collector sent you a BrickCircle message.',action:'Open conversation',route:'messages',thread:`direct:${actor}`};
    return {label:'New message',fallback:'A collector sent you a BrickCircle message.',action:'Open conversation',route:'messages'};
  }
  if(notification.kind==='exchange_message'){
    const caseId=notification?.exchange_case_id||notification?.metadata?.exchange_case_id;
    if(caseId)return {label:'New message',fallback:'A collector sent you a BrickCircle message.',action:'Open conversation',route:'messages',thread:`case:${caseId}`};
    return {label:'New message',fallback:'A collector sent you a BrickCircle message.',action:'Open conversation',route:'messages'};
  }
  if(notification.kind==='exchange_issue_reported')return {label:'Issue reported',fallback:'A peer reported an issue on your BrickCircle exchange.',action:'Open issue',route:'exchange',exchangeId:notificationExchangeId(notification)};
  if(notification.kind==='exchange_issue_response')return {label:'New issue response',fallback:'A peer responded to an issue on your BrickCircle exchange.',action:'Open issue',route:'exchange',exchangeId:notificationExchangeId(notification)};
  return {label:'Exchange updated',fallback:'Your BrickCircle exchange has been updated.',action:'Open exchanges',route:'exchanges'};
}
function lifecycleNoticeSeen(notification){try{return sessionStorage.getItem(`bc_lifecycle_notice_seen:${S.user?.id}:${notification.id}`)==='1'}catch(_){return false}}
function showLifecycleNotification(notification){
  if(!isCurrentNotificationRecipient(notification)||notification.read_at||!LIFECYCLE_NOTIFICATION_KINDS.has(notification.kind)||lifecycleNoticeSeen(notification)||notificationPresentationActive())return false;
  try{sessionStorage.setItem(`bc_lifecycle_notice_seen:${S.user.id}:${notification.id}`,'1')}catch(_){}
  const view=lifecyclePresentation(notification),root=document.createElement('section');root.id='bc-exchange-lifecycle-notice';root.className='bc-lifecycle-notice';root.setAttribute('role','status');
  root.innerHTML=`<span>${esc(view.label)}</span><h2>${esc(notification.title||view.label)}</h2><p>${esc(notification.body||view.fallback)}</p><div><button class="bc-btn" type="button" data-life-later>Not now</button><button class="bc-btn primary" type="button" data-life-open>${esc(view.action)}</button></div>`;
  document.body.appendChild(root);$('[data-life-later]',root).onclick=()=>root.remove();$('[data-life-open]',root).onclick=async()=>{await markNotificationRead(notification);root.remove();if(view.thread)navigate('messages',view.thread);else if(view.exchangeId)navigate('exchange',view.exchangeId);else navigate(view.route)};return true;
}
function showUnreadLifecycleNotice(){const notification=S.notifications.find(item=>!item.read_at&&isCurrentNotificationRecipient(item)&&LIFECYCLE_NOTIFICATION_KINDS.has(item.kind));return showLifecycleNotification(notification)}
function showNextUnreadNotificationNotice(){
  if(!S.user?.id||notificationPresentationActive())return false;
  return showUnreadProposalNotice()||showUnreadLifecycleNotice();
}

function loginMatchNoticeSeen(){try{return sessionStorage.getItem(`bc_login_match_notice_seen:${S.user?.id}`)==='1'}catch(_){return false}}
function showLoginMatchNotice(){
  if(!S.user||!S.matches.length||loginMatchNoticeSeen()||window.BC_PROPOSAL_NOTICE_ACTIVE||document.getElementById('bc-exchange-lifecycle-notice')||$('.bc-match-login-notice'))return false;
  const match=S.matches[0],profile=S.profiles[match.match_user]||{},notice=document.createElement('section');
  try{sessionStorage.setItem(`bc_login_match_notice_seen:${S.user.id}`,'1')}catch(_){}
  notice.className='bc-match-login-notice';notice.setAttribute('role','status');notice.innerHTML=`<h2>New local match found</h2><p><b>${esc(profile.display_name||'A nearby member')}</b> has <b>${esc(match.requested_name||match.requested_set)}</b> available and wants <b>${esc(match.offered_name||match.offered_set)}</b>.${S.matches.length>1?` You have ${S.matches.length} local reciprocal matches in total.`:''}</p><div class="bc-match-login-actions"><button class="bc-btn primary" type="button" data-view-match>View matches</button><button class="bc-btn" type="button" data-dismiss-match>Not now</button></div>`;
  document.body.appendChild(notice);$('[data-view-match]',notice).onclick=()=>{notice.remove();navigate('matches')};$('[data-dismiss-match]',notice).onclick=()=>notice.remove();return true;
}

function readiness(){
  const l=S.liquidity||{},steps=[
    {done:!!(S.profile?.display_name&&S.profile?.city&&S.profile?.country),title:'Profile + city',desc:S.profile?.city||'Choose your city',go:'profile'},
    {done:Number(l.collection_count||S.collection.length)>=3,title:'3 sets owned',desc:`${Number(l.collection_count||S.collection.length)}/3`,go:'browse'},
    {done:Number(l.exchangeable_count||S.collection.filter(x=>x.available_for_exchange).length)>=1,title:'1 exchangeable',desc:`${Number(l.exchangeable_count||S.collection.filter(x=>x.available_for_exchange).length)}/1`,go:'sets'},
    {done:Number(l.wishlist_count||S.wishlist.length)>=3,title:'3 wishlist sets',desc:`${Number(l.wishlist_count||S.wishlist.length)}/3`,go:'browse'},
    {done:Number(l.referral_claims||0)>=1,title:'Invite an AFOL',desc:Number(l.referral_claims||0)?'1+ joined':'Seed your city',invite:true}
  ];return {steps,score:Number(l.liquidity_readiness||Math.round(steps.filter(x=>x.done).length/steps.length*100)),done:steps.filter(x=>x.done).length,next:steps.find(x=>!x.done)};
}
function guidedProgress(){
  const owned=S.collection.length,wanted=S.wishlist.length,available=S.collection.filter(x=>x.available_for_exchange).length,matches=S.matches.length;
  const setupRemaining=[owned<3,wanted<3,available<1].filter(Boolean).length;
  const steps=[
    {done:true,title:'Account created',desc:'You’re ready to build your BrickCircle.'},
    {done:owned>=3,title:'My Sets',desc:`${owned}/3 owned sets added`},
    {done:wanted>=3,title:'Sets I Want',desc:`${wanted}/3 wanted sets added`},
    {done:available>=1,title:'Available to Exchange',desc:available>=1?'1 set available':'0/1 set available'},
    {done:matches>=1,title:'Reciprocal match',desc:matches?`${matches} match${matches===1?'':'es'} available`:'Waiting for the right overlap'}
  ];
  let action;if(matches)action={label:matches===1?'View my match':`View my ${matches} matches`,go:'matches'};else if(owned<3)action={label:`Add ${3-owned===1?'one more set':`${3-owned} more sets`}`,go:'browse'};else if(wanted<3)action={label:'Build my wishlist',go:'browse'};else if(available<1)action={label:'Make 1 set available',go:'sets'};else action={label:'Explore more sets',go:'browse'};
  const gaps=[];if(owned<3)gaps.push(`${3-owned} more owned set${3-owned===1?'':'s'}`);if(wanted<3)gaps.push(`${3-wanted} wanted set${3-wanted===1?'':'s'}`);if(available<1)gaps.push('1 more set available to exchange');
  const guidance=gaps.length?`Add ${gaps.join(' and ')} to improve your chances.`:'Your sets are ready for reciprocal matching.';
  return {steps,action,guidance,setupRemaining,status:matches?'Match found':setupRemaining?`${setupRemaining} setup step${setupRemaining===1?'':'s'} left`:'Ready for matching'};
}
function membershipPolicy(){
  return {body:'BrickCircle is free during beta while we build a trusted, liquid collector community. If a modest membership fee is introduced later, members will be informed well in advance.'};
}
function membershipBadge(){return S.user?'Beta Member · Free during beta':''}
function membershipCityCopy(){
  const status=S.membership;if(!status?.my_city)return '';
  return '<strong>Free during beta.</strong> If a modest membership fee is introduced later, members will be informed well in advance.';
}
function firstMatchCoach(){
  const owned=S.collection.length,wanted=S.wishlist.length,available=S.collection.filter(item=>item.available_for_exchange).length;
  const stage=owned<3?'own':wanted<3?'want':available<1?'exchangeable':'match',index={own:0,want:1,exchangeable:2,match:3}[stage];
  const labels=['OWN','WANT','EXCHANGEABLE','MATCH'];
  const guidance={own:`Owned sets: ${owned}/3. Add ${3-owned===1?'1 more set':`${3-owned} more sets`} so BrickCircle has enough supply signals to work with.`,want:`Wanted sets: ${wanted}/3. Add ${3-wanted===1?'1 more set':`${3-wanted} more sets`} you genuinely want to experience.`,exchangeable:`Available to exchange: ${available}/1. Make 1 owned set available so it can participate in reciprocal matching.`,match:`Owned ${owned}/3 · Wanted ${wanted}/3 · Available ${available}/1. Your sets are ready while BrickCircle looks for reciprocal overlap.`};
  const actions={own:['Add owned sets','browse'],want:['Add wanted sets','browse'],exchangeable:['Choose exchangeable sets','sets'],match:['Explore more sets','browse']},action=actions[stage];
  return `<section id="bc-first-match-coach" data-stage="${stage}" class="bc-first-match-coach" aria-label="Path to your first reciprocal match"><div class="bc-first-match-head"><div><div class="bc-first-match-kicker">YOUR FASTEST PATH TO A FIRST MATCH</div><h2>Next: ${action[0]}</h2></div><button class="bc-btn primary bc-first-match-action" type="button" data-action="${action[1]}">${action[0]}</button></div><div class="bc-first-match-steps">${labels.map((label,i)=>`<div class="bc-first-match-step ${i<index?'done':i===index?'current':''}">${i<index?'✓ ':''}${label}</div>`).join('')}</div><p class="bc-first-match-copy">${guidance[stage]}</p></section>`;
}
function stageForExchange(e){
  if(e.state==='COMPLETED')return 5;if(['ACTIVE','EARLY_RETURN','RETURN_PLANNING','RETURN_INSPECTION','DISPUTED'].includes(e.state))return 4;if(['INSPECTION','HANDOFF_PENDING','HANDOFF_ISSUE'].includes(e.state))return 3;if(['ACCEPTED','MEETUP_PLANNING','MEETUP_CONFIRMED'].includes(e.state))return 2;return 1;
}
const terminalCaseStates=new Set(['DECLINED','WITHDRAWN','EXPIRED','CANCELLED','COMPLETED']);
function activeExchanges(){return S.exchanges.filter(e=>!terminalCaseStates.has(e.state)&&e.state!=='PROPOSED')}
function pendingRequests(){return S.exchanges.filter(e=>e.state==='PROPOSED')}
function completedExchanges(){return S.exchanges.filter(e=>e.state==='COMPLETED')}
function exchangeHistory(){return S.exchanges.filter(e=>terminalCaseStates.has(e.state))}
function workflowForItem(itemId){return S.exchanges.find(e=>!terminalCaseStates.has(e.state)&&(e.item_a===itemId||e.item_b===itemId))||null}
function caseItemStatus(row,workflow){if(row.exchange_review_required)return 'Needs owner review';if(!workflow)return row.available_for_exchange?'Available to Exchange':'Not Available';if(workflow.state==='PROPOSED')return 'Proposal pending';if(['ACTIVE','HANDOFF_ISSUE','DISPUTED'].includes(workflow.state))return 'On exchange';if(['EARLY_RETURN','RETURN_PLANNING','RETURN_INSPECTION'].includes(workflow.state))return 'Return pending';return 'Reserved'}
function otherId(e){return e.user_a===S.user?.id?e.user_b:e.user_a}
function otherProfile(e){return S.profiles[otherId(e)]||{display_name:'Collector'} }
function itemName(id){const i=S.items[id];return i?.lego_sets?.name||S.sets[i?.set_number]?.name||i?.set_number||'LEGO set'}
async function hydrateExchangeItems(rows=S.exchanges,stillCurrent){
  const ids=[...new Set(rows.flatMap(e=>[e.item_a,e.item_b]).filter(Boolean))];if(!ids.length)return true;const missing=ids.filter(id=>!S.items[id]);if(missing.length){const {data}=await db.from('collection_items').select('*,lego_sets(*)').in('id',missing);if(stillCurrent&&!stillCurrent())return false;(data||[]).forEach(i=>{S.items[i.id]=i;if(i.lego_sets)S.sets[i.set_number]=i.lego_sets})}
  return true;
}
async function renderRoute(){
  const token=++S.renderToken;const r=routeName();syncNav();
  if(r!=='browse'&&r!=='catalogue')cancelCatalogueRequest();
  if(r==='home')return renderHome(token);
  if(r==='browse'||r==='catalogue')return renderBrowse(token);
  if(r==='sets'||r==='collection'||r==='wishlist')return renderSets(token,r);
  if(r==='matches')return renderMatches(token);
  if(r==='exchanges'||r==='requests'||r==='returns'||r==='meetup')return renderExchanges(token,r);
  if(r==='exchange')return renderExchangeDetail(routeId(),token);
  if(r==='messages')return renderMessages(token);
  if(r==='profile')return renderProfile(token);
  return navigate('home');
}

function homeNextAction(progress,active,pending,matches){
  if(active.length){
    const exchange=active[0],state=String(exchange.state||'').replaceAll('_',' ').toLowerCase();
    return {kicker:'EXCHANGE IN PROGRESS',title:'Keep your active exchange moving',copy:`Current stage: ${state||'active exchange'}. Open the exchange to see the next valid action.`,label:'Open active exchange',go:'exchanges',tone:'blue'};
  }
  if(pending.length){
    return {kicker:'PROPOSAL WAITING',title:`${pending.length} exchange proposal${pending.length===1?'':'s'} need attention`,copy:'Review the proposal or follow up with the collector before starting something new.',label:'Open exchanges',go:'exchanges',tone:'yellow'};
  }
  if(matches.length){
    return {kicker:'RECIPROCAL MATCH',title:matches.length===1?'You have a promising match':'You have new reciprocal matches',copy:'You want something they own — and they want something you own. This is the best time to start a proposal.',label:matches.length===1?'View my match':`View my ${matches.length} matches`,go:'matches',tone:'green'};
  }
  return {kicker:'YOUR NEXT BEST MOVE',title:progress.action.label,copy:progress.guidance,label:progress.action.label,go:progress.action.go,tone:'red'};
}
function homeOnboarding(progress){
  if(!progress.setupRemaining||S.matches.length||activeExchanges().length||pendingRequests().length)return '';
  const owned=S.collection.length,wanted=S.wishlist.length,available=S.collection.filter(x=>x.available_for_exchange).length;
  return `<section class="bc-onboarding-card" aria-labelledby="home-onboarding-title"><div class="bc-onboarding-copy"><span>2-MINUTE SETUP</span><h2 id="home-onboarding-title">Get match-ready in three moves</h2><p>Start small. One useful collection signal is better than a long setup form.</p></div><div class="bc-onboarding-steps"><article class="${owned?'done':''}"><b>${owned?'✓':'1'}</b><span>Add what you own</span></article><article class="${wanted?'done':''}"><b>${wanted?'✓':'2'}</b><span>Save what you want</span></article><article class="${available?'done':''}"><b>${available?'✓':'3'}</b><span>Make one set available</span></article></div><button class="bc-btn primary" data-guided-action="${progress.action.go}">${esc(progress.action.label)}</button></section>`;
}
async function renderHome(token){
  if(!S.user){
    const policy=membershipPolicy();page(`${landingHero()}${policy?`<aside class="bc-membership-policy"><b>Free during beta:</b> ${esc(policy.body)}</aside>`:''}${landingExchangeStory()}${landingWorkflow()}${landingMatchExample()}${landingTrust()}${landingFinalCta()}`);bindCommon(app());$$('[data-auth]',app()).forEach(b=>b.onclick=showAuth);$('[data-scroll="how-it-works"]',app()).onclick=()=>document.getElementById('how-it-works')?.scrollIntoView({behavior:'smooth'});return;
  }
  const progress=guidedProgress(),active=activeExchanges(),pending=pendingRequests(),matches=S.matches||[],l=S.liquidity||{};
  const name=(S.profile?.display_name||S.user.email||'Collector').split(' ')[0];
  const memberBadge=membershipBadge(),cityMembership=membershipCityCopy(),next=homeNextAction(progress,active,pending,matches);
  const availableCount=S.collection.filter(x=>x.available_for_exchange).length;
  page(`<div class="bc-dashboard-hero"><section class="bc-welcome"><span class="bc-pill gold">${esc(memberBadge)}</span><h1>Buy less. Build more.</h1><p>Welcome back, ${esc(name)}. Keep one collection moving and your next build gets closer.</p><div class="bc-head-actions" style="justify-content:flex-start;margin-top:15px">${S.collection.length?'<button class="bc-btn ghost" style="color:#fff;border-color:#ffffff44" data-action="sets">My LEGO</button>':'<button class="bc-btn ghost" style="color:#fff;border-color:#ffffff44" data-action="browse">Explore iconic sets</button>'}</div></section><section class="bc-home-next ${attr(next.tone)}" aria-labelledby="home-next-title"><span>${esc(next.kicker)}</span><h2 id="home-next-title">${esc(next.title)}</h2><p>${esc(next.copy)}</p><button class="bc-btn primary" data-guided-action="${attr(next.go)}">${esc(next.label)}</button></section></div><section class="bc-home-stats" aria-label="Your BrickCircle at a glance"><article><b>${S.collection.length}</b><span>Owned</span></article><article><b>${S.wishlist.length}</b><span>Wanted</span></article><article><b>${availableCount}</b><span>Available</span></article><article><b>${matches.length}</b><span>Matches</span></article></section><section class="bc-card bc-readiness"><div class="bc-small">MATCH SETUP</div><div class="bc-readiness-status">${esc(progress.status)}</div><div class="bc-readiness-counts"><span><b>${Math.min(S.collection.length,3)}/3</b> owned</span><span><b>${Math.min(S.wishlist.length,3)}/3</b> wanted</span><span><b>${Math.min(availableCount,1)}/1</b> available</span></div><div class="bc-small">${esc(progress.guidance)}</div></section>${homeOnboarding(progress)}<section class="bc-guided-progress" aria-labelledby="guided-progress-title"><div class="bc-guided-head"><div><span class="bc-small">OWN → WANT → MATCH → EXCHANGE</span><h2 id="guided-progress-title">Your path to your first match</h2></div><button class="bc-btn primary" data-guided-action="${progress.action.go}">${esc(progress.action.label)}</button></div><div class="bc-checklist">${progress.steps.map(x=>`<div class="bc-check ${x.done?'done':''}"><b>${x.done?'✓ ':''}${esc(x.title)}</b><span>${esc(x.desc)}</span></div>`).join('')}</div></section>${workflowGuide()}${reassuranceStrip()}<div class="bc-dashboard-grid"><section class="bc-card bc-dash-card"><h3>Reciprocal matches</h3><div class="bc-statbig">${matches.length}</div><p class="bc-small">Collectors in your city who want what you can offer and own something in your wishlist.</p><button class="bc-btn" data-action="matches">Open matches</button></section><section class="bc-card bc-dash-card"><h3>Exchange activity</h3><div class="bc-statbig">${active.length}</div><p class="bc-small">${pending.length?`${pending.length} pending request${pending.length===1?'':'s'} also waiting.`:'No pending requests right now.'}</p><button class="bc-btn" data-action="exchanges">Open exchanges</button></section><section class="bc-card bc-dash-card"><h3>${esc(S.profile?.city||'Your city')} BrickCircle</h3><div class="bc-statbig">${Number(l.city_members||0)}</div><p class="bc-small">${Number(l.city_exchangeable_sets||0)} sets available · ${Number(l.city_wishlist_items||0)} wanted-set signals</p><button class="bc-btn" data-invite>Invite local AFOL</button>${cityMembership?`<div class="bc-membership-city">${cityMembership}</div>`:''}</section></div>`);
  $$('[data-guided-action]',app()).forEach(b=>b.onclick=()=>navigate(b.dataset.guidedAction));$$('[data-invite]',app()).forEach(b=>b.onclick=shareInvite);if(S.installPrompt&&S.collection.length){const target=$('.bc-welcome .bc-head-actions');if(target){const b=document.createElement('button');b.className='bc-btn ghost';b.style.cssText='color:#fff;border-color:#ffffff44';b.textContent='Install BrickCircle';b.onclick=installPWA;target.appendChild(b)}}
}
function landingHero(){return `<section class="bc-hero bc-landing-hero"><div class="bc-landing-hero-copy"><span class="bc-pill gold">Local collector exchange · Beta</span><h1>Buy Less. <em>Build More.</em></h1><p>Exchange iconic LEGO sets locally with trusted collectors. Experience more builds without buying every set you love.</p><div class="bc-hero-actions"><button class="bc-btn primary" data-action="browse">Explore iconic sets</button><button class="bc-btn" data-auth>Join BrickCircle</button><button class="bc-btn ghost" data-scroll="how-it-works">How it works</button></div></div><div class="bc-landing-showcase" aria-label="Featured LEGO sets"><div class="bc-showcase-card own">${setImage('42143-1','Ferrari Daytona SP3',true)}<span>IN YOUR COLLECTION</span><strong>Ferrari Daytona SP3</strong></div><div class="bc-showcase-card want">${setImage('42141-1','McLaren F1',true)}<span>A SET YOU WANT</span><strong>McLaren F1</strong></div><div class="bc-showcase-link">A reciprocal exchange, not another purchase <b>⇄</b></div></div></section>`}
function landingExchangeStory(){return `<section class="bc-landing-section bc-story" id="how-it-works" aria-labelledby="story-title"><div class="bc-landing-heading"><span>THE BRICKCIRCLE LOOP</span><h2 id="story-title">See the exchange in seconds</h2></div><div class="bc-story-flow"><article><div class="bc-story-image">${setImage('42143-1','Ferrari Daytona SP3')}</div><small>YOU OWN</small><strong>Ferrari Daytona SP3</strong></article><i aria-hidden="true">→</i><article><div class="bc-story-image">${setImage('42141-1','McLaren F1')}</div><small>YOU WANT</small><strong>McLaren F1</strong></article><i aria-hidden="true">→</i><article class="overlap"><div class="bc-overlap-mark">◎</div><small>BRICKCIRCLE</small><strong>Finds the overlap</strong></article><i aria-hidden="true">→</i><article class="matched"><div class="bc-match-seal">✓</div><small>MUTUAL INTEREST</small><strong>Reciprocal Match</strong></article></div></section>`}
function landingWorkflow(){return `<section class="bc-landing-section" aria-labelledby="landing-workflow-title"><div class="bc-landing-heading"><span>ONE CLEAR PATH</span><h2 id="landing-workflow-title">Own → Want → Match → Exchange</h2></div><div class="bc-landing-workflow"><article><b>01</b><span>OWN</span><h3>Add your LEGO sets</h3><p>Choose which sets you could exchange.</p></article><article><b>02</b><span>WANT</span><h3>Pick your next experience</h3><p>Save the sets you genuinely want to try.</p></article><article><b>03</b><span>MATCH</span><h3>Find a reciprocal collector</h3><p>BrickCircle reveals the mutual overlap.</p></article><article><b>04</b><span>EXCHANGE</span><h3>Meet, inspect, swap</h3><p>Enjoy the set temporarily, then return it.</p></article></div></section>`}
function landingMatchExample(){return `<section class="bc-example-match" aria-labelledby="example-match-title"><div class="bc-example-copy"><span class="bc-pill green">Illustrative example · Reciprocal Match</span><h2 id="example-match-title">Both collectors get a set they want.</h2><p>No anonymous listing or one-sided request. A match appears when both sides independently want the exchange.</p><div class="bc-example-trust"><span>📍 Local</span><span>🤝 In person</span><span>✓ Inspection-first</span></div></div><div class="bc-example-sets"><article>${setImage('42143-1','Ferrari Daytona SP3')}<small>YOU</small><strong>Ferrari Daytona SP3</strong></article><div class="bc-example-swap">⇄</div><article>${setImage('42141-1','McLaren F1')}<small>COLLECTOR NEARBY</small><strong>McLaren F1</strong></article></div></section>`}
function landingTrust(){return `<section class="bc-landing-section bc-trust" aria-labelledby="trust-title"><div class="bc-landing-heading"><span>EXCHANGE WITH CONFIDENCE</span><h2 id="trust-title">Simple, local and inspection-first</h2></div><div class="bc-trust-grid"><span>⌖<b>Local exchanges</b></span><span>🤝<b>Meet in person</b></span><span>✓<b>Inspect before handoff</b></span><span>↩<b>Temporary exchange</b></span><span>□<b>No shipping required</b></span><span>◉<b>You choose what’s available</b></span></div></section>`}
function landingFinalCta(){return `<section class="bc-landing-final"><span>BUY LESS · BUILD MORE</span><h2>Your next great build may already belong to someone nearby.</h2><button class="bc-btn gold" data-auth>Join BrickCircle beta</button></section>`}
function workflowGuide(){return `<section class="bc-workflow" id="how-it-works" aria-labelledby="workflow-title"><div class="bc-section-heading"><span class="bc-small">HOW IT WORKS</span><h2 id="workflow-title">Three steps to a reciprocal match</h2></div><div class="bc-workflow-grid"><article><span>1 · OWN</span><h3>Add your LEGO sets</h3><p>Tell us what you own and which sets you’re willing to exchange.</p></article><article><span>2 · WANT</span><h3>Build your wishlist</h3><p>Choose sets you genuinely want to experience.</p></article><article><span>3 · MATCH</span><h3>Get reciprocal matches</h3><p>When another collector wants one of yours and you want one of theirs, BrickCircle connects you.</p></article></div></section>`}
function reassuranceStrip(){return `<section class="bc-reassurance" aria-label="How BrickCircle exchanges work"><b>Local · In-person · Inspection-first</b><span>No shipping</span><span>No anonymous hand-offs</span><span>No permanent sale required</span><span>You choose what becomes available to exchange</span></section>`}

function cancelCatalogueRequest(){
  catalogueSequence++;
  clearTimeout(catalogueTimer);
  catalogueController?.abort();
  catalogueController=null;
}
function scheduleCatalogueLoad(delay=180){
  cancelCatalogueRequest();
  const grid=$('#bc-set-grid'),status=$('#bc-cat-status');
  const activeCategory=CURATED_CATEGORIES.find(c=>c.id===(S.browse.category||'all'))||CURATED_CATEGORIES[0];
  if(status)status.textContent=S.browse.q?'Preparing search…':(activeCategory.id==='all'?'Loading iconic sets…':`Loading ${activeCategory.label}…`);
  grid?.setAttribute('aria-busy','true');
  catalogueTimer=setTimeout(()=>loadCatalogue(S.renderToken),delay);
}
async function renderBrowse(token){
  const chips=CURATED_CATEGORIES.map(c=>`<button class="bc-pop-chip" data-cat="${attr(c.id)}" aria-pressed="${S.browse.category===c.id?'true':'false'}">${esc(c.label)}</button>`).join('');
  page(`<div class="bc-page-head"><div><span class="bc-page-kicker">FIND YOUR NEXT BUILD</span><h1>100 iconic LEGO sets</h1><p>Discover iconic builds across 11 categories, from Technic and F1 to City, Friends, Star Wars and Disney. Search any set by product code or keyword.</p></div>${S.user?`<div class="bc-head-actions">${pill(`${S.collection.length} owned`,'green')}${pill(`${S.wishlist.length} wanted`,'blue')}</div>`:''}</div><div class="bc-catalogue-tools"><div class="bc-searchrow"><input id="bc-q" class="bc-input" placeholder="Search any LEGO set — product code or keywords" aria-label="Search the full LEGO catalogue by product code, set number, model name or keywords" value="${attr(S.browse.q)}" autocomplete="off"></div><div class="bc-discovery-chips" aria-label="Popular LEGO categories">${chips}</div><div class="bc-name-search-help bc-small">Try 42143, McLaren, Saturn V or Porsche. Search goes beyond the curated 100.</div></div><div class="bc-catalogue-meta"><div id="bc-cat-status" class="bc-small" role="status">Loading iconic sets…</div><div id="bc-cat-page-size" class="bc-small">100 curated sets · one page</div></div><div id="bc-set-grid" class="bc-set-grid" aria-busy="true">${loading('Loading iconic sets…')}</div>`);
  const q=$('#bc-q');
  const refreshCategoryChips=()=>$$('[data-cat]').forEach(b=>b.setAttribute('aria-pressed',String(!S.browse.q&&b.dataset.cat===S.browse.category)));
  q.oninput=()=>{const v=q.value.trim();S.browse.q=v;S.browse.category=v?'':'all';refreshCategoryChips();scheduleCatalogueLoad()};
  $$('[data-cat]').forEach(b=>b.onclick=()=>{S.browse.category=b.dataset.cat;S.browse.q='';q.value='';refreshCategoryChips();scheduleCatalogueLoad(0)});
  await loadCatalogue(token);
}
async function loadCatalogue(token=S.renderToken){
  clearTimeout(catalogueTimer);
  catalogueController?.abort();
  const requestId=++catalogueSequence,controller=new AbortController();
  catalogueController=controller;S.browse.busy=true;
  const cleanQuery=String(S.browse.q||'').replace(/[,%()]/g,' ').trim();
  const activeCategory=CURATED_CATEGORIES.find(c=>c.id===(S.browse.category||'all'))||CURATED_CATEGORIES[0];
  const snapshot={q:cleanQuery,category:activeCategory.id};
  const grid=$('#bc-set-grid'),status=$('#bc-cat-status');
  if(status)status.textContent=snapshot.q?`Searching the full catalogue for “${snapshot.q}”…`:(activeCategory.id==='all'?'Loading iconic sets…':`Loading ${activeCategory.label}…`);
  grid?.setAttribute('aria-busy','true');
  let timedOut=false,data=null,error=null;
  const timeout=setTimeout(()=>{timedOut=true;controller.abort()},CATALOGUE_TIMEOUT_MS);
  try{
    let req;
    if(snapshot.q){
      req=db.rpc('bc_search_lego_sets',{p_query:snapshot.q,p_theme:null,p_year:null,p_limit:CATALOGUE_SEARCH_LIMIT});
    }else{
      req=db.from('lego_sets').select('set_number,name,year,piece_count,theme,estimated_value,image_url').eq('catalog_active',true).in('set_number',activeCategory.sets);
    }
    if(typeof req.abortSignal==='function')req=req.abortSignal(controller.signal);
    ({data,error}=await req);
    if(!error&&!snapshot.q){
      const iconicRank=new Map(activeCategory.sets.map((setNumber,index)=>[setNumber,index]));
      data=(data||[]).filter(row=>iconicRank.has(row.set_number)).sort((a,b)=>(iconicRank.get(a.set_number)??Number.MAX_SAFE_INTEGER)-(iconicRank.get(b.set_number)??Number.MAX_SAFE_INTEGER));
    }
  }catch(caught){error=caught}
  clearTimeout(timeout);
  if(requestId!==catalogueSequence)return;
  S.browse.busy=false;catalogueController=null;
  if(token!==S.renderToken||(routeName()!=='browse'&&routeName()!=='catalogue'))return;
  grid?.removeAttribute('aria-busy');
  if(error||timedOut){
    if(status)status.textContent=timedOut?'Catalogue request timed out.':'Catalogue temporarily unavailable.';
    if(grid)grid.innerHTML=`<div class="bc-empty" style="grid-column:1/-1"><div class="bc-empty-icon">🧱</div><h2>${timedOut?'The catalogue took too long':'Catalogue unavailable'}</h2><p>Your search is safe. Retry the request without reloading the app.</p><button class="bc-btn primary" id="bc-cat-retry">Retry</button></div>`;
    $('#bc-cat-retry')?.addEventListener('click',()=>loadCatalogue(S.renderToken));
    return;
  }
  S.browse.rows=data||[];S.browse.lastCount=S.browse.rows.length;
  if(grid)grid.innerHTML=S.browse.rows.map(setCard).join('')||empty('🔎','No matching sets','Try a different set number, product code, model name or keyword.');
  if(status)status.textContent=S.browse.rows.length?(snapshot.q?`${S.browse.rows.length} product${S.browse.rows.length===1?'':'s'} matching “${snapshot.q}” across the full catalogue`:(activeCategory.id==='all'?`${S.browse.rows.length} iconic sets · curated for collectors`:`${S.browse.rows.length} set${S.browse.rows.length===1?'':'s'} · ${activeCategory.label}`)):'No matching sets';
  const pageSize=$('#bc-cat-page-size');
  if(pageSize)pageSize.textContent=snapshot.q?`Up to ${CATALOGUE_SEARCH_LIMIT} full-catalogue matches`:`${S.browse.rows.length} curated sets · one page`;
  wireImages(grid);bindSetActions(grid);bindSetDetailActions(grid);
  try{track(snapshot.q?'catalogue_product_name_search':'catalogue_curated_category_loaded',{query:snapshot.q,category:snapshot.category,result_count:S.browse.rows.length,curated_count:activeCategory.sets.length})}catch(_){ }
}
function setCard(s,index=99){
  const own=S.collection.find(x=>x.set_number===s.set_number),want=S.wishlist.find(x=>x.set_number===s.set_number);return `<article class="bc-set-card" data-set="${attr(s.set_number)}"><button class="bc-set-card-open" data-view-set="${attr(s.set_number)}" aria-label="View ${attr(s.name)} details">${setImage(s.set_number,s.name,index<6)}<div class="bc-set-card-copy"><div class="bc-set-theme">${pill(s.theme||'LEGO')}</div><h3>${esc(s.name)}</h3><div class="bc-set-meta">Set ${esc(s.set_number)}${s.year?` · ${s.year}`:''}${s.piece_count?` · ${Number(s.piece_count).toLocaleString()} pieces`:''}</div><span class="bc-set-view">View details →</span></div></button><div class="bc-set-actions"><button class="${own?'on':''}" data-own>${own?'✓ Owned':'＋ Own this'}</button><button class="want ${want?'on':''}" data-want>${want?'♥ Wanted':'♡ Want this'}</button></div></article>`
}
function bindSetDetailActions(root=document){$$('[data-view-set]',root).forEach(button=>button.onclick=()=>openCatalogueSetDetails(button.dataset.viewSet))}
function catalogueSetDetails(setNumber){return S.browse.rows.find(row=>row.set_number===setNumber)||S.sets[setNumber]||S.collection.find(row=>row.set_number===setNumber)?.lego_sets||S.wishlist.find(row=>row.set_number===setNumber)?.lego_sets||null}
function openCatalogueSetDetails(setNumber){
  const s=catalogueSetDetails(setNumber);if(!s)return;
  const own=S.collection.find(x=>x.set_number===setNumber),want=S.wishlist.find(x=>x.set_number===setNumber);
  const o=modal(`<div class="bc-set-detail"><div class="bc-set-detail-visual">${setImage(setNumber,s.name,true)}</div><div class="bc-set-detail-copy"><span class="bc-page-kicker">COLLECTOR SET</span><h2>${esc(s.name||setNumber)}</h2><div class="bc-set-detail-meta"><span>Set ${esc(setNumber)}</span>${s.theme?`<span>${esc(s.theme)}</span>`:''}${s.year?`<span>${s.year}</span>`:''}${s.piece_count?`<span>${Number(s.piece_count).toLocaleString()} pieces</span>`:''}</div><p>Own the sets that matter. Experience the ones you are curious about through a local BrickCircle exchange.</p><div class="bc-set-detail-actions"><button class="bc-btn ${own?'':'primary'}" data-detail-own>${own?'✓ Open in My LEGO':'＋ Add to My LEGO'}</button><button class="bc-btn ${want?'gold':''}" data-detail-want>${want?'♥ Open wishlist':'♡ Add to wishlist'}</button></div><div class="bc-set-detail-note">Meet locally · Inspect in person · Exchange only when both collectors agree</div></div><button class="bc-close" type="button" data-close aria-label="Close">×</button></div>`);
  $('[data-close]',o).onclick=closeOverlay;
  wireImages(o);
  $('[data-detail-own]',o).onclick=async()=>{closeOverlay();if(own){S.setTab='collection';navigate('sets');return}await toggleOwned(setNumber,document.createElement('button'))};
  $('[data-detail-want]',o).onclick=async()=>{closeOverlay();if(want){S.setTab='wishlist';navigate('sets');return}await toggleWanted(setNumber,document.createElement('button'))};
}
function ownerPhotoValidation(file){if(!file)return 'Choose a photo first.';if(!OWNER_PHOTO_TYPES.has(file.type))return 'Please use a JPEG, PNG or WebP image.';if(file.size>OWNER_PHOTO_MAX_BYTES)return 'Photo must be 8 MB or smaller.';return ''}
function ownerPhotoExtension(file){return file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg'}
async function uploadOwnerPhoto(file){const path=`${S.user.id}/${crypto.randomUUID()}.${ownerPhotoExtension(file)}`,{error}=await db.storage.from('collection-photos').upload(path,file,{contentType:file.type,upsert:false});if(error)throw error;return path}
async function cleanupOwnerPhoto(path){if(!path)return;try{await db.storage.from('collection-photos').remove([path])}catch(_){}}
function ownerPhotoPicker({title,copy,saveLabel='Add to My Sets',onSave}){
  const o=modal(`<div class="bc-modal-head"><div><h2>${esc(title)}</h2><p class="bc-muted">${esc(copy)}</p></div><button class="bc-close" type="button" data-close>×</button></div><form class="bc-form" id="bc-owner-photo-form"><div class="bc-field"><label>Photo of your finished LEGO set <b>(required)</b></label><input class="bc-input" id="bc-owner-photo-input" type="file" accept="image/jpeg,image/png,image/webp" required><div class="bc-small">Use your phone camera or gallery. JPEG, PNG or WebP · max 8 MB.</div></div><div id="bc-owner-photo-preview" hidden><img alt="Selected assembled LEGO set" style="width:100%;max-height:330px;object-fit:contain;border-radius:12px"></div><div class="bc-notice"><b>Why this is required</b><br>This photo helps the other collector understand the visible condition and apparent completeness of your physical set. Final inspection still happens in person.</div><div class="bc-form-actions"><button type="button" class="bc-btn" data-close>Cancel</button><button class="bc-btn primary" type="submit" disabled>${esc(saveLabel)}</button></div></form>`);
  $$('[data-close]',o).forEach(button=>button.onclick=closeOverlay);const input=$('#bc-owner-photo-input',o),preview=$('#bc-owner-photo-preview',o),image=$('img',preview),submit=$('button[type="submit"]',o);let objectUrl='';
  input.onchange=()=>{if(objectUrl)URL.revokeObjectURL(objectUrl);objectUrl='';const file=input.files?.[0],error=ownerPhotoValidation(file);submit.disabled=!!error;if(error){preview.hidden=true;if(file)toast(error);return}objectUrl=URL.createObjectURL(file);image.src=objectUrl;preview.hidden=false};
  $('#bc-owner-photo-form',o).onsubmit=async event=>{event.preventDefault();const file=input.files?.[0],error=ownerPhotoValidation(file);if(error)return toast(error);submit.disabled=true;const label=submit.textContent;submit.textContent='Uploading…';try{await onSave(file);if(objectUrl)URL.revokeObjectURL(objectUrl);closeOverlay()}catch(saveError){fail(saveError,'Could not save the photo. Please try again.');submit.disabled=false;submit.textContent=label}};
}
function addOwnedSetWithPhoto(set){const details=S.browse.rows.find(row=>row.set_number===set)||S.sets[set]||{};ownerPhotoPicker({title:`Add ${details.name||`Set ${set}`} to My Sets`,copy:'Upload a clear photo of your assembled set. This helps the other collector understand the set’s visible condition and completeness.',onSave:async file=>{const path=await uploadOwnerPhoto(file),{error}=await db.from('collection_items').insert({user_id:S.user.id,set_number:set,owner_photo_path:path});if(error){await cleanupOwnerPhoto(path);throw error}track('collection_item_added',{set_number:set,owner_photo:true});await refreshCore();await renderRoute();toast('Added to My Sets with your owner photo.')}})}
function addLegacyOwnerPhoto(item){ownerPhotoPicker({title:`Add a photo for set ${item.set_number}`,copy:'This legacy set needs a photo of the assembled model before it can be made available to exchange.',saveLabel:'Upload photo',onSave:async file=>{const path=await uploadOwnerPhoto(file),{error}=await db.from('collection_items').update({owner_photo_path:path,updated_at:new Date().toISOString()}).eq('id',item.id).eq('user_id',S.user.id);if(error){await cleanupOwnerPhoto(path);throw error}await refreshCore();renderSetsBody();toast('Photo added. You can now make this set available to exchange.')}})}
function replaceOwnerPhoto(item){
  if(!item||!S.user)return;
  const oldPath=item.owner_photo_path||'',details=item.lego_sets||S.sets[item.set_number]||{};
  ownerPhotoPicker({title:`Change photo for ${details.name||`Set ${item.set_number}`}`,copy:'Choose a new clear photo of your assembled LEGO set. The existing photo will be replaced only after the new photo is saved successfully.',saveLabel:'Save new photo',onSave:async file=>{
    const newPath=await uploadOwnerPhoto(file);
    const {error}=await db.from('collection_items').update({owner_photo_path:newPath,updated_at:new Date().toISOString()}).eq('id',item.id).eq('user_id',S.user.id);
    if(error){await cleanupOwnerPhoto(newPath);throw error}
    if(oldPath&&oldPath!==newPath){ownerPhotoUrls.delete(oldPath);await cleanupOwnerPhoto(oldPath)}
    ownerPhotoUrls.delete(newPath);
    track('collection_owner_photo_changed',{set_number:item.set_number});
    await refreshCore();renderSetsBody();toast('Set photo updated.');
  }});
}
async function signedOwnerPhoto(path){if(!path)return '';if(ownerPhotoUrls.has(path))return ownerPhotoUrls.get(path);const {data,error}=await db.storage.from('collection-photos').createSignedUrl(path,900);if(error)throw error;const url=data?.signedUrl||'';if(url)ownerPhotoUrls.set(path,url);return url}
async function hydrateOwnerPhotos(root){for(const row of S.collection){if(!row.owner_photo_path)continue;const image=root.querySelector(`[data-edit-set="${CSS.escape(row.id)}"]`)?.closest('.bc-myset')?.querySelector('.bc-myset-visual img');if(!image)continue;try{const url=await signedOwnerPhoto(row.owner_photo_path);if(url){image.src=url;image.removeAttribute('data-set-image');image.alt='Owner photo of assembled LEGO set'}}catch(_){}}}
async function hydrateMatchPhotos(root){
  const cards=root.querySelectorAll('.bc-match');
  for(const [index,match] of S.matches.entries()){
    const card=cards[index],side=card?.querySelectorAll('.bc-match-side')?.[1]||card?.querySelectorAll('.bc-match-set')?.[1];if(!side||side.querySelector('.bc-owner-proof'))continue;
    try{
      const {data,error}=await db.from('collection_items').select('owner_photo_path').eq('id',match.requested_item).eq('user_id',match.match_user).eq('available_for_exchange',true).limit(1),path=data?.[0]?.owner_photo_path;
      if(error||!path)continue;const url=await signedOwnerPhoto(path);
      if(url)side.insertAdjacentHTML('beforeend',`<div class="bc-owner-proof"><img src="${attr(url)}" alt="Owner photo of assembled LEGO set ${attr(match.requested_set)}" loading="lazy"><div class="bc-small">Owner photo · inspect the physical set in person before exchange</div></div>`);
    }catch(_){}
  }
}
function bindSetActions(root=document){$$('[data-own]',root).forEach(b=>b.onclick=()=>toggleOwned(b.closest('[data-set]').dataset.set,b));$$('[data-want]',root).forEach(b=>b.onclick=()=>toggleWanted(b.closest('[data-set]').dataset.set,b))}
async function toggleOwned(set,button){
  if(!S.user){showAuth();return}const existing=S.collection.find(x=>x.set_number===set);if(!existing){addOwnedSetWithPhoto(set);return}await removeCollectionItem(existing.id,existing.lego_sets?.name||set,button)
}
async function toggleWanted(set,button){
  if(!S.user){showAuth();return}button.disabled=true;const existing=S.wishlist.find(x=>x.set_number===set);if(existing){const {error}=await db.from('wishlists').delete().eq('id',existing.id).eq('user_id',S.user.id);if(error){fail(error);button.disabled=false;return}}else{const {error}=await db.from('wishlists').insert({user_id:S.user.id,set_number:set,priority:3});if(error){fail(error);button.disabled=false;return}track('wishlist_item_added',{set_number:set})}await refreshCore();await renderRoute();toast(existing?'Removed from wishlist.':'Added to your wishlist.')
}

async function renderSets(token,legacy='sets'){
  if(!S.user){showAuth();return navigate('home')}if(legacy==='wishlist')S.setTab='wishlist';if(legacy==='collection')S.setTab='collection';
  const progress=guidedProgress(),owned=S.collection.length,wanted=S.wishlist.length,available=S.collection.filter(x=>x.available_for_exchange).length;
  if(!['collection','wishlist','available'].includes(S.setTab))S.setTab='collection';
  page(`<div class="bc-page-head"><div><span class="bc-page-kicker">YOUR COLLECTION</span><h1>My LEGO</h1><p>Everything you own, want and have ready for exchange.</p></div><div class="bc-head-actions"><button class="bc-btn primary" data-action="browse">＋ Find sets</button></div></div><div class="bc-setup-summary" aria-label="Match setup counts"><span><b>${owned}</b> owned</span><span><b>${wanted}</b> wanted</span><span><b>${available}</b> available</span><strong>${esc(progress.status)}</strong></div><div class="bc-tabs" role="group" aria-label="My LEGO inventory"><button class="bc-tab ${S.setTab==='collection'?'active':''}" data-settab="collection" aria-pressed="${S.setTab==='collection'}" aria-controls="bc-sets-body">Owned · ${owned}</button><button class="bc-tab ${S.setTab==='wishlist'?'active':''}" data-settab="wishlist" aria-pressed="${S.setTab==='wishlist'}" aria-controls="bc-sets-body">Wanted · ${wanted}</button><button class="bc-tab ${S.setTab==='available'?'active':''}" data-settab="available" aria-pressed="${S.setTab==='available'}" aria-controls="bc-sets-body">Available · ${available}</button></div><div id="bc-sets-body"></div><div class="bc-my-lego-footer"><button class="bc-btn ghost" data-action="exchanges">View exchange history →</button></div>`);$$('[data-settab]').forEach(b=>b.onclick=()=>{const tab=b.dataset.settab;S.setTab=tab;renderSets(S.renderToken);$(`[data-settab="${tab}"]`,app())?.focus()});renderSetsBody();
}
function renderSetsBody(){
  const host=$('#bc-sets-body');if(!host)return;
  if(S.setTab==='wishlist'){
    host.innerHTML=S.wishlist.length?`<div class="bc-set-list">${S.wishlist.map(w=>mySetRow(w,true)).join('')}</div>`:empty('♡','Build your wishlist','Save sets you would genuinely like to experience. More wishes create more reciprocal-match possibilities.','Find sets','browse');
  }else{
    const rows=S.setTab==='available'?S.collection.filter(row=>row.available_for_exchange):S.collection;
    if(S.setTab==='available'&&!rows.length)host.innerHTML=empty('⇄','Nothing available yet','Choose one owned set and mark it Available to Exchange. Only sets you explicitly release can appear in matches.','Review owned sets','sets');
    else host.innerHTML=rows.length?`${S.setTab==='collection'?'<div class="bc-notice warn" style="margin-bottom:12px"><b>Availability is always your choice.</b> Only sets you explicitly make available can appear in reciprocal matches.</div>':''}<div class="bc-set-list">${rows.map(row=>mySetRow(row,false)).join('')}</div>`:empty('🧱','Start with the LEGO you already own','Add collectible sets you would be comfortable exchanging locally.','Add my first set','browse');
  }
  bindCommon(host);$$('[data-exchangeable]',host).forEach(x=>x.onchange=()=>setExchangeable(x.dataset.exchangeable,x.checked));$$('[data-remove-wish]',host).forEach(b=>b.onclick=()=>removeWish(b.dataset.removeWish));$$('[data-change-photo]',host).forEach(b=>b.onclick=()=>{const item=S.collection.find(row=>row.id===b.dataset.changePhoto);if(item)replaceOwnerPhoto(item)});$$('[data-release-set]',host).forEach(b=>b.onclick=()=>releaseSetFromWorkflow(b.dataset.releaseSet));$$('[data-clear-owner-review]',host).forEach(b=>b.onclick=()=>setExchangeable(b.dataset.clearOwnerReview,true));$$('[data-edit-set]',host).forEach(b=>b.onclick=()=>editCollectionItem(b.dataset.editSet));wireImages(host);if(S.setTab!=='wishlist')hydrateOwnerPhotos(host)
}
function mySetRow(row,wish){const s=row.lego_sets||S.sets[row.set_number]||{},image=imageSetNumber(row.set_number),workflow=!wish&&workflowForItem(row.id),status=caseItemStatus(row,workflow),statusTone=status==='Available to Exchange'?'green':status==='On exchange'||status==='Return pending'?'blue':status==='Needs owner review'?'gold':'';return `<article class="bc-card bc-myset"> <div class="bc-myset-visual"><img src="https://images.brickset.com/sets/images/${attr(image)}.jpg" alt="" loading="lazy" data-set-image="${attr(row.set_number)}"><div hidden>🧱</div></div><div><h3>${esc(s.name||row.set_number)}</h3><div class="bc-myset-meta">Set ${esc(row.set_number)}${s.theme?` · ${esc(s.theme)}`:''}${s.piece_count?` · ${Number(s.piece_count).toLocaleString()} pieces`:''}</div><div class="bc-statusrow">${wish?pill('Sets I Want','blue'):pill(status,statusTone)}${!wish&&row.condition?pill(row.condition):''}${!wish&&row.completeness!=null?pill(`${row.completeness}% complete`):''}</div></div><div class="bc-myset-actions">${wish?`<button class="bc-btn" data-remove-wish="${attr(row.set_number)}" aria-label="Remove ${attr(s.name||row.set_number)} from Sets I Want">Remove</button>`:`<label class="bc-toggle"><input type="checkbox" data-exchangeable="${attr(row.id)}" ${row.available_for_exchange?'checked':''} ${workflow?'disabled':''}> Available to Exchange</label>${workflow?`<button class="bc-btn danger" data-release-set="${attr(row.id)}">${workflow.state==='PROPOSED'?(workflow.proposer_id===S.user?.id?'Cancel proposal & free set':'Decline proposal'):['ACCEPTED','MEETUP_PLANNING','MEETUP_CONFIRMED','INSPECTION','HANDOFF_PENDING'].includes(workflow.state)?'Cancel before handoff':workflow.state==='ACTIVE'?'Request early return':'Open safe release options'}</button>`:''}${!workflow&&row.exchange_review_required?`<button class="bc-btn primary" data-clear-owner-review="${attr(row.id)}">Review complete · make available</button>`:''}<button class="bc-btn" data-change-photo="${attr(row.id)}">Change photo</button><button class="bc-btn" data-edit-set="${attr(row.id)}">Details</button>`}</div></article>`}
async function releaseSetFromWorkflow(itemId){
  const item=S.collection.find(row=>row.id===itemId);if(!item||!S.user)return;
  const workflow=workflowForItem(itemId);if(!workflow)return setExchangeable(itemId,false);
  const cancellable=['ACCEPTED','MEETUP_PLANNING','MEETUP_CONFIRMED','INSPECTION','HANDOFF_PENDING'].includes(workflow.state);
  if(cancellable){const reason=prompt('Cancel this exchange before the mutual handoff?\n\nEither collector can cancel until BOTH physical handoffs are confirmed. Add a short reason (optional).');if(reason===null)return;const trimmed=reason.trim()||'Owner cancelled before mutual handoff from My Sets',intent={case_id:workflow.id,version:workflow.state_version,action:'cancel_exchange_case_before_mutual_handoff',reason:trimmed};const {error}=await canonicalRpc('cancel_exchange_case_before_mutual_handoff',{p_case_id:workflow.id,p_expected_version:workflow.state_version,p_reason:trimmed},intent);if(error)return fail(error,'Could not cancel the exchange. Refresh and retry.');await refreshCore();renderSetsBody();toast('Exchange cancelled before the mutual handoff.');return}
  if(['ACTIVE','HANDOFF_ISSUE','EARLY_RETURN','RETURN_PLANNING','RETURN_INSPECTION','DISPUTED'].includes(workflow.state)){toast('Physical custody may have changed, so this exchange can no longer be cancelled. Continue in the case to plan a return or record an issue.');return navigate('exchange',workflow.id)}
  if(workflow.state!=='PROPOSED'){toast('Open the exchange case to continue.');return navigate('exchange',workflow.id)}
  const action=workflow.proposer_id===S.user.id?'withdraw':'decline';
  if(!confirm(`End this proposal for ${item.lego_sets?.name||item.set_number}? The case history and conversation remain preserved.`))return;
  const payload={reason:'Owner ended the exchange from My Sets'},intent={case_id:workflow.id,version:workflow.state_version,action,payload};
  const {error}=await canonicalRpc('exchange_case_transition',{p_case_id:workflow.id,p_expected_version:workflow.state_version,p_action:action,p_payload:payload},intent);
  if(error)return fail(error,'Could not end the proposal. Refresh and retry.');
  await refreshCore();renderSetsBody();toast('Proposal ended.')
}
function confirmOwnerReviewRecovery(item){
  return confirm(`I have ${item?.lego_sets?.name||item?.set_number||'this set'} back, have checked its condition and completeness, and want to make it available for exchange again.\n\nExchange history will be preserved.`);
}
async function setExchangeable(id,on){
  if(!S.user||!id)return;
  const item=S.collection.find(row=>row.id===id),previous=Boolean(item?.available_for_exchange),recovering=Boolean(on&&item?.exchange_review_required&&!workflowForItem(id));
  if(recovering&&!confirmOwnerReviewRecovery(item)){const input=$(`[data-exchangeable="${CSS.escape(id)}"]`);if(input)input.checked=previous;return}
  if(on&&item&&!item.owner_photo_path){const input=$(`[data-exchangeable="${CSS.escape(id)}"]`);if(input)input.checked=false;addLegacyOwnerPhoto(item);return}
  const revision=(exchangeabilityOperations.get(id)?.revision||0)+1;
  exchangeabilityOperations.set(id,{revision,desired:on});
  const prior=exchangeabilityQueues.get(id)||Promise.resolve();
  const operation=prior.catch(()=>{}).then(async()=>{
    const latest=exchangeabilityOperations.get(id);
    if(!latest||latest.revision!==revision)return;
    const {data,error}=await db.rpc('set_exchange_item_availability',{p_item_id:id,p_available:on});
    if(error)throw error;
    if(data?.ok!==true||Boolean(data.available)!==Boolean(on))throw new Error('BrickCircle could not confirm this exchange setting. Please try again.');
    if(exchangeabilityOperations.get(id)?.revision!==revision)return;
    await refreshCore();renderSetsBody();toast(recovering?'Owner review complete. This set is available to exchange again.':on?'This set is saved as Available to Exchange.':'This set is saved as Not Available.');
  }).catch(async error=>{
    if(exchangeabilityOperations.get(id)?.revision!==revision)return;
    const current=S.collection.find(row=>row.id===id);if(current)current.available_for_exchange=previous;
    renderSetsBody();fail(error,'Could not save this exchange setting. Please try again.');
  }).finally(()=>{if(exchangeabilityQueues.get(id)===operation)exchangeabilityQueues.delete(id)});
  exchangeabilityQueues.set(id,operation);
  return operation;
}
async function removeWish(setNumber){
  if(!S.user||!setNumber)return;
  const item=S.wishlist.find(x=>x.set_number===setNumber);
  const button=$(`[data-remove-wish="${CSS.escape(setNumber)}"]`,$('#bc-sets-body')||document);
  if(button){button.disabled=true;button.textContent='Removing…'}
  const {data,error}=await db.from('wishlists').delete().eq('user_id',S.user.id).eq('set_number',setNumber).select('id');
  if(error){if(button){button.disabled=false;button.textContent='Remove'}return fail(error,'Could not remove this set from your wishlist.')}
  if(!data?.length){if(button){button.disabled=false;button.textContent='Remove'}return fail(new Error('Wishlist item was not removed. Please refresh and try again.'))}
  S.wishlist=S.wishlist.filter(x=>x.set_number!==setNumber);
  renderSetsBody();
  toast(`${item?.lego_sets?.name||'Set'} removed from wishlist.`);
  await refreshCore();
  renderSetsBody();
}
function editCollectionItem(id){const c=S.collection.find(x=>x.id===id);if(!c)return;const name=c.lego_sets?.name||c.set_number,workflow=workflowForItem(id),o=modal(`<div class="bc-modal-head"><div><h2>${esc(name)}</h2><p class="bc-muted">Describe the physical copy another collector would receive.</p></div><button class="bc-close" data-close>×</button></div><form class="bc-form" id="bc-edit-item"><div class="bc-field"><label>Condition</label><select class="bc-select" name="condition">${['Excellent','Very good','Good','Fair'].map(x=>`<option ${c.condition===x?'selected':''}>${x}</option>`).join('')}</select></div><div class="bc-field"><label>Completeness (%)</label><input class="bc-input" name="completeness" type="number" min="0" max="100" value="${Number(c.completeness??100)}"></div><label><input name="box" type="checkbox" ${c.original_box?'checked':''}> Original box included</label><label><input name="exchangeable" type="checkbox" ${c.available_for_exchange?'checked':''} ${workflow?'disabled':''}> Available for exchange</label>${workflow?`<div class="bc-notice">Availability is controlled by the active exchange case. Photo and descriptive details remain editable.</div>`:''}${!workflow&&c.exchange_review_required?`<div class="bc-notice warn">This set is on owner review after a previous exchange. Confirm that you have it back and have checked its condition and completeness before making it available again.</div>`:''}<div class="bc-field"><label>Notes</label><textarea class="bc-textarea" name="notes" placeholder="Missing pieces, sticker condition, instructions, etc.">${esc(c.notes||'')}</textarea></div><div class="bc-form-actions"><button type="button" class="bc-btn danger" data-remove-collection-item="${attr(id)}" ${workflow?'disabled':''}>Remove set</button><button type="button" class="bc-btn" data-close>Cancel</button><button class="bc-btn primary" type="submit">Save details</button></div></form>`);$$('[data-close]',o).forEach(b=>b.onclick=closeOverlay);$('[data-remove-collection-item]',o).onclick=e=>removeCollectionItem(id,name,e.currentTarget);$('#bc-edit-item',o).onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget),btn=$('button[type="submit"]',e.currentTarget),wantsExchange=workflow?c.available_for_exchange:f.get('exchangeable')==='on';if(wantsExchange&&!c.owner_photo_path){addLegacyOwnerPhoto(c);return}if(wantsExchange&&c.exchange_review_required&&!workflow&&!confirmOwnerReviewRecovery(c))return;btn.disabled=true;const patch={condition:String(f.get('condition')),completeness:Number(f.get('completeness')),original_box:f.get('box')==='on',notes:String(f.get('notes')||''),updated_at:new Date().toISOString()};const {error}=await db.from('collection_items').update(patch).eq('id',id).eq('user_id',S.user.id);if(error){fail(error);btn.disabled=false;return}if(!workflow&&wantsExchange!==Boolean(c.available_for_exchange)){const changed=await db.rpc('set_exchange_item_availability',{p_item_id:id,p_available:wantsExchange});if(changed.error){fail(changed.error);btn.disabled=false;return}}closeOverlay();await refreshCore();renderSetsBody();toast('Set details updated.')}
}
async function removeCollectionItem(id,name,button){
  if(!id)return;const original=button?.textContent||'Remove';if(button){button.disabled=true;button.textContent='Checking…'}
  try{
    const {data:{user},error:userError}=await withTimeout(db.auth.getUser(),8000);
    if(userError||!user)throw userError||new Error('Please sign in again before removing this set.');
    const item=S.collection.find(row=>row.id===id);if(!item)throw new Error('This set is no longer in your collection. Refresh and try again.');
    const {data:refs,error:refsError}=await db.from('exchange_cases').select('id,state,created_at').or(`item_a.eq.${id},item_b.eq.${id}`).order('created_at',{ascending:false});if(refsError)throw refsError;
    const active=(refs||[]).find(row=>!terminalCaseStates.has(row.state));
    if(active){const message=active.state==='accepted'?'This set is part of an accepted exchange. Cancel that exchange before removing the set from My Sets.':active.state==='swap_active'?'This set is currently in a temporary exchange. Complete the return before removing it from My Sets.':active.state==='disputed'?'This set is tied to an exchange with an open issue. Resolve the exchange before removing it from My Sets.':'This set is part of an active exchange and cannot be removed yet.';if(button){button.disabled=false;button.textContent=original}if(confirm(`${message}\n\nOpen the exchange now?`)){closeOverlay();navigate('exchange',active.id)}return}
    if(!confirm(`Remove ${name||'this set'} from My Sets?\n\nCompleted or cancelled exchange history will be preserved.`)){if(button){button.disabled=false;button.textContent=original}return}
    if(button)button.textContent='Removing…';
    const {data,error}=await withTimeout(db.from('collection_items').delete().eq('id',id).eq('user_id',user.id).select('id'),12000);
    if(error)throw error;if(!data?.length)throw new Error('Collection item was not removed. Please refresh and try again.');
    await cleanupOwnerPhoto(item.owner_photo_path);S.collection=S.collection.filter(row=>row.id!==id);closeOverlay();renderSetsBody();toast(`${name||'Set'} removed from My Sets.`);await refreshCore();renderSetsBody();
  }catch(error){const raw=String(error?.message||''),message=/foreign key constraint|exchanges_item_[ab]_fkey|exchanges_request_id_fkey/i.test(raw)?'This set is still linked to an exchange. Open Exchanges and resolve or cancel it before trying again.':(error?.message||'Could not remove this set. Please try again.');fail(new Error(message),message);if(button){button.disabled=false;button.textContent=original}}
}

async function renderMatches(token){
  if(!S.user){showAuth();return navigate('home')}const rd=readiness();if(rd.score<40&&!S.matches.length){page(`<div class="bc-page-head"><div><h1>Great matches</h1><p>Collectors who want something you own — and own something you want.</p></div></div>${empty('⇄','Finish your match setup','Add owned sets, mark exchangeable copies and build a wishlist. BrickCircle can only create a reciprocal match when both sides line up.','Continue setup','sets')}`);return}
  const ids=[...new Set(S.matches.map(m=>m.match_user))];if(ids.length){const {data}=await db.from('public_profiles').select('id,display_name,country,city,bio,avatar_url,rating,review_count,identity_verified,member_since').in('id',ids);(data||[]).forEach(p=>S.profiles[p.id]=p);await loadPeerReputations(ids)}
  page(`<div class="bc-page-head"><div><h1>Great matches</h1><p>Collectors who want something you own — and own something you want.</p></div><div class="bc-head-actions">${pill(`${S.matches.length} reciprocal`,S.matches.length?'green':'')}</div></div><div class="bc-match-list">${S.matches.length?S.matches.map((m,i)=>matchCard(m,i)).join(''):empty('🔎','No reciprocal match yet','Your wishlist and exchangeable sets are ready. Add a few more wanted sets or invite another collector in your city to improve local liquidity.','Explore more sets','browse')}</div>`);$$('[data-propose]',app()).forEach(b=>b.onclick=()=>showProposal(Number(b.dataset.propose)));$$('[data-message-person]',app()).forEach(b=>b.onclick=()=>navigate('messages',`direct:${b.dataset.messagePerson}`));bindCommon(app());wireImages(app());hydrateMatchPhotos(app());
}
function matchCard(m,i){const p=S.profiles[m.match_user]||{},offerImage=imageSetNumber(m.offered_set),requestImage=imageSetNumber(m.requested_set);return `<article class="bc-card bc-match bc-match-premium"><div class="bc-match-top"><div class="bc-match-person"><div class="bc-mini-avatar">${avatar(p)}</div><div><b>${esc(p.display_name||'Collector')}</b><div class="bc-small">${esc(p.city||S.profile?.city||'')}</div>${reputationTrustContext(m.match_user)}</div></div>${pill('Reciprocal match','green')}</div><div class="bc-match-visuals"><div class="bc-match-set"><div class="bc-match-set-image"><img src="https://images.brickset.com/sets/images/${attr(offerImage)}.jpg" alt="" loading="lazy" data-set-image="${attr(m.offered_set)}"><div hidden>🧱</div></div><span>You offer</span><strong>${esc(m.offered_name)}</strong><small>Set ${esc(m.offered_set)}</small></div><div class="bc-match-exchange-mark" aria-hidden="true">⇄</div><div class="bc-match-set"><div class="bc-match-set-image"><img src="https://images.brickset.com/sets/images/${attr(requestImage)}.jpg" alt="" loading="lazy" data-set-image="${attr(m.requested_set)}"><div hidden>🧱</div></div><span>You build next</span><strong>${esc(m.requested_name)}</strong><small>Set ${esc(m.requested_set)}</small></div></div><div class="bc-match-proof"><b>Two collections. One great exchange.</b><span>Both of you independently want the other collector’s available set.</span></div><div class="bc-match-actions"><button class="bc-btn primary" data-propose="${i}">View & propose</button><button class="bc-btn" data-message-person="${attr(m.match_user)}">Message ${esc((p.display_name||'collector').split(' ')[0])}</button></div></article>`}
async function showProposal(i){const m=S.matches[i];if(!m)return;await loadPeerReputation(m.match_user);const p=S.profiles[m.match_user]||{};const o=modal(`<div class="bc-modal-head"><div><span class="bc-pill green">Reciprocal match</span><h2 style="margin-top:8px">Propose an exchange with ${esc(p.display_name||'this collector')}</h2><p class="bc-muted">Meet locally. Inspect both sets. Exchange only when you are both happy.</p></div><button class="bc-close" data-close>×</button></div><div class="bc-proposal-steps" aria-label="Proposal steps"><span class="done"><b>1</b>Your set</span><span class="done"><b>2</b>Their set</span><span class="current"><b>3</b>Terms</span></div><div class="bc-proposal-pair"><div><span>You offer</span><strong>${esc(m.offered_name)}</strong><small>Set ${esc(m.offered_set)}</small></div><i>⇄</i><div><span>You request</span><strong>${esc(m.requested_name)}</strong><small>Set ${esc(m.requested_set)}</small></div></div>${reputationTrustContext(m.match_user)}<form class="bc-form" id="bc-proposal"><div class="bc-field"><label>How long would you like to exchange?</label><select class="bc-select" name="days"><option value="30">30 days</option><option value="60" selected>60 days</option><option value="90">90 days</option></select></div><div class="bc-field"><label>Optional message</label><textarea class="bc-textarea" name="message">Hi! We have a reciprocal BrickCircle match. Would you like to meet locally, inspect both sets and exchange them temporarily?</textarea></div><div class="bc-notice warn"><b>Meet. Inspect. Exchange.</b><br>The proposal creates one shared case for meetup, inspection, handoff, return and messages.</div><div class="bc-form-actions"><button type="button" class="bc-btn" data-close>Not now</button><button type="submit" class="bc-btn primary">Send proposal</button></div></form>`);$$('[data-close]',o).forEach(b=>b.onclick=closeOverlay);$('#bc-proposal',o).onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget),btn=$('button[type="submit"]',e.currentTarget),days=Number(f.get('days')),message=String(f.get('message')||''),intent={offered_item_id:m.offered_item,requested_item_id:m.requested_item,duration_days:days,message};if(btn.disabled)return;btn.disabled=true;btn.textContent='Sending…';const {data,error}=await canonicalRpc('create_exchange_case',{p_offered_item_id:m.offered_item,p_requested_item_id:m.requested_item,p_duration_days:days,p_message:message},intent);if(error||data?.ok===false){fail(error||new Error('Could not send the proposal.'));btn.disabled=false;btn.textContent='Send proposal';return}closeOverlay();await refreshCore();navigate('exchange',data.case?.id);toast(data?.idempotent?'Your existing proposal is open.':'Exchange proposal sent.');track('exchange_proposal_sent',{match_user:m.match_user,duration_days:days})}}

async function renderExchanges(token,legacy='exchanges'){
  if(!S.user){showAuth();return navigate('home')}await hydrateExchangeItems();if(legacy==='requests'||routeId())S.exchangeTab='requests';if(legacy==='returns'||legacy==='meetup')S.exchangeTab='active';
  const active=activeExchanges(),pending=pendingRequests(),history=exchangeHistory();page(`<div class="bc-page-head"><div><h1>Exchanges</h1><p>Every exchange shows one clear stage and the next action to keep it moving.</p></div><div class="bc-head-actions">${active.length?pill(`${active.length} active`,'green'):''}${pending.length?pill(`${pending.length} needs attention`,'gold'):''}</div></div><div class="bc-tabs"><button class="bc-tab ${S.exchangeTab==='active'?'active':''}" data-extab="active">Active · ${active.length}</button><button class="bc-tab ${S.exchangeTab==='requests'?'active':''}" data-extab="requests">Needs action · ${pending.length}</button><button class="bc-tab ${S.exchangeTab==='completed'?'active':''}" data-extab="completed">Past · ${history.length}</button></div><div id="bc-exchange-body"></div>`);$$('[data-extab]').forEach(b=>b.onclick=()=>{S.exchangeTab=b.dataset.extab;renderExchangeBody()});renderExchangeBody();
}
function renderExchangeBody(){const host=$('#bc-exchange-body');if(!host)return;const active=activeExchanges(),pending=pendingRequests(),history=exchangeHistory();if(S.exchangeTab==='requests'){host.innerHTML=pending.length?`<div class="bc-exchange-list">${pending.map(requestCard).join('')}</div>`:empty('📨','No pending proposals','New proposals you send or receive will appear here.','Find matches','matches');$$('[data-request-action]',host).forEach(b=>b.onclick=()=>respondRequest(b.dataset.requestId,b.dataset.requestAction))}else if(S.exchangeTab==='completed'){host.innerHTML=history.length?`<div class="bc-exchange-list">${history.map(exchangeCard).join('')}</div>`:empty('✓','No exchange history yet','Completed and closed exchange cases remain visible here.','Find a match','matches')}else{host.innerHTML=active.length?`<div class="bc-exchange-list">${active.map(exchangeCard).join('')}</div>`:empty('🤝','No active exchanges','Accept a reciprocal proposal and your meetup → handoff → return journey will live here.','See matches','matches')}$$('[data-exchange]',host).forEach(b=>b.onclick=()=>navigate('exchange',b.dataset.exchange));bindCommon(host)}
function requestCard(r){const incoming=r.recipient_id===S.user.id,other=otherId(r),p=S.profiles[other]||{},offer=itemName(r.item_a),want=itemName(r.item_b),focused=routeId()===r.id;return `<article class="bc-card bc-pad bc-request" data-request-card="${attr(r.id)}" ${focused?'style="outline:3px solid #f3c623;outline-offset:2px"':''}><div><div>${pill(incoming?'Incoming proposal':'Proposal sent',incoming?'gold':'blue')}</div><h3>${esc(offer)} ⇄ ${esc(want)}</h3><div class="bc-ex-meta">With ${esc(p.display_name||'Collector')} · ${r.duration_days} days · responds by ${fmtDateTime(r.response_deadline)}</div>${r.opening_message?`<div class="bc-notice" style="margin-top:10px">${esc(r.opening_message)}</div>`:''}</div><div class="bc-request-actions">${incoming?`<button class="bc-btn primary" data-request-action="accept" data-request-id="${r.id}">Accept</button><button class="bc-btn" data-request-action="decline" data-request-id="${r.id}">Decline</button><button class="bc-btn" data-request-action="counter" data-request-id="${r.id}">Counter</button>`:`<button class="bc-btn danger" data-request-action="withdraw" data-request-id="${r.id}">Withdraw proposal</button>`}<button class="bc-btn" data-exchange="${r.id}">Open case</button></div></article>`}
async function respondRequest(id,action){
  const btn=$(`[data-request-id="${CSS.escape(id)}"][data-request-action="${action}"]`);
  const original=btn?.textContent||'';
  if(btn){btn.disabled=true;btn.textContent=action==='accept'?'Accepting…':'Working…'}
  const exchange=S.exchanges.find(row=>row.id===id);if(!exchange)return;
  if(action==='counter')return showCounterProposal(exchange);
  const intent={case_id:id,version:exchange.state_version,action,payload:{}};
  const {data,error}=await settledTimeout(canonicalRpc('exchange_case_transition',{p_case_id:id,p_expected_version:exchange.state_version,p_action:action,p_payload:{}},intent),15000);
  if(error){
    fail(error);
    if(btn){btn.disabled=false;btn.textContent=original}
    await refreshCore();
    renderExchangeBody();
    return;
  }
  if(data?.ok===false){
    fail(new Error(data.message||'This proposal has changed.'));
    if(btn){btn.disabled=false;btn.textContent=original}
    await refreshCore();
    renderExchangeBody();
    return;
  }
  await refreshCore();
  await hydrateExchangeItems();
  if(action==='accept'){
    S.exchangeTab='active';
    toast('Exchange accepted. Plan a safe meetup next.');
    track('exchange_request_accepted',{case_id:id});
    return navigate('exchange',id);
  }
  renderExchangeBody();
}
function showCounterProposal(exchange){const o=modal(`<div class="bc-modal-head"><div><h2>Counterproposal</h2><p class="bc-muted">Update the duration without creating another exchange case.</p></div><button class="bc-close" data-close>×</button></div><form class="bc-form" id="bc-counter"><div class="bc-field"><label>Temporary exchange period</label><select class="bc-select" name="days">${[30,60,90].map(days=>`<option value="${days}" ${days===exchange.duration_days?'selected':''}>${days} days</option>`).join('')}</select></div><div class="bc-field"><label>Message</label><textarea class="bc-textarea" name="message">${esc(exchange.opening_message||'')}</textarea></div><button type="submit" class="bc-btn primary">Send counterproposal</button></form>`);$$('[data-close]',o).forEach(b=>b.onclick=closeOverlay);$('#bc-counter',o).onsubmit=async event=>{event.preventDefault();const form=new FormData(event.currentTarget),button=$('button[type="submit"]',event.currentTarget),payload={duration_days:Number(form.get('days')),message:String(form.get('message')||'')},intent={case_id:exchange.id,version:exchange.state_version,action:'counter',payload};if(button.disabled)return;button.disabled=true;const {error}=await canonicalRpc('exchange_case_transition',{p_case_id:exchange.id,p_expected_version:exchange.state_version,p_action:'counter',p_payload:payload},intent);if(error){button.disabled=false;return fail(error,'Could not send the counterproposal.')}closeOverlay();await refreshCore();navigate('exchange',exchange.id);toast('Counterproposal sent in the same exchange case.')}}
function exchangeStageLabel(e){return {PROPOSED:'Proposal pending',ACCEPTED:'Plan meetup',MEETUP_PLANNING:'Review meetup',MEETUP_CONFIRMED:'Safety checklist',INSPECTION:'Meet and inspect',HANDOFF_PENDING:'Confirm handoff',HANDOFF_ISSUE:'Legacy custody review',ACTIVE:e.return_due_at&&new Date(e.return_due_at)<new Date()?'Return overdue':'Temporary exchange active',EARLY_RETURN:'Early return requested',RETURN_PLANNING:'Plan return',RETURN_INSPECTION:'Inspect returned sets',DISPUTED:'Legacy issue',DECLINED:'Declined',WITHDRAWN:'Withdrawn',EXPIRED:'Expired',CANCELLED:'Cancelled',COMPLETED:'Completed'}[e.state]||'In progress'}
function exchangeCard(e){const p=otherProfile(e),a=itemName(e.item_a),b=itemName(e.item_b),stage=stageForExchange(e),closed=terminalCaseStates.has(e.state),next=caseNextAction(e);return `<article class="bc-card bc-ex-card"><div class="bc-ex-top"><div><span class="bc-pill ${e.state==='DISPUTED'||e.state==='HANDOFF_ISSUE'?'red':e.state==='COMPLETED'?'green':e.state==='ACTIVE'?'blue':'gold'}">${esc(exchangeStageLabel(e))}</span><h3>${esc(a)} ⇄ ${esc(b)}</h3><div class="bc-ex-meta">With ${esc(p.display_name||'Collector')} · ${e.duration_days} days${e.return_due_at?` · return ${fmtDate(e.return_due_at)}`:''}</div></div><button class="bc-btn ${closed?'':'primary'}" data-exchange="${e.id}">${closed?'View history':'Continue →'}</button></div>${closed?'':`<div class="bc-ex-next"><span>Next</span><strong>${esc(next.label||exchangeStageLabel(e))}</strong><small>${esc(next.copy)}</small></div>`}<div class="bc-ex-progress">${[1,2,3,4,5].map(n=>`<i class="bc-ex-step ${n<stage?'done':n===stage?'current':''}"></i>`).join('')}</div><div class="bc-small">Proposal → Meetup → Handoff → Experience → Return</div></article>`}

async function renderExchangeDetail(id,token){
  if(!S.user){showAuth();return navigate('home')}if(!id)return navigate('exchanges');page(loading('Opening exchange…'));const {data:e,error}=await db.from('exchange_cases').select('*').eq('id',id).maybeSingle();if(error||!e)return page(empty('⚠️','Exchange unavailable','This exchange case could not be loaded. Please retry.','Back to exchanges','exchanges'));if(![e.user_a,e.user_b].includes(S.user.id))return navigate('exchanges');
  await hydrateExchangeItems([e]);
  const oid=otherId(e);
  if(!S.profiles[oid]){const {data:p}=await db.from('public_profiles').select('*').eq('id',oid).maybeSingle();if(p)S.profiles[oid]=p}
  const overdueStates=['ACTIVE','EARLY_RETURN','RETURN_PLANNING','RETURN_INSPECTION'];
  const [msg,events,issueRows,reviews,reputation,overdue]=await Promise.all([
    db.from('exchange_case_messages').select('*').eq('case_id',id).order('created_at',{ascending:true}),
    db.from('exchange_case_events').select('*').eq('case_id',id).order('created_at',{ascending:true}),
    db.from('exchange_case_issues').select('*').eq('case_id',id).order('created_at',{ascending:true}),
    db.rpc('get_peer_exchange_reviews',{p_case_id:id}),
    db.rpc('exchange_peer_reputation_summary',{p_user_id:oid}),
    e.return_due_at&&overdueStates.includes(e.state)?db.rpc('exchange_case_overdue_days',{p_case_id:id,p_as_of:new Date().toISOString()}):Promise.resolve({data:null,error:null})
  ]);
  const issues=issueRows.data||[],issueIds=issues.map(issue=>issue.id);
  const issueResponses=issueIds.length?((await db.from('exchange_case_issue_responses').select('*').in('issue_id',issueIds).order('created_at',{ascending:true})).data||[]):[];
  if(reputation&&!reputation.error&&reputation.data)S.reputation[oid]=reputation.data;
  const overdueDays=Number(overdue&&!overdue.error?overdue.data||0:0);
  if(overdueDays>0)S.caseOverdue[id]=overdueDays;else delete S.caseOverdue[id];
  if(token!==S.renderToken)return;
  renderExchangeDetailLoaded(e,msg.data||[],events.data||[],reviews&&!reviews.error?(reviews.data||[]):[],issues,issueResponses)
}
function exchangeTimeline(e){const current=stageForExchange(e),labels=['Proposal','Meetup','Handoff','Experience','Return'];return `<div class="bc-timeline ${terminalCaseStates.has(e.state)&&e.state!=='COMPLETED'?'closed':''}">${labels.map((label,index)=>`<div class="${index+1<current?'done':index+1===current?'current':''}"><i></i>${label}</div>`).join('')}</div>`}
function renderExchangeDetailLoaded(e,messages,events,reviews,issues,issueResponses){
  const p=otherProfile(e),oid=otherId(e),mineA=e.user_a===S.user.id,myItem=mineA?e.item_a:e.item_b,theirItem=mineA?e.item_b:e.item_a,myName=itemName(myItem),theirName=itemName(theirItem),messagingClosed=terminalCaseStates.has(e.state),next=caseNextAction(e),secondary=caseSecondaryAction(e),overdueDays=Number(S.caseOverdue[e.id]||0),trust=reputationTrustContext(oid);
  const overdueNotice=overdueDays>0?`<div class="bc-notice warn" style="margin-top:12px"><b>Return overdue by ${overdueDays} day${overdueDays===1?'':'s'}</b><br>Please arrange the return with the other collector, or record an issue and ask BrickCircle support for help.</div>`:'';
  page(`<button class="bc-back" data-action="exchanges">← Back to Exchanges</button><section class="bc-exchange-hero"><div class="bc-exchange-hero-top"><div><span class="bc-pill gold">${esc(exchangeStageLabel(e))} · with ${esc(p.display_name||'Collector')}${p.city?' · '+esc(p.city):''}</span><h1>${esc(myName)} ⇄ ${esc(theirName)}</h1><p>${e.duration_days}-day local temporary exchange${e.return_due_at?` · return due ${fmtDate(e.return_due_at)}`:''}</p>${trust}${overdueNotice}</div></div>${exchangeTimeline(e)}</section>${messagingClosed?'':`<section class="bc-mobile-next"><span>YOUR NEXT ACTION</span><h2>${esc(next.label||exchangeStageLabel(e))}</h2>${next.action?`<button class="bc-btn primary" data-case-action="${attr(next.action)}">${esc(next.label)}</button>`:''}${secondary?`<button class="bc-btn" data-case-action="${attr(secondary.action)}">${esc(secondary.label)}</button>`:''}</section>`}<div class="bc-exchange-layout"><div><section class="bc-card bc-flow-card" id="bc-flow">${flowMarkup(e,events)}</section>${caseIssuesMarkup(e,issues||[],issueResponses||[])}${reviewMarkup(e,p,reviews||[])}</div><aside><section class="bc-card bc-flow-card"><div class="bc-chat-head"><h2>Exchange conversation</h2><button class="bc-btn ghost" type="button" data-open-messages-case="${attr(e.id)}">Open in Messages</button></div><div class="bc-chat" id="bc-chat">${messages.length?messages.map(m=>`<div class="bc-msg ${m.sender_id===S.user.id?'mine':''}">${esc(m.body)}<small>${fmtDateTime(m.created_at)}</small></div>`).join(''):'<div class="bc-small">No messages yet. Keep meetup, handoff, return and issue details here.</div>'}</div>${messagingClosed?'':`<form class="bc-chat-form" id="bc-chat-form"><input name="message" maxlength="4000" placeholder="Message ${attr((p.display_name||'collector').split(' ')[0])}" required><button class="bc-btn primary">Send</button></form>`}</section><section class="bc-card bc-flow-card" style="margin-top:14px"><h2>Exchange guidance</h2><p>${esc(next.copy)}</p>${canReportCaseIssue(e)?'<button class="bc-btn danger" style="margin-top:10px" data-case-action="report_issue">Report an issue</button>':''}${legacyIssueCase(e)?`<div class="bc-notice warn" style="margin-top:10px"><b>Legacy case.</b><br>This exchange sits in a legacy custody review state, so the newer issue tools are unavailable here. Keep communicating with the other collector, or contact <a href="mailto:${attr(SUPPORT_EMAIL)}">${esc(SUPPORT_EMAIL)}</a>.</div>`:''}<button class="bc-btn" style="margin-top:10px" data-case-action="request_support">Need BrickCircle support?</button><div class="bc-notice warn" style="margin-top:12px"><b>Inspection first.</b><br>Meet publicly. Inspect condition, parts and completeness together. Confirm handoff only after you are satisfied.</div></section></aside></div>`);
  bindCommon(app());bindExchangeDetail(e,p)
}
function caseParticipantValue(e,prefix,mine=true){const suffix=(S.user.id===e.user_a)===mine?'a':'b';return e[`${prefix}_${suffix}_at`]}
function caseNextAction(e){const mine=S.user.id,recipient=e.recipient_id===mine,meetupOther=e.meetup_proposed_by&&e.meetup_proposed_by!==mine,returnOther=e.return_proposed_by&&e.return_proposed_by!==mine;
  if(e.migration_review_required)return {action:null,label:'',copy:'This migrated exchange is paused while BrickCircle reconciles physical custody and item locks.'};
  if(e.state==='PROPOSED')return recipient?{action:'accept',label:'Accept proposal',copy:'Accept, decline, or make a counterproposal before the deadline.'}:{action:null,label:'',copy:'Waiting for the other collector to respond.'};
  if(e.state==='ACCEPTED')return {action:'propose_meetup',label:'Plan public meetup',copy:'Choose a public place and future time.'};
  if(e.state==='MEETUP_PLANNING')return meetupOther?{action:'accept_meetup',label:'Accept meetup',copy:'Review and accept the proposed place and time.'}:{action:null,label:'',copy:'Waiting for the other collector to accept the meetup.'};
  if(e.state==='MEETUP_CONFIRMED'&&!caseParticipantValue(e,'safety_ack'))return {action:'safety_ack',label:'Accept safety checklist',copy:'Agree to meet publicly and inspect both sets before handoff.'};
  if(e.state==='INSPECTION'&&!caseParticipantValue(e,'arrived'))return {action:'arrive',label:'I have arrived',copy:'Confirm only when you are physically at the agreed public meetup.'};
  if(e.state==='INSPECTION'&&!caseParticipantValue(e,'arrived',false))return {action:null,label:'',copy:'Waiting for the other collector to arrive. Inspection unlocks after both arrivals.'};
  if(e.state==='INSPECTION'&&!caseParticipantValue(e,'inspected'))return {action:'inspect',label:'I inspected the set',copy:'Inspect condition, parts and completeness together.'};
  if(e.state==='HANDOFF_PENDING'&&!caseParticipantValue(e,'handoff'))return {action:'handoff',label:'Confirm physical handoff',copy:'Confirm only after physical custody changes.'};
  if(e.state==='ACTIVE')return {action:'propose_return',label:'Plan normal return',copy:`The return is due ${fmtDate(e.return_due_at)}. You may also request an early return.`};
  if(e.state==='EARLY_RETURN')return {action:'propose_return',label:'Plan return meetup',copy:'Both sets stay locked until mutual return confirmation.'};
  if(e.state==='RETURN_PLANNING')return returnOther?{action:'accept_return',label:'Accept return meetup',copy:'Review and accept the return place and time.'}:{action:null,label:'',copy:'Waiting for the other collector to accept the return meetup.'};
  if(e.state==='RETURN_INSPECTION'&&!caseParticipantValue(e,'return_arrived'))return {action:'return_arrive',label:'I arrived for return',copy:'Confirm when you are at the public return meetup.'};
  if(e.state==='RETURN_INSPECTION'&&!caseParticipantValue(e,'return_arrived',false))return {action:null,label:'',copy:'Waiting for the other collector to arrive. Return inspection unlocks after both arrivals.'};
  if(e.state==='RETURN_INSPECTION'&&!caseParticipantValue(e,'return_inspected'))return {action:'return_inspect',label:'I inspected my returned set',copy:'Check condition, parts and completeness before confirming.'};
  if(e.state==='RETURN_INSPECTION'&&!caseParticipantValue(e,'return_confirmed'))return {action:'return_confirm',label:'Confirm set returned',copy:'Confirm only after your physical set is back.'};
  if(legacyIssueCase(e))return {action:null,label:'',copy:'This is a legacy case, so the new issue tools are not available here. Keep communicating with the other collector and contact BrickCircle support for help with custody.'};
  if(e.state==='COMPLETED')return {action:null,label:'',copy:'Both returns are confirmed. Each owner must review and re-enable their own set.'};
  return {action:null,label:'',copy:'Waiting for the other collector’s confirmation.'};
}
function caseSecondaryAction(e){if(e.migration_review_required)return null;if(e.state==='PROPOSED')return {action:e.proposer_id===S.user.id?'withdraw':'decline',label:e.proposer_id===S.user.id?'Withdraw':'Decline'};if(['ACCEPTED','MEETUP_PLANNING','MEETUP_CONFIRMED','INSPECTION','HANDOFF_PENDING'].includes(e.state))return {action:'cancel_before_handoff',label:'Cancel before handoff'};if(e.state==='ACTIVE')return {action:'early_return',label:'Request early return'};return null}
function flowMarkup(e,events){const mineA=S.user.id===e.user_a,steps=[['Safety checklist',mineA?e.safety_ack_a_at:e.safety_ack_b_at,mineA?e.safety_ack_b_at:e.safety_ack_a_at],['Arrival',mineA?e.arrived_a_at:e.arrived_b_at,mineA?e.arrived_b_at:e.arrived_a_at],['Inspection',mineA?e.inspected_a_at:e.inspected_b_at,mineA?e.inspected_b_at:e.inspected_a_at],['Handoff',mineA?e.handoff_a_at:e.handoff_b_at,mineA?e.handoff_b_at:e.handoff_a_at],['Return inspection',mineA?e.return_inspected_a_at:e.return_inspected_b_at,mineA?e.return_inspected_b_at:e.return_inspected_a_at],['Return confirmation',mineA?e.return_confirmed_a_at:e.return_confirmed_b_at,mineA?e.return_confirmed_b_at:e.return_confirmed_a_at]];return `<h2>${esc(exchangeStageLabel(e))}</h2>${e.meetup_at?`<div class="bc-notice"><b>Meetup</b><br>${esc(e.meetup_venue_name||'Public venue')}${e.meetup_venue_area?` · ${esc(e.meetup_venue_area)}`:''}<br>${fmtDateTime(e.meetup_at)}</div>`:''}${e.return_meetup_at?`<div class="bc-notice"><b>Return meetup</b><br>${esc(e.return_venue_name||'Public venue')}${e.return_venue_area?` · ${esc(e.return_venue_area)}`:''}<br>${fmtDateTime(e.return_meetup_at)}</div>`:''}<section class="bc-shared-checklist" aria-label="Shared exchange checklist">${steps.map(([label,mine,theirs],index)=>`<div class="bc-flow-step ${mine?'done':''}"><div class="bc-flow-step-number">${mine?'✓':index+1}</div><div><b>${label}</b><div class="bc-flow-step-status"><span>You: ${mine?'confirmed':'not yet'}</span><span>Other collector: ${theirs?'confirmed':'waiting'}</span></div></div></div>`).join('')}</section><details class="bc-case-history"><summary>Case history · ${events.length} events</summary>${events.map(event=>`<div class="bc-small">${fmtDateTime(event.created_at)} · ${esc(event.event_type.replaceAll('_',' '))} · ${esc(event.resulting_state)}</div>`).join('')}</details>`}
function reviewScoreStars(value){const n=Math.max(0,Math.min(5,Number(value||0)));return '★'.repeat(n)+'☆'.repeat(5-n)}
function reviewScoreRow(label,value){return value==null?'':`<div class="bc-small">${esc(label)}: ${reviewScoreStars(value)}</div>`}
function reviewMarkup(e,p,reviews){
  const rows=reviews.filter(row=>row&&row.id),own=rows.find(row=>row.reviewer_id===S.user.id),theirs=rows.find(row=>row.reviewer_id!==S.user.id),pending=!own&&(S.submittedPeerReviews.has(e.id)||peerReviewSubmitted(e.id));
  let body='';
  if(pending)body='<div class="bc-notice good">✓ Review submitted — hidden until both submit or reveal window.</div>';
  else if(own&&!theirs)body=`<div class="bc-notice good">✓ You reviewed ${esc(p.display_name||'this collector')}.</div><p class="bc-small">Their review stays hidden until both are submitted or the reveal window opens.</p>`;
  else if(own&&theirs)body=`<div class="bc-notice good">✓ You reviewed ${esc(p.display_name||'this collector')}.</div><div class="bc-flow-step-status" style="margin-top:8px"><span>Verified peer review · ${esc(p.display_name||'collector')}</span><span>${reviewScoreStars(theirs.overall_rating)}</span></div>${reviewScoreRow('Return reliability',theirs.return_reliability)}${reviewScoreRow('Set accuracy',theirs.set_accuracy)}${reviewScoreRow('Communication',theirs.communication)}${reviewScoreRow('Condition accuracy',theirs.condition_accuracy)}${theirs.would_exchange_again?'<div class="bc-small">Would exchange again.</div>':'<div class="bc-small">Would not exchange again.</div>'}${theirs.comment?`<p class="bc-small" style="margin-top:6px">${esc(theirs.comment)}</p>`:''}`;
  else if(e.state==='COMPLETED'&&Boolean(e.handoff_at))body=`<p class="bc-muted">How was the full exchange and return experience with ${esc(p.display_name||'this collector')}?</p><button class="bc-btn primary" data-review>Leave review</button>`;
  else body='<p class="bc-small">Peer reviews open once both returns are confirmed and the case is complete.</p>';
  return `<section class="bc-card bc-flow-card" style="margin-top:14px"><h2>Peer review</h2><p class="bc-small">Double-blind: each collector reviews the other privately, and reviews stay hidden until both are submitted or the reveal window opens.</p>${body}</section>`
}
function bindExchangeDetail(e,p){$$('[data-case-action]',app()).forEach(button=>button.onclick=()=>runCaseAction(e,button.dataset.caseAction,button));bindCaseIssues(e);$$('[data-open-messages-case]',app()).forEach(button=>button.onclick=()=>navigate('messages',`case:${button.dataset.openMessagesCase}`));const review=$('[data-review]',app());if(review)review.onclick=()=>showReview(e,p);const form=$('#bc-chat-form');if(form)form.onsubmit=async event=>{event.preventDefault();const data=new FormData(form),body=String(data.get('message')||'').trim(),button=$('button',form),intent={case_id:e.id,body};if(!body||button.disabled)return;button.disabled=true;const {error}=await canonicalRpc('send_exchange_case_message',{p_case_id:e.id,p_body:body},intent);if(error){button.disabled=false;return fail(error,'Message was not sent. Please retry.')}form.reset();await refreshCore();await renderExchangeDetail(e.id,S.renderToken)}}
function scheduleCaseMeetup(e,returning=false){const title=returning?'Plan return meetup':'Plan public meetup',o=modal(`<div class="bc-modal-head"><div><h2>${title}</h2><p class="bc-muted">The other collector must accept the same public place and future time.</p></div><button class="bc-close" data-close>×</button></div><form class="bc-form" id="bc-case-meetup"><div class="bc-field"><label>Public venue</label><input class="bc-input" name="venue" value="${attr(returning?e.return_venue_name||'':e.meetup_venue_name||'')}" required></div><div class="bc-field"><label>Area / neighbourhood</label><input class="bc-input" name="area" value="${attr(returning?e.return_venue_area||'':e.meetup_venue_area||'')}"></div><div class="bc-field"><label>Date & time</label><input class="bc-input" name="when" type="datetime-local" required></div><button type="submit" class="bc-btn primary">Share proposal</button></form>`);$$('[data-close]',o).forEach(button=>button.onclick=closeOverlay);$('#bc-case-meetup',o).onsubmit=async event=>{event.preventDefault();const data=new FormData(event.currentTarget),date=new Date(String(data.get('when'))),button=$('button[type="submit"]',event.currentTarget),action=returning?'propose_return':'propose_meetup';if(Number.isNaN(date.getTime())||date<=new Date())return toast('Choose a future date and time.');if(button.disabled)return;const payload={venue_name:String(data.get('venue')||'').trim(),venue_area:String(data.get('area')||'').trim(),meetup_at:date.toISOString()},intent={case_id:e.id,version:e.state_version,action,payload};button.disabled=true;const {error}=await canonicalRpc('exchange_case_transition',{p_case_id:e.id,p_expected_version:e.state_version,p_action:action,p_payload:payload},intent);if(error){button.disabled=false;return fail(error,'Could not save the meetup proposal.')}closeOverlay();await refreshCore();await renderExchangeDetail(e.id,S.renderToken)}}
async function runCaseAction(e,action,button){if(action==='propose_meetup')return scheduleCaseMeetup(e,false);if(action==='propose_return')return scheduleCaseMeetup(e,true);if(action==='report_issue'){if(!canReportCaseIssue(e))return toast('Issues can be reported once a handoff has been confirmed on this exchange.');return showCaseIssueForm(e)}if(action==='request_support')return showCaseSupportForm(e);if(action==='cancel_before_handoff')return cancelCaseBeforeMutualHandoff(e,button);if(action==='handoff'&&!confirm('Confirm only after the physical set has changed custody and you are satisfied with inspection. Continue?'))return;if(action==='return_confirm'&&!confirm('Confirm only after your own physical LEGO set is back and inspected. Continue?'))return;return performCaseTransition(e,action,{},button)}
async function cancelCaseBeforeMutualHandoff(e,button){
  const oneSided=e.handoff_a_at||e.handoff_b_at;
  const reason=prompt(oneSided?'One collector has already confirmed the handoff, so a set may physically have moved. Tell the other collector what happened.':'Why are you cancelling before the mutual handoff? (required)');
  if(reason===null)return;
  const trimmed=String(reason).trim();
  if(!trimmed)return toast('Add a short reason so the other collector understands.');
  if(!confirm('Cancel this exchange before the mutual handoff? Set preferences will be restored and the case history preserved.'))return;
  if(button)button.disabled=true;
  const intent={case_id:e.id,version:e.state_version,action:'cancel_exchange_case_before_mutual_handoff',reason:trimmed};
  const {error}=await canonicalRpc('cancel_exchange_case_before_mutual_handoff',{p_case_id:e.id,p_expected_version:e.state_version,p_reason:trimmed},intent);
  if(error){if(button)button.disabled=false;return fail(error,'Could not cancel before handoff. The exchange may have changed, or a handoff may already be confirmed. Refresh and retry.')}
  await refreshCore();await renderExchangeDetail(e.id,S.renderToken);toast('Exchange cancelled before the mutual handoff.');
}
async function performCaseTransition(e,action,payload,button){if(button)button.disabled=true;const intent={case_id:e.id,version:e.state_version,action,payload};const {error}=await canonicalRpc('exchange_case_transition',{p_case_id:e.id,p_expected_version:e.state_version,p_action:action,p_payload:payload},intent);if(error){if(button)button.disabled=false;return fail(error,'The exchange changed or this action is no longer available. Refresh and retry.')}await refreshCore();await renderExchangeDetail(e.id,S.renderToken);toast('Exchange case updated.')}
function legacyIssueCase(e){return e.state==='HANDOFF_ISSUE'||e.state==='DISPUTED'}
function canReportCaseIssue(e){return Boolean(e.handoff_at)&&!legacyIssueCase(e)}
function reputationTrustContext(userId){
  if(!userId||userId===S.user?.id)return '';
  const summary=S.reputation[userId];
  const building='Peer trust: new collector · reputation still building.';
  if(!summary)return `<div class="bc-small">${building}</div>`;
  const completed=Number(summary.completed_exchanges||0),revealed=Number(summary.revealed_review_count||0),rating=summary.overall_rating==null?null:Number(summary.overall_rating),onTime=summary.on_time_return_percentage==null?null:Number(summary.on_time_return_percentage),again=summary.would_exchange_again_percentage==null?null:Number(summary.would_exchange_again_percentage),unresolved=Number(summary.unresolved_issue_count||0),parts=[];
  if(rating!=null)parts.push(`${rating.toFixed(1)} ★ from ${revealed} peer review${revealed===1?'':'s'}`);
  else if(revealed)parts.push(`${revealed} peer review${revealed===1?'':'s'}`);
  if(onTime!=null)parts.push(`returned on time ${onTime}% of tracked returns`);
  if(again!=null)parts.push(`${again}% would exchange again`);
  if(completed)parts.push(`${completed} completed exchange${completed===1?'':'s'}`);
  if(!parts.length)return `<div class="bc-small">${building}</div>`;
  return `<div class="bc-small">Peer trust: ${esc(parts.join(' · '))}.${unresolved?` ${unresolved} unresolved peer issue${unresolved===1?'':'s'}.`:''}</div>`;
}
async function loadPeerReputation(userId){
  if(!userId||userId===S.user?.id)return null;
  if(S.reputation[userId])return S.reputation[userId];
  const {data,error}=await db.rpc('exchange_peer_reputation_summary',{p_user_id:userId});
  if(error||!data)return null;
  S.reputation[userId]=data;return data;
}
async function loadPeerReputations(userIds){await Promise.all([...new Set(userIds.filter(Boolean))].map(id=>loadPeerReputation(id).catch(()=>null)))}
function peerReviewSubmissionsStore(){return `bc_peer_review_submitted:${S.user?.id||'anonymous'}`}
function peerReviewSubmitted(caseId){try{return JSON.parse(sessionStorage.getItem(peerReviewSubmissionsStore())||'{}')[caseId]==='1'}catch(_){return false}}
function rememberPeerReviewSubmitted(caseId){try{const all=JSON.parse(sessionStorage.getItem(peerReviewSubmissionsStore())||'{}');all[caseId]='1';sessionStorage.setItem(peerReviewSubmissionsStore(),JSON.stringify(all))}catch(_){}}
function resetPeerTrustCaches(){S.reputation={};S.caseOverdue={};S.submittedPeerReviews=new Set()}
const CASE_ISSUE_CATEGORY_OPTIONS=[['missing_pieces','Missing pieces'],['major_component_missing','Major component missing'],['unexpected_damage','Unexpected damage'],['materially_different_condition','Materially different condition'],['wrong_set_or_accessory','Wrong set or accessory'],['return_overdue','Return overdue'],['communication_problem','Communication problem'],['other','Other']];
function caseIssueCategoryLabel(category){const match=CASE_ISSUE_CATEGORY_OPTIONS.find(([value])=>value===category);return match?match[1]:'Other'}
function caseIssueReporter(issue){return issue.reported_by||issue.reporter_id||issue.author_id||issue.created_by}
function caseIssueResponseAuthor(response){return response.author_id||response.responder_id||response.user_id}
function caseIssuesMarkup(e,issues,responses){
  const mine=issues.filter(issue=>issue&&issue.id);
  if(!mine.length)return '';
  const scoped=responses.filter(response=>mine.some(issue=>issue.id===response.issue_id));
  return `<section class="bc-card bc-flow-card" style="margin-top:14px"><h2>Peer issues</h2><p class="bc-muted">Issues recorded by either collector. Respond here, and mark an issue resolved once you have sorted it out together.</p>${mine.map(issue=>{const rows=scoped.filter(response=>response.issue_id===issue.id),resolved=issue.status==='resolved',reporter=caseIssueReporter(issue),mineReported=Boolean(reporter)&&reporter===S.user.id;return `<div class="bc-notice ${resolved?'good':''}" style="margin-top:10px"><div class="bc-statusrow">${pill(caseIssueCategoryLabel(issue.category),resolved?'green':'gold')}${pill(resolved?'Resolved':issue.status==='unresolved'?'Left unresolved':'Open',resolved?'green':issue.status==='unresolved'?'gold':'blue')}</div><p style="margin-top:6px">${esc(issue.description||'')}</p><div class="bc-small">Reported by ${mineReported?'you':'the other collector'}${issue.created_at?' · '+fmtDateTime(issue.created_at):''}</div>${rows.length?`<div class="bc-chat" style="margin-top:8px">${rows.map(response=>`<div class="bc-msg ${caseIssueResponseAuthor(response)===S.user.id?'mine':''}">${esc(response.body||'')}<small>${fmtDateTime(response.created_at)}</small></div>`).join('')}</div>`:''}${resolved?'':`<form class="bc-chat-form" data-issue-response-form="${attr(issue.id)}"><input name="body" maxlength="4000" placeholder="Add your response" required><button class="bc-btn primary" type="submit">Respond</button></form><div class="bc-statusrow" style="margin-top:8px"><button class="bc-btn" data-issue-status="resolve" data-issue-id="${attr(issue.id)}">Mark resolved</button><button class="bc-btn" data-issue-status="unresolved" data-issue-id="${attr(issue.id)}">Leave unresolved</button></div>`}</div>`}).join('')}</section>`
}
function bindCaseIssues(e){
  $$('[data-issue-response-form]',app()).forEach(form=>form.onsubmit=event=>{event.preventDefault();return submitCaseIssueResponse(e,form.dataset.issueResponseForm,form)});
  $$('[data-issue-status]',app()).forEach(button=>button.onclick=()=>setCaseIssueStatus(e,button.dataset.issueId,button.dataset.issueStatus,button));
}
async function submitCaseIssueResponse(e,issueId,form){
  const data=new FormData(form),body=String(data.get('body')||'').trim(),button=$('button[type="submit"]',form);
  if(!body||button.disabled)return;
  button.disabled=true;
  const {error}=await canonicalRpc('respond_exchange_case_issue',{p_issue_id:issueId,p_body:body,p_evidence:[]},{case_id:e.id,issue_id:issueId,body});
  if(error){button.disabled=false;return fail(error,'Your response was not added. Please retry.')}
  await refreshCore();await renderExchangeDetail(e.id,S.renderToken);toast('Response added.');
}
async function setCaseIssueStatus(e,issueId,action,button){
  if(button)button.disabled=true;
  const {error}=await canonicalRpc('set_exchange_case_issue_status',{p_issue_id:issueId,p_action:action},{case_id:e.id,issue_id:issueId,action});
  if(error){if(button)button.disabled=false;return fail(error,'Could not update the issue. Please retry.')}
  await refreshCore();await renderExchangeDetail(e.id,S.renderToken);toast(action==='resolve'?'Resolution acknowledgement recorded.':'Issue left unresolved for the record.');
}
function showCaseIssueForm(e){
  const o=modal(`<div class="bc-modal-head"><div><h2>Report an issue</h2><p class="bc-muted">Describe what happened in your own words. The other collector can respond, and either of you can mark the issue resolved.</p></div><button class="bc-close" data-close>×</button></div><form class="bc-form" id="bc-case-issue"><div class="bc-field"><label>What happened?</label><select class="bc-select" name="category" required>${CASE_ISSUE_CATEGORY_OPTIONS.map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}</select></div><div class="bc-field"><label>Description</label><textarea class="bc-textarea" name="description" maxlength="4000" required placeholder="What is missing, damaged, different or overdue? Include the set number and what you checked."></textarea></div><div class="bc-notice"><b>Recording an issue does not decide fault.</b><br>Keep coordinating in the conversation. For platform, safety or technical help use “Need BrickCircle support?”.</div><button class="bc-btn primary" type="submit">Report issue</button></form>`);
  $$('[data-close]',o).forEach(button=>button.onclick=closeOverlay);
  $('#bc-case-issue',o).onsubmit=async event=>{event.preventDefault();const data=new FormData(event.currentTarget),category=String(data.get('category')||'other'),description=String(data.get('description')||'').trim(),button=$('button[type="submit"]',event.currentTarget);
    if(!description)return toast('Add a description so the other collector understands.');
    button.disabled=true;
    const {error}=await canonicalRpc('report_exchange_case_issue',{p_case_id:e.id,p_category:category,p_description:description,p_evidence:[]},{case_id:e.id,category,description});
    if(error){button.disabled=false;return fail(error,'Could not report the issue. Please retry.')}
    closeOverlay();await refreshCore();await renderExchangeDetail(e.id,S.renderToken);toast('Issue reported. The other collector can respond here.')};
}
function showCaseSupportForm(e){
  const o=modal(`<div class="bc-modal-head"><div><h2>Need BrickCircle support?</h2><p class="bc-muted">Support helps with platform, safety and technical matters.</p></div><button class="bc-close" data-close>×</button></div><form class="bc-form" id="bc-case-support"><div class="bc-field"><label>What do you need help with?</label><select class="bc-select" name="category" required>${[['technical','Technical problem'],['safety','Safety concern'],['account','Account question'],['other','Something else']].map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}</select></div><div class="bc-field"><label>Note</label><textarea class="bc-textarea" name="note" maxlength="2000" required placeholder="What happened, and what would help?"></textarea></div><div class="bc-notice"><b>Support does not choose a winner.</b><br>BrickCircle support helps with platform, safety and technical matters, but does not decide fault or who is right. We reply at <a href="mailto:${attr(SUPPORT_EMAIL)}">${esc(SUPPORT_EMAIL)}</a>.</div><button class="bc-btn primary" type="submit">Send to support</button></form>`);
  $$('[data-close]',o).forEach(button=>button.onclick=closeOverlay);
  $('#bc-case-support',o).onsubmit=async event=>{event.preventDefault();const data=new FormData(event.currentTarget),category=String(data.get('category')||'other'),note=String(data.get('note')||'').trim(),button=$('button[type="submit"]',event.currentTarget);
    if(!note)return toast('Add a short note so support can help.');
    button.disabled=true;
    const {error}=await canonicalRpc('request_exchange_case_support',{p_case_id:e.id,p_category:category,p_note:note},{case_id:e.id,category,note});
    if(error){button.disabled=false;return fail(error,'Could not send your request. Please retry.')}
    closeOverlay();toast(`Support request sent. We reply at ${SUPPORT_EMAIL}.`)};
}
function showReview(e,p){
  const scale=[5,4,3,2,1].map(n=>`<option value="${n}">${n} · ${['Very poor','Poor','Okay','Good','Excellent'][n-1]}</option>`).join('');
  const o=modal(`<div class="bc-modal-head"><div><h2>Review ${esc(p.display_name||'collector')}</h2><p class="bc-muted">Double-blind review. Your ratings stay hidden until both collectors submit or the reveal window opens.</p></div><button class="bc-close" data-close>×</button></div><form class="bc-form" id="bc-peer-review-form"><div class="bc-field"><label>Overall experience</label><select class="bc-select" name="overall_rating" required>${scale}</select></div><div class="bc-field"><label>Return reliability</label><select class="bc-select" name="return_reliability" required>${scale}</select></div><div class="bc-field"><label>Set accuracy</label><select class="bc-select" name="set_accuracy" required>${scale}</select></div><div class="bc-field"><label>Communication</label><select class="bc-select" name="communication" required>${scale}</select></div><div class="bc-field"><label>Condition accuracy</label><select class="bc-select" name="condition_accuracy" required>${scale}</select></div><div class="bc-field"><label>Would you exchange with them again?</label><select class="bc-select" name="would_exchange_again" required><option value="yes">Yes</option><option value="no">No</option></select></div><div class="bc-field"><label>Comment (optional)</label><textarea class="bc-textarea" name="comment" maxlength="2000" placeholder="What should another collector know?"></textarea></div><button class="bc-btn primary" type="submit">Submit review</button></form>`);
  $$('[data-close]',o).forEach(b=>b.onclick=closeOverlay);
  $('#bc-peer-review-form',o).onsubmit=async ev=>{
    ev.preventDefault();const f=new FormData(ev.currentTarget),btn=$('button[type="submit"]',ev.currentTarget);
    if(btn.disabled)return;
    const args={p_case_id:e.id,p_overall_rating:Number(f.get('overall_rating')),p_return_reliability:Number(f.get('return_reliability')),p_set_accuracy:Number(f.get('set_accuracy')),p_communication:Number(f.get('communication')),p_condition_accuracy:Number(f.get('condition_accuracy')),p_would_exchange_again:String(f.get('would_exchange_again'))==='yes',p_comment:String(f.get('comment')||'').trim()};
    btn.disabled=true;
    const intent={case_id:e.id,overall:args.p_overall_rating,reliability:args.p_return_reliability,accuracy:args.p_set_accuracy,communication:args.p_communication,condition:args.p_condition_accuracy,again:args.p_would_exchange_again,comment:args.p_comment};
    const {data,error}=await canonicalRpc('submit_peer_exchange_review',args,intent);
    if(error||data?.ok===false){fail(error||new Error('Could not submit your review.'),'Could not submit your review. Please retry.');btn.disabled=false;return}
    S.submittedPeerReviews.add(e.id);rememberPeerReviewSubmitted(e.id);closeOverlay();toast('Review submitted. It stays hidden until both reviews are in or the reveal window opens.');await refreshCore();await renderExchangeDetail(e.id,S.renderToken)
  }
}

async function renderProfile(token){
  if(!S.user){showAuth();return navigate('home')}const p=S.profile||{},completed=completedExchanges().length,reviewCount=Number(p.review_count||0),rating=reviewCount?Number(p.rating||0).toFixed(1):null,memberBadge=membershipBadge(),cityMembership=membershipCityCopy();page(`<div class="bc-page-head"><div><h1>Profile</h1><p>Your collector identity, local BrickCircle and account controls.</p></div><div class="bc-head-actions"><button class="bc-btn" data-edit-profile>Edit profile</button><button class="bc-btn danger" data-signout>Sign out</button></div></div><section class="bc-profile-hero"><div class="bc-profile-avatar" id="bc-profile-avatar">${avatar(p)}</div><div><h1>${esc(p.display_name||'Collector')}</h1><p>📍 ${esc(p.city||'Choose city')}${p.country?' · '+esc(p.country):''}</p><div class="bc-profile-badges">${memberBadge?`<span class="bc-pill">${esc(memberBadge)}</span>`:''}<span class="bc-pill">🧱 Member since ${new Date(p.member_since||p.created_at||S.user.created_at||Date.now()).getFullYear()}</span>${p.identity_verified?'<span class="bc-pill green">✓ Identity verified</span>':''}</div><div style="margin-top:12px"><label class="bc-btn" style="display:inline-flex;align-items:center">Upload photo<input id="bc-avatar-input" type="file" accept="image/jpeg,image/png,image/webp" hidden></label></div>${cityMembership?`<div class="bc-membership-city">${cityMembership}</div>`:''}</div></section><div class="bc-profile-grid"><section class="bc-card bc-profile-card"><h2>Collector reputation</h2>${reviewCount?`<div class="bc-rating">${rating} ★</div><div class="bc-small">${reviewCount} review${reviewCount===1?'':'s'} · ${completed} completed exchange${completed===1?'':'s'}</div>`:`<div class="bc-rating" style="font-size:25px">New collector</div><div class="bc-small">No reviews yet. Your first completed exchange will start your reputation.</div>`}</section><section class="bc-card bc-profile-card"><h2>Local exchange</h2><div class="bc-row"><small>Home city</small><b>${esc(p.city||'Not set')}</b></div><div class="bc-row"><small>Current model</small><b>Local · in person</b></div><div class="bc-row"><small>Exchangeable sets</small><b>${S.collection.filter(x=>x.available_for_exchange).length}</b></div></section><section class="bc-card bc-profile-card"><h2>Account</h2><div class="bc-row"><small>Email</small><b>${esc(S.user.email||'')}</b></div><div class="bc-row"><small>Collection</small><b>${S.collection.length} sets</b></div><div class="bc-row"><small>Wishlist</small><b>${S.wishlist.length} sets</b></div><div class="bc-row"><small>Support</small><b><a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a></b></div></section></div><section class="bc-card bc-pad" style="margin-top:14px"><h2 style="margin-top:0">Your BrickCircle</h2><p class="bc-muted">Invite collectors in your city. Marketplace value grows fastest when nearby AFOLs join together.</p><button class="bc-btn primary" data-invite>Invite an AFOL</button>${S.installPrompt?'<button class="bc-btn" style="margin-left:7px" data-install>Install BrickCircle</button>':''}</section>`);$('[data-edit-profile]',app()).onclick=editProfile;$('[data-signout]',app()).onclick=signOut;$('[data-invite]',app()).onclick=shareInvite;$('[data-install]',app())?.addEventListener('click',installPWA);$('#bc-avatar-input',app()).onchange=e=>uploadAvatar(e.target.files?.[0]);
}
function editProfile(){const p=S.profile||{};const o=modal(`<div class="bc-modal-head"><div><h2>Edit profile</h2><p class="bc-muted">Your city determines where BrickCircle searches for local reciprocal matches.</p></div><button class="bc-close" data-close>×</button></div><form class="bc-form" id="bc-profile-form"><div class="bc-field"><label>Display name</label><input class="bc-input" name="name" value="${attr(p.display_name||'')}" required></div><div class="bc-field"><label>Country</label><select class="bc-select" name="country" required>${locationOptions(p.country||'')}</select></div><div class="bc-field"><label>City</label><select class="bc-select" name="city" required>${cityOptions(p.country||'',p.city||'')}</select></div><div class="bc-field"><label>About your LEGO interests</label><textarea class="bc-textarea" name="bio">${esc(p.bio||'')}</textarea></div><div class="bc-form-actions"><button type="button" class="bc-btn" data-close>Cancel</button><button class="bc-btn primary">Save profile</button></div></form>`);$$('[data-close]',o).forEach(b=>b.onclick=closeOverlay);const f=$('#bc-profile-form',o),country=$('[name="country"]',f),city=$('[name="city"]',f);country.onchange=()=>{city.innerHTML=cityOptions(country.value);city.disabled=!country.value};f.onsubmit=async ev=>{ev.preventDefault();const fd=new FormData(f),patch={display_name:String(fd.get('name')).trim(),country:String(fd.get('country')).trim(),city:String(fd.get('city')).trim(),bio:String(fd.get('bio')||'').trim(),updated_at:new Date().toISOString()};const {error}=await db.from('profiles').update(patch).eq('id',S.user.id);if(error)return fail(error);closeOverlay();await refreshCore();await renderRoute();toast('Profile updated.')}}
function ownedAvatarStoragePath(path){const value=String(path||'').trim();return !!(S.user&&value&&!/^[a-z][a-z0-9+.-]*:/i.test(value)&&value.startsWith(`${S.user.id}/`)&&!value.includes('..'))}
async function removeOwnedAvatar(path){if(!ownedAvatarStoragePath(path))return;try{const {error}=await db.storage.from('avatars').remove([path]);if(error)console.warn('Avatar cleanup failed',error)}catch(error){console.warn('Avatar cleanup failed',error)}}
async function syncProviderAvatar(){if(!S.user)return;try{await db.rpc('sync_my_provider_avatar')}catch(_){}}
async function uploadAvatar(file){
  if(!file)return;if(!['image/jpeg','image/png','image/webp'].includes(file.type))return toast('Choose a JPG, PNG or WebP image.');if(file.size>5*1024*1024)return toast('Profile photo must be 5 MB or smaller.');
  toast('Uploading photo…');
  const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[file.type],path=`${S.user.id}/profile-${crypto.randomUUID()}.${ext}`,previous=S.profile?.avatar_url||'';
  const {data,error}=await db.storage.from('avatars').upload(path,file,{contentType:file.type,cacheControl:'3600',upsert:false});if(error)return fail(error);
  const {error:pe}=await db.from('profiles').update({avatar_url:data.path,avatar_source:'upload',updated_at:new Date().toISOString()}).eq('id',S.user.id);
  if(pe){await removeOwnedAvatar(data.path);return fail(pe)}
  if(previous&&previous!==data.path&&ownedAvatarStoragePath(previous))await removeOwnedAvatar(previous);
  await refreshCore();shell();await renderRoute();toast('Profile photo updated.');
}
async function signOut(){stopNotificationRealtime();clearNotificationPresentation();await window.bcWebPush?.signOut(S.user);try{await db.auth.signOut({scope:'local'})}catch(_){try{await db.auth.signOut()}catch(__){}}try{Object.keys(localStorage).filter(k=>/^bc_(?!pending_referral)/.test(k)).forEach(k=>localStorage.removeItem(k))}catch(_){ }try{sessionStorage.removeItem(peerReviewSubmissionsStore())}catch(_){}
  resetPeerTrustCaches();S.user=null;closeOverlay();navigate('home');await refreshRoute();toast('Signed out.')}

async function shareInvite(){if(!S.user){showAuth();return}try{const {data,error}=await db.rpc('bc_my_referral_code');if(error)throw error;const url=`${location.origin}/v2.html?ref=${encodeURIComponent(String(data||''))}`,text='Join me on BrickCircle — a local LEGO set exchange community for adult collectors. BrickCircle is free during beta.';if(navigator.share)await navigator.share({title:'Join BrickCircle',text,url});else if(navigator.clipboard){await navigator.clipboard.writeText(url);toast('Invite link copied.')}else prompt('Copy your BrickCircle invite link',url);track('beta_invite_shared')}catch(e){if(e?.name!=='AbortError')fail(e,'Could not create invite link.')}}
function showNotifications(){
  if(!S.user)return showAuth();
  clearNotificationPresentation();
  const unread=S.notifications.filter(notification=>!notification.read_at).length;
  const o=drawer(`<div class="bc-drawer-head"><div><h2>Notifications</h2><div class="bc-small">${unread?`${unread} unread`:'You’re caught up'}</div></div><button class="bc-close" data-close>×</button></div>${betaPWAEnabled()?'<button class="bc-btn" data-enable-push style="margin-bottom:10px">Enable system notifications</button>':''}${unread?'<button class="bc-btn" data-read-all style="margin:0 0 10px 8px">Mark all read</button>':''}<div>${S.notifications.length?S.notifications.map(notification=>`<button class="bc-notification ${notification.read_at?'':'unread'}" type="button" data-note="${attr(notification.id)}" style="display:block;width:100%;text-align:left;background:${notification.read_at?'#fff':'#fff9df'}"><b>${esc(notification.title||String(notification.kind||'Update').replace(/_/g,' '))}</b><div>${esc(notification.body||'')}</div><small>${fmtDateTime(notification.created_at)}${isProposalNotification(notification)?' · View proposal':isReciprocalMatchNotification(notification)?' · View match':''}</small></button>`).join(''):'<div class="bc-empty"><div class="bc-empty-icon">🔔</div><h3>No notifications yet</h3></div>'}</div>`);
  $('[data-close]',o).onclick=()=>o.closest('.bc-drawer-overlay').remove();
  $('[data-enable-push]',o)?.addEventListener('click',()=>{o.closest('.bc-drawer-overlay').remove();window.bcWebPush?.open(S.user)});
  $('[data-read-all]',o)?.addEventListener('click',async()=>{const {error}=await db.from('notifications').update({read_at:new Date().toISOString()}).eq('user_id',S.user.id).is('read_at',null);if(error)return fail(error);await refreshCore();shell();await renderRoute();showNotifications()});
  $$('[data-note]',o).forEach(element=>element.onclick=()=>openNotification(S.notifications.find(notification=>notification.id===element.dataset.note)));
}
/* --- Messages: conversation list + direct/case threads --- */
function messagesThreadGuard(kind,id){return !!S.user&&routeName()==='messages'&&routeId()===`${kind}:${id}`}
function parseMessagesTarget(){
  const raw=routeId(),separator=raw.indexOf(':');
  if(separator<1)return raw?{kind:'invalid'}:null;
  const kind=raw.slice(0,separator).toLowerCase(),value=raw.slice(separator+1);
  if(kind==='direct')return value?{kind:'direct',peerId:value}:{kind:'invalid'};
  if(kind==='case')return value?{kind:'case',caseId:value}:{kind:'invalid'};
  return {kind:'invalid'};
}
const MESSAGE_INDEX_PAGE_SIZE=100;
const messageIndexByUid=new Map();
let messageIndexUid=null;
let messagesFilter='all';
const watermarkPrefix='brickcircle:messages:seen:';
function messageIndex(uid){
  if(messageIndexUid!==uid){messageIndexByUid.clear();messageIndexUid=uid}
  if(!messageIndexByUid.has(uid))messageIndexByUid.set(uid,{direct:new Map(),cases:new Map(),loadedAt:0});
  return messageIndexByUid.get(uid);
}
function messageWatermarkKey(uid,threadKey){return `${watermarkPrefix}${uid}:${threadKey}`}
function readMessageWatermark(uid,threadKey){try{return Number(localStorage.getItem(messageWatermarkKey(uid,threadKey)))||0}catch(_){return 0}}
function writeMessageWatermark(uid,threadKey,stamp){try{localStorage.setItem(messageWatermarkKey(uid,threadKey),String(Math.max(0,Math.floor(stamp)||0)))}catch(_){}}
function conversationThreadKey(group){return `${group.kind}:${group.kind==='case'?group.caseId:group.peerId}`}
function conversationUnread(uid,group){
  const watermark=readMessageWatermark(uid,conversationThreadKey(group));
  let count=0;
  (group.messages||[]).forEach(m=>{
    if(m.sender_id===uid)return;
    if(new Date(m.created_at).getTime()>watermark)count++;
  });
  return count;
}
function totalUnreadCount(uid){
  const index=uid?messageIndexByUid.get(uid):null;
  if(!index)return 0;
  let total=0;
  index.direct.forEach(group=>{total+=conversationUnread(uid,group)});
  index.cases.forEach(group=>{total+=conversationUnread(uid,group)});
  return total;
}
function updateMessageBadge(){
  const uid=S.user?.id,unread=uid?totalUnreadCount(uid):0;
  const inbox=$('[data-open="inbox"]');
  const buttons=[...$$('[data-nav="messages"]')];
  if(inbox)buttons.push(inbox);
  buttons.forEach(button=>{
    if(!button)return;
    const base=button.getAttribute('data-bc-label')||button.getAttribute('aria-label')||'Messages';
    if(!button.getAttribute('data-bc-label'))button.setAttribute('data-bc-label',base);
    let badge=$('.bc-badge',button);
    if(!unread){
      badge?.remove();
      button.setAttribute('aria-label',base);
      return;
    }
    if(!badge){badge=document.createElement('span');badge.className='bc-badge';button.appendChild(badge)}
    badge.textContent=unread>9?'9+':String(unread);
    button.setAttribute('aria-label',`${base}, ${unread>9?'9+':unread} unread`);
  });
}
function participantMessagesQuery(uid,cursor){
  const scope=cursor?`and(or(sender_id.eq.${uid},recipient_id.eq.${uid}),${threadCursorPredicate(cursor)})`:`sender_id.eq.${uid},recipient_id.eq.${uid}`;
  return db.from('messages').select('*').is('exchange_id',null).or(scope).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(MESSAGE_INDEX_PAGE_SIZE);
}
function participantCaseMessagesQuery(uid,cursor){
  const scope=cursor?`and(or(sender_id.eq.${uid},recipient_id.eq.${uid}),${threadCursorPredicate(cursor)})`:`sender_id.eq.${uid},recipient_id.eq.${uid}`;
  return db.from('exchange_case_messages').select('*').or(scope).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(MESSAGE_INDEX_PAGE_SIZE);
}
function participantCasesQuery(uid,cursor){
  const scope=cursor?`and(or(user_a.eq.${uid},user_b.eq.${uid}),${threadCursorPredicate(cursor)})`:`user_a.eq.${uid},user_b.eq.${uid}`;
  return db.from('exchange_cases').select('*').or(scope).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(MESSAGE_INDEX_PAGE_SIZE);
}
async function fetchPagedIndex(buildQuery,stillCurrent){
  const rows=[];
  let cursor=null;
  for(;;){
    if(stillCurrent&&!stillCurrent())return{data:rows,error:null,incomplete:true};
    const {data,error}=await settledTimeout(buildQuery(cursor));
    if(stillCurrent&&!stillCurrent())return{data:rows,error:null,incomplete:true};
    if(error)return{data:rows,error};
    const chunk=data||[];
    rows.push(...chunk);
    if(chunk.length<MESSAGE_INDEX_PAGE_SIZE)break;
    const last=chunk[chunk.length-1];
    const next={created_at:last.created_at,id:last.id};
    if(cursor&&cursor.created_at===next.created_at&&String(cursor.id)===String(next.id))return{data:rows,error:new Error('Conversation history could not advance. Please retry.')};
    cursor=next;
  }
  return{data:rows,error:null};
}
async function loadMessageIndex(uid,token){
  const stillCurrent=()=>S.user?.id===uid&&token===S.renderToken;
  const [direct,caseMessages,cases]=await Promise.all([
    fetchPagedIndex(cursor=>participantMessagesQuery(uid,cursor),stillCurrent),
    fetchPagedIndex(cursor=>participantCaseMessagesQuery(uid,cursor),stillCurrent),
    fetchPagedIndex(cursor=>participantCasesQuery(uid,cursor),stillCurrent)
  ]);
  if(!stillCurrent())return null;
  const loadError=direct.error||caseMessages.error||cases.error;
  if(loadError)throw loadError;
  const ownedCases=(cases.data||[]).filter(c=>c&&(c.user_a===uid||c.user_b===uid));
  const caseParticipants=new Map(ownedCases.map(c=>[c.id,new Set([c.user_a,c.user_b])]));
  const index=messageIndex(uid);
  index.direct.clear();index.cases.clear();
  (direct.data||[]).forEach(m=>{
    if(m.exchange_id!=null)return;
    if(m.sender_id!==uid&&m.recipient_id!==uid)return;
    const peerId=m.sender_id===uid?m.recipient_id:m.sender_id;
    if(!peerId||peerId===uid)return;
    if(!index.direct.has(peerId))index.direct.set(peerId,{kind:'direct',peerId,messages:[]});
    index.direct.get(peerId).messages.push(m);
  });
  (caseMessages.data||[]).forEach(m=>{
    if(!m.case_id)return;
    const participants=caseParticipants.get(m.case_id);
    if(!participants)return;
    if(m.sender_id===m.recipient_id)return;
    if(!participants.has(m.sender_id)||!participants.has(m.recipient_id))return;
    if(m.sender_id!==uid&&m.recipient_id!==uid)return;
    if(!index.cases.has(m.case_id))index.cases.set(m.case_id,{kind:'case',caseId:m.case_id,messages:[]});
    index.cases.get(m.case_id).messages.push(m);
  });
  (cases.data||[]).forEach(c=>{
    if(!caseParticipants.has(c.id))return;
    if(!index.cases.has(c.id))index.cases.set(c.id,{kind:'case',caseId:c.id,messages:[]});
    index.cases.get(c.id).case=c;
  });
  [...index.direct.values(),...index.cases.values()].forEach(group=>{
    group.messages.sort((a,b)=>new Date(a.created_at)-new Date(b.created_at)||String(a.id).localeCompare(String(b.id)));
    const last=group.messages[group.messages.length-1]||null;
    group.last=last;
    group.stamp=last?new Date(last.created_at).getTime():(group.case&&group.case.created_at?new Date(group.case.created_at).getTime():0);
  });
  index.loadedAt=Date.now();
  const people=new Set();
  index.direct.forEach(group=>people.add(group.peerId));
  ownedCases.forEach(c=>{people.add(c.user_a);people.add(c.user_b)});
  people.delete(uid);
  const missing=[...people].filter(id=>!S.profiles[id]);
  if(missing.length){
    const {data,error}=await settledTimeout(db.from('public_profiles').select('id,display_name,country,city,bio,avatar_url,rating,review_count,identity_verified,member_since').in('id',missing),10000);
    if(!stillCurrent())return null;
    if(error)throw error;
    (data||[]).forEach(p=>{S.profiles[p.id]=p});
  }
  if(!await hydrateExchangeItems(ownedCases,stillCurrent))return null;
  return index;
}
function currentConversationKey(){
  if(routeName()!=='messages')return'';
  return routeId()||'';
}
function filteredConversationGroups(){
  const uid=S.user?.id;
  const index=uid?messageIndexByUid.get(uid):null;
  if(!index)return[];
  const groups=[...index.direct.values(),...index.cases.values()];
  const filtered=groups.filter(group=>{
    if(messagesFilter==='unread')return conversationUnread(uid,group)>0;
    if(messagesFilter==='exchanges')return group.kind==='case';
    if(messagesFilter==='collectors')return group.kind==='direct';
    return true;
  });
  return filtered.sort((a,b)=>b.stamp-a.stamp);
}
function messagesFilterBarMarkup(){
  return `<div class="bc-msg-filters" role="group" aria-label="Filter conversations">${[['all','All'],['unread','Unread'],['exchanges','Exchanges'],['collectors','Collectors']].map(([value,label])=>`<button class="bc-msg-filter" type="button" data-msg-filter="${value}" aria-pressed="${messagesFilter===value}"${value==='unread'?' title="Unread on this device"':''}>${label}</button>`).join('')}<button class="bc-msg-refresh" type="button" data-refresh-messages-list>↻ Refresh</button></div>`;
}
function messageRow(group,uid,selected){
  const unread=conversationUnread(uid,group);
  const unreadBadge=unread?`<span class="bc-msg-unread" title="Unread on this device" aria-label="${unread} unread on this device">${unread>9?'9+':unread}</span>`:'';
  if(group.kind==='direct'){
    const p=S.profiles[group.peerId]||{};
    return `<button class="bc-msg-row ${selected?'selected':''}" type="button" data-message-open="direct:${attr(group.peerId)}" ${selected?'aria-current="true"':''}><span class="bc-mini-avatar">${avatar(p)}</span><span class="bc-msg-row-main"><span class="bc-msg-row-top"><span class="bc-msg-row-name">${esc(p.display_name||'Collector')}</span><span class="bc-msg-row-time">${group.last?fmtDateTime(group.last.created_at):''}</span></span><span class="bc-msg-row-preview">${esc(group.last?.body||'Start the conversation')}</span></span>${pill('Direct','blue')}${unreadBadge}</button>`;
  }
  const e=group.case||S.exchanges.find(row=>row.id===group.caseId)||{};
  const p=S.profiles[otherId(e)]||{};
  const closed=terminalCaseStates.has(e.state);
  return `<button class="bc-msg-row ${selected?'selected':''}" type="button" data-message-open="case:${attr(group.caseId)}" ${selected?'aria-current="true"':''}><span class="bc-mini-avatar">${avatar(p)}</span><span class="bc-msg-row-main"><span class="bc-msg-row-top"><span class="bc-msg-row-name">${esc(p.display_name||'Collector')}</span><span class="bc-msg-row-time">${group.last?fmtDateTime(group.last.created_at):fmtDateTime(e.created_at)}</span></span><span class="bc-msg-row-preview">${esc(itemName(e.item_a))} ⇄ ${esc(itemName(e.item_b))}${group.last?` — ${esc(group.last.body)}`:''}</span></span>${pill(closed?`Closed · ${exchangeStageLabel(e)}`:exchangeStageLabel(e),closed?'':'gold')}${unreadBadge}</button>`;
}
function messagesListPaneMarkup(){
  const uid=S.user?.id,groups=filteredConversationGroups(),selected=currentConversationKey();
  const count=groups.length;
  return `<div class="bc-msg-list-head"><h2>Conversations</h2><span class="bc-small">${count?`${count} conversation${count===1?'':'s'}`:'Newest first'}</span></div>${messagesFilterBarMarkup()}${groups.length?`<div class="bc-msg-rows">${groups.map(group=>messageRow(group,uid,selected===conversationThreadKey(group))).join('')}</div>`:empty('💬','No conversations yet','Messages with matched collectors and exchange partners will appear here.','Find matches','matches')}`;
}
function reconcileMessageIndex(uid,kind,id){
  const index=messageIndex(uid);
  const cache=threadCaches[kind].get(`${uid}:${id}`);
  if(!cache)return;
  const store=kind==='case'?index.cases:index.direct;
  let group=store.get(id);
  if(!group){
    group=kind==='case'?{kind:'case',caseId:id,messages:[],case:cache.caseRow||null}:{kind:'direct',peerId:id,messages:[]};
    store.set(id,group);
  }
  if(kind==='case'&&cache.caseRow)group.case=cache.caseRow;
  const seen=new Set(group.messages.map(m=>m.id));
  cache.messages.forEach(m=>{if(m&&m.id&&!seen.has(m.id)){seen.add(m.id);group.messages.push(m)}});
  group.messages.sort((a,b)=>new Date(a.created_at)-new Date(b.created_at)||String(a.id).localeCompare(String(b.id)));
  const last=group.messages[group.messages.length-1]||null;
  group.last=last;
  group.stamp=last?new Date(last.created_at).getTime():(group.case&&group.case.created_at?new Date(group.case.created_at).getTime():0);
}
function advanceThreadWatermark(uid,kind,id){
  const cache=threadCaches[kind].get(`${uid}:${id}`);
  if(!cache||!cache.messages.length)return;
  const newest=new Date(cache.messages[cache.messages.length-1].created_at).getTime();
  const threadKey=`${kind}:${id}`;
  if(newest>readMessageWatermark(uid,threadKey))writeMessageWatermark(uid,threadKey,newest);
  renderMessagesListPane();
}
function renderMessagesListPane(){
  const pane=$('.bc-messages-list-pane',app());
  if(!pane)return;
  pane.innerHTML=messagesListPaneMarkup();
  bindMessagesListPane(pane);
  updateMessageBadge();
}
function bindMessagesListPane(root=app()){
  $$('[data-msg-filter]',root).forEach(b=>b.onclick=()=>{messagesFilter=b.dataset.msgFilter;renderMessagesListPane()});
  $$('[data-refresh-messages-list]',root).forEach(b=>b.onclick=()=>refreshMessagesList());
  $$('[data-message-open]',root).forEach(b=>b.onclick=()=>navigate('messages',b.dataset.messageOpen));
}
async function refreshMessagesList(){
  const uid=S.user?.id;
  if(!uid||routeName()!=='messages')return;
  const token=S.renderToken;
  const button=$('[data-refresh-messages-list]',app());
  if(button){button.disabled=true;button.textContent='Refreshing…'}
  let failure=null;
  try{
    await loadMessageIndex(uid,token);
  }catch(error){failure=error}
  if(token!==S.renderToken||S.user?.id!==uid||routeName()!=='messages')return;
  if(button){button.disabled=false;button.textContent='↻ Refresh'}
  if(failure){
    const pane=$('.bc-messages-list-pane',app());
    if(pane){
      pane.innerHTML=`<div class="bc-msg-list-error" role="alert"><span>Conversations could not be refreshed.</span><button class="bc-btn" type="button" data-retry-messages-list>Retry</button></div>`;
      $('[data-retry-messages-list]',app()).onclick=()=>refreshMessagesList();
    }
    return;
  }
  renderMessagesListPane();
  updateMessageBadge();
}
async function renderMessagesList(token){
  const uid=S.user?.id;
  page(loading('Loading conversations…'));
  let index=null,failure=null;
  try{
    index=await loadMessageIndex(uid,token);
  }catch(error){failure=error}
  if(token!==S.renderToken||S.user?.id!==uid||routeName()!=='messages'||routeId())return;
  if(failure||!index)return renderMessagesUnavailable('Your conversations could not be loaded. Please retry.',()=>renderMessagesList(S.renderToken));
  page(`<div class="bc-page-head"><div><span class="bc-page-kicker">YOUR CONVERSATIONS</span><h1>Messages</h1><p>Direct messages and exchange conversations, newest first. Exchange chats stay attached to their case.</p></div><div class="bc-head-actions"><button class="bc-btn" data-action="exchanges">Open exchanges</button></div></div><div class="bc-messages-layout" data-view="list"><section class="bc-messages-list-pane bc-card bc-pad" aria-label="Conversations">${messagesListPaneMarkup()}</section><section class="bc-messages-thread-pane">${empty('💬','Pick a conversation','Choose a direct message or an exchange conversation to read the history and reply.')}</section></div>`);
  bindMessagesListPane();
  updateMessageBadge();
}
const THREAD_PAGE_SIZE=50;
const DIRECT_THREAD_FALLBACK='No messages yet. Say hello and arrange your first meetup.';
const CASE_THREAD_FALLBACK='No messages yet. Keep meetup, handoff, return and issue details here.';
const threadCaches={direct:new Map(),case:new Map()};
const threadDrafts=new Map();
const pendingSends=new Map();
let threadCacheUid=null;
function threadCache(kind,id,uid){
  if(threadCacheUid!==uid){threadCaches.direct.clear();threadCaches.case.clear();threadDrafts.clear();pendingSends.clear();threadCacheUid=uid}
  const key=`${uid}:${id}`;
  const store=threadCaches[kind];
  if(!store.has(key))store.set(key,{kind,id,uid,messages:[],ids:new Set(),hasOlder:true,pair:null,participants:null,caseRow:null});
  return store.get(key);
}
function mergeThreadHistory(cache,incoming){
  (incoming||[]).forEach(m=>{
    if(!m||!m.id||cache.ids.has(m.id))return;
    cache.ids.add(m.id);
    cache.messages.push(m);
  });
  cache.messages.sort((a,b)=>new Date(a.created_at)-new Date(b.created_at)||String(a.id).localeCompare(String(b.id)));
}
function validateThreadRows(cache,rows){
  if(!cache)return rows||[];
  if(cache.kind==='case'){
    const [a,b]=cache.participants||[];
    return (rows||[]).filter(m=>m.case_id===cache.id&&a&&b&&((m.sender_id===a&&m.recipient_id===b)||(m.sender_id===b&&m.recipient_id===a)));
  }
  const [uid,peerId]=cache.pair||[];
  return (rows||[]).filter(m=>m.exchange_id==null&&uid&&peerId&&((m.sender_id===uid&&m.recipient_id===peerId)||(m.sender_id===peerId&&m.recipient_id===uid)));
}
function threadCursorPredicate(cursor){return `or(created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id}))`}
function threadLatestQuery(kind,id,uid){
  return kind==='case'
    ?db.from('exchange_case_messages').select('*').eq('case_id',id).or(`sender_id.eq.${uid},recipient_id.eq.${uid}`).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(THREAD_PAGE_SIZE)
    :db.from('messages').select('*').is('exchange_id',null).or(`and(sender_id.eq.${uid},recipient_id.eq.${id}),and(sender_id.eq.${id},recipient_id.eq.${uid})`).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(THREAD_PAGE_SIZE);
}
function threadEarlierQuery(kind,id,uid,cursor){
  const cursorFilter=threadCursorPredicate(cursor);
  return kind==='case'
    ?db.from('exchange_case_messages').select('*').eq('case_id',id).or(`and(sender_id.eq.${uid},${cursorFilter}),and(recipient_id.eq.${uid},${cursorFilter})`).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(THREAD_PAGE_SIZE)
    :db.from('messages').select('*').is('exchange_id',null).or(`and(sender_id.eq.${uid},recipient_id.eq.${id},${cursorFilter}),and(sender_id.eq.${id},recipient_id.eq.${uid},${cursorFilter})`).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(THREAD_PAGE_SIZE);
}
async function mergeThreadLatest(kind,id,uid,stillCurrent){
  const {data,error}=await settledTimeout(threadLatestQuery(kind,id,uid));
  if(error)throw error;
  if(stillCurrent&&!stillCurrent())return;
  const cache=threadCache(kind,id,uid);
  mergeThreadHistory(cache,validateThreadRows(cache,data));
}
function sameDay(a,b){const x=new Date(a),y=new Date(b);return x.getFullYear()===y.getFullYear()&&x.getMonth()===y.getMonth()&&x.getDate()===y.getDate()}
function messageBubble(m,senderName){const mine=m.sender_id===S.user?.id;return `<div class="bc-msg ${mine?'mine':''}"><span class="bc-msg-sender">${mine?'You':esc(senderName||'Collector')}</span>${esc(m.body||'')}<small>${fmtDateTime(m.created_at)}</small></div>`}
function earlierThreadButtonMarkup(){return `<button class="bc-msg-earlier" type="button" data-load-earlier>Load earlier messages</button>`}
function threadChatMarkup(messages,fallback,senderName,hasOlder){
  if(!messages.length)return `<div class="bc-small">${esc(fallback||'No messages yet.')}</div>`;
  let markup=messages.length&&hasOlder?earlierThreadButtonMarkup():'',lastDay=null;
  messages.forEach(m=>{
    const day=new Date(m.created_at);
    if(!lastDay||!sameDay(lastDay,day)){markup+=`<div class="bc-msg-day" role="separator" aria-label="Messages from ${esc(fmtDate(m.created_at))}">${esc(fmtDate(m.created_at))}</div>`;lastDay=day}
    markup+=messageBubble(m,senderName);
  });
  return markup;
}
function updateThreadChat(cache,options={}){
  const chat=$('#bc-msg-chat');if(!chat)return;
  const {fallback='',senderName='',scrollMode='jump'}=options;
  const prevTop=chat.scrollTop,prevHeight=chat.scrollHeight;
  chat.innerHTML=threadChatMarkup(cache.messages,fallback,senderName,cache.hasOlder);
  if(scrollMode==='prepend')chat.scrollTop=Math.max(0,prevTop+(chat.scrollHeight-prevHeight));
  else if(scrollMode==='keep')chat.scrollTop=prevTop;
  else requestAnimationFrame(()=>{chat.scrollTop=chat.scrollHeight});
}
function bindThreadCompose(form,kind,id,senderName){
  if(!form)return;
  const uid=S.user?.id;
  const key=`${uid}:${kind}:${id}`;
  const input=$('textarea[name="message"]',form);
  if(input){
    const saved=threadDrafts.get(key);
    if(saved)input.value=saved;
    input.addEventListener('input',()=>{threadDrafts.set(key,input.value)});
  }
  if(pendingSends.has(key)){
    const button=$('button[type="submit"]',form);
    if(button)button.disabled=true;
    if(input)input.disabled=true;
    showThreadStatus('Sending…');
  }
  form.onsubmit=async ev=>{
    ev.preventDefault();
    if(!S.user){showAuth();return}
    if(!messagesThreadGuard(kind,id))return;
    const submitUid=S.user.id,token=S.renderToken;
    const stillCurrent=()=>S.user?.id===submitUid&&token===S.renderToken&&messagesThreadGuard(kind,id);
    const sendKey=`${submitUid}:${kind}:${id}`;
    if(pendingSends.has(sendKey)){showThreadStatus('Sending…');return}
    const body=String(new FormData(form).get('message')||'').trim();
    if(!body){toast('Write a message before sending.');return}
    const button=$('button[type="submit"]',form);
    if(!button||button.disabled)return;
    if(kind==='case'){
      const caseRow=$('#bc-msg-chat')?.bcThread?.caseRow;
      if(caseRow&&terminalCaseStates.has(caseRow.state))return;
    }
    clearThreadError();
    const sendOperation={};
    pendingSends.set(sendKey,sendOperation);
    button.disabled=true;if(input)input.disabled=true;
    const restore=()=>{if(stillCurrent()){button.disabled=false;if(input){input.disabled=false;input.focus()}}};
    try{
      const intent={case_id:id,body};
      const result=kind==='case'?await settledTimeout(withTimeout(canonicalRpc('send_exchange_case_message',{p_case_id:id,p_body:body},intent),15000)):await settledTimeout(withTimeout(db.from('messages').insert({sender_id:submitUid,recipient_id:id,exchange_id:null,body}),15000));
      if(!stillCurrent())return;
      if(result.error){restore();showThreadError(result.error?.message||'Message was not sent. Please retry.');return}
      const sentDraft=input?input.value:null;
      form.reset();
      if(sentDraft!==null&&threadDrafts.get(key)===sentDraft)threadDrafts.delete(key);
      try{
        await mergeThreadLatest(kind,id,submitUid,stillCurrent);
      }catch(_){
        if(!stillCurrent())return;
        restore();
        showThreadError('Message sent — refresh the conversation to see it.');
        return;
      }
      if(!stillCurrent())return;
      updateThreadChat(threadCache(kind,id,submitUid),{fallback:kind==='case'?CASE_THREAD_FALLBACK:DIRECT_THREAD_FALLBACK,senderName});
      reconcileMessageIndex(submitUid,kind,id);
      advanceThreadWatermark(submitUid,kind,id);
      updateMessageBadge();
      restore();
      toast('Message sent.');
    }finally{
      if(pendingSends.get(sendKey)!==sendOperation)return;
      pendingSends.delete(sendKey);
      const liveForm=activeThreadForm(submitUid,kind,id);
      if(liveForm){
        clearThreadStatus();
        const liveButton=$('button[type="submit"]',liveForm);
        const liveInput=$('textarea[name="message"]',liveForm);
        if(liveButton)liveButton.disabled=false;
        if(liveInput)liveInput.disabled=false;
      }
    }
  };
}
function showThreadError(message,retry){
  const card=$('.bc-msg-thread-card',app());if(!card)return;
  const chat=$('#bc-msg-chat',card);
  let box=$('#bc-msg-error',card);
  if(!box){
    box=document.createElement('div');
    box.id='bc-msg-error';
    box.className='bc-msg-error';
    box.setAttribute('role','alert');
    box.hidden=true;
    card.insertBefore(box,chat||null);
  }
  box.hidden=false;
  box.innerHTML=`<span>${esc(message)}</span>${retry?'<button class="bc-btn" type="button" data-retry-thread>Retry</button>':''}`;
  if(retry)$('[data-retry-thread]',box).onclick=()=>{box.hidden=true;box.innerHTML='';retry()};
}
function clearThreadError(){
  const card=$('.bc-msg-thread-card',app());if(!card)return;
  const box=$('#bc-msg-error',card);
  if(box){box.hidden=true;box.innerHTML=''}
}
function showThreadStatus(message){
  const card=$('.bc-msg-thread-card',app());if(!card)return;
  const chat=$('#bc-msg-chat',card);
  let box=$('#bc-msg-status',card);
  if(!box){
    box=document.createElement('div');
    box.id='bc-msg-status';
    box.className='bc-msg-status';
    box.setAttribute('role','status');
    box.hidden=true;
    card.insertBefore(box,chat||null);
  }
  box.hidden=false;
  box.textContent=message;
}
function clearThreadStatus(){
  const box=$('#bc-msg-status',app());
  if(box){box.hidden=true;box.textContent=''}
}
function activeThreadForm(uid,kind,id){
  if(S.user?.id!==uid)return null;
  const ctx=$('#bc-msg-chat')?.bcThread;
  if(!ctx||ctx.kind!==kind||String(ctx.id)!==String(id))return null;
  return $('#bc-msg-form');
}
async function loadEarlierThreadMessages(chat){
  const ctx=chat?.bcThread;if(!ctx)return;
  const {kind,id,senderName,fallback}=ctx;
  if(!S.user||!messagesThreadGuard(kind,id))return;
  const uid=S.user.id,token=S.renderToken;
  const stillCurrent=()=>S.user?.id===uid&&token===S.renderToken&&messagesThreadGuard(kind,id);
  const cache=threadCache(kind,id,uid);
  const oldest=cache.messages[0];
  if(!oldest)return;
  const button=$('[data-load-earlier]',chat);
  if(button){button.disabled=true;button.textContent='Loading…'}
  const {data,error}=await settledTimeout(threadEarlierQuery(kind,id,uid,oldest));
  if(error){
    if(stillCurrent()){
      if(button){button.disabled=false;button.textContent='Load earlier messages'}
      showThreadError('Earlier messages could not be loaded.',()=>loadEarlierThreadMessages(chat));
    }
    return;
  }
  if(!stillCurrent())return;
  mergeThreadHistory(cache,validateThreadRows(cache,data));
  cache.hasOlder=(data||[]).length>=THREAD_PAGE_SIZE;
  updateThreadChat(cache,{fallback,senderName,scrollMode:'prepend'});
}
function applyCaseMetadata(e){
  const closed=terminalCaseStates.has(e.state);
  const p=S.profiles[otherId(e)]||{};
  const root=app();
  const pill=$('[data-msg-stage-pill]',root);
  if(pill){pill.className=`bc-pill ${closed?'':'gold'}`;pill.textContent=exchangeStageLabel(e)}
  const title=$('[data-msg-case-title]',root);
  if(title)title.textContent=`${itemName(e.item_a)} ⇄ ${itemName(e.item_b)}`;
  const sub=$('[data-msg-case-sub]',root);
  if(sub)sub.textContent=`With ${p.display_name||'Collector'} · ${Number(e.duration_days)||30}-day exchange${e.return_due_at?` · return due ${fmtDate(e.return_due_at)}`:''}`;
  const next=caseNextAction(e);
  const nextBlock=$('.bc-ex-next',root);
  if(nextBlock){
    const strong=$('strong',nextBlock),small=$('small',nextBlock);
    if(strong)strong.textContent=next.label||exchangeStageLabel(e);
    if(small)small.textContent=next.copy;
  }
  const timeline=$('.bc-timeline',root);
  if(timeline)timeline.outerHTML=exchangeTimeline(e);
  updateCaseComposerState(e,p);
}
function updateCaseComposerState(e,p){
  const closed=terminalCaseStates.has(e.state);
  const card=$('.bc-msg-thread-card',app());
  if(!card)return;
  const composer=$('#bc-msg-form',card);
  if(closed){
    if(composer)composer.remove();
    if(!$('.bc-msg-readonly',card)){
      const notice=document.createElement('div');
      notice.className='bc-notice bc-msg-readonly';
      notice.innerHTML='<b>Case closed.</b> This exchange conversation is read-only.';
      card.appendChild(notice);
    }
    return;
  }
  const notice=$('.bc-msg-readonly',card);
  if(notice)notice.remove();
  if(!composer){
    const firstName=(p.display_name||'collector').split(' ')[0];
    card.insertAdjacentHTML('beforeend',`<form class="bc-msg-compose" id="bc-msg-form"><textarea class="bc-textarea" name="message" rows="2" maxlength="4000" placeholder="Message ${attr(firstName)}" autocomplete="off" required aria-label="Message ${attr(firstName)}"></textarea><button class="bc-btn primary" type="submit">Send</button></form>`);
    bindThreadCompose($('#bc-msg-form'),'case',e.id,p.display_name);
  }
}
async function refreshThread(chat){
  const ctx=chat?.bcThread;if(!ctx)return;
  const {kind,id,senderName,fallback}=ctx;
  if(!S.user||!messagesThreadGuard(kind,id))return;
  const uid=S.user.id,token=S.renderToken;
  const stillCurrent=()=>S.user?.id===uid&&token===S.renderToken&&messagesThreadGuard(kind,id);
  const form=$('#bc-msg-form'),input=form?$('textarea[name="message"]',form):null;
  const draft=input?input.value:'';
  const caret=input&&input.selectionStart!=null?[input.selectionStart,input.selectionEnd]:null;
  const hadFocus=!!(input&&document.activeElement===input);
  const button=$('[data-refresh-thread]',app());
  if(button){button.disabled=true;button.textContent='Refreshing…'}
  const [caseResult,messageFailure]=await Promise.all([
    kind==='case'?settledTimeout(db.from('exchange_cases').select('*').eq('id',id).maybeSingle(),10000):Promise.resolve({data:null,error:null}),
    (async()=>{try{await mergeThreadLatest(kind,id,uid,stillCurrent);return null}catch(error){return error}})()
  ]);
  if(!stillCurrent())return;
  if(button){button.disabled=false;button.textContent='↻ Refresh'}
  if(kind==='case'&&caseResult.data){
    ctx.caseRow=caseResult.data;
    applyCaseMetadata(caseResult.data);
  }
  if(!messageFailure)updateThreadChat(threadCache(kind,id,uid),{fallback,senderName,scrollMode:'keep'});
  if(!messageFailure){
    reconcileMessageIndex(uid,kind,id);
    advanceThreadWatermark(uid,kind,id);
  }
  if(!caseResult.error&&!messageFailure)clearThreadError();
  const liveForm=$('#bc-msg-form'),liveInput=liveForm?$('textarea[name="message"]',liveForm):null;
  if(liveInput){liveInput.value=draft;if(caret)liveInput.setSelectionRange(caret[0],caret[1]);if(hadFocus)liveInput.focus()}
  updateMessageBadge();
  if(caseResult.error||messageFailure){
    showThreadError('Messages could not be refreshed.',()=>refreshThread(chat));
  }
}
function bindMessagesPage(){
  bindMessagesListPane();
  $$('[data-refresh-thread]',app()).forEach(b=>b.onclick=()=>refreshThread($('#bc-msg-chat')));
  const chat=$('#bc-msg-chat');
  if(chat){
    chat.addEventListener('click',event=>{
      const button=event.target.closest('[data-load-earlier]');
      if(!button||button.disabled)return;
      loadEarlierThreadMessages(chat);
    });
    requestAnimationFrame(()=>{chat.scrollTop=chat.scrollHeight});
  }
}
function renderMessagesUnavailable(message,retry){
  page(`<button class="bc-btn bc-thread-back" data-action="messages" type="button">← Back to Messages</button>${empty('⚠️','Conversation unavailable',message,retry?'Retry':'Back to messages',retry?'retry-thread-load':'messages')}`);
  if(retry)$('[data-action="retry-thread-load"]',app()).onclick=retry;
}
async function renderDirectThread(token,peerId){
  page(loading('Opening conversation…'));
  const uid=S.user?.id;
  const indexPromise=uid?loadMessageIndex(uid,token).catch(()=>null):Promise.resolve(null);
  const {data:peer,error:peerError}=await settledTimeout(db.from('public_profiles').select('id,display_name,country,city,bio,avatar_url,rating,review_count,identity_verified,member_since').eq('id',peerId).maybeSingle(),10000);
  if(token!==S.renderToken||S.user?.id!==uid||!messagesThreadGuard('direct',peerId))return;
  if(peerError)return renderMessagesUnavailable('Collector details could not be loaded. Please retry.',()=>renderDirectThread(S.renderToken,peerId));
  if(!peer)return renderMessagesUnavailable('This collector could not be found or no longer has a public profile.');
  const {data:rows,error:messageError}=await settledTimeout(threadLatestQuery('direct',peerId,uid),10000);
  if(token!==S.renderToken||S.user?.id!==uid||!messagesThreadGuard('direct',peerId))return;
  if(messageError)return renderMessagesUnavailable('Your messages could not be loaded. Please retry.',()=>renderDirectThread(S.renderToken,peerId));
  await indexPromise;
  if(token!==S.renderToken||S.user?.id!==uid||!messagesThreadGuard('direct',peerId))return;
  S.profiles[peerId]=peer;
  const cache=threadCache('direct',peerId,uid);
  cache.pair=[uid,peerId];cache.participants=null;
  const firstLoad=cache.ids.size===0;
  mergeThreadHistory(cache,validateThreadRows(cache,rows));
  if(firstLoad)cache.hasOlder=cache.messages.length>=THREAD_PAGE_SIZE;
  const p=peer,firstName=(p.display_name||'collector').split(' ')[0];
  page(`<button class="bc-btn bc-thread-back" data-action="messages" type="button">← Back to Messages</button><section class="bc-msg-hero bc-card"><div class="bc-msg-hero-person"><span class="bc-mini-avatar bc-msg-hero-avatar">${avatar(p)}</span><div><span class="bc-pill blue">Direct message</span><h1>${esc(p.display_name||'Collector')}</h1><p>${esc([p.city,p.country].filter(Boolean).join(' · '))||'BrickCircle collector'}</p>${reputationTrustContext(peerId)}</div></div></section><div class="bc-messages-layout" data-view="thread"><section class="bc-messages-list-pane bc-card bc-pad" aria-label="Conversations">${messagesListPaneMarkup()}</section><section class="bc-messages-thread-pane"><section class="bc-card bc-msg-thread-card"><div class="bc-msg-tools"><button class="bc-msg-refresh" type="button" data-refresh-thread>↻ Refresh</button></div><div class="bc-msg-chat" id="bc-msg-chat" aria-live="polite" aria-label="Conversation history">${threadChatMarkup(cache.messages,DIRECT_THREAD_FALLBACK,p.display_name,cache.hasOlder)}</div><form class="bc-msg-compose" id="bc-msg-form"><textarea class="bc-textarea" name="message" rows="2" maxlength="4000" placeholder="Message ${attr(firstName)}" autocomplete="off" required aria-label="Message ${attr(firstName)}"></textarea><button class="bc-btn primary" type="submit">Send</button></form></section></section></div>`);
  const chat=$('#bc-msg-chat');
  if(chat)chat.bcThread={kind:'direct',id:peerId,senderName:p.display_name,fallback:DIRECT_THREAD_FALLBACK,caseRow:null};
  bindMessagesPage();
  bindThreadCompose($('#bc-msg-form'),'direct',peerId,p.display_name);
  advanceThreadWatermark(uid,'direct',peerId);
  updateMessageBadge();
}
async function renderCaseThread(token,caseId){
  page(loading('Opening exchange conversation…'));
  const uid=S.user?.id;
  const stillCurrent=()=>token===S.renderToken&&S.user?.id===uid&&messagesThreadGuard('case',caseId);
  const indexPromise=uid?loadMessageIndex(uid,token).catch(()=>null):Promise.resolve(null);
  const {data:e,error:caseError}=await settledTimeout(db.from('exchange_cases').select('*').eq('id',caseId).maybeSingle(),10000);
  if(!stillCurrent())return;
  if(caseError)return renderMessagesUnavailable('This exchange conversation could not be loaded. Please retry.',()=>renderCaseThread(S.renderToken,caseId));
  if(!e||![e.user_a,e.user_b].includes(S.user.id))return renderMessagesUnavailable('This exchange conversation is unavailable or belongs to another collector.');
  if(!await hydrateExchangeItems([e],stillCurrent))return;
  if(!stillCurrent())return;
  const oid=otherId(e);
  const {data:peer}=await settledTimeout(oid?db.from('public_profiles').select('id,display_name,country,city,bio,avatar_url,rating,review_count,identity_verified,member_since').eq('id',oid).maybeSingle():Promise.resolve({data:null,error:null}),10000);
  if(!stillCurrent())return;
  if(peer)S.profiles[oid]=peer;
  const {data:rows,error:messageError}=await settledTimeout(threadLatestQuery('case',caseId,uid),10000);
  if(!stillCurrent())return;
  if(messageError)return renderMessagesUnavailable('Your exchange messages could not be loaded. Please retry.',()=>renderCaseThread(S.renderToken,caseId));
  await indexPromise;
  if(!stillCurrent())return;
  const cache=threadCache('case',caseId,uid);
  cache.participants=[e.user_a,e.user_b];cache.pair=null;
  const firstLoad=cache.ids.size===0;
  mergeThreadHistory(cache,validateThreadRows(cache,rows));
  if(firstLoad)cache.hasOlder=cache.messages.length>=THREAD_PAGE_SIZE;
  const p=S.profiles[oid]||{},closed=terminalCaseStates.has(e.state),next=caseNextAction(e),firstName=(p.display_name||'collector').split(' ')[0];
  page(`<button class="bc-btn bc-thread-back" data-action="messages" type="button">← Back to Messages</button><section class="bc-msg-hero bc-card"><div class="bc-msg-hero-person"><span class="bc-mini-avatar bc-msg-hero-avatar">${avatar(p)}</span><div><span class="bc-pill ${closed?'':'gold'}" data-msg-stage-pill>${esc(exchangeStageLabel(e))}</span><h1 data-msg-case-title>${esc(itemName(e.item_a))} ⇄ ${esc(itemName(e.item_b))}</h1><p data-msg-case-sub>With ${esc(p.display_name||'Collector')} · ${Number(e.duration_days)||30}-day exchange${e.return_due_at?` · return due ${fmtDate(e.return_due_at)}`:''}</p>${reputationTrustContext(oid)}</div></div><button class="bc-btn primary" type="button" data-open-exchange="${attr(e.id)}">Open exchange</button></section><div class="bc-ex-next" role="status"><span>NEXT</span><strong>${esc(next.label||exchangeStageLabel(e))}</strong><small>${esc(next.copy)}</small></div>${exchangeTimeline(e)}<div class="bc-messages-layout" data-view="thread"><section class="bc-messages-list-pane bc-card bc-pad" aria-label="Conversations">${messagesListPaneMarkup()}</section><section class="bc-messages-thread-pane"><section class="bc-card bc-msg-thread-card"><div class="bc-msg-tools"><button class="bc-msg-refresh" type="button" data-refresh-thread>↻ Refresh</button></div><div class="bc-msg-chat" id="bc-msg-chat" aria-live="polite" aria-label="Conversation history">${threadChatMarkup(cache.messages,CASE_THREAD_FALLBACK,p.display_name,cache.hasOlder)}</div>${closed?'<div class="bc-notice"><b>Case closed.</b> This exchange conversation is read-only.</div>':`<form class="bc-msg-compose" id="bc-msg-form"><textarea class="bc-textarea" name="message" rows="2" maxlength="4000" placeholder="Message ${attr(firstName)}" autocomplete="off" required aria-label="Message ${attr(firstName)}"></textarea><button class="bc-btn primary" type="submit">Send</button></form>`}</section></section></div>`);
  const chat=$('#bc-msg-chat');
  if(chat)chat.bcThread={kind:'case',id:caseId,senderName:p.display_name,fallback:CASE_THREAD_FALLBACK,caseRow:e};
  bindMessagesPage();
  bindThreadCompose($('#bc-msg-form'),'case',e.id,p.display_name);
  advanceThreadWatermark(uid,'case',caseId);
  updateMessageBadge();
}
async function renderMessages(token){
  if(!S.user){showAuth();return navigate('home')}
  document.querySelector('.bc-match-login-notice')?.remove();
  const target=parseMessagesTarget();
  if(!target)return renderMessagesList(token);
  if(target.kind==='direct'){
    if(target.peerId===S.user.id)return renderMessagesUnavailable('You cannot open a direct conversation with yourself.');
    return renderDirectThread(token,target.peerId);
  }
  if(target.kind==='case')return renderCaseThread(token,target.caseId);
  return renderMessagesUnavailable('This conversation link is not valid. Open Messages and pick a conversation.');
}
function showInbox(){if(!S.user){showAuth();return}navigate('messages')}
function quickMessage(peerId){if(!S.user){showAuth();return}if(!peerId)return showInbox();navigate('messages',`direct:${peerId}`)}

function installPWA(){if(!S.installPrompt)return toast('Use your browser menu and choose Add to Home screen.');S.installPrompt.prompt();S.installPrompt.userChoice.finally(()=>{S.installPrompt=null})}
async function disableBetaPWA(){
  try{
    if('serviceWorker'in navigator&&navigator.serviceWorker.getRegistrations){
      const registrations=await navigator.serviceWorker.getRegistrations();
      const brickCircleRegistration=registration=>[registration.installing,registration.waiting,registration.active].filter(Boolean).some(worker=>{try{const url=new URL(worker.scriptURL,location.href);return url.origin===location.origin&&url.pathname==='/catalogue-cache-sw.js'}catch(_){return false}});
      await Promise.allSettled(registrations.filter(brickCircleRegistration).map(registration=>registration.unregister()));
    }
  }catch(error){console.warn('Service worker cleanup',error)}
  try{if(window.caches?.keys){const keys=await caches.keys();await Promise.allSettled(keys.filter(key=>key.startsWith('brickcircle-')).map(key=>caches.delete(key)))}}catch(error){console.warn('Cache cleanup',error)}
}
function setupPWA(){
  if(!betaPWAEnabled()){disableBetaPWA().catch(error=>console.warn('PWA cleanup',error));return}
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();S.installPrompt=e});
  if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('/catalogue-cache-sw.js').catch(e=>console.warn('SW',e)))
}

async function boot(){
  captureReferral();setupPWA();shell();page(loading('Opening BrickCircle…'));if(parseJoinIntent()){showAuth();clearQueryParam('join')}providerSettings();const sessionResult=await settledTimeout(db.auth.getSession(),8000);S.user=sessionResult.data?.session?.user||S.user||null;if(sessionResult.error)S.refreshWarning='Your session is taking longer than expected. BrickCircle will keep trying.';if(S.user)await syncProviderAvatar();if(S.user)await refreshCore();S.booted=true;shell();await renderRoute();if(S.user){await claimReferralAndProvider();await refreshCore();shell();await renderRoute();await startNotificationRealtime().catch(()=>{});const onboardingShown=await onboardingIfNeeded();if(!onboardingShown&&!showNextUnreadNotificationNotice())showLoginMatchNotice()}if(['oauth','code','error','error_code','error_description'].some(name=>new URLSearchParams(location.search).has(name)))cleanOAuthQuery();if(pendingAuthChange){const [event,nextSession]=pendingAuthChange;pendingAuthChange=null;handleAuthChange(event,nextSession)}
}
function handleAuthChange(event,session){
  if(!S.booted){pendingAuthChange=[event,session];return}
  if(event==='SIGNED_OUT'&&isResumeWindow()){setTimeout(async()=>{const recovered=await recoverSession();if(recovered)handleAuthChange('TOKEN_REFRESHED',recovered);else handleAuthChange('CONFIRMED_SIGNED_OUT',null)},350);return}
  const prev=S.user?.id;
  if(event==='SIGNED_OUT'||event==='CONFIRMED_SIGNED_OUT'){stopNotificationRealtime();clearNotificationPresentation();clearProtectedState()}
  S.user=session?.user||null;
  setTimeout(async()=>{if(event==='PASSWORD_RECOVERY'&&S.user){showPasswordRecovery()}else if((event==='SIGNED_IN'||event==='TOKEN_REFRESHED')&&S.user){if(event==='SIGNED_IN')await claimReferralAndProvider();await syncProviderAvatar();await refreshCore();shell();await renderRoute();await startNotificationRealtime().catch(()=>{});const onboardingShown=await onboardingIfNeeded();if(event==='SIGNED_IN'&&!onboardingShown&&!showNextUnreadNotificationNotice())showLoginMatchNotice();if(event==='SIGNED_IN'&&!prev)toast('Welcome to BrickCircle.')}else if(event==='SIGNED_OUT'||event==='CONFIRMED_SIGNED_OUT'){stopNotificationRealtime();window.BC_PROPOSAL_NOTICE_ACTIVE=false;await refreshCore();shell();await renderRoute()}},0)
}
db.auth.onAuthStateChange(handleAuthChange);
window.addEventListener('hashchange',()=>{if(S.booted)renderRoute()});
document.addEventListener('visibilitychange',()=>{if(document.hidden){lastHiddenAt=Date.now();rememberRoute();return}lastVisibleAt=Date.now();validateResume().catch(()=>{});reconcileNotifications().catch(()=>{})});
window.addEventListener('pagehide',()=>{lastHiddenAt=Date.now();rememberRoute()});
window.addEventListener('pageshow',event=>{lastVisibleAt=Date.now();if(event.persisted)validateResume().catch(()=>{})});
window.addEventListener('focus',()=>{lastVisibleAt=Date.now();validateResume().catch(()=>{})});
window.addEventListener('online',()=>reconcileNotifications().catch(()=>{}));
window.bcNav=navigate;window.bcAuth=showAuth;window.bcClose=closeOverlay;window.bcV3Refresh=refreshRoute;window.bcPushToast=toast;window.bcApplyA11y=()=>applyA11y(document);window.showInbox=showInbox;window.quickMessage=quickMessage;
boot().catch(e=>{console.error('BrickCircle V3 boot failed',e);shell();page(empty('⚠️','BrickCircle could not start','Please refresh the page. If this continues, try again in a moment.'))});
})();
