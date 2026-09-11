(()=>{
'use strict';
const SUPABASE_URL='https://nsxtromjdpdscknadxez.supabase.co';
const SUPABASE_KEY='sb_publishable_JJhVbgjGblHrnKuPOsJkxQ_zRoQNlIL';
const OWNER_USER_ID='388ee0a7-2b93-4505-a70c-f4766d7ad50a';
const db=window.supabase?.createClient?.(SUPABASE_URL,SUPABASE_KEY);
const $=s=>document.querySelector(s);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
const fmt=x=>x?new Date(x).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'}):'—';
let payload=null, selectedId='';

function status(message,error=false){const el=$('#status');el.textContent=message;el.classList.toggle('error',error)}
function metric(label,value){return `<article class="metric"><span>${esc(label)}</span><b>${Number(value||0).toLocaleString()}</b></article>`}
function userSetNumbers(u){return [...(u.collection||[]),...(u.wishlist||[])].map(x=>String(x.set_number||'')).join(' ')}
function userSearchText(u){return [u.display_name,u.email,u.city,u.country,userSetNumbers(u)].join(' ').toLowerCase()}
function imageSetNumber(n){const s=String(n||'');return /-\d+$/.test(s)?s:`${s}-1`}
function setName(n){return payload?.sets?.[String(n)]?.name||''}
function setThumb(n,name=''){
  const number=imageSetNumber(n),src=`https://images.brickset.com/sets/images/${encodeURIComponent(number)}.jpg`;
  return `<img class="set-thumb" src="${src}" alt="${esc(name||`LEGO set ${n}`)}" loading="lazy" decoding="async" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span class="set-thumb-fallback" hidden aria-hidden="true">🧱</span>`;
}

async function accessToken(){
  const {data:{session}}=await db.auth.getSession();
  if(!session?.access_token)throw new Error('Sign in to BrickCircle first, then reopen this page.');
  const {data:{user},error}=await db.auth.getUser();
  if(error||!user)throw new Error('Your session is invalid or expired. Please sign in again.');
  if(user.id!==OWNER_USER_ID)throw new Error('This admin console is restricted to the BrickCircle owner account.');
  return session.access_token;
}
async function load(){
  if(!db){status('Supabase could not start.',true);return}
  $('#refresh').disabled=true;status('Checking owner administrator access…');
  try{
    const token=await accessToken();
    const res=await fetch(`${SUPABASE_URL}/functions/v1/admin-dashboard`,{headers:{Authorization:`Bearer ${token}`,apikey:SUPABASE_KEY}});
    const body=await res.json().catch(()=>({}));
    if(!res.ok)throw new Error(body?.error||`Dashboard request failed (${res.status}).`);
    payload=body;render();status(`Owner administrator access confirmed · refreshed ${new Date().toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}`);
  }catch(e){payload=null;$('#dashboard').classList.add('hidden');status(e?.message||'Could not load admin dashboard.',true)}
  finally{$('#refresh').disabled=false}
}
function render(){
  if(!payload)return;
  $('#dashboard').classList.remove('hidden');
  const s=payload.summary||{};
  $('#metrics').innerHTML=[
    metric('Registered users',s.users),metric('Joined last 7 days',s.new_7d),metric('Collection sets',s.collection_items),metric('Wishlist items',s.wishlist_items),metric('Exchangeable sets',s.exchangeable_items),metric('Open requests',s.open_requests),metric('Active exchanges',s.active_exchanges),metric('Completed exchanges',s.completed_exchanges),metric('Users with a collection',s.users_with_collection),metric('Users with a wishlist',s.users_with_wishlist)
  ].join('');
  renderUsers();
  if(selectedId)renderDetail(selectedId);
}
function renderUsers(){
  const q=$('#search').value.trim().toLowerCase();
  const rows=(payload.users||[]).filter(u=>!q||userSearchText(u).includes(q));
  $('#users').innerHTML=rows.length?rows.map(u=>`<tr>
    <td><button class="user-btn" type="button" data-user="${esc(u.id)}">${esc(u.display_name||'Unnamed member')}</button><div class="muted">${esc(u.email||'')}</div></td>
    <td>${fmt(u.created_at)}</td><td>${u.adult_confirmed_at?`<span class="pill good" title="Confirmed ${esc(fmt(u.adult_confirmed_at))}">18+ confirmed</span>`:'<span class="pill">Pending</span>'}</td><td>${esc([u.city,u.country].filter(Boolean).join(', ')||'—')}</td>
    <td>${u.collection?.length||0}</td><td>${u.wishlist?.length||0}</td><td>${(u.collection||[]).filter(x=>x.available_for_exchange).length}</td>
    <td>${u.request_count||0}</td><td>${u.exchange_count||0}</td>
  </tr>`).join(''):`<tr><td colspan="9" class="empty">No users match this search.</td></tr>`;
  document.querySelectorAll('[data-user]').forEach(b=>b.addEventListener('click',()=>{selectedId=b.dataset.user;renderDetail(selectedId);$('#detail-panel').scrollIntoView({behavior:'smooth',block:'start'})}));
}
function renderCollection(items=[]){return items.length?items.map(x=>{const name=setName(x.set_number);return `<div class="row"><div class="set-info">${setThumb(x.set_number,name)}<div class="set-copy"><b>${esc(x.set_number)}</b>${name?`<span class="set-name">${esc(name)}</span>`:''}<small>${esc([x.condition,x.completeness].filter(Boolean).join(' · '))}</small></div></div>${x.available_for_exchange?'<span class="pill good">Exchangeable</span>':'<span class="pill">Collection</span>'}</div>`}).join(''):'<div class="empty">No sets added.</div>'}
function renderWishlist(items=[]){return items.length?items.map(x=>{const name=setName(x.set_number);return `<div class="row"><div class="set-info">${setThumb(x.set_number,name)}<div class="set-copy"><b>${esc(x.set_number)}</b>${name?`<span class="set-name">${esc(name)}</span>`:''}</div></div><span class="pill">${esc(x.priority||'Wanted')}</span></div>`}).join(''):'<div class="empty">No wishlist items.</div>'}
function renderDetail(id){
  const u=(payload.users||[]).find(x=>x.id===id);if(!u)return;
  $('#detail-panel').classList.remove('hidden');
  $('#detail').innerHTML=`<div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap"><div><h3>${esc(u.display_name||'Unnamed member')}</h3><div class="muted">${esc(u.email||'')} · joined ${fmt(u.created_at)} · ${esc([u.city,u.country].filter(Boolean).join(', ')||'location not set')}</div></div><button class="btn" id="close-detail" type="button">Close</button></div>
  <div class="detail-grid"><div class="mini"><span class="muted">Collection</span><b>${u.collection?.length||0}</b></div><div class="mini"><span class="muted">Wishlist</span><b>${u.wishlist?.length||0}</b></div><div class="mini"><span class="muted">Exchangeable</span><b>${(u.collection||[]).filter(x=>x.available_for_exchange).length}</b></div><div class="mini"><span class="muted">Trust score</span><b>${Number(u.trust_score||0).toLocaleString()}</b></div></div>
  <div class="lists"><section class="list"><h4>Collection</h4>${renderCollection(u.collection)}</section><section class="list"><h4>Wishlist</h4>${renderWishlist(u.wishlist)}</section></div>`;
  $('#close-detail').addEventListener('click',()=>{selectedId='';$('#detail-panel').classList.add('hidden')});
}

$('#search').addEventListener('input',renderUsers);
$('#refresh').addEventListener('click',load);
$('#signout').addEventListener('click',async()=>{await db.auth.signOut();location.href='/v2.html'});
load();
})();