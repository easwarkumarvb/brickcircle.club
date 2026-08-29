/* BrickCircle V3 auth/onboarding reliability hotfix.
   - Saves onboarding profile directly without waiting on full app refresh.
   - Uses upsert so social-auth users always have a usable profile row.
   - Forces Google's account chooser for easy account switching.
*/
(()=>{
  'use strict';
  const URL='https://nsxtromjdpdscknadxez.supabase.co';
  const KEY='sb_publishable_JJhVbgjGblHrnKuPOsJkxQ_zRoQNlIL';
  const db=window.supabase?.createClient?.(URL,KEY);
  if(!db)return;

  function toast(msg,bad=false){
    document.querySelector('.bc-hotfix-toast')?.remove();
    const el=document.createElement('div');el.className='bc-hotfix-toast';
    el.style.cssText='position:fixed;left:50%;bottom:90px;transform:translateX(-50%);z-index:999999;background:'+(bad?'#991b1b':'#111827')+';color:#fff;padding:12px 16px;border-radius:12px;box-shadow:0 8px 30px #0003;font:700 14px system-ui;max-width:min(92vw,520px);text-align:center';
    el.textContent=msg;document.body.appendChild(el);setTimeout(()=>el.remove(),3200);
  }

  async function saveOnboarding(form){
    if(form.dataset.bcSaving==='1')return;
    form.dataset.bcSaving='1';
    const btn=form.querySelector('button');const original=btn?.textContent||'Continue to add my LEGO sets';
    if(btn){btn.disabled=true;btn.textContent='Saving…'}
    try{
      const {data:{user},error:ue}=await db.auth.getUser();if(ue||!user)throw ue||new Error('Your sign-in session expired. Please sign in again.');
      const f=new FormData(form),patch={
        id:user.id,
        display_name:String(f.get('name')||'').trim(),
        country:String(f.get('country')||'').trim(),
        city:String(f.get('city')||'').trim(),
        updated_at:new Date().toISOString()
      };
      if(!patch.display_name||!patch.country||!patch.city)throw new Error('Please choose your name, country and city.');
      const {error}=await db.from('profiles').upsert(patch,{onConflict:'id'});if(error)throw error;
      document.getElementById('bc-overlay')?.remove();
      toast('Saved. Now add the LEGO sets you own.');
      history.replaceState({},'',location.pathname+'#browse');
      // A clean reload ensures the V3 in-memory state sees the newly saved profile
      // without blocking this button on expensive secondary refresh work.
      setTimeout(()=>location.reload(),120);
    }catch(err){
      console.error('BrickCircle onboarding save failed',err);toast(err?.message||'Could not save your profile. Please retry.',true);
      form.dataset.bcSaving='0';if(btn){btn.disabled=false;btn.textContent=original}
    }
  }

  document.addEventListener('submit',e=>{
    const form=e.target;
    if(!(form instanceof HTMLFormElement)||form.id!=='bc-onboard')return;
    e.preventDefault();e.stopImmediatePropagation();saveOnboarding(form);
  },true);

  document.addEventListener('click',async e=>{
    const b=e.target.closest?.('[data-oauth="google"]');if(!b)return;
    e.preventDefault();e.stopImmediatePropagation();
    b.disabled=true;const old=b.textContent;b.textContent='Opening Google…';
    const {error}=await db.auth.signInWithOAuth({provider:'google',options:{
      redirectTo:`${location.origin}/v2.html?oauth=1`,
      queryParams:{prompt:'select_account'}
    }});
    if(error){toast(error.message||'Google sign-in is unavailable.',true);b.disabled=false;b.textContent=old}
  },true);
})();