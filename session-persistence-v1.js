/* BrickCircle session persistence guard — protects valid sessions across mobile tab background/resume. */
(()=>{
'use strict';

const supabaseGlobal=window.supabase;
if(!supabaseGlobal?.createClient)return;

const originalCreateClient=supabaseGlobal.createClient.bind(supabaseGlobal);
let lastHiddenAt=0;
let lastVisibleAt=Date.now();
let lastRoute='';

async function resilientAuthLock(name,acquireTimeout,fn){
  const locks=window.navigator?.locks;
  if(!locks?.request)return fn();
  const controller=new AbortController();
  const timeoutMs=acquireTimeout>0?Math.min(acquireTimeout,3500):3500;
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    return await locks.request(name,{mode:'exclusive',signal:controller.signal},lock=>lock?fn():fn());
  }catch(error){
    if(error?.name!=='AbortError')throw error;
    console.warn('BrickCircle recovered a stalled cross-tab auth lock.');
    return fn();
  }finally{
    clearTimeout(timer);
  }
}

function rememberRoute(){
  const hash=location.hash||'#home';
  if(hash&&hash!=='#home')lastRoute=hash;
  try{if(hash)sessionStorage.setItem('bc_last_route',hash)}catch(_){ }
}

function isResumeWindow(){
  const now=Date.now();
  return document.hidden || now-lastHiddenAt<6000 || now-lastVisibleAt<2500;
}

async function recoverSession(auth){
  try{
    const current=await auth.getSession();
    if(current?.data?.session?.user)return current.data.session;
  }catch(_){ }
  try{
    const refreshed=await auth.refreshSession();
    if(refreshed?.data?.session?.user)return refreshed.data.session;
  }catch(_){ }
  return null;
}

function wrapClient(client){
  if(!client?.auth||client.auth.__bcPersistenceWrapped)return client;
  client.auth.__bcPersistenceWrapped=true;

  const auth=client.auth;
  const originalOnAuthStateChange=auth.onAuthStateChange.bind(auth);

  auth.onAuthStateChange=(callback)=>originalOnAuthStateChange((event,session)=>{
    if(event!=='SIGNED_OUT' || !isResumeWindow()){
      callback(event,session);
      return;
    }

    // Supabase holds an internal auth lock while this callback runs. Defer all
    // Supabase calls so getSession/refreshSession cannot deadlock app startup.
    setTimeout(async()=>{
      await new Promise(resolve=>setTimeout(resolve,350));
      const recovered=await recoverSession(auth);
      if(recovered){
        callback('TOKEN_REFRESHED',recovered);
        queueMicrotask(()=>window.bcV3Refresh?.());
        return;
      }

      callback('SIGNED_OUT',null);
    },0);
  });

  const validateResume=async()=>{
    if(document.hidden)return;
    const session=await recoverSession(auth);
    if(!session)return;

    const remembered=lastRoute||(()=>{try{return sessionStorage.getItem('bc_last_route')||''}catch(_){return ''}})();
    if((location.hash||'#home')==='#home' && remembered && remembered!=='#home'){
      location.hash=remembered;
    }
    queueMicrotask(()=>window.bcV3Refresh?.());
  };

  document.addEventListener('visibilitychange',()=>{
    if(document.hidden){
      lastHiddenAt=Date.now();
      rememberRoute();
      return;
    }
    lastVisibleAt=Date.now();
    validateResume();
  });
  window.addEventListener('pagehide',()=>{lastHiddenAt=Date.now();rememberRoute()});
  window.addEventListener('pageshow',event=>{lastVisibleAt=Date.now();if(event.persisted)validateResume()});
  window.addEventListener('focus',()=>{lastVisibleAt=Date.now();validateResume()});

  return client;
}

supabaseGlobal.createClient=(url,key,options={})=>{
  const authOptions={
    persistSession:true,
    autoRefreshToken:true,
    detectSessionInUrl:true,
    lock:resilientAuthLock,
    ...(options.auth||{})
  };
  return wrapClient(originalCreateClient(url,key,{...options,auth:authOptions}));
};
})();
