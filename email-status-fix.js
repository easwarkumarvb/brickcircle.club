/* BrickCircle profile verification status fix.
   Supabase Auth is the source of truth for email verification. The public
   profiles.email_verified field can become stale after OTP verification,
   so the profile UI must use auth.getUser().email_confirmed_at instead.
*/
(()=>{
  const SUPABASE_URL='https://nsxtromjdpdscknadxez.supabase.co';
  const SUPABASE_KEY='sb_publishable_JJhVbgJblHrnKuPOsJkxQ_zRoQNlIL';
  const client=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);

  async function syncEmailStatus(){
    if(location.hash.slice(1)!=='profile') return;
    const {data,error}=await client.auth.getUser();
    if(error||!data?.user) return;
    const verified=Boolean(data.user.email_confirmed_at||data.user.confirmed_at);
    const pills=[...document.querySelectorAll('.pill')];
    const emailPill=pills.find(el=>/Email (verification pending|verified)/i.test(el.textContent||''));
    if(emailPill){
      emailPill.textContent=verified?'✓ Email verified':'Email verification pending';
      emailPill.classList.toggle('ok',verified);
    }
  }

  window.addEventListener('hashchange',()=>setTimeout(syncEmailStatus,50));
  const observer=new MutationObserver(()=>syncEmailStatus());
  observer.observe(document.body,{childList:true,subtree:true});
  setTimeout(syncEmailStatus,300);
})();
