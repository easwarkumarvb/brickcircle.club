/* BrickCircle production profile verification hotfix.
   Supabase Auth is authoritative for email verification. Do not use
   profiles.email_verified for this display state because it can be stale.
*/
(()=>{
  const SUPABASE_URL='https://nsxtromjdpdscknadxez.supabase.co';
  const SUPABASE_KEY='sb_publishable_JJhVbgjGblHrnKuPOsJkxQ_zRoQNlIL';
  const client=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);

  async function sync(){
    if(location.hash.slice(1)!=='profile') return;
    const {data,error}=await client.auth.getUser();
    if(error||!data?.user) return;
    const verified=!!data.user.email_confirmed_at;
    const app=document.querySelector('#app');
    if(!app) return;
    const pills=[...app.querySelectorAll('.pill')];
    const emailPill=pills.find(el=>/email verification pending|email verified/i.test(el.textContent||''));
    if(emailPill){
      emailPill.textContent=verified?'✓ Email verified':'Email verification pending';
      emailPill.classList.toggle('ok',verified);
    }
  }

  let scheduled=false;
  const schedule=()=>{
    if(scheduled)return;
    scheduled=true;
    setTimeout(()=>{scheduled=false;sync()},80);
  };
  window.addEventListener('hashchange',schedule);
  new MutationObserver(schedule).observe(document.querySelector('#app')||document.body,{childList:true,subtree:true});
  window.addEventListener('load',schedule);
  schedule();
})();
