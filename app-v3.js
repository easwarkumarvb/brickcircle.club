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
const routeName=()=>decodeURIComponent((location.hash||'#home').slice(1).split('/')[0]||'home');
const routeId=()=>decodeURIComponent((location.hash||'').slice(1).split('/')[1]||'');
const isSignedIn=()=>!!S.user;
const betaPWAEnabled=()=>window.BC_BETA_FLAGS?.pwaEnabled===true;
const LOC=()=>window.BC_LOCATIONS||{};
const countries=()=>Object.keys(LOC()).sort((a,b)=>a.localeCompare(b));
const popularSets=['42143','42115','42083','42056','42141','42172','10283','21309','10318','10307'];
const primaryRoutes=[['home','⌂','Home'],['browse','⌕','Browse'],['sets','🧱','My Sets'],['matches','⇄','Matches'],['exchanges','🤝','Exchanges']];

const CATALOGUE_PAGE_SIZE=24;
const CATALOGUE_SEARCH_LIMIT=60;
const CATALOGUE_TIMEOUT_MS=8000;
const OWNER_USER_ID='388ee0a7-2b93-4505-a70c-f4766d7ad50a';
const ADULT_CONFIRMATION_VERSION='2026-09-11';
const ADULT_ATTESTATION='I confirm that I am at least 18 years old and legally able to participate in BrickCircle exchanges.';
const LIFECYCLE_NOTIFICATION_KINDS=new Set(['exchange_accepted','exchange_declined','exchange_cancelled','exchange_created','reciprocal_match']);
let catalogueSequence=0;
let catalogueController=null;
let catalogueTimer=null;
const exchangeabilityOperations=new Map();
const exchangeabilityQueues=new Map();
const ownerPhotoUrls=new Map();
const OWNER_PHOTO_TYPES=new Set(['image/jpeg','image/png','image/webp']);
const OWNER_PHOTO_MAX_BYTES=8*1024*1024;

