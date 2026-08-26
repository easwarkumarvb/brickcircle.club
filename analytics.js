(function(){
  'use strict';
  var GA_ID='G-GHBWVMTRF1';
  if(window.__brickcircleGaLoaded) return;
  window.__brickcircleGaLoaded=true;

  window.dataLayer=window.dataLayer||[];
  window.gtag=window.gtag||function(){window.dataLayer.push(arguments);};
  window.gtag('js',new Date());
  window.gtag('config',GA_ID,{send_page_view:true});

  var s=document.createElement('script');
  s.async=true;
  s.src='https://www.googletagmanager.com/gtag/js?id='+encodeURIComponent(GA_ID);
  document.head.appendChild(s);

  window.bcTrack=function(eventName,params){
    try{window.gtag('event',eventName,params||{});}catch(e){}
  };
})();
