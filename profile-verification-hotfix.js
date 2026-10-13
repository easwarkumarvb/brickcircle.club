/* BrickCircle profile verification display sync.
   Deliberately avoids MutationObserver: the base V2 renderer changes #app,
   and observing #app creates a render -> mutation -> sync -> mutation loop.
*/
(()=>{
  const SUPABASE_URL='https://nsxtromjdpdscknadxez.supabase.co';
  const SUPABASE_KEY='sb_publishable_JJhVbgjGblHrnKuPOsJkxQ_zRoQNlIL';
  const client=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
  let timer=0;

  async function sync(){
    if(location.hash.slice(1)!=='profile') return;
    const {data,error}=await client.auth.getUser();
    if(error||!data?.user) return;
    const verified=!!data.user.email_confirmed_at;
    const app=document.querySelector('#app');
    if(!app) return;
    const pill=[...app.querySelectorAll('.pill')].find(el=>/email verification pending|email verified/i.test(el.textContent||''));
    if(!pill) return;
    const next=verified?'✓ Email verified':'Email verification pending';
    if(pill.textContent!==next) pill.textContent=next;
    const hasOk=pill.classList.contains('ok');
    if(hasOk!==verified) pill.classList.toggle('ok',verified);
  }

  function schedule(delay=80){
    clearTimeout(timer);
    timer=setTimeout(()=>{timer=0;sync()},delay);
  }
  window.addEventListener('hashchange',()=>schedule(100));
  window.addEventListener('load',()=>schedule(150));
  // Initial profile may already exist before this script loads.
  schedule(150);
})();