const S={
  user:null,profile:null,liquidity:null,membership:null,collection:[],wishlist:[],matches:[],
  requests:[],exchanges:[],notifications:[],messages:[],reviews:[],profiles:{},items:{},sets:{},
  browse:{page:0,q:'',theme:'',year:'',rows:[],busy:false,lastCount:0},
  setTab:'collection',exchangeTab:'active',providers:{google:true,apple:false},
  booted:false,installPrompt:null,renderToken:0,refreshWarning:''
};
let pendingAuthChange=null;
let notificationChannel=null;
let notificationPollTimer=null;
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
  closeOverlay();const o=document.createElement('div');o.className='bc-overlay';o.id='bc-overlay';o.innerHTML=`<section class="bc-modal ${wide?'wide':''}" role="dialog" aria-modal="true">${html}</section>`;document.body.appendChild(o);o.addEventListener('click',e=>{if(e.target===o)closeOverlay()});applyA11y(o);announceRender(o);return o;
}
function closeOverlay(){document.getElementById('bc-overlay')?.remove()}
function drawer(html){
  document.getElementById('bc-drawer-overlay')?.remove();const o=document.createElement('div');o.className='bc-drawer-overlay';o.id='bc-drawer-overlay';o.innerHTML=`<aside class="bc-drawer">${html}</aside>`;document.body.appendChild(o);o.addEventListener('click',e=>{if(e.target===o)o.remove()});applyA11y(o);announceRender(o);return o;
}
function loading(label='Loading BrickCircle…'){return `<div class="bc-loading"><div><div class="bc-spinner"></div>${esc(label)}</div></div>`}
function empty(icon,title,copy,button='',action=''){return `<div class="bc-empty"><div class="bc-empty-icon">${icon}</div><h2>${esc(title)}</h2><p>${esc(copy)}</p>${button?`<button class="bc-btn primary" data-action="${attr(action)}">${esc(button)}</button>`:''}</div>`}
function pill(text,type=''){return `<span class="bc-pill ${type}">${esc(text)}</span>`}
function initials(name){return String(name||'B').trim().slice(0,1).toUpperCase()||'B'}
function avatar(p,size='mini'){
  const url=p?.avatar_url?publicAvatar(p.avatar_url):'';
  return url?`<img src="${attr(url)}" alt="" loading="lazy">`:esc(initials(p?.display_name));
}
function publicAvatar(path){if(!path)return '';if(/^https?:\/\//.test(path))return path;return db.storage.from('avatars').getPublicUrl(path).data?.publicUrl||''}
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
  const nav=primaryRoutes.map(([p,i,l])=>`<button data-nav="${p}" class="${routeName()===p?'active':''}">${l}</button>`).join('');
  const mobile=primaryRoutes.map(([p,i,l])=>`<button data-nav="${p}" class="${routeName()===p?'active':''}" aria-label="${l}" ${routeName()===p?'aria-current="page"':''}><span>${i}</span>${l}</button>`).join('');
  const unread=S.notifications.filter(n=>!n.read_at).length;
  const identity=S.profile||{};
  root.innerHTML=`<header class="bc-topbar"><div class="bc-topbar-in"><button class="bc-logo" data-nav="home" aria-label="BrickCircle home"><img src="/assets/brickcircle-logo.png?v=20260913-logo" alt="BrickCircle"></button><nav class="bc-desktop-nav" aria-label="Primary navigation">${nav}</nav><div class="bc-top-actions">${S.user?`<button class="bc-icon-btn" data-open="inbox" aria-label="Inbox">💬</button><button class="bc-icon-btn" data-open="notifications" aria-label="Notifications">🔔${unread?`<span class="bc-badge">${unread>9?'9+':unread}</span>`:''}</button>${S.user.id===OWNER_USER_ID?'<a class="bc-owner-admin-link" href="/admin.html" aria-label="Open BrickCircle admin dashboard">Admin</a>':''}<button class="bc-avatar-btn" data-nav="profile" aria-label="Profile and account controls">${avatar(identity)}</button><button class="bc-top-signout" type="button" data-signout-top>Log out</button>`:`<button class="bc-signin" data-auth>Join / Sign in</button>`}</div></div></header><main id="bc-main" class="bc-main">${loading()}</main><nav class="bc-mobile-nav" aria-label="Mobile navigation">${mobile}</nav>`;
  bindShell(root);
}
function bindShell(root=document){
  $$('[data-nav]',root).forEach(b=>b.onclick=()=>navigate(b.dataset.nav));
  $$('[data-auth]',root).forEach(b=>b.onclick=showAuth);
  $$('[data-signout-top]',root).forEach(b=>b.onclick=signOut);
  $$('[data-open="notifications"]',root).forEach(b=>b.onclick=showNotifications);
  $$('[data-open="inbox"]',root).forEach(b=>b.onclick=showInbox);
}
function syncNav(){
  $$('[data-nav]').forEach(b=>{const active=b.dataset.nav===routeName();b.classList.toggle('active',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')});
}
function app(){return document.getElementById('bc-main')}
function page(html){const a=app();if(!a)return;const warning=S.refreshWarning?`<div class="bc-notice warn bc-refresh-warning" role="status" style="margin-bottom:14px"><b>Some information could not refresh.</b> Your last confirmed view is still shown. <button class="bc-btn ghost" data-refresh-retry>Retry</button></div>`:'';a.innerHTML=`<div class="bc-page">${S.user?firstMatchCoach():''}${warning}${html}</div>`;wireImages(a);applyA11y(a);bindCommon(a);syncNav();announceRender(a);window.scrollTo({top:0,behavior:'instant'})}
function bindCommon(root=document){
  $$('[data-action="browse"]',root).forEach(b=>b.onclick=()=>navigate('browse'));
  $$('[data-action="sets"]',root).forEach(b=>b.onclick=()=>navigate('sets'));
  $$('[data-action="matches"]',root).forEach(b=>b.onclick=()=>navigate('matches'));
  $$('[data-action="exchanges"]',root).forEach(b=>b.onclick=()=>navigate('exchanges'));
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

function clearProtectedState(){S.user=null;S.profile=null;S.collection=[];S.wishlist=[];S.matches=[];S.requests=[];S.exchanges=[];S.notifications=[];S.messages=[];S.reviews=[];S.liquidity=null;S.membership=null;S.profiles={};S.items={};S.sets={}}
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
  const [p,c,w,req,ex,n,msg,liq,membership]=await Promise.all([
    settledTimeout(db.from('profiles').select('*').eq('id',uid).maybeSingle()),
    settledTimeout(db.from('collection_items').select('*,lego_sets(*)').eq('user_id',uid).order('created_at',{ascending:false})),
    settledTimeout(db.from('wishlists').select('*,lego_sets(*)').eq('user_id',uid).order('created_at',{ascending:false})),
    settledTimeout(db.from('exchange_requests').select('*').or(`requester_id.eq.${uid},responder_id.eq.${uid}`).order('created_at',{ascending:false}).limit(80)),
    settledTimeout(db.from('exchanges').select('*').or(`user_a.eq.${uid},user_b.eq.${uid}`).order('created_at',{ascending:false}).limit(80)),
    settledTimeout(db.from('notifications').select('*').eq('user_id',uid).order('created_at',{ascending:false}).limit(50)),
    settledTimeout(db.from('messages').select('*').or(`sender_id.eq.${uid},recipient_id.eq.${uid}`).order('created_at',{ascending:false}).limit(100)),
    settledTimeout(db.rpc('bc_liquidity_status')),
    settledTimeout(db.rpc('bc_membership_status'))
  ]);
  if(generation!==refreshGeneration||S.user?.id!==uid)return;
  const failures=[p,c,w,req,ex,n,msg,liq,membership].filter(result=>result.error);
  if(!p.error)S.profile=p.data||null;if(!c.error)S.collection=c.data||[];if(!w.error)S.wishlist=w.data||[];if(!req.error)S.requests=req.data||[];if(!ex.error)S.exchanges=ex.data||[];if(!n.error)S.notifications=n.data||[];if(!msg.error)S.messages=msg.data||[];
  if(!liq.error)S.liquidity=Array.isArray(liq.data)?liq.data[0]:liq.data;
  if(!membership.error)S.membership=Array.isArray(membership.data)?membership.data[0]:membership.data;
  const m=await settledTimeout(db.rpc('find_matches',{p_user:uid}));if(generation!==refreshGeneration||S.user?.id!==uid)return;if(!m.error)S.matches=m.data||[];else failures.push(m);
  S.refreshWarning=failures.length?(failures[0].error?.message||'Some BrickCircle information could not refresh.'):(authError?S.refreshWarning:'');
  S.collection.forEach(i=>{S.items[i.id]=i;if(i.lego_sets)S.sets[i.set_number]=i.lego_sets});S.wishlist.forEach(i=>{if(i.lego_sets)S.sets[i.set_number]=i.lego_sets});
  window.bcWebPush?.consider(S.user,{meaningful:S.collection.length+S.wishlist.length>0});
  const people=new Set();S.requests.forEach(r=>{people.add(r.requester_id);people.add(r.responder_id)});S.exchanges.forEach(e=>{people.add(e.user_a);people.add(e.user_b)});S.matches.forEach(m=>people.add(m.match_user));S.messages.forEach(m=>{people.add(m.sender_id);people.add(m.recipient_id)});people.delete(uid);if(people.size){const result=await settledTimeout(db.from('public_profiles').select('id,display_name,country,city,bio,avatar_url,rating,review_count,identity_verified,member_since').in('id',[...people]));if(generation!==refreshGeneration||S.user?.id!==uid)return;if(result.error)S.refreshWarning=S.refreshWarning||result.error.message||'Collector details could not refresh.';else(result.data||[]).forEach(p=>S.profiles[p.id]=p)}
}
async function refreshRoute(){await refreshCore();shell();await renderRoute()}

function isProposalNotification(notification){return notification?.kind==='request_received'}
function isReciprocalMatchNotification(notification){return notification?.kind==='reciprocal_match'&&notification?.entity_type==='reciprocal_match'}
function notificationRequestId(notification){return notification?.entity_id||notification?.metadata?.exchange_request_id||''}
function isCurrentNotificationRecipient(notification){return !!S.user?.id&&notification?.user_id===S.user.id}
function isPendingProposalNotification(notification){
  if(!isCurrentNotificationRecipient(notification)||!isProposalNotification(notification))return false;
  const requestId=notificationRequestId(notification),request=S.requests.find(item=>item.id===requestId);
  return !!request&&request.status==='pending';
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
    S.exchangeTab='requests';
    const requestId=notificationRequestId(notification);
    navigate('exchanges',requestId);
    return;
  }
  if(isReciprocalMatchNotification(notification)){navigate('matches');return}
  shell();await renderRoute();
}
function stopNotificationRealtime(){
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
function startNotificationRealtime(){
  stopNotificationRealtime();
  if(!S.user?.id)return;
  const userId=S.user.id;
  notificationPollTimer=setInterval(()=>reconcileNotifications().catch(()=>{}),30000);
  if(typeof db.channel!=='function')return;
  notificationChannel=db.channel(`notifications:${userId}`)
    .on('postgres_changes',{event:'*',schema:'public',table:'notifications',filter:`user_id=eq.${userId}`},applyNotificationChange)
    .subscribe(status=>{if(status==='SUBSCRIBED')reconcileNotifications().catch(()=>{})});
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

function lifecyclePresentation(notification){
  if(notification.kind==='reciprocal_match')return {label:'New local match',fallback:'A nearby collector has a reciprocal LEGO match with you.',action:'View matches',route:'matches'};
  if(notification.kind==='exchange_accepted')return {label:'Exchange accepted',fallback:'Your BrickCircle exchange has been accepted.',action:'Open exchanges',route:'exchanges'};
  if(notification.kind==='exchange_declined')return {label:'Proposal declined',fallback:'Your BrickCircle proposal was declined.',action:'Open exchanges',route:'exchanges'};
  if(notification.kind==='exchange_cancelled')return {label:'Proposal cancelled',fallback:'Your BrickCircle exchange was cancelled.',action:'Open exchanges',route:'exchanges'};
  return {label:'Exchange updated',fallback:'Your BrickCircle exchange has been updated.',action:'Open exchanges',route:'exchanges'};
}
function lifecycleNoticeSeen(notification){try{return sessionStorage.getItem(`bc_lifecycle_notice_seen:${S.user?.id}:${notification.id}`)==='1'}catch(_){return false}}
function showLifecycleNotification(notification){
  if(!isCurrentNotificationRecipient(notification)||notification.read_at||!LIFECYCLE_NOTIFICATION_KINDS.has(notification.kind)||lifecycleNoticeSeen(notification)||notificationPresentationActive())return false;
  try{sessionStorage.setItem(`bc_lifecycle_notice_seen:${S.user.id}:${notification.id}`,'1')}catch(_){}
  const view=lifecyclePresentation(notification),root=document.createElement('section');root.id='bc-exchange-lifecycle-notice';root.className='bc-lifecycle-notice';root.setAttribute('role','status');
  root.innerHTML=`<span>${esc(view.label)}</span><h2>${esc(notification.title||view.label)}</h2><p>${esc(notification.body||view.fallback)}</p><div><button class="bc-btn" type="button" data-life-later>Not now</button><button class="bc-btn primary" type="button" data-life-open>${esc(view.action)}</button></div>`;
  document.body.appendChild(root);$('[data-life-later]',root).onclick=()=>root.remove();$('[data-life-open]',root).onclick=async()=>{await markNotificationRead(notification);root.remove();navigate(view.route)};return true;
}
function showUnreadLifecycleNotice(){const notification=S.notifications.find(item=>!item.read_at&&isCurrentNotificationRecipient(item)&&LIFECYCLE_NOTIFICATION_KINDS.has(item.kind));return showLifecycleNotification(notification)}
function showNextUnreadNotificationNotice(){
  if(!S.user?.id||notificationPresentationActive())return false;
  return showUnreadLifecycleNotice()||showUnreadProposalNotice();
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
  if(e.state==='completed')return 5;if(e.state==='disputed')return 4;if(e.state==='swap_active')return 4;if(e.state==='accepted')return 2;return 1;
}
function activeExchanges(){return S.exchanges.filter(e=>!['completed','cancelled'].includes(e.state))}
function pendingRequests(){return S.requests.filter(r=>r.status==='pending')}
function completedExchanges(){return S.exchanges.filter(e=>e.state==='completed')}
function otherId(e){return e.user_a===S.user?.id?e.user_b:e.user_a}
function otherProfile(e){return S.profiles[otherId(e)]||{display_name:'Collector'} }
function itemName(id){const i=S.items[id];return i?.lego_sets?.name||S.sets[i?.set_number]?.name||i?.set_number||'LEGO set'}
async function hydrateExchangeItems(rows=S.exchanges){
  const ids=[...new Set(rows.flatMap(e=>[e.item_a,e.item_b]).filter(Boolean))];if(!ids.length)return;const missing=ids.filter(id=>!S.items[id]);if(missing.length){const {data}=await db.from('collection_items').select('*,lego_sets(*)').in('id',missing);(data||[]).forEach(i=>{S.items[i.id]=i;if(i.lego_sets)S.sets[i.set_number]=i.lego_sets})}
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
  if(r==='profile')return renderProfile(token);
  if(r==='inbox'){showInbox();return navigate('home')}
  return navigate('home');
}

async function renderHome(token){
  if(!S.user){
    const policy=membershipPolicy();page(`${landingHero()}${policy?`<aside class="bc-membership-policy"><b>Free during beta:</b> ${esc(policy.body)}</aside>`:''}${landingExchangeStory()}${landingWorkflow()}${landingMatchExample()}${landingTrust()}${landingFinalCta()}`);bindCommon(app());$$('[data-auth]',app()).forEach(b=>b.onclick=showAuth);$('[data-scroll="how-it-works"]',app()).onclick=()=>document.getElementById('how-it-works')?.scrollIntoView({behavior:'smooth'});return;
  }
  const progress=guidedProgress(),active=activeExchanges(),pending=pendingRequests(),matches=S.matches||[],l=S.liquidity||{};
  const name=(S.profile?.display_name||S.user.email||'Collector').split(' ')[0];
  const memberBadge=membershipBadge(),cityMembership=membershipCityCopy();
  page(`<div class="bc-dashboard-hero"><section class="bc-welcome"><span class="bc-pill gold">${esc(memberBadge)}</span><h1>Welcome back, ${esc(name)}.</h1><p>Own → Want → Match → Exchange. Your next step is ready below.</p><div class="bc-head-actions" style="justify-content:flex-start;margin-top:15px"><button class="bc-btn gold" data-guided-action="${progress.action.go}">${esc(progress.action.label)}</button>${S.collection.length?'<button class="bc-btn ghost" style="color:#fff;border-color:#ffffff44" data-action="sets">My Sets</button>':''}</div></section><section class="bc-card bc-readiness"><div class="bc-small">MATCH SETUP</div><div class="bc-readiness-status">${esc(progress.status)}</div><div class="bc-readiness-counts"><span><b>${Math.min(S.collection.length,3)}/3</b> owned</span><span><b>${Math.min(S.wishlist.length,3)}/3</b> wanted</span><span><b>${Math.min(S.collection.filter(x=>x.available_for_exchange).length,1)}/1</b> available</span></div><div class="bc-small">${esc(progress.guidance)}</div></section></div><section class="bc-guided-progress" aria-labelledby="guided-progress-title"><div class="bc-guided-head"><div><span class="bc-small">OWN → WANT → MATCH → EXCHANGE</span><h2 id="guided-progress-title">Your path to your first match</h2></div><button class="bc-btn primary" data-guided-action="${progress.action.go}">${esc(progress.action.label)}</button></div><div class="bc-checklist">${progress.steps.map(x=>`<div class="bc-check ${x.done?'done':''}"><b>${x.done?'✓ ':''}${esc(x.title)}</b><span>${esc(x.desc)}</span></div>`).join('')}</div></section>${workflowGuide()}${reassuranceStrip()}<div class="bc-dashboard-grid"><section class="bc-card bc-dash-card"><h3>Reciprocal matches</h3><div class="bc-statbig">${matches.length}</div><p class="bc-small">Collectors in your city who want what you can offer and own something in Sets I Want.</p><button class="bc-btn" data-action="matches">Open matches</button></section><section class="bc-card bc-dash-card"><h3>Exchange activity</h3><div class="bc-statbig">${active.length}</div><p class="bc-small">${pending.length?`${pending.length} pending request${pending.length===1?'':'s'} also waiting.`:'No pending requests right now.'}</p><button class="bc-btn" data-action="exchanges">Open exchanges</button></section><section class="bc-card bc-dash-card"><h3>${esc(S.profile?.city||'Your city')} BrickCircle</h3><div class="bc-statbig">${Number(l.city_members||0)}</div><p class="bc-small">${Number(l.city_exchangeable_sets||0)} sets available · ${Number(l.city_wishlist_items||0)} wanted-set signals</p><button class="bc-btn" data-invite>Invite local AFOL</button>${cityMembership?`<div class="bc-membership-city">${cityMembership}</div>`:''}</section></div>`);
  $$('[data-guided-action]',app()).forEach(b=>b.onclick=()=>navigate(b.dataset.guidedAction));$$('[data-invite]',app()).forEach(b=>b.onclick=shareInvite);if(S.installPrompt&&S.collection.length){const target=$('.bc-welcome .bc-head-actions');if(target){const b=document.createElement('button');b.className='bc-btn ghost';b.style.cssText='color:#fff;border-color:#ffffff44';b.textContent='Install BrickCircle';b.onclick=installPWA;target.appendChild(b)}}
}
function landingHero(){return `<section class="bc-hero bc-landing-hero"><div class="bc-landing-hero-copy"><span class="bc-pill gold">Own → Want → Match → Exchange</span><h1>Experience more LEGO <em>without buying every set.</em></h1><p>Add what you own. Pick what you want. Meet a nearby collector and exchange temporarily.</p><div class="bc-hero-actions"><button class="bc-btn primary" data-auth>Start with my collection</button><button class="bc-btn" data-scroll="how-it-works">See how it works</button></div></div><div class="bc-landing-showcase" aria-label="Featured LEGO sets"><div class="bc-showcase-card own">${setImage('42143-1','Ferrari Daytona SP3',true)}<span>IN YOUR COLLECTION</span><strong>Ferrari Daytona SP3</strong></div><div class="bc-showcase-card want">${setImage('42141-1','McLaren F1',true)}<span>A SET YOU WANT</span><strong>McLaren F1</strong></div><div class="bc-showcase-link">A reciprocal exchange, not another purchase <b>⇄</b></div></div></section>`}
function landingExchangeStory(){return `<section class="bc-landing-section bc-story" id="how-it-works" aria-labelledby="story-title"><div class="bc-landing-heading"><span>THE BRICKCIRCLE LOOP</span><h2 id="story-title">See the exchange in seconds</h2></div><div class="bc-story-flow"><article><div class="bc-story-image">${setImage('42143-1','Ferrari Daytona SP3')}</div><small>YOU OWN</small><strong>Ferrari Daytona SP3</strong></article><i aria-hidden="true">→</i><article><div class="bc-story-image">${setImage('42141-1','McLaren F1')}</div><small>YOU WANT</small><strong>McLaren F1</strong></article><i aria-hidden="true">→</i><article class="overlap"><div class="bc-overlap-mark">◎</div><small>BRICKCIRCLE</small><strong>Finds the overlap</strong></article><i aria-hidden="true">→</i><article class="matched"><div class="bc-match-seal">✓</div><small>MUTUAL INTEREST</small><strong>Reciprocal Match</strong></article></div></section>`}
function landingWorkflow(){return `<section class="bc-landing-section" aria-labelledby="landing-workflow-title"><div class="bc-landing-heading"><span>ONE CLEAR PATH</span><h2 id="landing-workflow-title">Own → Want → Match → Exchange</h2></div><div class="bc-landing-workflow"><article><b>01</b><span>OWN</span><h3>Add your LEGO sets</h3><p>Choose which sets you could exchange.</p></article><article><b>02</b><span>WANT</span><h3>Pick your next experience</h3><p>Save the sets you genuinely want to try.</p></article><article><b>03</b><span>MATCH</span><h3>Find a reciprocal collector</h3><p>BrickCircle reveals the mutual overlap.</p></article><article><b>04</b><span>EXCHANGE</span><h3>Meet, inspect, swap</h3><p>Enjoy the set temporarily, then return it.</p></article></div></section>`}
function landingMatchExample(){return `<section class="bc-example-match" aria-labelledby="example-match-title"><div class="bc-example-copy"><span class="bc-pill green">Illustrative example · Reciprocal Match</span><h2 id="example-match-title">Both collectors get a set they want.</h2><p>No anonymous listing or one-sided request. A match appears when both sides independently want the exchange.</p><div class="bc-example-trust"><span>📍 Local</span><span>🤝 In person</span><span>✓ Inspection-first</span></div></div><div class="bc-example-sets"><article>${setImage('42143-1','Ferrari Daytona SP3')}<small>YOU</small><strong>Ferrari Daytona SP3</strong></article><div class="bc-example-swap">⇄</div><article>${setImage('42141-1','McLaren F1')}<small>COLLECTOR NEARBY</small><strong>McLaren F1</strong></article></div></section>`}
function landingTrust(){return `<section class="bc-landing-section bc-trust" aria-labelledby="trust-title"><div class="bc-landing-heading"><span>EXCHANGE WITH CONFIDENCE</span><h2 id="trust-title">Simple, local and inspection-first</h2></div><div class="bc-trust-grid"><span>⌖<b>Local exchanges</b></span><span>🤝<b>Meet in person</b></span><span>✓<b>Inspect before handoff</b></span><span>↩<b>Temporary exchange</b></span><span>□<b>No shipping required</b></span><span>◉<b>You choose what’s available</b></span></div></section>`}
function landingFinalCta(){return `<section class="bc-landing-final"><span>YOUR COLLECTION STARTS THE MATCH</span><h2>Ready to experience your next set?</h2><button class="bc-btn gold" data-auth>Add your first set</button></section>`}
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
  if(status)status.textContent=S.browse.q?'Preparing search…':'Loading page…';
  grid?.setAttribute('aria-busy','true');
  catalogueTimer=setTimeout(()=>loadCatalogue(S.renderToken),delay);
}
async function renderBrowse(token){
  page(`<div class="bc-page-head"><div><h1>Browse LEGO sets</h1><p>Add what you own and wishlist what you want. Every action improves BrickCircle’s reciprocal matching.</p></div>${S.user?`<div class="bc-head-actions">${pill(`${S.collection.length} owned`,'green')}${pill(`${S.wishlist.length} wanted`,'blue')}</div>`:''}</div><div class="bc-popular"><h2>Popular collector sets</h2><div class="bc-popular-row">${[['42143','Ferrari Daytona'],['42115','Lamborghini Sián'],['42083','Bugatti Chiron'],['42056','Porsche GT3 RS'],['10283','Space Shuttle'],['21309','Saturn V']].map(([n,t])=>`<button class="bc-pop-chip" data-pop="${n}">${esc(t)}</button>`).join('')}</div></div><div class="bc-catalogue-tools"><div class="bc-searchrow"><input id="bc-q" class="bc-input" placeholder="Search product name, set number or theme — e.g. McLaren, Ferrari, Saturn V" aria-label="Search LEGO products by product name, set number or theme" value="${attr(S.browse.q)}" autocomplete="off"><select id="bc-theme" class="bc-select"><option value="">All themes</option>${['Technic','Icons','Ideas','Star Wars','Creator Expert','Architecture','Speed Champions','City','Castle','Space','Pirates','Harry Potter','Marvel Super Heroes'].map(t=>`<option ${S.browse.theme===t?'selected':''}>${t}</option>`).join('')}</select><select id="bc-year" class="bc-select"><option value="">Any year</option>${Array.from({length:new Date().getFullYear()-1948},(_,i)=>new Date().getFullYear()-i).map(y=>`<option ${String(S.browse.year)===String(y)?'selected':''}>${y}</option>`).join('')}</select></div><div class="bc-name-search-help bc-small" style="margin-top:7px;color:#667085">Tip: type any part of the LEGO product name. “McLaren” will show every McLaren set in the catalogue.</div></div><div class="bc-catalogue-meta"><div id="bc-cat-status" class="bc-small" role="status">Loading sets…</div><div id="bc-cat-page-size" class="bc-small">${CATALOGUE_PAGE_SIZE} per page</div></div><div id="bc-set-grid" class="bc-set-grid" aria-busy="true">${loading('Loading catalogue…')}</div><div class="bc-pager"><button class="bc-btn" id="bc-prev">← Previous</button><span id="bc-page-label" class="bc-small">Page ${S.browse.page+1}</span><button class="bc-btn primary" id="bc-next">Next →</button></div>`);
  const q=$('#bc-q'),theme=$('#bc-theme'),year=$('#bc-year');
  q.oninput=()=>{S.browse.q=q.value.trim();S.browse.page=0;scheduleCatalogueLoad()};
  theme.onchange=()=>{S.browse.theme=theme.value;S.browse.page=0;scheduleCatalogueLoad(0)};
  year.onchange=()=>{S.browse.year=year.value;S.browse.page=0;scheduleCatalogueLoad(0)};
  $('#bc-prev').onclick=()=>{if(S.browse.page>0){S.browse.page--;scheduleCatalogueLoad(0)}};
  $('#bc-next').onclick=()=>{if(S.browse.lastCount===CATALOGUE_PAGE_SIZE){S.browse.page++;scheduleCatalogueLoad(0)}};
  $$('[data-pop]').forEach(b=>b.onclick=()=>{q.value=b.dataset.pop;S.browse.q=b.dataset.pop;S.browse.page=0;scheduleCatalogueLoad(0)});
  await loadCatalogue(token);
}
async function loadCatalogue(token=S.renderToken){
  clearTimeout(catalogueTimer);
  catalogueController?.abort();
  const requestId=++catalogueSequence,controller=new AbortController();
  catalogueController=controller;S.browse.busy=true;
  const cleanQuery=String(S.browse.q||'').replace(/[,%()]/g,' ').trim();
  // An exact set number identifies one product, so stale theme/year filters must not hide it.
  const isExactSetNumber=/^\d{3,7}(?:-\d+)?$/.test(cleanQuery);
  const snapshot={page:S.browse.page,q:cleanQuery,theme:isExactSetNumber?null:(S.browse.theme||null),year:isExactSetNumber?null:(S.browse.year?Number(S.browse.year):null),broadened:false};
  const grid=$('#bc-set-grid'),status=$('#bc-cat-status');
  if(status)status.textContent=snapshot.q?`Searching for “${snapshot.q}”…`:'Loading page…';
  grid?.setAttribute('aria-busy','true');
  let timedOut=false,data=null,error=null;
  const timeout=setTimeout(()=>{timedOut=true;controller.abort()},CATALOGUE_TIMEOUT_MS);
  try{
    let req;
    if(snapshot.q){
      req=db.rpc('bc_search_lego_sets',{p_query:snapshot.q,p_theme:snapshot.theme,p_year:snapshot.year,p_limit:CATALOGUE_SEARCH_LIMIT});
    }else{
      const from=snapshot.page*CATALOGUE_PAGE_SIZE,to=from+CATALOGUE_PAGE_SIZE-1;
      req=db.from('lego_sets').select('set_number,name,year,piece_count,theme,estimated_value,image_url').eq('catalog_active',true);
      if(snapshot.theme)req=req.eq('theme',snapshot.theme);
      if(snapshot.year)req=req.eq('year',snapshot.year);
      req=req.order('year',{ascending:false}).order('set_number',{ascending:true}).range(from,to);
    }
    if(typeof req.abortSignal==='function')req=req.abortSignal(controller.signal);
    ({data,error}=await req);
    // A collector may type a specific model while an old theme/year filter is
    // still selected. Preserve useful combined filtering when it finds rows,
    // but never let a stale filter turn a valid product-name match into an
    // unexplained empty state.
    if(!error&&snapshot.q&&!(data||[]).length&&(snapshot.theme||snapshot.year)){
      let fallback=db.rpc('bc_search_lego_sets',{p_query:snapshot.q,p_theme:null,p_year:null,p_limit:CATALOGUE_SEARCH_LIMIT});
      if(typeof fallback.abortSignal==='function')fallback=fallback.abortSignal(controller.signal);
      const broadened=await fallback;
      if(!broadened.error&&(broadened.data||[]).length){
        data=broadened.data;snapshot.broadened=true;
      }
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
  if(grid)grid.innerHTML=S.browse.rows.map(setCard).join('')||empty('🔎','No matching sets','Try a different set number, name, theme or year.');
  if(status)status.textContent=S.browse.rows.length?(snapshot.q?`${S.browse.rows.length} product${S.browse.rows.length===1?'':'s'} matching “${snapshot.q}”${snapshot.broadened?' across all themes and years':''}`:`Page ${snapshot.page+1} · ${S.browse.rows.length} sets`):'No matching sets';
  const pager=$('.bc-pager'),pageSize=$('#bc-cat-page-size');
  if(pager)pager.style.display=snapshot.q?'none':'';
  if(pageSize)pageSize.textContent=snapshot.q?`Up to ${CATALOGUE_SEARCH_LIMIT} matches`:`${CATALOGUE_PAGE_SIZE} per page`;
  $('#bc-page-label')&&( $('#bc-page-label').textContent=`Page ${snapshot.page+1}` );
  $('#bc-prev')&&( $('#bc-prev').disabled=snapshot.page===0 );
  $('#bc-next')&&( $('#bc-next').disabled=S.browse.rows.length<CATALOGUE_PAGE_SIZE );
  wireImages(grid);bindSetActions(grid);
  try{track(snapshot.q?'catalogue_product_name_search':'catalogue_page_loaded',{query:snapshot.q,page:snapshot.page,result_count:S.browse.rows.length,broadened:snapshot.broadened})}catch(_){ }
}
function setCard(s,index=99){
  const own=S.collection.find(x=>x.set_number===s.set_number),want=S.wishlist.find(x=>x.set_number===s.set_number);return `<article class="bc-set-card" data-set="${attr(s.set_number)}">${setImage(s.set_number,s.name,index<6)}<div style="margin-top:9px">${pill(s.theme||'LEGO')}</div><h3>${esc(s.name)}</h3><div class="bc-set-meta">Set ${esc(s.set_number)} · ${s.year||''}${s.piece_count?` · ${Number(s.piece_count).toLocaleString()} pieces`:''}</div><div class="bc-small" style="margin-top:6px">${money(s.estimated_value)}</div><div class="bc-set-actions"><button class="${own?'on':''}" data-own>${own?'✓ I own this':'○ I own this'}</button><button class="want ${want?'on':''}" data-want>${want?'♥ Wishlist':'♡ I want this'}</button></div></article>`
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
    const side=cards[index]?.querySelectorAll('.bc-match-side')?.[1];if(!side||side.querySelector('.bc-owner-proof'))continue;
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
  const progress=guidedProgress(),owned=S.collection.length,wanted=S.wishlist.length,available=S.collection.filter(x=>x.available_for_exchange).length;page(`<div class="bc-page-head"><div><h1>My Sets</h1><p>Keep the relationship simple: what you own, and what you want to experience next.</p></div><div class="bc-head-actions"><button class="bc-btn primary" data-action="browse">+ Add sets</button></div></div><div class="bc-setup-summary" aria-label="Match setup counts"><span><b>${Math.min(owned,3)}/3</b> owned</span><span><b>${Math.min(wanted,3)}/3</b> wanted</span><span><b>${Math.min(available,1)}/1</b> available</span><strong>${esc(progress.status)}</strong></div><div class="bc-tabs"><button class="bc-tab ${S.setTab==='collection'?'active':''}" data-settab="collection">My Sets · ${S.collection.length}</button><button class="bc-tab ${S.setTab==='wishlist'?'active':''}" data-settab="wishlist">Sets I Want · ${S.wishlist.length}</button></div><div id="bc-sets-body"></div>`);$$('[data-settab]').forEach(b=>b.onclick=()=>{S.setTab=b.dataset.settab;renderSets(S.renderToken)});renderSetsBody();
}
function renderSetsBody(){
  const host=$('#bc-sets-body');if(!host)return;if(S.setTab==='wishlist'){host.innerHTML=S.wishlist.length?`<div class="bc-set-list">${S.wishlist.map(w=>mySetRow(w,true)).join('')}</div>`:empty('♡','Build Sets I Want','Add at least three sets you would genuinely like to experience. This gives BrickCircle enough demand signals to find reciprocal collectors.','Browse LEGO sets','browse')}else{host.innerHTML=S.collection.length?`<div class="bc-notice warn" style="margin-bottom:12px"><b>Make at least one set available to exchange.</b> Only sets you explicitly make available can appear in reciprocal matches.</div><div class="bc-set-list">${S.collection.map(c=>mySetRow(c,false)).join('')}</div>`:empty('🧱','Start with the LEGO you already own','Add at least three collectible sets. You decide which physical copies are available for a temporary local exchange.','Add my first set','browse')};bindCommon(host);$$('[data-exchangeable]',host).forEach(x=>x.onchange=()=>setExchangeable(x.dataset.exchangeable,x.checked));$$('[data-remove-wish]',host).forEach(b=>b.onclick=()=>removeWish(b.dataset.removeWish));$$('[data-change-photo]',host).forEach(b=>b.onclick=()=>{const item=S.collection.find(row=>row.id===b.dataset.changePhoto);if(item)replaceOwnerPhoto(item)});$$('[data-edit-set]',host).forEach(b=>b.onclick=()=>editCollectionItem(b.dataset.editSet));wireImages(host);if(S.setTab==='collection')hydrateOwnerPhotos(host)
}
function mySetRow(row,wish){const s=row.lego_sets||S.sets[row.set_number]||{},image=imageSetNumber(row.set_number);return `<article class="bc-card bc-myset"> <div class="bc-myset-visual"><img src="https://images.brickset.com/sets/images/${attr(image)}.jpg" alt="" loading="lazy" data-set-image="${attr(row.set_number)}"><div hidden>🧱</div></div><div><h3>${esc(s.name||row.set_number)}</h3><div class="bc-myset-meta">Set ${esc(row.set_number)}${s.theme?` · ${esc(s.theme)}`:''}${s.piece_count?` · ${Number(s.piece_count).toLocaleString()} pieces`:''}</div><div class="bc-statusrow">${wish?pill('Sets I Want','blue'):(row.available_for_exchange?pill('Available to Exchange','green'):pill('Not Available'))}${!wish&&row.condition?pill(row.condition):''}${!wish&&row.completeness!=null?pill(`${row.completeness}% complete`):''}</div></div><div class="bc-myset-actions">${wish?`<button class="bc-btn" data-remove-wish="${attr(row.set_number)}" aria-label="Remove ${attr(s.name||row.set_number)} from Sets I Want">Remove</button>`:`<label class="bc-toggle"><input type="checkbox" data-exchangeable="${attr(row.id)}" ${row.available_for_exchange?'checked':''}> Available to Exchange</label><button class="bc-btn" data-change-photo="${attr(row.id)}">Change photo</button><button class="bc-btn" data-edit-set="${attr(row.id)}">Details</button>`}</div></article>`}
async function setExchangeable(id,on){
  if(!S.user||!id)return;
  const item=S.collection.find(row=>row.id===id),previous=Boolean(item?.available_for_exchange);
  if(on&&item&&!item.owner_photo_path){const input=$(`[data-exchangeable="${CSS.escape(id)}"]`);if(input)input.checked=false;addLegacyOwnerPhoto(item);return}
  const revision=(exchangeabilityOperations.get(id)?.revision||0)+1;
  exchangeabilityOperations.set(id,{revision,desired:on});
  const prior=exchangeabilityQueues.get(id)||Promise.resolve();
  const operation=prior.catch(()=>{}).then(async()=>{
    const latest=exchangeabilityOperations.get(id);
    if(!latest||latest.revision!==revision)return;
    const {data,error}=await db.from('collection_items').update({available_for_exchange:on,updated_at:new Date().toISOString()}).eq('id',id).eq('user_id',S.user.id).select('id,available_for_exchange');
    if(error)throw error;
    const saved=(data||[]).find(row=>row.id===id);
    if(!saved||Boolean(saved.available_for_exchange)!==Boolean(on))throw new Error('BrickCircle could not confirm this exchange setting. Please try again.');
    if(exchangeabilityOperations.get(id)?.revision!==revision)return;
    await refreshCore();renderSetsBody();toast(on?'This set is saved as Available to Exchange.':'This set is saved as Not Available.');
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
function editCollectionItem(id){const c=S.collection.find(x=>x.id===id);if(!c)return;const name=c.lego_sets?.name||c.set_number,o=modal(`<div class="bc-modal-head"><div><h2>${esc(name)}</h2><p class="bc-muted">Describe the physical copy another collector would receive.</p></div><button class="bc-close" data-close>×</button></div><form class="bc-form" id="bc-edit-item"><div class="bc-field"><label>Condition</label><select class="bc-select" name="condition">${['Excellent','Very good','Good','Fair'].map(x=>`<option ${c.condition===x?'selected':''}>${x}</option>`).join('')}</select></div><div class="bc-field"><label>Completeness (%)</label><input class="bc-input" name="completeness" type="number" min="0" max="100" value="${Number(c.completeness??100)}"></div><label><input name="box" type="checkbox" ${c.original_box?'checked':''}> Original box included</label><label><input name="exchangeable" type="checkbox" ${c.available_for_exchange?'checked':''}> Available for exchange</label><div class="bc-field"><label>Notes</label><textarea class="bc-textarea" name="notes" placeholder="Missing pieces, sticker condition, instructions, etc.">${esc(c.notes||'')}</textarea></div><div class="bc-form-actions"><button type="button" class="bc-btn danger" data-remove-collection-item="${attr(id)}">Remove set</button><button type="button" class="bc-btn" data-close>Cancel</button><button class="bc-btn primary" type="submit">Save details</button></div></form>`);$$('[data-close]',o).forEach(b=>b.onclick=closeOverlay);$('[data-remove-collection-item]',o).onclick=e=>removeCollectionItem(id,name,e.currentTarget);$('#bc-edit-item',o).onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget),btn=$('button[type="submit"]',e.currentTarget),wantsExchange=f.get('exchangeable')==='on';if(wantsExchange&&!c.owner_photo_path){addLegacyOwnerPhoto(c);return}btn.disabled=true;const patch={condition:String(f.get('condition')),completeness:Number(f.get('completeness')),original_box:f.get('box')==='on',available_for_exchange:wantsExchange,notes:String(f.get('notes')||''),updated_at:new Date().toISOString()};const {error}=await db.from('collection_items').update(patch).eq('id',id).eq('user_id',S.user.id);if(error){fail(error);btn.disabled=false;return}closeOverlay();await refreshCore();renderSetsBody();toast('Set details updated.')}
}
async function removeCollectionItem(id,name,button){
  if(!id)return;const original=button?.textContent||'Remove';if(button){button.disabled=true;button.textContent='Checking…'}
  try{
    const {data:{user},error:userError}=await withTimeout(db.auth.getUser(),8000);
    if(userError||!user)throw userError||new Error('Please sign in again before removing this set.');
    const item=S.collection.find(row=>row.id===id);if(!item)throw new Error('This set is no longer in your collection. Refresh and try again.');
    const {data:refs,error:refsError}=await db.from('exchanges').select('id,state,created_at').or(`item_a.eq.${id},item_b.eq.${id}`).order('created_at',{ascending:false});if(refsError)throw refsError;
    const active=(refs||[]).find(row=>!['completed','cancelled'].includes(row.state));
    if(active){const message=active.state==='accepted'?'This set is part of an accepted exchange. Cancel that exchange before removing the set from My Sets.':active.state==='swap_active'?'This set is currently in a temporary exchange. Complete the return before removing it from My Sets.':active.state==='disputed'?'This set is tied to an exchange with an open issue. Resolve the exchange before removing it from My Sets.':'This set is part of an active exchange and cannot be removed yet.';if(button){button.disabled=false;button.textContent=original}if(confirm(`${message}\n\nOpen the exchange now?`)){closeOverlay();navigate('exchange',active.id)}return}
    if(!confirm(`Remove ${name||'this set'} from My Sets?\n\nCompleted or cancelled exchange history will be preserved.`)){if(button){button.disabled=false;button.textContent=original}return}
    if(button)button.textContent='Removing…';
    const {data,error}=await withTimeout(db.from('collection_items').delete().eq('id',id).eq('user_id',user.id).select('id'),12000);
    if(error)throw error;if(!data?.length)throw new Error('Collection item was not removed. Please refresh and try again.');
    await cleanupOwnerPhoto(item.owner_photo_path);S.collection=S.collection.filter(row=>row.id!==id);closeOverlay();renderSetsBody();toast(`${name||'Set'} removed from My Sets.`);await refreshCore();renderSetsBody();
  }catch(error){const raw=String(error?.message||''),message=/foreign key constraint|exchanges_item_[ab]_fkey|exchanges_request_id_fkey/i.test(raw)?'This set is still linked to an exchange. Open Exchanges and resolve or cancel it before trying again.':(error?.message||'Could not remove this set. Please try again.');fail(new Error(message),message);if(button){button.disabled=false;button.textContent=original}}
}

async function renderMatches(token){
  if(!S.user){showAuth();return navigate('home')}const rd=readiness();if(rd.score<40&&!S.matches.length){page(`<div class="bc-page-head"><div><h1>Matches</h1><p>This is where BrickCircle becomes useful: both collectors want what the other owns.</p></div></div>${empty('⇄','Finish your match setup','Add owned sets, mark exchangeable copies and build a wishlist. BrickCircle can only create a reciprocal match when both sides line up.','Continue setup','sets')}`);return}
  const ids=[...new Set(S.matches.map(m=>m.match_user))];if(ids.length){const {data}=await db.from('public_profiles').select('*').in('id',ids);(data||[]).forEach(p=>S.profiles[p.id]=p)}
  page(`<div class="bc-page-head"><div><h1>Matches</h1><p>A match appears only when you want their available set and they want one of yours.</p></div><div class="bc-head-actions">${pill(`${S.matches.length} reciprocal`,S.matches.length?'green':'')}</div></div><div class="bc-match-list">${S.matches.length?S.matches.map((m,i)=>matchCard(m,i)).join(''):empty('🔎','No reciprocal match yet','Your wishlist and exchangeable sets are ready. Add a few more wanted sets or invite another collector in your city to improve local liquidity.','Explore more sets','browse')}</div>`);$$('[data-propose]',app()).forEach(b=>b.onclick=()=>showProposal(Number(b.dataset.propose)));$$('[data-message-person]',app()).forEach(b=>b.onclick=()=>quickMessage(b.dataset.messagePerson));bindCommon(app());hydrateMatchPhotos(app());
}
function matchCard(m,i){const p=S.profiles[m.match_user]||{},rating=Number(p.review_count||0)>0?`${Number(p.rating||0).toFixed(1)} ★ · ${p.review_count} review${p.review_count===1?'':'s'}`:'New collector';return `<article class="bc-card bc-match"><div class="bc-match-top"><div class="bc-match-person"><div class="bc-mini-avatar">${avatar(p)}</div><div><b>${esc(p.display_name||'Collector')}</b><div class="bc-small">${esc(p.city||S.profile?.city||'')} · ${rating}</div></div></div>${pill(`${m.match_score}% fit`,'green')}</div><div class="bc-match-sides"><div class="bc-match-side"><label>You offer</label><strong>${esc(m.offered_name)}</strong><span class="bc-small">Set ${esc(m.offered_set)} · ${money(m.offered_value)}</span></div><div class="bc-match-arrow">⇄</div><div class="bc-match-side"><label>You experience</label><strong>${esc(m.requested_name)}</strong><span class="bc-small">Set ${esc(m.requested_set)} · ${money(m.requested_value)}</span></div></div><div class="bc-notice good"><b>Reciprocal match</b> Both of you have independently wishlisted the other collector’s available set.</div><div class="bc-match-actions" style="margin-top:12px"><button class="bc-btn primary" data-propose="${i}">Propose exchange</button><button class="bc-btn" data-message-person="${attr(m.match_user)}">Message ${esc((p.display_name||'collector').split(' ')[0])}</button></div></article>`}
function showProposal(i){const m=S.matches[i];if(!m)return;const p=S.profiles[m.match_user]||{};const o=modal(`<div class="bc-modal-head"><div><span class="bc-pill green">Reciprocal match</span><h2 style="margin-top:8px">Propose an exchange with ${esc(p.display_name||'this collector')}</h2><p class="bc-muted">No deposit or shipping step. BrickCircle’s current model is local, in-person and inspection-first.</p></div><button class="bc-close" data-close>×</button></div><div class="bc-notice"><b>${esc(m.offered_name)}</b> ⇄ <b>${esc(m.requested_name)}</b></div><form class="bc-form" id="bc-proposal"><div class="bc-field"><label>Temporary exchange period</label><select class="bc-select" name="days"><option value="30">30 days</option><option value="60" selected>60 days</option><option value="90">90 days</option></select></div><div class="bc-field"><label>Message</label><textarea class="bc-textarea" name="message">Hi! We have a reciprocal BrickCircle match. Would you like to meet locally, inspect both sets and exchange them temporarily?</textarea></div><div class="bc-notice warn"><b>What happens next</b><br>The other collector accepts → you choose a public meetup → both inspect the actual sets → both confirm the handoff.</div><div class="bc-form-actions"><button type="button" class="bc-btn" data-close>Cancel</button><button type="submit" class="bc-btn primary">Send proposal</button></div></form>`);$$('[data-close]',o).forEach(b=>b.onclick=closeOverlay);$('#bc-proposal',o).onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget),btn=$('button[type="submit"]',e.currentTarget);btn.disabled=true;btn.textContent='Sending…';const {error}=await db.from('exchange_requests').insert({requester_id:S.user.id,responder_id:m.match_user,offered_item_id:m.offered_item,requested_item_id:m.requested_item,duration_days:Number(f.get('days')),offered_value:m.offered_value,requested_value:m.requested_value,proposed_deposit:0,message:String(f.get('message')||'')});if(error){fail(error);btn.disabled=false;btn.textContent='Send proposal';return}closeOverlay();await refreshCore();S.exchangeTab='requests';navigate('exchanges');toast('Exchange proposal sent.');track('exchange_proposal_sent',{match_user:m.match_user,duration_days:Number(f.get('days'))})}}

async function renderExchanges(token,legacy='exchanges'){
  if(!S.user){showAuth();return navigate('home')}await hydrateExchangeItems();if(legacy==='requests'||routeId())S.exchangeTab='requests';if(legacy==='returns'||legacy==='meetup')S.exchangeTab='active';
  const active=activeExchanges(),pending=pendingRequests(),done=completedExchanges();page(`<div class="bc-page-head"><div><h1>Exchanges</h1><p>One place for proposals, meetups, active temporary swaps, returns and completed exchanges.</p></div><div class="bc-head-actions">${active.length?pill(`${active.length} active`,'green'):''}${pending.length?pill(`${pending.length} request${pending.length===1?'':'s'}`,'gold'):''}</div></div><div class="bc-tabs"><button class="bc-tab ${S.exchangeTab==='active'?'active':''}" data-extab="active">Active · ${active.length}</button><button class="bc-tab ${S.exchangeTab==='requests'?'active':''}" data-extab="requests">Requests · ${pending.length}</button><button class="bc-tab ${S.exchangeTab==='completed'?'active':''}" data-extab="completed">Completed · ${done.length}</button></div><div id="bc-exchange-body"></div>`);$$('[data-extab]').forEach(b=>b.onclick=()=>{S.exchangeTab=b.dataset.extab;renderExchangeBody()});renderExchangeBody();
}
function renderExchangeBody(){const host=$('#bc-exchange-body');if(!host)return;const active=activeExchanges(),pending=pendingRequests(),done=completedExchanges();if(S.exchangeTab==='requests'){host.innerHTML=pending.length?`<div class="bc-exchange-list">${pending.map(requestCard).join('')}</div>`:empty('📨','No pending requests','New proposals you send or receive will appear here.','Find matches','matches');$$('[data-request-action]',host).forEach(b=>b.onclick=()=>respondRequest(b.dataset.requestId,b.dataset.requestAction))}else if(S.exchangeTab==='completed'){host.innerHTML=done.length?`<div class="bc-exchange-list">${done.map(exchangeCard).join('')}</div>`:empty('✓','No completed exchanges yet','Your completed exchange history and reviews will build here.','Find a match','matches');$$('[data-exchange]',host).forEach(b=>b.onclick=()=>navigate('exchange',b.dataset.exchange))}else{host.innerHTML=active.length?`<div class="bc-exchange-list">${active.map(exchangeCard).join('')}</div>`:empty('🤝','No active exchanges','Accept a reciprocal proposal and your entire meetup → swap → return journey will live here.','See matches','matches');$$('[data-exchange]',host).forEach(b=>b.onclick=()=>navigate('exchange',b.dataset.exchange))}bindCommon(host)}
function requestCard(r){const incoming=r.responder_id===S.user.id,other=incoming?r.requester_id:r.responder_id,p=S.profiles[other]||{},offer=itemName(r.offered_item_id),want=itemName(r.requested_item_id),focused=routeId()===r.id;return `<article class="bc-card bc-pad bc-request" data-request-card="${attr(r.id)}" ${focused?'style="outline:3px solid #f3c623;outline-offset:2px"':''}><div><div>${pill(incoming?'Incoming proposal':'Proposal sent',incoming?'gold':'blue')}</div><h3>${esc(offer)} ⇄ ${esc(want)}</h3><div class="bc-ex-meta">With ${esc(p.display_name||'Collector')} · ${r.duration_days} days · ${fmtDateTime(r.created_at)}</div>${r.message?`<div class="bc-notice" style="margin-top:10px">${esc(r.message)}</div>`:''}</div><div class="bc-request-actions">${incoming?`<button class="bc-btn primary" data-request-action="accept" data-request-id="${r.id}">Accept</button><button class="bc-btn" data-request-action="decline" data-request-id="${r.id}">Decline</button>`:`<button class="bc-btn danger" data-request-action="cancel" data-request-id="${r.id}">Cancel proposal</button>`}</div></article>`}
async function respondRequest(id,action){
  const btn=$(`[data-request-id="${CSS.escape(id)}"][data-request-action="${action}"]`);
  const original=btn?.textContent||'';
  if(btn){btn.disabled=true;btn.textContent=action==='accept'?'Accepting…':'Working…'}
  const {data,error}=await settledTimeout(db.rpc('respond_exchange_request',{p_request_id:id,p_action:action}),15000);
  if(error){
    fail(error);
    if(btn){btn.disabled=false;btn.textContent=original}
    await refreshCore();
    renderExchangeBody();
    return;
  }
  if(data?.ok===false){
    fail(new Error(data.message||'This proposal can no longer be accepted.'));
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
    track('exchange_request_accepted',{request_id:id});
    if(data?.exchange_id)return navigate('exchange',data.exchange_id);
  }
  renderExchangeBody();
}
function exchangeStageLabel(e){if(e.state==='disputed')return 'Issue reported';if(e.state==='swap_active')return e.return_due_at&&new Date(e.return_due_at)<new Date()?'Return overdue':'Temporary swap active';if(e.state==='completed')return 'Completed';if(e.state==='accepted')return 'Plan meetup';return 'In progress'}
function exchangeCard(e){const p=otherProfile(e),a=itemName(e.item_a),b=itemName(e.item_b),stage=stageForExchange(e);return `<article class="bc-card bc-ex-card"><div class="bc-ex-top"><div><span class="bc-pill ${e.state==='disputed'?'red':e.state==='completed'?'green':e.state==='swap_active'?'blue':'gold'}">${esc(exchangeStageLabel(e))}</span><h3>${esc(a)} ⇄ ${esc(b)}</h3><div class="bc-ex-meta">With ${esc(p.display_name||'Collector')} · ${e.duration_days} days${e.return_due_at?` · return ${fmtDate(e.return_due_at)}`:''}</div></div><button class="bc-btn primary" data-exchange="${e.id}">${e.state==='completed'?'View & review':'Continue →'}</button></div><div class="bc-ex-progress">${[1,2,3,4,5].map(n=>`<i class="bc-ex-step ${n<stage?'done':n===stage?'current':''}"></i>`).join('')}</div><div class="bc-small">Request → Meetup → Handoff → Experience → Return</div></article>`}

async function renderExchangeDetail(id,token){
  if(!S.user){showAuth();return navigate('home')}if(!id)return navigate('exchanges');page(loading('Opening exchange…'));const {data:e,error}=await db.from('exchanges').select('*').eq('id',id).maybeSingle();if(error||!e)return page(empty('⚠️','Exchange unavailable',error?.message||'This exchange could not be found.','Back to exchanges','exchanges'));if(![e.user_a,e.user_b].includes(S.user.id))return navigate('exchanges');await hydrateExchangeItems([e]);const oid=otherId(e);if(!S.profiles[oid]){const {data:p}=await db.from('public_profiles').select('*').eq('id',oid).maybeSingle();if(p)S.profiles[oid]=p}const [meet,ret,msg,rv]=await Promise.all([db.from('exchange_meetups').select('*').eq('exchange_id',id).maybeSingle(),db.from('exchange_returns').select('*').eq('exchange_id',id).maybeSingle(),db.from('messages').select('*').eq('exchange_id',id).order('created_at',{ascending:true}),db.from('reviews').select('*').eq('exchange_id',id)]);if(token!==S.renderToken)return;renderExchangeDetailLoaded(e,meet.data||null,ret.data||null,msg.data||[],rv.data||[])
}
function exchangeTimeline(e,meet,ret){let current=e.state==='completed'?6:e.state==='swap_active'?(ret?5:4):e.state==='accepted'?(meet?3:2):e.state==='disputed'?5:2;const labels=['Accepted','Plan meetup','Meet & inspect','Experience','Return','Complete'];return `<div class="bc-timeline">${labels.map((l,i)=>`<div class="${i+1<current?'done':i+1===current?'current':''}"><i></i>${l}</div>`).join('')}</div>`}
function renderExchangeDetailLoaded(e,meet,ret,messages,reviews){const p=otherProfile(e),mineA=e.user_a===S.user.id,myItem=mineA?e.item_a:e.item_b,theirItem=mineA?e.item_b:e.item_a,myName=itemName(myItem),theirName=itemName(theirItem),messagingClosed=['completed','cancelled'].includes(e.state);page(`<button class="bc-back" data-action="exchanges">← Back to Exchanges</button><section class="bc-exchange-hero"><div class="bc-exchange-hero-top"><div><span class="bc-pill gold">With ${esc(p.display_name||'Collector')}${p.city?' · '+esc(p.city):''}</span><h1>${esc(myName)} ⇄ ${esc(theirName)}</h1><p>${e.duration_days}-day local temporary exchange · no shipping or advance payment required</p></div></div>${exchangeTimeline(e,meet,ret)}</section><div class="bc-exchange-layout"><div><section class="bc-card bc-flow-card" id="bc-flow">${flowMarkup(e,meet,ret)}</section>${e.state==='completed'?reviewMarkup(e,p,reviews):''}</div><aside><section class="bc-card bc-flow-card"><h2>Exchange conversation</h2><div class="bc-chat" id="bc-chat">${messages.length?messages.map(m=>`<div class="bc-msg ${m.sender_id===S.user.id?'mine':''}">${esc(m.body)}<small>${fmtDateTime(m.created_at)}</small></div>`).join(''):'<div class="bc-small">No messages yet. Use this conversation for meetup coordination and exchange details.</div>'}</div>${messagingClosed?'':`<form class="bc-chat-form" id="bc-chat-form"><input name="message" maxlength="4000" placeholder="Message ${attr((p.display_name||'collector').split(' ')[0])}" required><button class="bc-btn primary">Send</button></form>`}</section><section class="bc-card bc-flow-card" style="margin-top:14px"><h2>Trust & safety</h2><div class="bc-notice warn"><b>Meet in public.</b><br>Inspect the actual LEGO sets before either collector confirms handoff. BrickCircle’s current exchange model does not require shipping or advance payment.</div>${e.state==='accepted'?'<button class="bc-btn danger" style="margin-top:12px" data-cancel-exchange>Cancel before handoff</button>':''}</section></aside></div>`);bindCommon(app());bindExchangeDetail(e,meet,ret,p,messages,reviews)}
function participantValue(obj,e,key){if(!obj)return false;return obj[key+(S.user.id===e.user_a?'_a':'_b')]}
function otherValue(obj,e,key){if(!obj)return false;return obj[key+(S.user.id===e.user_a?'_b':'_a')]}
function flowMarkup(e,meet,ret){
  if(e.state==='disputed')return `<h2>Exchange paused</h2><div class="bc-notice bad"><b>An issue has been reported.</b><br>This exchange is paused. Keep communication inside BrickCircle while the issue is resolved.<br>Need help? Email <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>.</div>`;
  if(e.state==='completed')return `<h2>Exchange complete ✓</h2><div class="bc-notice good">Both LEGO sets were returned, inspected and confirmed. This exchange now contributes to each collector’s reputation.</div>`;
  if(e.state==='accepted')return `<h2>${meet?'Meet & inspect':'Plan the first meetup'}</h2>${meet?meetupMarkup(e,meet):`<p class="bc-muted">Choose a public, well-lit venue. The meetup is shared with both collectors.</p><button class="bc-btn primary" data-schedule="outbound">Schedule meetup</button>`}`;
  if(e.state==='swap_active')return `<h2>Temporary swap active</h2>${e.return_due_at?`<div class="bc-due ${new Date(e.return_due_at)<new Date()?'overdue':''}"><b>${new Date(e.return_due_at)<new Date()?'⚠ Return overdue':'Return due'}</b><br>${fmtDateTime(e.return_due_at)}</div>`:''}<p class="bc-muted">Enjoy the agreed exchange period. When you are ready to return the sets, arrange the return meetup here.</p>${ret?returnMarkup(e,ret):`<button class="bc-btn primary" data-schedule="return">Schedule return meetup</button>`}`;
  return `<h2>Exchange in progress</h2><p class="bc-muted">Open this exchange again after its next status update.</p>`
}
function meetupMarkup(e,m){const bothSafe=m.safety_ack_a&&m.safety_ack_b,bothArrived=m.arrived_a&&m.arrived_b,bothInspected=m.inspected_a&&m.inspected_b;const rows=[['safety_ack','Safe Meetup rules',true,'Confirm that you will meet publicly and inspect sets before handoff.'],['arrived','I have arrived',bothSafe,'Waiting for both collectors to accept the safety rules.'],['inspected','I inspected the other set',bothArrived,'Waiting for both collectors to confirm arrival.'],['confirm','I am satisfied — start the swap',bothInspected,'Waiting for both collectors to inspect the sets.']];return `<div class="bc-notice"><b>📍 ${esc(m.venue_name||'Public venue')}</b>${m.venue_area?' · '+esc(m.venue_area):''}<br>${fmtDateTime(m.meetup_at)} <button class="bc-btn ghost" style="min-height:30px;padding:2px 6px" data-schedule="outbound">Reschedule</button></div>${rows.map(([action,label,open,why])=>flowStep(e,m,action,label,open,why)).join('')}<button class="bc-btn danger" style="margin-top:10px" data-report="outbound">Report an issue</button>`}
function returnMarkup(e,r){const bothSafe=r.safety_ack_a&&r.safety_ack_b,bothArrived=r.arrived_a&&r.arrived_b,bothInspected=r.inspected_a&&r.inspected_b;const rows=[['safety_ack','Safe Return Meetup rules',true,'Confirm the public return meetup rules.'],['arrived','I have arrived for the return',bothSafe,'Waiting for both collectors to accept the return safety rules.'],['inspected','I inspected my returned LEGO set',bothArrived,'Waiting for both collectors to confirm arrival.'],['confirm','My LEGO set was returned satisfactorily',bothInspected,'Waiting for both returned sets to be inspected.']];return `<div class="bc-notice"><b>📍 ${esc(r.venue_name||'Public venue')}</b>${r.venue_area?' · '+esc(r.venue_area):''}<br>${fmtDateTime(r.meetup_at)} <button class="bc-btn ghost" style="min-height:30px;padding:2px 6px" data-schedule="return">Reschedule</button></div>${rows.map(([action,label,open,why])=>flowStep(e,r,action,label,open,why)).join('')}<button class="bc-btn danger" style="margin-top:10px" data-report="return">Report return issue</button>${e.return_due_at&&new Date(e.return_due_at)<new Date()?'<button class="bc-btn danger" style="margin-top:10px;margin-left:7px" data-overdue>Report overdue return</button>':''}`}
function flowStep(e,obj,action,label,open,why){const key=action==='confirm'?'confirmed':action,yes=participantValue(obj,e,key),them=otherValue(obj,e,key);return `<div class="bc-flow-step ${yes?'done':!open?'locked':''}"><div class="bc-flow-step-head"><b>${yes?'✓ ':''}${esc(label)}</b><span class="bc-small">Other collector: ${them?'✓':'waiting'}</span></div>${!yes&&open?`<button class="bc-btn" style="margin-top:8px" data-flow-action="${action}">Confirm</button>`:''}${!yes&&!open?`<small>🔒 ${esc(why)}</small>`:''}</div>`}
function reviewMarkup(e,p,reviews){const mine=reviews.find(r=>r.reviewer_id===S.user.id);return `<section class="bc-card bc-flow-card" style="margin-top:14px"><h2>Collector review</h2>${mine?`<div class="bc-notice good">✓ You reviewed ${esc(p.display_name||'this collector')} with ${mine.rating}/5 stars.</div>`:`<p class="bc-muted">How was the full exchange and return experience with ${esc(p.display_name||'this collector')}?</p><button class="bc-btn primary" data-review>Leave review</button>`}</section>`}
function bindExchangeDetail(e,meet,ret,p,messages,reviews){
  $$('[data-schedule]',app()).forEach(b=>b.onclick=()=>scheduleMeetup(e,b.dataset.schedule,b.dataset.schedule==='return'?ret:meet));$$('[data-flow-action]',app()).forEach(b=>b.onclick=()=>doFlowAction(e,b.dataset.flowAction,e.state==='swap_active'?'return':'outbound'));$$('[data-report]',app()).forEach(b=>b.onclick=()=>reportIssue(e,b.dataset.report));$('[data-overdue]',app())?.addEventListener('click',()=>reportOverdue(e));$('[data-cancel-exchange]',app())?.addEventListener('click',()=>cancelExchange(e));$('[data-review]',app())?.addEventListener('click',()=>showReview(e,p));const f=$('#bc-chat-form');if(f)f.onsubmit=async ev=>{ev.preventDefault();const fd=new FormData(f),text=String(fd.get('message')||'').trim();if(!text)return;const btn=$('button',f);btn.disabled=true;const {error}=await db.from('messages').insert({exchange_id:e.id,sender_id:S.user.id,recipient_id:otherId(e),body:text});if(error){fail(error);btn.disabled=false;return}f.reset();await renderExchangeDetail(e.id,S.renderToken)};
}
function scheduleMeetup(e,type,current){const title=type==='return'?'Schedule return meetup':'Plan meetup';const o=modal(`<div class="bc-modal-head"><div><h2>${title}</h2><p class="bc-muted">Choose a public, well-lit venue. Both collectors see the same meetup details.</p></div><button class="bc-close" data-close>×</button></div><form class="bc-form" id="bc-meet-form"><div class="bc-field"><label>Public venue</label><input class="bc-input" name="venue" value="${attr(current?.venue_name||'')}" placeholder="Café, mall, hobby store…" required></div><div class="bc-field"><label>Area / neighbourhood</label><input class="bc-input" name="area" value="${attr(current?.venue_area||'')}" placeholder="Optional"></div><div class="bc-field"><label>Date & time</label><input class="bc-input" name="when" type="datetime-local" required></div><div class="bc-notice warn"><b>Safety first</b><br>Do not exchange until both collectors are present and have inspected the physical sets.</div><div class="bc-form-actions"><button type="button" class="bc-btn" data-close>Cancel</button><button type="submit" class="bc-btn primary">Share meetup</button></div></form>`);$$('[data-close]',o).forEach(b=>b.onclick=closeOverlay);$('#bc-meet-form',o).onsubmit=async ev=>{ev.preventDefault();const f=new FormData(ev.currentTarget),d=new Date(String(f.get('when')));if(isNaN(d)||d<=new Date()){toast('Choose a future date and time.');return}const fn=type==='return'?'setup_return_meetup':'setup_meetup',args={p_exchange_id:e.id,p_venue_name:String(f.get('venue')).trim(),p_venue_area:String(f.get('area')||'').trim()||null,p_meetup_at:d.toISOString()};const btn=$('button[type="submit"]',ev.currentTarget);btn.disabled=true;btn.textContent='Saving…';const {error}=await db.rpc(fn,args);if(error){fail(error);btn.disabled=false;btn.textContent='Share meetup';return}closeOverlay();toast('Meetup shared with both collectors.');await renderExchangeDetail(e.id,S.renderToken)}}
async function doFlowAction(e,action,type){if(action==='confirm'&&!confirm(type==='return'?'Confirm only after your own LEGO set is back and you have inspected it. Continue?':'Confirm only after you personally inspected the other LEGO set and are satisfied with the handoff. Continue?'))return;const fn=type==='return'?'return_action':'meetup_action';const {error}=await db.rpc(fn,{p_exchange_id:e.id,p_action:action,p_note:null});if(error)return fail(error);await refreshCore();await renderExchangeDetail(e.id,S.renderToken);if(action==='confirm')toast(type==='return'?'Return confirmation saved.':'Handoff confirmation saved.')}
async function reportIssue(e,type){const note=prompt(type==='return'?'Describe the return problem (damage, missing pieces, wrong set, no-show, etc.).':'Describe the issue. Do not complete the handoff if the set is not as described.');if(!note)return;const fn=type==='return'?'return_action':'meetup_action';const {error}=await db.rpc(fn,{p_exchange_id:e.id,p_action:'issue',p_note:note});if(error)return fail(error);await refreshCore();await renderExchangeDetail(e.id,S.renderToken);toast('Issue recorded. The exchange is paused.')}
async function reportOverdue(e){const note=prompt('Briefly describe the overdue return / no-show problem.');if(note===null)return;const {error}=await db.rpc('report_overdue_return_issue',{p_exchange_id:e.id,p_note:note||'Return overdue / no-show'});if(error)return fail(error);await refreshCore();await renderExchangeDetail(e.id,S.renderToken)}
async function cancelExchange(e){if(!confirm('Cancel this exchange before physical handoff? Both sets will become available again.'))return;const reason=prompt('Optional reason for cancellation:','')||null;const {error}=await db.rpc('cancel_in_person_exchange',{p_exchange_id:e.id,p_reason:reason});if(error)return fail(error);await refreshCore();navigate('exchanges');toast('Exchange cancelled and sets released.')}
function showReview(e,p){const o=modal(`<div class="bc-modal-head"><div><h2>Review ${esc(p.display_name||'collector')}</h2><p class="bc-muted">Rate the full experience: communication, meetup, set accuracy and return.</p></div><button class="bc-close" data-close>×</button></div><form class="bc-form" id="bc-review-form"><div class="bc-field"><label>Rating</label><select class="bc-select" name="rating"><option value="5">★★★★★ · Excellent</option><option value="4">★★★★☆ · Good</option><option value="3">★★★☆☆ · Okay</option><option value="2">★★☆☆☆ · Poor</option><option value="1">★☆☆☆☆ · Very poor</option></select></div><div class="bc-field"><label>Comment</label><textarea class="bc-textarea" name="comment" maxlength="1000" placeholder="What should another collector know?"></textarea></div><button class="bc-btn primary">Submit review</button></form>`);$$('[data-close]',o).forEach(b=>b.onclick=closeOverlay);$('#bc-review-form',o).onsubmit=async ev=>{ev.preventDefault();const f=new FormData(ev.currentTarget),btn=$('button',ev.currentTarget);btn.disabled=true;const {error}=await db.rpc('submit_exchange_review',{p_exchange_id:e.id,p_rating:Number(f.get('rating')),p_comment:String(f.get('comment')||'')});if(error){fail(error);btn.disabled=false;return}closeOverlay();toast('Review submitted. Thank you!');await refreshCore();await renderExchangeDetail(e.id,S.renderToken)}}

async function renderProfile(token){
  if(!S.user){showAuth();return navigate('home')}const p=S.profile||{},completed=completedExchanges().length,reviewCount=Number(p.review_count||0),rating=reviewCount?Number(p.rating||0).toFixed(1):null,memberBadge=membershipBadge(),cityMembership=membershipCityCopy();page(`<div class="bc-page-head"><div><h1>Profile</h1><p>Your collector identity, local BrickCircle and account controls.</p></div><div class="bc-head-actions"><button class="bc-btn" data-edit-profile>Edit profile</button><button class="bc-btn danger" data-signout>Sign out</button></div></div><section class="bc-profile-hero"><div class="bc-profile-avatar" id="bc-profile-avatar">${avatar(p)}</div><div><h1>${esc(p.display_name||'Collector')}</h1><p>📍 ${esc(p.city||'Choose city')}${p.country?' · '+esc(p.country):''}</p><div class="bc-profile-badges">${memberBadge?`<span class="bc-pill">${esc(memberBadge)}</span>`:''}<span class="bc-pill">🧱 Member since ${new Date(p.member_since||p.created_at||S.user.created_at||Date.now()).getFullYear()}</span>${p.identity_verified?'<span class="bc-pill green">✓ Identity verified</span>':''}</div><div style="margin-top:12px"><label class="bc-btn" style="display:inline-flex;align-items:center">Upload photo<input id="bc-avatar-input" type="file" accept="image/jpeg,image/png,image/webp" hidden></label></div>${cityMembership?`<div class="bc-membership-city">${cityMembership}</div>`:''}</div></section><div class="bc-profile-grid"><section class="bc-card bc-profile-card"><h2>Collector reputation</h2>${reviewCount?`<div class="bc-rating">${rating} ★</div><div class="bc-small">${reviewCount} review${reviewCount===1?'':'s'} · ${completed} completed exchange${completed===1?'':'s'}</div>`:`<div class="bc-rating" style="font-size:25px">New collector</div><div class="bc-small">No reviews yet. Your first completed exchange will start your reputation.</div>`}</section><section class="bc-card bc-profile-card"><h2>Local exchange</h2><div class="bc-row"><small>Home city</small><b>${esc(p.city||'Not set')}</b></div><div class="bc-row"><small>Current model</small><b>Local · in person</b></div><div class="bc-row"><small>Exchangeable sets</small><b>${S.collection.filter(x=>x.available_for_exchange).length}</b></div></section><section class="bc-card bc-profile-card"><h2>Account</h2><div class="bc-row"><small>Email</small><b>${esc(S.user.email||'')}</b></div><div class="bc-row"><small>Collection</small><b>${S.collection.length} sets</b></div><div class="bc-row"><small>Wishlist</small><b>${S.wishlist.length} sets</b></div><div class="bc-row"><small>Support</small><b><a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a></b></div></section></div><section class="bc-card bc-pad" style="margin-top:14px"><h2 style="margin-top:0">Your BrickCircle</h2><p class="bc-muted">Invite collectors in your city. Marketplace value grows fastest when nearby AFOLs join together.</p><button class="bc-btn primary" data-invite>Invite an AFOL</button>${S.installPrompt?'<button class="bc-btn" style="margin-left:7px" data-install>Install BrickCircle</button>':''}</section>`);$('[data-edit-profile]',app()).onclick=editProfile;$('[data-signout]',app()).onclick=signOut;$('[data-invite]',app()).onclick=shareInvite;$('[data-install]',app())?.addEventListener('click',installPWA);$('#bc-avatar-input',app()).onchange=e=>uploadAvatar(e.target.files?.[0]);
}
function editProfile(){const p=S.profile||{};const o=modal(`<div class="bc-modal-head"><div><h2>Edit profile</h2><p class="bc-muted">Your city determines where BrickCircle searches for local reciprocal matches.</p></div><button class="bc-close" data-close>×</button></div><form class="bc-form" id="bc-profile-form"><div class="bc-field"><label>Display name</label><input class="bc-input" name="name" value="${attr(p.display_name||'')}" required></div><div class="bc-field"><label>Country</label><select class="bc-select" name="country" required>${locationOptions(p.country||'')}</select></div><div class="bc-field"><label>City</label><select class="bc-select" name="city" required>${cityOptions(p.country||'',p.city||'')}</select></div><div class="bc-field"><label>About your LEGO interests</label><textarea class="bc-textarea" name="bio">${esc(p.bio||'')}</textarea></div><div class="bc-form-actions"><button type="button" class="bc-btn" data-close>Cancel</button><button class="bc-btn primary">Save profile</button></div></form>`);$$('[data-close]',o).forEach(b=>b.onclick=closeOverlay);const f=$('#bc-profile-form',o),country=$('[name="country"]',f),city=$('[name="city"]',f);country.onchange=()=>{city.innerHTML=cityOptions(country.value);city.disabled=!country.value};f.onsubmit=async ev=>{ev.preventDefault();const fd=new FormData(f),patch={display_name:String(fd.get('name')).trim(),country:String(fd.get('country')).trim(),city:String(fd.get('city')).trim(),bio:String(fd.get('bio')||'').trim(),updated_at:new Date().toISOString()};const {error}=await db.from('profiles').update(patch).eq('id',S.user.id);if(error)return fail(error);closeOverlay();await refreshCore();await renderRoute();toast('Profile updated.')}}
async function uploadAvatar(file){if(!file)return;if(!['image/jpeg','image/png','image/webp'].includes(file.type))return toast('Choose a JPG, PNG or WebP image.');if(file.size>5*1024*1024)return toast('Profile photo must be 5 MB or smaller.');toast('Uploading photo…');const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[file.type],path=`${S.user.id}/profile-${Date.now()}.${ext}`;const {data,error}=await db.storage.from('avatars').upload(path,file,{contentType:file.type,cacheControl:'3600',upsert:false});if(error)return fail(error);const {error:pe}=await db.from('profiles').update({avatar_url:data.path,updated_at:new Date().toISOString()}).eq('id',S.user.id);if(pe)return fail(pe);await refreshCore();shell();await renderRoute();toast('Profile photo updated.')}
async function signOut(){stopNotificationRealtime();clearNotificationPresentation();await window.bcWebPush?.signOut(S.user);try{await db.auth.signOut({scope:'local'})}catch(_){try{await db.auth.signOut()}catch(__){}}try{Object.keys(localStorage).filter(k=>/^bc_(?!pending_referral)/.test(k)).forEach(k=>localStorage.removeItem(k))}catch(_){ }S.user=null;closeOverlay();navigate('home');await refreshRoute();toast('Signed out.')}

async function shareInvite(){if(!S.user){showAuth();return}try{const {data,error}=await db.rpc('bc_my_referral_code');if(error)throw error;const url=`${location.origin}/v2.html?ref=${encodeURIComponent(String(data||''))}`,text='Join me on BrickCircle — a local LEGO set exchange community for adult collectors. BrickCircle is free during beta.';if(navigator.share)await navigator.share({title:'Join BrickCircle',text,url});else if(navigator.clipboard){await navigator.clipboard.writeText(url);toast('Invite link copied.')}else prompt('Copy your BrickCircle invite link',url);track('beta_invite_shared')}catch(e){if(e?.name!=='AbortError')fail(e,'Could not create invite link.')}}
function showNotifications(){
  if(!S.user)return showAuth();
  const unread=S.notifications.filter(notification=>!notification.read_at).length;
  const o=drawer(`<div class="bc-drawer-head"><div><h2>Notifications</h2><div class="bc-small">${unread?`${unread} unread`:'You’re caught up'}</div></div><button class="bc-close" data-close>×</button></div>${betaPWAEnabled()?'<button class="bc-btn" data-enable-push style="margin-bottom:10px">Enable system notifications</button>':''}${unread?'<button class="bc-btn" data-read-all style="margin:0 0 10px 8px">Mark all read</button>':''}<div>${S.notifications.length?S.notifications.map(notification=>`<button class="bc-notification ${notification.read_at?'':'unread'}" type="button" data-note="${attr(notification.id)}" style="display:block;width:100%;text-align:left;background:${notification.read_at?'#fff':'#fff9df'}"><b>${esc(notification.title||String(notification.kind||'Update').replace(/_/g,' '))}</b><div>${esc(notification.body||'')}</div><small>${fmtDateTime(notification.created_at)}${isProposalNotification(notification)?' · View proposal':isReciprocalMatchNotification(notification)?' · View match':''}</small></button>`).join(''):'<div class="bc-empty"><div class="bc-empty-icon">🔔</div><h3>No notifications yet</h3></div>'}</div>`);
  $('[data-close]',o).onclick=()=>o.closest('.bc-drawer-overlay').remove();
  $('[data-enable-push]',o)?.addEventListener('click',()=>{o.closest('.bc-drawer-overlay').remove();window.bcWebPush?.open(S.user)});
  $('[data-read-all]',o)?.addEventListener('click',async()=>{const {error}=await db.from('notifications').update({read_at:new Date().toISOString()}).eq('user_id',S.user.id).is('read_at',null);if(error)return fail(error);await refreshCore();shell();await renderRoute();showNotifications()});
  $$('[data-note]',o).forEach(element=>element.onclick=()=>openNotification(S.notifications.find(notification=>notification.id===element.dataset.note)));
}
function showInbox(){if(!S.user)return showAuth();const groups={};S.messages.forEach(m=>{const other=m.sender_id===S.user.id?m.recipient_id:m.sender_id,key=m.exchange_id||`person:${other}`;(groups[key]??=[]).push(m)});const entries=Object.entries(groups);const o=drawer(`<div class="bc-drawer-head"><div><h2>Inbox</h2><div class="bc-small">Exchange conversations stay attached to their journey.</div></div><button class="bc-close" data-close>×</button></div>${entries.length?entries.map(([key,ms])=>{const last=ms[0],other=last.sender_id===S.user.id?last.recipient_id:last.sender_id,p=S.profiles[other]||{},latest=ms.slice().sort((a,b)=>new Date(b.created_at)-new Date(a.created_at))[0];return `<button class="bc-card bc-pad" style="width:100%;text-align:left;margin-bottom:8px" data-chat-key="${attr(key)}" data-chat-person="${attr(other)}" data-chat-exchange="${attr(last.exchange_id||'')}"><b>${esc(p.display_name||'Collector')}</b><div class="bc-small">${esc((latest.body||'').slice(0,90))}</div><div class="bc-small">${fmtDateTime(latest.created_at)}</div></button>`}).join(''):empty('💬','No conversations yet','Messages with matched collectors and exchange partners will appear here.')}`);$('[data-close]',o).onclick=()=>o.closest('.bc-drawer-overlay').remove();$$('[data-chat-key]',o).forEach(b=>b.onclick=()=>{const ex=b.dataset.chatExchange;o.closest('.bc-drawer-overlay').remove();if(ex)navigate('exchange',ex);else quickMessage(b.dataset.chatPerson)})}
function quickMessage(person){if(!S.user)return showAuth();const p=S.profiles[person]||{};const o=modal(`<div class="bc-modal-head"><div><h2>Message ${esc(p.display_name||'collector')}</h2></div><button class="bc-close" data-close>×</button></div><form class="bc-form" id="bc-quick-message"><textarea class="bc-textarea" name="message" maxlength="4000" required placeholder="Write your message"></textarea><button class="bc-btn primary">Send message</button></form>`);$('[data-close]',o).onclick=closeOverlay;$('#bc-quick-message',o).onsubmit=async ev=>{ev.preventDefault();const f=new FormData(ev.currentTarget),{error}=await db.from('messages').insert({sender_id:S.user.id,recipient_id:person,body:String(f.get('message'))});if(error)return fail(error);closeOverlay();toast('Message sent.');await refreshCore()}}

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
  captureReferral();setupPWA();shell();page(loading('Opening BrickCircle…'));if(parseJoinIntent()){showAuth();clearQueryParam('join')}providerSettings();const sessionResult=await settledTimeout(db.auth.getSession(),8000);S.user=sessionResult.data?.session?.user||S.user||null;if(sessionResult.error)S.refreshWarning='Your session is taking longer than expected. BrickCircle will keep trying.';if(S.user)await refreshCore();S.booted=true;shell();await renderRoute();if(S.user){await claimReferralAndProvider();await refreshCore();shell();await renderRoute();startNotificationRealtime();const onboardingShown=await onboardingIfNeeded();if(!onboardingShown&&!showNextUnreadNotificationNotice())showLoginMatchNotice()}if(['oauth','code','error','error_code','error_description'].some(name=>new URLSearchParams(location.search).has(name)))cleanOAuthQuery();if(pendingAuthChange){const [event,nextSession]=pendingAuthChange;pendingAuthChange=null;handleAuthChange(event,nextSession)}
}
function handleAuthChange(event,session){
  if(!S.booted){pendingAuthChange=[event,session];return}
  if(event==='SIGNED_OUT'&&isResumeWindow()){setTimeout(async()=>{const recovered=await recoverSession();if(recovered)handleAuthChange('TOKEN_REFRESHED',recovered);else handleAuthChange('CONFIRMED_SIGNED_OUT',null)},350);return}
  const prev=S.user?.id;
  if(event==='SIGNED_OUT'||event==='CONFIRMED_SIGNED_OUT'){stopNotificationRealtime();clearNotificationPresentation();clearProtectedState()}
  S.user=session?.user||null;
  setTimeout(async()=>{if(event==='PASSWORD_RECOVERY'&&S.user){showPasswordRecovery()}else if((event==='SIGNED_IN'||event==='TOKEN_REFRESHED')&&S.user){if(event==='SIGNED_IN')await claimReferralAndProvider();await refreshCore();shell();await renderRoute();startNotificationRealtime();const onboardingShown=await onboardingIfNeeded();if(event==='SIGNED_IN'&&!onboardingShown&&!showNextUnreadNotificationNotice())showLoginMatchNotice();if(event==='SIGNED_IN'&&!prev)toast('Welcome to BrickCircle.')}else if(event==='SIGNED_OUT'||event==='CONFIRMED_SIGNED_OUT'){stopNotificationRealtime();window.BC_PROPOSAL_NOTICE_ACTIVE=false;await refreshCore();shell();await renderRoute()}},0)
}
db.auth.onAuthStateChange(handleAuthChange);
window.addEventListener('hashchange',()=>{if(S.booted)renderRoute()});
document.addEventListener('visibilitychange',()=>{if(document.hidden){lastHiddenAt=Date.now();rememberRoute();return}lastVisibleAt=Date.now();validateResume().catch(()=>{});reconcileNotifications().catch(()=>{})});
window.addEventListener('pagehide',()=>{lastHiddenAt=Date.now();rememberRoute()});
window.addEventListener('pageshow',event=>{lastVisibleAt=Date.now();if(event.persisted)validateResume().catch(()=>{})});
window.addEventListener('focus',()=>{lastVisibleAt=Date.now();validateResume().catch(()=>{})});
window.addEventListener('online',()=>reconcileNotifications().catch(()=>{}));
window.bcNav=navigate;window.bcAuth=showAuth;window.bcClose=closeOverlay;window.bcV3Refresh=refreshRoute;window.bcPushToast=toast;window.bcApplyA11y=()=>applyA11y(document);
boot().catch(e=>{console.error('BrickCircle V3 boot failed',e);shell();page(empty('⚠️','BrickCircle could not start','Please refresh the page. If this continues, try again in a moment.'))});
})();
