(function(){
  'use strict';
  // Auth callback URLs may contain credentials. Do not load analytics on them.
  if(/[?&#](?:code|token|token_hash|access_token|refresh_token|id_token|provider_token|provider_refresh_token|error_description)=/.test(location.href)) return;
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
    try{window.gtag('event',eventName,Object.assign({},params||{},safePage()));}catch(e){}
  };
})();
