/* BrickCircle beta locations — countries + curated major cities only.
   authfix.js owns the offline country/city dataset. This layer deliberately
   removes custom-city entry and any third-party location API dependency.
*/
(()=>{
  const BETA_NOTE='BrickCircle beta is currently available only in the listed major cities. Choose the city where you can meet other AFOL collectors in person.';
  let attachedCountry=null,attachedCity=null;

  function cleanCustomCityUI(){
    document.getElementById('bcCustomCityWrap')?.remove();
    const city=document.querySelector('#afcity');
    if(!city)return;
    [...city.options].filter(o=>o.dataset?.bcCustom==='1'||o.value==='__bc_other_city__').forEach(o=>o.remove());
  }

  function addBetaNote(){
    const city=document.querySelector('#afcity');
    if(!city||!city.closest('.modalbox'))return;
    let note=document.getElementById('bcBetaCityNote');
    if(!note){
      note=document.createElement('div');
      note.id='bcBetaCityNote';
      note.style.cssText='font-size:12px;line-height:1.45;color:#667085;margin:7px 0 2px';
      city.insertAdjacentElement('afterend',note);
    }
    note.textContent=BETA_NOTE;
  }

  function enhance(){
    const country=document.querySelector('#afcountry'),city=document.querySelector('#afcity');
    if(!country||!city)return;
    cleanCustomCityUI();
    addBetaNote();

    if(country!==attachedCountry){
      attachedCountry=country;
      country.addEventListener('change',()=>setTimeout(()=>{cleanCustomCityUI();addBetaNote()},30),true);
    }
    if(city!==attachedCity){
      attachedCity=city;
      city.addEventListener('change',cleanCustomCityUI,true);
    }
  }

  new MutationObserver(enhance).observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('DOMContentLoaded',enhance);
  enhance();
})();
