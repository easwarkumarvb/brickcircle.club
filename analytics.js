(function(){
  'use strict';
  // Auth callback URLs may contain credentials. Do not load analytics on them.
  function sensitiveCallback(){
    try {
      var url=new URL(location.href),names=['code','token','token_hash','access_token','refresh_token','id_token','provider_token','provider_refresh_token','error','error_description','recovery'];
      if(['/admin.html','/auth-confirm.html'].indexOf(url.pathname)>=0) return true;
      var fragment=url.hash.slice(1),parts=[url.search.slice(1),fragment,fragment.indexOf('?')>=0?fragment.slice(fragment.indexOf('?')+1):''];
      return parts.some(function(part){return Array.from(new URLSearchParams(part).keys()).some(function(key){return names.indexOf(key.toLowerCase())>=0;});});
    }catch(e){return true;}
  }
  if(sensitiveCallback()) return;
  var sections=['home','browse','sets','matches','exchanges','exchange','profile','messages'];
  function safePage(){var raw=(location.hash||'#home').slice(1).split('/')[0];var section=sections.indexOf(raw)>=0?raw:'home';return {page_location:location.origin+'/#'+section,page_path:'/#'+section,page_title:'BrickCircle - '+section};}
  window.bcAnalyticsPage=safePage;
  var GA_ID='G-GHBWVMTRF1';
  if(window.__brickcircleGaLoaded) return;
  window.__brickcircleGaLoaded=true;

  window.dataLayer=window.dataLayer||[];
  window.gtag=window.gtag||function(){window.dataLayer.push(arguments);};
  window.gtag('js',new Date());
  // Explicit sanitized views; callback documents never load the vendor tag.
  // GA Enhanced Measurement history views must also be disabled in the stream
  // settings (send_page_view only disables the initial automatic config view).
  window.gtag('set',Object.assign({page_referrer:location.origin+'/'},safePage()));
  window.gtag('config',GA_ID,Object.assign({send_page_view:false,page_referrer:location.origin+'/'},safePage()));
  window.gtag('event','page_view',safePage());

  var s=document.createElement('script');
  s.async=true;
  s.src='https://www.googletagmanager.com/gtag/js?id='+encodeURIComponent(GA_ID);
  document.head.appendChild(s);

  window.bcTrack=function(eventName,params){
    if(sensitiveCallback()) return;
    // Only aggregate, enumerated product dimensions may leave the browser.
    // Callers can hold account IDs, names, free text and exchange IDs.
    var safe={};params=params||{};
    ['section','source'].forEach(function(key){if(sections.indexOf(params[key])>=0)safe[key]=params[key];});
    if(['owned','wishlist'].indexOf(params.collection_type)>=0)safe.collection_type=params.collection_type;
    ['result_count','curated_count','duration_days'].forEach(function(key){if(Number.isSafeInteger(params[key])&&params[key]>=0&&params[key]<=1000000)safe[key]=params[key];});
    if(typeof params.owner_photo==='boolean')safe.owner_photo=params.owner_photo;
    if(typeof eventName!=='string'||!/^[a-z][a-z0-9_]{0,63}$/.test(eventName))return;
    try{window.gtag('event',eventName,Object.assign(safe,safePage()));}catch(e){}
  };
})();
