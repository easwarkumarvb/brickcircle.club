/* BrickCircle auth reliability fix: OTP-first email confirmation.
   Uses the Supabase publishable key in the browser; RLS/auth enforce access.
*/
(()=>{
  const SUPABASE_URL='https://nsxtromjdpdscknadxez.supabase.co';
  const SUPABASE_KEY='sb_publishable_JJhVbgjGblHrnKuPOsJkxQ_zRoQNlIL';
  const sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
  const modal=()=>document.querySelector('#modal');
  const esc=s=>String(s??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
  let mode='in', pendingEmail='';

  const css=document.createElement('style');
  css.textContent='.authfix-note{padding:11px 13px;border-radius:10px;background:#f8fafc;border:1px solid #e5e7eb;margin:10px 0;font-size:14px}.authfix-error{padding:11px 13px;border-radius:10px;background:#fff1f2;color:#9f1239;border:1px solid #fecdd3;margin:10px 0;font-size:14px}.authfix-success{padding:11px 13px;border-radius:10px;background:#ecfdf3;color:#047857;border:1px solid #a7f3d0;margin:10px 0;font-size:14px}.authfix-code{font-size:28px;letter-spacing:8px;text-align:center;font-weight:900;padding:14px;border:1px dashed #cbd5e1;border-radius:12px;background:#f8fafc}.authfix-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.authfix-actions button{border:1px solid #d9dee7;background:#fff;border-radius:9px;padding:10px 13px;font-weight:750;cursor:pointer}.authfix-actions .primary{background:#111827;color:#fff;border-color:#111827}';
  document.head.appendChild(css);

  function box(){
    modal().innerHTML=`<div class="modalback"><div class="modalbox"><button class="close" onclick="window.bcAuthFixClose()">×</button><h2>Join BrickCircle</h2><p class="muted">Secure email verification for your collector account.</p><div class="tabs"><button id="afsi" class="${mode==='in'?'on':''}" onclick="window.bcAuthFixMode('in')">Sign in</button><button id="afsu" class="${mode==='up'?'on':''}" onclick="window.bcAuthFixMode('up')">Create account</button></div><div id="afbody"></div></div></div>`;
    renderForm();
  }
  function renderForm(message=''){
    const b=document.querySelector('#afbody'); if(!b)return;
    b.innerHTML=`<form class="form" onsubmit="return window.bcAuthFixSubmit(event)">
      <label>Email<input id="afemail" type="email" autocomplete="email" required placeholder="you@example.com"></label>
      <label>Password<input id="afpass" type="password" minlength="8" autocomplete="${mode==='in'?'current-password':'new-password'}" required placeholder="At least 8 characters"></label>
      ${mode==='up'?'<label>Display name<input id="afname" maxlength="60" autocomplete="name" required placeholder="Your collector name"></label>':''}
      ${message?`<div class="authfix-error">${esc(message)}</div>`:''}
      <button class="primary" type="submit">${mode==='up'?'Create account':'Sign in'}</button>
      ${mode==='in'?'<button type="button" onclick="window.bcAuthFixForgot()">Forgot password?</button>':''}
    </form>`;
  }
  function otpForm(email){
    const b=document.querySelector('#afbody');
    b.innerHTML=`<div class="authfix-note"><b>Check your email.</b><br>We sent a verification code to <b>${esc(email)}</b>. Enter the code exactly as shown in the email. If you do not see it, check Spam/Promotions.</div><form class="form" onsubmit="return window.bcAuthFixVerify(event)"><label>Verification code<input id="afotp" inputmode="numeric" autocomplete="one-time-code" maxlength="10" pattern="[0-9]{6,10}" required placeholder="Enter your code" class="authfix-code"></label><button class="primary" type="submit">Verify email</button><div class="authfix-actions"><button type="button" onclick="window.bcAuthFixResend()">Resend code</button><button type="button" onclick="window.bcAuthFixMode('in')">Back to sign in</button></div><div id="afstatus"></div></form>`;
  }
  window.bcAuthFixMode=(m)=>{mode=m;box()};
  window.bcAuthFixClose=()=>{modal().innerHTML=''};
  window.bcAuth=()=>{mode='in';box()};
  window.bcAuthFixSubmit=async e=>{
    e.preventDefault();
    const email=document.querySelector('#afemail').value.trim().toLowerCase();
    const password=document.querySelector('#afpass').value;
    const name=document.querySelector('#afname')?.value.trim()||'';
    const btn=e.submitter; if(btn){btn.disabled=true;btn.textContent='Working…'}
    if(mode==='up'){
      const {data,error}=await sb.auth.signUp({email,password,options:{data:{display_name:name},emailRedirectTo:'https://brickcircle.club'}});
      if(error){renderForm(error.message);return false}
      if(data.user){pendingEmail=email;otpForm(email);return false}
      renderForm('We could not create the account. Please try again.');
      return false;
    }
    const {error}=await sb.auth.signInWithPassword({email,password});
    if(error){renderForm(error.message);return false}
    window.location.reload();
    return false;
  };
  window.bcAuthFixVerify=async e=>{
    e.preventDefault();
    const token=document.querySelector('#afotp').value.trim();
    const status=document.querySelector('#afstatus');
    const {data,error}=await sb.auth.verifyOtp({email:pendingEmail,token,type:'email'});
    if(error){status.innerHTML=`<div class="authfix-error">${esc(error.message)}</div>`;return false}
    status.innerHTML='<div class="authfix-success">Email verified. Signing you in…</div>';
    setTimeout(()=>window.location.reload(),300);
    return false;
  };
  window.bcAuthFixResend=async()=>{
    const status=document.querySelector('#afstatus');
    const {error}=await sb.auth.resend({type:'signup',email:pendingEmail,options:{emailRedirectTo:'https://brickcircle.club'}});
    if(error){status.innerHTML=`<div class="authfix-error">${esc(error.message)}</div>`}
    else{status.innerHTML='<div class="authfix-success">A new verification code was sent. Please wait at least 60 seconds before requesting another.</div>'}
  };
  window.bcAuthFixForgot=async()=>{
    const email=prompt('Enter the email address for your BrickCircle account:');
    if(!email)return;
    const {error}=await sb.auth.resetPasswordForEmail(email.trim().toLowerCase(),{redirectTo:'https://brickcircle.club'});
    alert(error?error.message:'If an account exists, a password reset email has been sent.');
  };
})();
