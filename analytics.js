(function(){
  'use strict';
  function sensitiveCallback(){
    try{
      var url=new URL(location.href),names=['code','token','token_hash','access_token','refresh_token','id_token','provider_token','provider_refresh_token','error','error_description','recovery'];
      if(['/admin.html','/auth-confirm.html'].indexOf(url.pathname)>=0)return true;
      var fragment=url.hash.slice(1),parts=[url.search.slice(1),fragment,fragment.indexOf('?')>=0?fragment.slice(fragment.indexOf('?')+1):''];
      return parts.some(function(part){return Array.from(new URLSearchParams(part).keys()).some(function(key){return names.indexOf(key.toLowerCase())>=0;});});
    }catch(_){return true;}
  }
  if(sensitiveCallback())return;
  var sections=['home','browse','sets','matches','exchanges','exchange','profile','messages'];
  var GA_ID='G-GHBWVMTRF1',loaded=false;
  function safePage(){
    var raw=(location.hash||'#home').slice(1).split('/')[0],section=sections.indexOf(raw)>=0?raw:'home';
    return {page_location:location.origin+'/#'+section,page_path:'/#'+section,page_title:'BrickCircle - '+section};
  }
  window.bcAnalyticsPage=safePage;
  function loadAnalytics(){
    if(loaded||window.bcAnalyticsConsent!=='granted')return;
    loaded=true;window['ga-disable-'+GA_ID]=false;
    window.dataLayer=window.dataLayer||[];
    window.gtag=window.gtag||function(){window.dataLayer.push(arguments);};
    window.gtag('js',new Date());
    window.gtag('set',Object.assign({page_referrer:location.origin+'/'},safePage()));
    window.gtag('config',GA_ID,Object.assign({send_page_view:false,page_referrer:location.origin+'/'},safePage()));
    window.gtag('event','page_view',safePage());
    var tag=document.createElement('script');tag.async=true;tag.src='https://www.googletagmanager.com/gtag/js?id='+encodeURIComponent(GA_ID);document.head.appendChild(tag);
  }
  function stopAnalytics(){
    window['ga-disable-'+GA_ID]=true;
    try{
      var names=document.cookie.split(';').map(function(part){return part.trim().split('=')[0]}).filter(function(name){return name==='_ga'||name.indexOf('_ga_')===0});
      names.forEach(function(name){
        document.cookie=name+'=; Max-Age=0; path=/; SameSite=Lax';
        document.cookie=name+'=; Max-Age=0; path=/; domain='+location.hostname+'; SameSite=Lax';
        var labels=location.hostname.split('.');
        if(labels.length>2){document.cookie=name+'=; Max-Age=0; path=/; domain=.'+labels.slice(-2).join('.')+'; SameSite=Lax';}
      });
    }catch(_){}
  }
  window.bcTrack=function(eventName,params){
    if(window.bcAnalyticsConsent!=='granted'||sensitiveCallback())return;
    var safe={};params=params||{};
    ['section','source'].forEach(function(key){if(sections.indexOf(params[key])>=0)safe[key]=params[key];});
    if(['owned','wishlist'].indexOf(params.collection_type)>=0)safe.collection_type=params.collection_type;
    ['result_count','curated_count','duration_days'].forEach(function(key){if(Number.isSafeInteger(params[key])&&params[key]>=0&&params[key]<=1000000)safe[key]=params[key];});
    if(typeof params.owner_photo==='boolean')safe.owner_photo=params.owner_photo;
    if(typeof eventName!=='string'||!/^[a-z][a-z0-9_]{0,63}$/.test(eventName))return;
    try{window.gtag('event',eventName,Object.assign(safe,safePage()));}catch(_){}
  };
  window.addEventListener('bc:analytics-consent',function(event){
    if(event.detail?.consent==='granted')loadAnalytics();
    else stopAnalytics();
  });
  if(window.bcAnalyticsConsent==='granted')loadAnalytics();
})();