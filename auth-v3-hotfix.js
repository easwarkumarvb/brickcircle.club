/* BrickCircle V3 auth/onboarding hotfix: resilient first-run save + direct Google Identity sign-in. */
(()=>{
'use strict';
const URL='https://nsxtromjdpdscknadxez.supabase.co';
const KEY='sb_publishable_JJhVbgjGblHrnKuPOsJkxQ_zRoQNlIL';
const db=window.supabase?.createClient?.(URL,KEY); if(!db)return;

const qs=(s,r=document)=>r.querySelector(s);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const withTimeout=(p,ms=12000)=>Promise.race([p,new Promise((_,rej)=>setTimeout(()=>rej(new Error('Request timed out. Please check your connection and try again.')),ms))]);
function toast(msg){let e=document.querySelector('.bc-auth-hotfix-toast');if(!e){e=document.createElement('div');e.className='bc-auth-hotfix-toast';Object.assign(e.style,{position:'fixed',left:'50%',bottom:'92px',transform:'translateX(-50%)',zIndex:999999,background:'#111827',color:'#fff',padding:'11px 14px',borderRadius:'10px',maxWidth:'90vw',font:'600 14px system-ui'});document.body.appendChild(e)}e.textContent=msg;clearTimeout(e._t);e._t=setTimeout(()=>e.remove(),3500)}

// Capture onboarding submit before the legacy handler. New social users can occasionally reach
// the screen before their profile trigger row is visible; upsert makes the save idempotent.
document.addEventListener('submit',async e=>{
  const form=e.target;if(!(form instanceof HTMLFormElement)||form.id!=='bc-onboard')return;
  e.preventDefault();e.stopImmediatePropagation();
  const btn=qs('button[type="submit"],button',form);const old=btn?.textContent||'Continue to add my LEGO sets';
  try{
    if(btn){btn.disabled=true;btn.textContent='Saving…'}
    const {data:{user}}=await withTimeout(db.auth.getUser(),8000);if(!user)throw new Error('Your sign-in session was not found. Please sign in again.');
    const f=new FormData(form),patch={id:user.id,display_name:String(f.get('name')||'').trim(),country:String(f.get('country')||'').trim(),city:String(f.get('city')||'').trim(),updated_at:new Date().toISOString()};
    if(!patch.display_name||!patch.country||!patch.city)throw new Error('Please complete your name, country and city.');
    let result=await withTimeout(db.from('profiles').upsert(patch,{onConflict:'id'}).select('id').maybeSingle(),12000);
    if(result.error)throw result.error;
    document.getElementById('bc-overlay')?.remove();toast('Profile saved — now add the LEGO sets you own.');
    history.replaceState({},'',location.pathname+'#browse');
    await sleep(150);location.reload();
  }catch(err){console.error('BrickCircle onboarding save',err);toast(err?.message||'Could not save your profile. Please try again.');if(btn){btn.disabled=false;btn.textContent=old}}
},true);

let gisPromise=null,googleClientId=null;
function loadGIS(){
  if(window.google?.accounts?.id)return Promise.resolve();if(gisPromise)return gisPromise;
  gisPromise=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://accounts.google.com/gsi/client';s.async=true;s.defer=true;s.onload=resolve;s.onerror=()=>reject(new Error('Google sign-in could not load.'));document.head.appendChild(s)});return gisPromise;
}
async function discoverGoogleClientId(){
  if(googleClientId)return googleClientId;
  const {data,error}=await db.auth.signInWithOAuth({provider:'google',options:{skipBrowserRedirect:true,redirectTo:location.origin+'/v2.html'}});
  if(error)throw error;const u=new URL(data.url);googleClientId=u.searchParams.get('client_id');if(!googleClientId)throw new Error('Google client configuration was not found.');return googleClientId;
}
async function directGoogle(){
  try{
    const btn=qs('.bc-auth-provider.google');if(btn){btn.disabled=true;btn.textContent='Opening Google…'}
    const [clientId]=await Promise.all([discoverGoogleClientId(),loadGIS()]);
    await new Promise((resolve,reject)=>{
      let settled=false;const finish=(fn,v)=>{if(settled)return;settled=true;fn(v)};
      window.google.accounts.id.initialize({client_id:clientId,auto_select:false,cancel_on_tap_outside:true,use_fedcm_for_prompt:true,callback:async response=>{
        try{const {error}=await db.auth.signInWithIdToken({provider:'google',token:response.credential});if(error)throw error;finish(resolve)}catch(err){finish(reject,err)}
      }});
      window.google.accounts.id.prompt(n=>{if(n.isNotDisplayed?.()||n.isSkippedMoment?.()){finish(reject,new Error('Google account chooser did not open. Please try again.'))}});
      setTimeout(()=>finish(reject,new Error('Google sign-in timed out. Please try again.')),30000);
    });
    document.getElementById('bc-overlay')?.remove();toast('Signed in with Google.');setTimeout(()=>location.reload(),150);
  }catch(err){console.error('BrickCircle direct Google sign-in',err);toast(err?.message||'Google sign-in failed.');const btn=qs('.bc-auth-provider.google');if(btn){btn.disabled=false;btn.textContent='Continue with Google'}}
}

// Intercept only BrickCircle's Google button. This uses Google's Identity Services to obtain the
// ID token directly, then exchanges it with Supabase. The browser no longer navigates through the
// project's *.supabase.co OAuth authorize page, so users see the BrickCircle/Google experience.
document.addEventListener('click',e=>{
  const b=e.target?.closest?.('.bc-auth-provider.google,[data-oauth="google"]');if(!b)return;
  e.preventDefault();e.stopImmediatePropagation();directGoogle();
},true);
})();
