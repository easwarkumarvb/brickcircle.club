/* BrickCircle V2.7 — scalable Rebrickable catalogue search.
   Avoids loading 28k+ lego_sets rows into every browser. */
(()=>{
'use strict';
const PAGE=36;
let offset=0, busy=false, lastKey='', total=null;
const $=s=>document.querySelector(s);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=x=>x==null||Number(x)<=0?'Market value unavailable':'$'+Number(x).toLocaleString();
const emoji=t=>({Technic:'🏎️',Icons:'🏛️',Ideas:'🚀','Star Wars':'🤖'})[t]||'🧱';
const owned=n=>(window.S?.collection||[]).some(c=>c.set_number===n);
const wanted=n=>(window.S?.wishlist||[]).some(w=>w.set_number===n);
function card(s){return `<div class="card"><div class="icon">${emoji(s.theme)}</div><span class="pill">${esc(s.theme||'LEGO')}</span><h3>${esc(s.name)}</h3><div class="muted" style="font-size:13px">Set ${esc(s.set_number)} · ${s.year||''} · ${(s.piece_count||0).toLocaleString()} pieces</div><p>Market value <b>${money(s.estimated_value)}</b></p><div class="actions">${owned(s.set_number)?'<span class="pill ok">In collection</span>':`<button class="primary" onclick="addCollection('${esc(s.set_number)}')">Add to collection</button>`}${wanted(s.set_number)?'<span class="pill ok">Wanted</span>':`<button onclick="addWish('${esc(s.set_number)}')">Wishlist</button>`}</div></div>`}
function clean(v){return String(v||'').trim().replace(/[,%()]/g,' ');}
async function query(reset=true){
 if(busy||!window.db)return; busy=true;
 const q=clean($('#bcCatQ')?.value), theme=$('#bcCatTheme')?.value||'', year=$('#bcCatYear')?.value||'';
 const key=[q,theme,year].join('|'); if(reset||key!==lastKey){offset=0;lastKey=key;}
 let req=db.from('lego_sets').select('set_number,name,year,piece_count,theme,estimated_value',{count:offset===0?'exact':undefined}).eq('catalog_active',true);
 if(theme)req=req.eq('theme',theme); if(year)req=req.eq('year',Number(year));
 if(q){const p=`%${q}%`;req=req.or(`set_number.ilike.${p},name.ilike.${p},theme.ilike.${p}`);}
 // Exact/near set numbers naturally sort first; newest sets then name for stable pagination.
 req=req.order('year',{ascending:false}).order('set_number',{ascending:true}).range(offset,offset+PAGE-1);
 const {data,error,count}=await req; busy=false;
 const list=$('#bcCatList'),status=$('#bcCatStatus'),more=$('#bcCatMore'); if(!list)return;
 if(error){status.textContent='Catalogue search temporarily unavailable.';console.error(error);return;}
 if(offset===0){list.innerHTML=''; if(count!=null)total=count;}
 list.insertAdjacentHTML('beforeend',(data||[]).map(card).join('')|| (offset===0?'<div class="notice">No matching LEGO sets found.</div>':''));
 offset+=(data||[]).length;
 status.textContent=`Showing ${Math.min(offset,total??offset).toLocaleString()}${total!=null?' of '+total.toLocaleString():''} matching sets`;
 more.style.display=(data||[]).length===PAGE && (total==null||offset<total)?'inline-block':'none';
}
async function themes(){
 // Small curated filter list keeps the initial page fast; search still covers every theme.
 const preferred=['Technic','Icons','Ideas','Star Wars','Creator Expert','Architecture','Speed Champions','City','Castle','Space','Pirates','Harry Potter','Marvel Super Heroes','DC Comics Super Heroes','Ninjago'];
 const sel=$('#bcCatTheme'); if(!sel)return; preferred.forEach(t=>sel.insertAdjacentHTML('beforeend',`<option value="${esc(t)}">${esc(t)}</option>`));
}
function mount(){
 if((location.hash||'#home').slice(1)!=='catalogue')return;
 const app=$('#app'); if(!app)return;
 app.innerHTML=`<div class="wrap"><div class="tabs">${[['home','Home'],['catalogue','Catalogue'],['collection','My collection'],['wishlist','Wishlist'],['matches','Matches'],['messages','Messages'],['profile','Profile']].map(([p,t])=>`<button class="${p==='catalogue'?'on':''}" onclick="bcNav('${p}')">${t}</button>`).join('')}</div><div class="card"><h2>LEGO catalogue</h2><p class="muted">Search BrickCircle's comprehensive Rebrickable-powered catalogue. Results load in small batches for speed.</p><div class="toolbar"><input id="bcCatQ" placeholder="Search set number, name or theme" autocomplete="off"><select id="bcCatTheme"><option value="">All themes</option></select><select id="bcCatYear"><option value="">Any year</option>${Array.from({length:new Date().getFullYear()-1948},(_,i)=>new Date().getFullYear()-i).map(y=>`<option>${y}</option>`).join('')}</select></div><div id="bcCatStatus" class="muted" style="margin:8px 0 15px">Loading catalogue…</div><div id="bcCatList" class="sets"></div><div style="text-align:center;margin:20px"><button id="bcCatMore" class="primary" style="display:none">Load more</button></div></div><div class="footer">BrickCircle · Rebrickable-powered LEGO catalogue</div></div>`;
 themes(); let timer; $('#bcCatQ').addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>query(true),250)}); $('#bcCatTheme').addEventListener('change',()=>query(true)); $('#bcCatYear').addEventListener('change',()=>query(true)); $('#bcCatMore').addEventListener('click',()=>query(false)); query(true);
}
const oldRender=window.render;
function hook(){
 const oldNav=window.bcNav; if(oldNav&&!oldNav.__cat27){const n=p=>{oldNav(p);if(p==='catalogue')setTimeout(mount,0)};n.__cat27=true;window.bcNav=n;}
 window.addEventListener('hashchange',()=>setTimeout(mount,0)); setTimeout(mount,0);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',hook);else hook();
})();