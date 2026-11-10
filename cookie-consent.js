(function(){
  'use strict';
  var KEY='bc_privacy_preferences_v1';
  var choice='unknown';
  try{var saved=localStorage.getItem(KEY);if(saved==='accepted'||saved==='rejected')choice=saved}catch(_){}
  window.bcAnalyticsConsent=choice==='accepted'?'granted':choice==='rejected'?'denied':'unknown';

  function save(next){
    choice=next;
    window.bcAnalyticsConsent=next==='accepted'?'granted':'denied';
    try{localStorage.setItem(KEY,next)}catch(_){}
    window.dispatchEvent(new CustomEvent('bc:analytics-consent',{detail:{consent:window.bcAnalyticsConsent}}));
    var banner=document.getElementById('bc-cookie-consent');if(banner)banner.hidden=true;
  }
  function show(){
    var banner=document.getElementById('bc-cookie-consent');
    if(!banner){
      banner=document.createElement('section');
      banner.id='bc-cookie-consent';
      banner.setAttribute('role','region');
      banner.setAttribute('aria-label','Cookie and analytics choices');
      banner.innerHTML='<div class="bc-cookie-copy"><strong>Your privacy choices</strong><p>Essential storage supports sign-in and site operation. Optional Google Analytics helps us understand how the community uses BrickCircle. You can accept or reject analytics, and change your choice later.</p><a href="/privacy.html">Read the Privacy Policy</a></div><div class="bc-cookie-actions"><button type="button" data-bc-consent="rejected">Reject analytics</button><button type="button" data-bc-consent="accepted">Allow analytics</button></div>';
      var style=document.createElement('style');
      style.textContent='#bc-cookie-consent{position:fixed;z-index:2147483000;left:16px;right:16px;bottom:16px;display:flex;gap:20px;align-items:center;justify-content:space-between;padding:18px 20px;background:#17191c;color:#fff;border:1px solid #454b54;border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.28);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}#bc-cookie-consent[hidden]{display:none}#bc-cookie-consent .bc-cookie-copy{max-width:720px}#bc-cookie-consent strong{font-size:17px}#bc-cookie-consent p{margin:5px 0;color:#e5e7eb}#bc-cookie-consent a{color:#ffe047}#bc-cookie-consent .bc-cookie-actions{display:flex;gap:10px;flex-wrap:wrap}#bc-cookie-consent button{min-height:44px;padding:10px 15px;border-radius:10px;border:1px solid #aeb5c0;background:#fff;color:#111;font:600 14px system-ui,-apple-system,"Segoe UI",sans-serif;cursor:pointer}#bc-cookie-consent button[data-bc-consent="accepted"]{background:#ffd935;border-color:#e5bd20}@media(max-width:640px){#bc-cookie-consent{left:10px;right:10px;bottom:10px;display:block;padding:15px}#bc-cookie-consent .bc-cookie-actions{margin-top:12px}#bc-cookie-consent button{flex:1}}';
      document.head.appendChild(style);
      document.body.appendChild(banner);
      banner.addEventListener('click',function(event){var button=event.target.closest('[data-bc-consent]');if(button)save(button.dataset.bcConsent)});
    }
    banner.hidden=false;
    banner.querySelector('button')?.focus();
  }
  function init(){
    var footer=document.querySelector('footer');
    if(footer&&!document.getElementById('bc-cookie-settings')){
      var link=document.createElement('a');link.id='bc-cookie-settings';link.href='#cookie-settings';link.textContent='Cookie settings';
      link.addEventListener('click',function(event){event.preventDefault();show()});
      footer.appendChild(document.createTextNode(' · '));footer.appendChild(link);
    }
    if(choice==='unknown')show();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
  window.bcOpenCookieSettings=show;
})();