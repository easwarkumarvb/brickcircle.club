/* BrickCircle V2.3 route guard: keep Meet & Exchange authoritative while #meetup is active. */
(()=>{
  const isMeetup=()=>location.hash==='#meetup';
  const app=()=>document.getElementById('app');
  let recovering=false;

  function addMeetupNav(){
    document.querySelectorAll('.tabs,.xnav').forEach(n=>{
      if(n.querySelector('[data-bc-meetup-nav]')) return;
      const b=document.createElement('button');
      b.dataset.bcMeetupNav='1';
      b.textContent='Meet & Exchange';
      if(isMeetup()) b.classList.add('on');
      b.onclick=()=>{ location.hash='meetup'; setTimeout(recover,0); };
      n.appendChild(b);
    });
  }

  async function recover(){
    if(!isMeetup()||recovering) return;
    const a=app();
    if(!a) return;
    addMeetupNav();
    if(a.querySelector('.v23hero')) return;
    recovering=true;
    try{
      if(typeof window.bc23Refresh==='function') await window.bc23Refresh();
      if(!a.querySelector('.v23hero') && typeof window.bcNav==='function') window.bcNav('meetup');
    } finally {
      setTimeout(()=>{ recovering=false; },80);
    }
  }

  const observer=new MutationObserver(()=>{
    addMeetupNav();
    if(isMeetup() && !app()?.querySelector('.v23hero')) recover();
  });

  function start(){
    const a=app();
    if(a) observer.observe(a,{childList:true,subtree:true});
    addMeetupNav();
    if(isMeetup()) setTimeout(recover,120);
  }

  document.addEventListener('DOMContentLoaded',start,{once:true});
  window.addEventListener('load',()=>{addMeetupNav(); if(isMeetup()) recover();});
  window.addEventListener('hashchange',()=>{addMeetupNav(); if(isMeetup()) setTimeout(recover,0);});
  window.addEventListener('focus',()=>{if(isMeetup()) recover();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&isMeetup()) recover();});
  setInterval(()=>{if(isMeetup()) recover();},1500);
})();