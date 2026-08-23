/* BrickCircle signup locations — streamlined for fast mobile registration.
   Countries stay global, but city choices use the concise major-city shortlist
   already provided by authfix.js. Users whose city is not listed can enter it.
*/
(()=>{
  const API='https://countriesnow.space/api/v0.1/countries';
  const COUNTRY_CACHE='bc_global_countries_v2';
  const MAX_AGE=14*24*60*60*1000;
  const OTHER='__bc_other_city__';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let attachedCountry=null,attachedCity=null;

  function readCache(key){try{const x=JSON.parse(localStorage.getItem(key)||'null');return x&&Date.now()-x.t<MAX_AGE?x.v:null}catch{return null}}
  function writeCache(key,v){try{localStorage.setItem(key,JSON.stringify({t:Date.now(),v}))}catch{}}

  async function getCountries(){
    const cached=readCache(COUNTRY_CACHE);if(cached?.length)return cached;
    const r=await fetch(`${API}/iso`,{headers:{Accept:'application/json'}});
    if(!r.ok)throw new Error('Country service unavailable');
    const j=await r.json(),rows=Array.isArray(j.data)?j.data:[];
    const names=[...new Set(rows.map(x=>x.name||x.country).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
    if(!names.length)throw new Error('No countries returned');
    writeCache(COUNTRY_CACHE,names);return names;
  }

  function fillCountries(select,items,selected=''){
    select.innerHTML='<option value="">Select country</option>'+items.map(x=>`<option value="${esc(x)}"${x===selected?' selected':''}>${esc(x)}</option>`).join('');
  }

  function removeCustomUI(){
    document.getElementById('bcCustomCityWrap')?.remove();
  }

  function appendOther(city){
    if(!city||!city.closest('.modalbox'))return;
    [...city.options].filter(o=>o.dataset.bcCustom==='1'||o.value===OTHER).forEach(o=>o.remove());
    const opt=document.createElement('option');opt.value=OTHER;opt.textContent='My city is not listed…';city.appendChild(opt);
  }

  function showCustomCity(city){
    removeCustomUI();
    const wrap=document.createElement('div');wrap.id='bcCustomCityWrap';wrap.style.cssText='margin-top:8px';
    wrap.innerHTML='<label for="bcCustomCity" style="display:block;font-size:12px;font-weight:800;color:#667085;margin-bottom:5px">Enter your city</label><input id="bcCustomCity" type="text" autocomplete="address-level2" placeholder="Type your city name" style="width:100%;min-height:46px;padding:11px 12px;border:1px solid #d0d5dd;border-radius:10px;font:inherit">';
    city.insertAdjacentElement('afterend',wrap);
    const input=wrap.querySelector('input');
    input.addEventListener('input',()=>{
      const val=input.value.trim();
      [...city.options].filter(o=>o.dataset.bcCustom==='1').forEach(o=>o.remove());
      if(val){const o=document.createElement('option');o.value=val;o.textContent=val;o.selected=true;o.dataset.bcCustom='1';city.appendChild(o)}
      else city.value=OTHER;
    });
    setTimeout(()=>input.focus(),50);
  }

  function refreshCityShortlist(){
    const country=document.querySelector('#afcountry'),city=document.querySelector('#afcity');
    if(!country||!city)return;
    // authfix.js owns the curated major-city shortlist. Let its change handler run first.
    setTimeout(()=>{
      if(!country.value){removeCustomUI();return}
      city.disabled=false;
      appendOther(city);
    },20);
  }

  async function enhance(){
    const country=document.querySelector('#afcountry'),city=document.querySelector('#afcity');
    if(!country||!city)return;

    if(country!==attachedCountry){
      attachedCountry=country;
      const selected=country.value;
      try{
        const countries=await getCountries();
        fillCountries(country,countries,selected);
      }catch(e){console.warn('BrickCircle country lookup:',e)}
      country.addEventListener('change',()=>{removeCustomUI();refreshCityShortlist()},true);
      refreshCityShortlist();
    }

    if(city!==attachedCity){
      attachedCity=city;
      city.addEventListener('change',()=>{
        if(city.value===OTHER)showCustomCity(city);
        else if(!city.querySelector('option:checked')?.dataset.bcCustom)removeCustomUI();
      });
    }
  }

  new MutationObserver(enhance).observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('DOMContentLoaded',enhance);
  enhance();
})();
