/* BrickCircle V3 auth/onboarding reliability hotfix.
   - Resilient onboarding profile upsert with timeout/retry-safe behavior.
   - Direct Google Identity Services sign-in using an ID token, avoiding a visible
     navigation through the project's *.supabase.co OAuth authorize hostname.
*/
(()=>{
  'use strict';
  const URL='https://nsxtromjdpdscknadxez.supabase.co';
  const KEY='sb_publishable_JJhVbgjGblHrnKuPOsJkxQ_zRoQNlIL';
  const db=window.supabase?.createClient?.(URL,KEY);if(!db)return;
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

  let gisLoad=null,clientId='';
  function loadGoogleIdentity(){
    if(window.google?.accounts?.id)return Promise.resolve();if(gisLoad)return gisLoad;
    gisLoad=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://accounts.google.com/gsi/client';s.async=true;s.defer=true;s.onload=resolve;s.onerror=()=>reject(new Error('Google sign-in could not load.'));document.head.appendChild(s)});return gisLoad;
  }
  async function getGoogleClientId(){
    if(clientId)return clientId;
    // Ask Supabase only for the generated OAuth URL without redirecting the browser.
    // Its Google client_id is public configuration, not a secret.
    const {data,error}=await timeout(db.auth.signInWithOAuth({provider:'google',options:{skipBrowserRedirect:true,redirectTo:`${location.origin}/v2.html`}}),8000);if(error)throw error;
    const u=new URL(data.url);clientId=u.searchParams.get('client_id')||'';if(!clientId)throw new Error('Google sign-in configuration could not be found.');return clientId;
  }
  async function directGoogle(button){
    const old=button.textContent;button.disabled=true;button.textContent='Opening Google…';
    try{
      const [cid]=await Promise.all([getGoogleClientId(),loadGoogleIdentity()]);
      await new Promise((resolve,reject)=>{
        let done=false;const finish=(fn,v)=>{if(done)return;done=true;fn(v)};
        window.google.accounts.id.initialize({client_id:cid,auto_select:false,cancel_on_tap_outside:true,use_fedcm_for_prompt:true,callback:async response=>{try{const {error}=await db.auth.signInWithIdToken({provider:'google',token:response.credential});if(error)throw error;finish(resolve)}catch(err){finish(reject,err)}}});
        window.google.accounts.id.prompt(n=>{if(n.isNotDisplayed?.()||n.isSkippedMoment?.())finish(reject,new Error('Google account chooser did not open. Please try again.'))});
        setTimeout(()=>finish(reject,new Error('Google sign-in timed out. Please try again.')),30000);
      });
      document.getElementById('bc-overlay')?.remove();toast('Signed in with Google.');setTimeout(()=>location.reload(),150);
    }catch(err){console.error('BrickCircle Google direct sign-in failed',err);toast(err?.message||'Google sign-in failed.',true);button.disabled=false;button.textContent=old}
  }

  document.addEventListener('click',e=>{
    const b=e.target.closest?.('.bc-auth-provider.google,[data-oauth="google"]');if(!b)return;
    e.preventDefault();e.stopImmediatePropagation();directGoogle(b);
  },true);
})();