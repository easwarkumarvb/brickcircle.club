/* BrickCircle product-funnel analytics. Delegated instrumentation keeps product logic untouched. */
(function(){
  'use strict';
  function track(name,params){ if(typeof window.bcTrack==='function') window.bcTrack(name,params||{}); }
  function text(el){ return ((el&&el.textContent)||'').replace(/\s+/g,' ').trim().toLowerCase(); }
  function hashPage(){ return (location.hash||'#home').slice(1); }

  var lastPage=hashPage();
  function trackVirtualPage(){
    var p=hashPage();
    if(p===lastPage) return;
    lastPage=p;
    track('page_view',{page_title:'BrickCircle - '+p,page_location:location.href,page_path:'/#'+p});
    track('bc_section_view',{section:p});
  }
  addEventListener('hashchange',trackVirtualPage);

  document.addEventListener('click',function(e){
    var el=e.target.closest('button,a'); if(!el) return;
    var t=text(el), oc=el.getAttribute('onclick')||'';
    if(/create account|join brickcircle/.test(t)) track('sign_up_start',{source:hashPage()});
    if(/sign in/.test(t)) track('login_start',{source:hashPage()});
    if(/add to collection/.test(t)||/addCollection\(/.test(oc)) track('set_add_start',{collection_type:'owned'});
    if(/wishlist/.test(t)||/addWish\(/.test(oc)) track('wishlist_add_start',{});
    if(/request exchange/.test(t)||/bcRequest\(/.test(oc)) track('exchange_request_start',{});
    if(/message collector/.test(t)||/messageUser\(/.test(oc)) track('collector_message_start',{});
    if(/edit profile/.test(t)) track('profile_edit_start',{});
  },true);

  // Observe successful user-visible outcomes without sending PII.
  var seen=new Set();
  var obs=new MutationObserver(function(muts){
    muts.forEach(function(m){ Array.from(m.addedNodes||[]).forEach(function(n){
      if(n.nodeType!==1) return; var t=text(n); if(!t) return;
      var candidates=[
        ['sign_up','account created'],['login','signed in'],['set_added','added to collection'],
        ['wishlist_added','added to wishlist'],['exchange_requested','exchange request'],
        ['match_found','reciprocal match'],['review_submitted','review submitted'],
        ['exchange_completed','exchange completed'],['return_completed','return completed']
      ];
      candidates.forEach(function(x){ if(t.indexOf(x[1])>=0){ var k=x[0]+':'+t.slice(0,80); if(!seen.has(k)){seen.add(k);track(x[0],{});} } });
    }); });
  });
  function start(){ if(document.body) obs.observe(document.body,{childList:true,subtree:true}); track('bc_app_loaded',{section:hashPage()}); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start); else start();
})();
