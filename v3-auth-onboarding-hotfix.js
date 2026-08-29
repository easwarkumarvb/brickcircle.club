/* BrickCircle V3 auth/onboarding reliability hotfix.
   - Resilient onboarding profile upsert with timeout/retry-safe behavior.
   - Google sign-in uses Supabase's supported OAuth redirect flow. The OAuth URL
     returned by Supabase is an Auth authorize URL, not a Google URL, so do not
     attempt to extract Google's client_id from it in the browser.
*/
(()=>{
  'use strict';
  const SUPABASE_URL='https://nsxtromjdpdscknadxez.supabase.co';
  const SUPABASE_KEY='sb_publishable_JJhVbgjGblHrnKuPOsJkxQ_zRoQNlIL';
  const db=window.supabase?.createClient?.(SUPABASE_URL,SUPABASE_KEY);if(!db)return;
  const timeout=(p,ms=12000)=>Promise.race([p,new Promise((_,reject)=>setTimeout(()=>reject(new Error('This is taking longer than expected. Please check your connection and try again.')),ms))]);

  function toast(msg,bad=false){
    document.querySelector('.bc-hotfix-toast')?.remove();const el=document.createElement('div');el.className='bc-hotfix-toast';
    el.style.cssText='position:fixed;left:50%;bottom:90px;transform:translateX(-50%);z-index:999999;background:'+(bad?'#991b1b':'#111827')+';color:#fff;padding:12px 16px;border-radius:12px;box-shadow:0 8px 30px #0003;font:700 14px system-ui;max-width:min(92vw,520px);text-align:center';
    el.textContent=msg;document.body.appendChild(el);setTimeout(()=>el.remove(),3600);
  }

  async function saveOnboarding(form){
    if(form.dataset.bcSaving==='1')return;form.dataset.bcSaving='1';const btn=form.querySelector('button');const original=btn?.textContent||'Continue to add my LEGO sets';if(btn){btn.disabled=true;btn.textContent='Saving…'}
    try{
      const {data:{user},error:ue}=await timeout(db.auth.getUser(),8000);if(ue||!user)throw ue||new Error('Your sign-in session expired. Please sign in again.');
      const f=new FormData(form),patch={id:user.id,display_name:String(f.get('name')||'').trim(),country:String(f.get('country')||'').trim(),city:String(f.get('city')||'').trim(),updated_at:new Date().toISOString()};
      if(!patch.display_name||!patch.country||!patch.city)throw new Error('Please choose your name, country and city.');
      const {error}=await timeout(db.from('profiles').upsert(patch,{onConflict:'id'}),12000);if(error)throw error;
      document.getElementById('bc-overlay')?.remove();toast('Saved. Now add the LEGO sets you own.');history.replaceState({},'',location.pathname+'#browse');setTimeout(()=>location.reload(),150);
    }catch(err){console.error('BrickCircle onboarding save failed',err);toast(err?.message||'Could not save your profile. Please retry.',true);form.dataset.bcSaving='0';if(btn){btn.disabled=false;btn.textContent=original}}
  }

  document.addEventListener('submit',e=>{const form=e.target;if(!(form instanceof HTMLFormElement)||form.id!=='bc-onboard')return;e.preventDefault();e.stopImmediatePropagation();saveOnboarding(form)},true);

  async function startGoogleOAuth(button){
    const old=button.textContent;button.disabled=true;button.textContent='Opening Google…';
    try{
      const redirectTo=`${location.origin}/v2.html`;
      const {data,error}=await timeout(db.auth.signInWithOAuth({
        provider:'google',
        options:{
          redirectTo,
          skipBrowserRedirect:true,
          queryParams:{prompt:'select_account'}
        }
      }),10000);
      if(error)throw error;
      if(!data?.url)throw new Error('Google sign-in is temporarily unavailable. Please try again.');
      // data.url intentionally points to Supabase Auth. Supabase then redirects
      // to Google using the server-side Google client configuration.
      window.location.assign(data.url);
    }catch(err){
      console.error('BrickCircle Google OAuth start failed',err);
      toast(err?.message||'Google sign-in failed. Please try again.',true);
      button.disabled=false;button.textContent=old;
    }
  }

  document.addEventListener('click',e=>{
    const b=e.target.closest?.('.bc-auth-provider.google,[data-oauth="google"]');if(!b)return;
    e.preventDefault();e.stopImmediatePropagation();startGoogleOAuth(b);
  },true);
})();