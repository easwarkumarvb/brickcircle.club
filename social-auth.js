/* BrickCircle social login + minimal onboarding. */
(()=>{
  const URL='https://nsxtromjdpdscknadxez.supabase.co';
  const KEY='sb_publishable_JJhVbgjGblHrnKuPOsJkxQ_zRoQNlIL';
  const db=window.supabase?.createClient(URL,KEY);
  if(!db) return;

  const CITIES=['Bengaluru','Mumbai','Delhi','Hyderabad','Chennai','Kolkata','Pune','Kochi','Mysuru','London','Manchester','Birmingham','Berlin','Munich','Frankfurt','Tokyo','Osaka','Yokohama','New York','Los Angeles','Chicago','San Francisco','Seattle','Boston','Austin','Singapore','Toronto','Vancouver','Sydney','Melbourne','Dubai','Abu Dhabi','Paris','Amsterdam'];
  const COUNTRIES=['India','United States','United Kingdom','Germany','Japan','Singapore','Canada','Australia','United Arab Emirates','France','Netherlands'];
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const modal=()=>document.querySelector('#modal');

  const ref=new URLSearchParams(location.search).get('ref');
  if(ref) localStorage.setItem('bc_pending_referral',ref.slice(0,80));

  async function providerSettings(){
    try{
      const r=await fetch(`${URL}/auth/v1/settings`,{headers:{apikey:KEY}});
      if(!r.ok) return {};
      return (await r.json())?.external||{};
    }catch(_){return {}}
  }

  async function oauth(provider){
    const pendingRef=localStorage.getItem('bc_pending_referral');
    if(pendingRef) localStorage.setItem('bc_pending_referral',pendingRef);
    const redirect=`${location.origin}/v2.html?oauth=1`;
    const {error}=await db.auth.signInWithOAuth({provider,options:{redirectTo:redirect}});
    if(error) alert(`${provider==='google'?'Google':'Apple'} sign-in is not available yet: ${error.message}`);
  }

  function emailFallback(){
    if(window.bcAuthFix){ window.bcAuthFix(); return; }
    if(window.bcAuth) window.bcAuth();
  }

  async function renderAuth(){
    const settings=await providerSettings();
    const google=!!settings.google, apple=!!settings.apple;
    modal().innerHTML=`<div class="modalback"><div class="modalbox"><button class="close" onclick="window.bcSocialClose()">×</button>
      <h2>Join BrickCircle</h2>
      <p class="muted">Start exchanging LEGO sets with collectors near you. Social sign-in takes only a few seconds.</p>
      <div style="display:grid;gap:10px;margin:18px 0">
        <button class="primary" style="padding:13px" ${google?'':'disabled'} onclick="window.bcSocialOAuth('google')">Continue with Google</button>
        <button style="padding:13px;background:#000;color:#fff;border-radius:9px;border:1px solid #000" ${apple?'':'disabled'} onclick="window.bcSocialOAuth('apple')">Continue with Apple</button>
      </div>
      ${(!google&&!apple)?'<div class="notice">Social providers are not enabled in Supabase yet. The UI and callback flow are ready; provider credentials still need to be configured.</div>':''}
      <div style="display:flex;align-items:center;gap:10px;margin:16px 0"><span style="height:1px;background:#e5e7eb;flex:1"></span><span class="muted">or</span><span style="height:1px;background:#e5e7eb;flex:1"></span></div>
      <button style="width:100%;padding:12px" onclick="window.bcSocialEmail()">Continue with email</button>
      <p class="muted" style="font-size:12px;margin-top:14px">By continuing, you agree to BrickCircle's community and safety rules.</p>
    </div></div>`;
  }

  function options(xs,selected=''){return '<option value="">Select</option>'+xs.map(x=>`<option ${x===selected?'selected':''}>${esc(x)}</option>`).join('')}

  async function ensureProfile(user){
    if(!user) return;
    const {data:profile}=await db.from('profiles').select('id,display_name,country,city').eq('id',user.id).maybeSingle();
    const pendingRef=localStorage.getItem('bc_pending_referral');
    if(pendingRef){
      await db.rpc('bc_claim_referral',{p_code:pendingRef}).catch(()=>{});
      localStorage.removeItem('bc_pending_referral');
    }
    const provider=user.app_metadata?.provider||user.identities?.[0]?.provider||'unknown';
    await db.rpc('bc_record_auth_provider',{p_provider:provider}).catch(()=>{});
    if(profile?.country&&profile?.city) return;

    const inferredName=profile?.display_name||user.user_metadata?.full_name||user.user_metadata?.name||'';
    modal().innerHTML=`<div class="modalback"><div class="modalbox">
      <h2>Where do you collect?</h2>
      <p class="muted">We only need your location to find local exchanges. You can add everything else later.</p>
      <label>Display name</label><input id="bc-social-name" value="${esc(inferredName)}" placeholder="Your collector name">
      <label>Country</label><select id="bc-social-country">${options(COUNTRIES,profile?.country||'')}</select>
      <label>City</label><input id="bc-social-city" list="bc-social-cities" value="${esc(profile?.city||'')}" placeholder="Start typing your city"><datalist id="bc-social-cities">${CITIES.map(c=>`<option value="${esc(c)}">`).join('')}</datalist>
      <p class="muted" style="font-size:12px">Use the city where you can meet another collector in person.</p>
      <button class="primary" style="width:100%;padding:12px;margin-top:10px" onclick="window.bcSocialComplete()">Continue to my collection</button>
    </div></div>`;
  }

  async function complete(){
    const {data:{user}}=await db.auth.getUser(); if(!user)return;
    const name=document.querySelector('#bc-social-name')?.value?.trim();
    const country=document.querySelector('#bc-social-country')?.value?.trim();
    const city=document.querySelector('#bc-social-city')?.value?.trim();
    if(!name||!country||!city){alert('Please add your display name, country and city.');return;}
    const {error}=await db.from('profiles').update({display_name:name,country,city,updated_at:new Date().toISOString()}).eq('id',user.id);
    if(error){alert(error.message);return;}
    await db.from('growth_events').insert({user_id:user.id,event_name:'social_onboarding_completed',properties:{country,city}}).catch(()=>{});
    modal().innerHTML='';
    history.replaceState({},'',location.pathname+'#collection');
    if(window.bcNav) window.bcNav('collection'); else location.hash='collection';
  }

  window.bcSocialOAuth=oauth;
  window.bcSocialEmail=emailFallback;
  window.bcSocialClose=()=>{modal().innerHTML=''};
  window.bcSocialComplete=complete;
  window.bcSocialAuth=renderAuth;

  // Make social auth the default entry point without deleting the legacy email flow.
  setTimeout(()=>{ window.bcAuth=renderAuth; },50);

  db.auth.onAuthStateChange((_event,session)=>{ if(session?.user) setTimeout(()=>ensureProfile(session.user),80); });
  db.auth.getSession().then(({data})=>{ if(data?.session?.user) ensureProfile(data.session.user); });
})();