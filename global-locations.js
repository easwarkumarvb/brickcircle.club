/* BrickCircle global signup locations.
   Expands the signup country/city controls using CountriesNow's public dataset.
   Countries are loaded globally; cities are fetched only for the selected country.
   Existing authfix.js data remains a graceful offline fallback. */
(()=>{
  const API='https://countriesnow.space/api/v0.1/countries';
  const COUNTRY_CACHE='bc_global_countries_v1';
  const CITY_PREFIX='bc_global_cities_v1:';
  const MAX_AGE=7*24*60*60*1000;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let attachedCountry=null;

  function readCache(key){
    try{const x=JSON.parse(localStorage.getItem(key)||'null');return x&&Date.now()-x.t<MAX_AGE?x.v:null}catch{return null}
  }
  function writeCache(key,v){try{localStorage.setItem(key,JSON.stringify({t:Date.now(),v}))}catch{}}

  async function getCountries(){
    const cached=readCache(COUNTRY_CACHE); if(cached?.length)return cached;
    const r=await fetch(`${API}/iso`,{headers:{Accept:'application/json'}});
    if(!r.ok)throw new Error('Country service unavailable');
    const j=await r.json();
    const rows=Array.isArray(j.data)?j.data:[];
    const names=[...new Set(rows.map(x=>x.name||x.country).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
    if(!names.length)throw new Error('No countries returned');
    writeCache(COUNTRY_CACHE,names); return names;
  }

  async function getCities(country){
    const key=CITY_PREFIX+country;
    const cached=readCache(key); if(cached?.length)return cached;
    const r=await fetch(`${API}/cities/q?country=${encodeURIComponent(country)}`,{headers:{Accept:'application/json'}});
    if(!r.ok)throw new Error('City service unavailable');
    const j=await r.json();
    const raw=Array.isArray(j.data)?j.data:(Array.isArray(j.data?.cities)?j.data.cities:[]);
    const cities=[...new Set(raw.map(x=>typeof x==='string'?x:(x?.name||x?.city)).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
    if(!cities.length)throw new Error('No cities returned');
    writeCache(key,cities); return cities;
  }

  function fill(select,items,prompt,selected=''){
    select.innerHTML=`<option value="">${esc(prompt)}</option>`+items.map(x=>`<option value="${esc(x)}"${x===selected?' selected':''}>${esc(x)}</option>`).join('');
  }

  async function loadCities(country,keep=''){
    const city=document.querySelector('#afcity'); if(!city)return;
    if(!country){city.disabled=true;city.innerHTML='<option value="">Select country first</option>';return;}
    city.disabled=true; city.innerHTML='<option value="">Loading cities…</option>';
    try{
      const cities=await getCities(country);
      fill(city,cities,'Select city',keep);
      city.disabled=false;
    }catch(e){
      // authfix.js has already populated its built-in fallback list. Re-run it if available.
      try{window.bcAuthFixCities?.()}catch{}
      city.disabled=false;
      if(!city.options.length)city.innerHTML='<option value="">City list unavailable — try again</option>';
      console.warn('BrickCircle global city lookup:',e);
    }
  }

  async function enhance(){
    const country=document.querySelector('#afcountry');
    const city=document.querySelector('#afcity');
    if(!country||!city)return;
    if(country===attachedCountry)return;
    attachedCountry=country;
    const selected=country.value;
    try{
      const countries=await getCountries();
      fill(country,countries,'Select country',selected);
      if(selected)await loadCities(selected,city.value);
    }catch(e){console.warn('BrickCircle global country lookup:',e)}
    // Capture phase runs before authfix's inline onchange, then refreshes with the complete city list.
    country.addEventListener('change',()=>{
      const chosen=country.value;
      setTimeout(()=>loadCities(chosen),0);
    },true);
  }

  new MutationObserver(enhance).observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('DOMContentLoaded',enhance);
  enhance();
})();
