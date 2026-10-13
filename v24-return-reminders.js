/* BrickCircle V2.4 — return navigation + due-date reminders */
(()=>{
  const U='https://nsxtromjdpdscknadxez.supabase.co',K='sb_publishable_JJhVbgjGblHrnKuPOsJkxQ_zRoQNlIL';
  const db=window.supabase.createClient(U,K);
  let timer=0,busy=false,last=[];
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const css=`
  .bc24-return-banner{max-width:1180px;margin:0 auto 16px;padding:18px 20px;border-radius:18px;background:linear-gradient(135deg,#fff8d8,#fff);border:1px solid #eed370;box-shadow:0 10px 28px #11182710;display:flex;align-items:center;justify-content:space-between;gap:18px;color:#172033}
  .bc24-return-banner strong{display:block;font-size:19px;margin-bottom:4px}.bc24-return-banner p{margin:0;color:#667085;line-height:1.45}.bc24-return-banner button{min-height:44px;padding:10px 15px;border:0;border-radius:11px;background:#111827;color:#fff;font-weight:850;white-space:nowrap;cursor:pointer}
  .bc24-return-count{display:inline-grid;place-items:center;min-width:20px;height:20px;padding:0 6px;border-radius:999px;background:#f4c542;color:#111827;font-size:11px;font-weight:900;margin-left:4px}
  .bc24-return-overdue{background:linear-gradient(135deg,#fff0f0,#fff);border-color:#f2aaaa}
  @media(max-width:760px){.bc24-return-banner{margin:0 10px 12px;padding:15px;align-items:flex-start;flex-direction:column}.bc24-return-banner button{width:100%;min-height:48px}.bc-mobilebar{grid-template-columns:repeat(6,1fr)!important}.bc-mobilebar button{font-size:9px!important}.bc-mobilebar button span{font-size:19px!important}}
  `;
  function style(){if(document.getElementById('bc24-return-reminder-style'))return;const s=document.createElement('style');s.id='bc24-return-reminder-style';s.textContent=css;document.head.appendChild(s)}
  const navReturns=()=>{if(typeof window.bcNav==='function')window.bcNav('returns');else location.hash='returns'};
  async function fetchActive(){
    if(busy)return last;busy=true;
    try{
      const {data:{user}}=await db.auth.getUser();if(!user){last=[];return last}
      const {data,error}=await db.from('exchanges').select('id,user_a,user_b,state,return_due_at,duration_days').or(`user_a.eq.${user.id},user_b.eq.${user.id}`).eq('state','swap_active').order('return_due_at',{ascending:true});
      if(error){console.warn('Return reminder load',error);return last}
      last=data||[];return last;
    } finally {busy=false}
  }
  function label(ex){
    if(!ex.length)return null;
    const due=ex[0].return_due_at?new Date(ex[0].return_due_at):null;
    if(!due)return {title:`${ex.length} active temporary swap${ex.length===1?'':'s'}`,text:'A return date is pending. Open Returns to plan the hand-back.',overdue:false};
    const days=Math.ceil((due-Date.now())/86400000),overdue=days<0;
    return overdue?{title:`Return overdue by ${Math.abs(days)} day${Math.abs(days)===1?'':'s'}`,text:'Arrange the return meetup now. Both LEGO sets stay reserved until the return is completed.',overdue:true}:{title:`Return due in ${days} day${days===1?'':'s'}`,text:`${ex.length} temporary swap${ex.length===1?' is':'s are'} still active. Schedule or review the return meetup.`,overdue:false};
  }
  function addDesktopNav(count){
    document.querySelectorAll('.xnav,.bcprof-nav').forEach(nav=>{
      let b=nav.querySelector('[data-bc24-returns]');
      if(!b){b=document.createElement('button');b.dataset.bc24Returns='1';b.onclick=navReturns;nav.appendChild(b)}
      b.classList.toggle('on',location.hash==='#returns');
      b.innerHTML=`Returns${count?` <span class="bc24-return-count">${count}</span>`:''}`;
    });
  }
  function addMobileNav(count){
    const nav=document.querySelector('.bc-mobilebar');if(!nav)return;
    let b=nav.querySelector('[data-page="returns"]');
    if(!b){b=document.createElement('button');b.dataset.page='returns';b.setAttribute('aria-label','Returns');b.onclick=navReturns;nav.appendChild(b)}
    b.classList.toggle('active',location.hash==='#returns');
    b.innerHTML=`<span>↩️</span>Returns${count?`<i class="bc24-return-count" style="position:absolute;margin:0;transform:translate(13px,-15px)">${count}</i>`:''}`;
    b.style.position='relative';
  }
  function insertBanner(ex){
    document.getElementById('bc24ProfileReturnBanner')?.remove();
    document.getElementById('bc24MeetReturnBanner')?.remove();
    if(!ex.length)return;
    const info=label(ex);if(!info)return;
    const hash=location.hash;
    if(hash!=='#profile'&&hash!=='#meetup')return;
    const host=document.createElement('section');host.id=hash==='#profile'?'bc24ProfileReturnBanner':'bc24MeetReturnBanner';host.className='bc24-return-banner'+(info.overdue?' bc24-return-overdue':'');
    host.innerHTML=`<div><strong>↩️ ${esc(info.title)}</strong><p>${esc(info.text)}</p></div><button type="button">Open Returns →</button>`;
    host.querySelector('button').onclick=navReturns;
    if(hash==='#profile'){
      const prof=document.querySelector('.bcprof');const nav=prof?.querySelector('.bcprof-nav');
      if(prof) (nav?.nextSibling?prof.insertBefore(host,nav.nextSibling):prof.prepend(host));
    }else{
      const wrap=document.querySelector('#app .wrap');const hero=wrap?.querySelector('.v23hero');
      if(wrap) wrap.insertBefore(host,hero||wrap.firstChild);
    }
  }
  async function refresh(){
    style();const ex=await fetchActive();addDesktopNav(ex.length);addMobileNav(ex.length);insertBanner(ex);
  }
  function schedule(ms=100){clearTimeout(timer);timer=setTimeout(()=>{timer=0;refresh()},ms)}
  const obs=new MutationObserver(()=>{
    const count=last.length;
    if(document.querySelector('.xnav,.bcprof-nav')&&!document.querySelector('[data-bc24-returns]'))addDesktopNav(count);
    if(document.querySelector('.bc-mobilebar')&&!document.querySelector('.bc-mobilebar [data-page="returns"]'))addMobileNav(count);
    if((location.hash==='#profile'||location.hash==='#meetup')&&last.length&&!document.querySelector('#bc24ProfileReturnBanner,#bc24MeetReturnBanner'))insertBanner(last);
  });
  document.addEventListener('DOMContentLoaded',()=>{obs.observe(document.body,{childList:true,subtree:true});schedule(180)});
  window.addEventListener('load',()=>schedule(250));
  window.addEventListener('hashchange',()=>schedule(120));
  window.addEventListener('focus',()=>schedule(80));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule(80)});
  setTimeout(()=>{if(document.body&&!obs.takeRecords){}schedule(300)},300);
})();
