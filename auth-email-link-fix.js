/* BrickCircle signup confirmation hardening.
   Uses Supabase confirmation-link/token flow instead of expecting a numeric OTP.
   Adds resend cooldown, double-submit protection, and clearer unconfirmed-email recovery.
*/
(()=>{
  const SUPABASE_URL='https://nsxtromjdpdscknadxez.supabase.co';
  const SUPABASE_KEY='sb_publishable_JJhVbgGblHrnKuPOsJkxQ_zRoQNlIL';
  const CONFIRM_URL='https://brickcircle.club/auth-confirm.html';
  const sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
  let busy=false;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function statusBox(html,kind='note'){
    let el=document.querySelector('#afstatus');
    if(!el){
      el=document.createElement('div');el.id='afstatus';
      document.querySelector('#afbody .form')?.appendChild(el);
    }
    el.innerHTML=`<div class="authfix-${kind}">${html}</div>`;
  }
  function setBusy(btn,on){
    if(!btn)return;
    btn.disabled=on;
    if(on){btn.dataset.oldText=btn.textContent;btn.textContent='Working…'}
    else btn.textContent=btn.dataset.oldText||btn.textContent;
  }
  function rememberSignup(email,name,country,city){
    try{localStorage.setItem('bc_pending_signup',JSON.stringify({email,name,country,city,ts:Date.now()}))}catch(_){ }
  }
  function pendingEmail(){
    try{return JSON.parse(localStorage.getItem('bc_pending_signup')||'{}').email||''}catch(_){return ''}
  }

  window.bcAuthFixSubmit=async e=>{
    e.preventDefault();
    if(busy)return false;
    const email=document.querySelector('#afemail')?.value.trim().toLowerCase()||'';
    const password=document.querySelector('#afpass')?.value||'';
    const name=document.querySelector('#afname')?.value.trim()||'';
    const country=document.querySelector('#afcountry')?.value||'';
    const city=document.querySelector('#afcity')?.value||'';
    const isSignup=!!document.querySelector('#afname');
    const btn=e.submitter;
    busy=true;setBusy(btn,true);
    try{
      if(isSignup){
        if(!country||!city){statusBox('Please select your country and city.','error');return false}
        rememberSignup(email,name,country,city);
        const {data,error}=await sb.auth.signUp({
          email,password,
          options:{data:{display_name:name,country,city},emailRedirectTo:CONFIRM_URL}
        });
        if(error){
          if(error.status===429||/rate limit|only request this after/i.test(error.message||'')){
            statusBox('A confirmation email was already requested. Please wait about 60 seconds before trying again.','error');
          }else statusBox(esc(error.message),'error');
          return false;
        }
        if(data?.session){
          statusBox('Account created and signed in. Loading BrickCircle…','success');
          setTimeout(()=>location.assign('/v2.html#home'),400);
          return false;
        }
        document.querySelector('#afbody').innerHTML=`
          <div class="authfix-success"><b>Account created.</b><br>We sent a secure confirmation <b>link</b> to <b>${esc(email)}</b>. Click the link in that email to activate your BrickCircle account. No OTP code is required.</div>
          <div class="authfix-note">If it is not in your inbox, check Spam/Promotions. Delivery can take a minute. Please do not create the account repeatedly.</div>
          <div class="authfix-actions"><button class="primary" type="button" onclick="window.bcAuthLinkResend()">Resend confirmation link</button><button type="button" onclick="window.bcAuthFixMode('in')">Back to sign in</button></div>
          <div id="afstatus"></div>`;
        return false;
      }

      const {error}=await sb.auth.signInWithPassword({email,password});
      if(error){
        if(error.code==='email_not_confirmed'||/email not confirmed/i.test(error.message||'')){
          rememberSignup(email,'','','');
          statusBox(`Your email has not been confirmed yet. Click the confirmation link sent to <b>${esc(email)}</b>. <button type="button" onclick="window.bcAuthLinkResend()" style="margin-left:6px">Resend link</button>`,'error');
        }else statusBox(esc(error.message),'error');
        return false;
      }
      location.reload();
      return false;
    }catch(err){
      statusBox(esc(err?.message||'Something went wrong. Please try again.'),'error');
      return false;
    }finally{
      busy=false;setBusy(btn,false);
    }
  };

  let lastResend=0;
  window.bcAuthLinkResend=async()=>{
    const email=pendingEmail();
    if(!email){statusBox('Please return to Create account and enter your email again.','error');return}
    const now=Date.now();
    const remaining=Math.ceil((60000-(now-lastResend))/1000);
    if(lastResend&&remaining>0){statusBox(`Please wait ${remaining} seconds before requesting another confirmation email.`,'note');return}
    lastResend=now;
    const {error}=await sb.auth.resend({type:'signup',email,options:{emailRedirectTo:CONFIRM_URL}});
    if(error){
      if(error.status===429||/rate limit|only request this after/i.test(error.message||'')) statusBox('Supabase is rate-limiting repeated email requests. Please wait about 60 seconds and try once more.','error');
      else statusBox(esc(error.message),'error');
      return;
    }
    statusBox(`A fresh confirmation link was sent to <b>${esc(email)}</b>.`,'success');
  };
})();
