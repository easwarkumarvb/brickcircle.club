/* A deadline is not proof of logout. Never retry while the SDK operation is pending. */
(()=>{'use strict';
window.bcCreateLocalLogout=auth=>{
  let pending=false;
  return {get pending(){return pending},async run(beforeLogout=()=>Promise.resolve()){
    if(pending)throw new Error('Sign out is still pending. Wait for it to finish before retrying.');
    pending=true;
    let timer,expired=false;
    const operation=Promise.resolve().then(async()=>{
      await beforeLogout();
      // A drain that finishes after the deadline must not silently log out a
      // later session. Stay locked until an explicit retry confirms logout.
      if(expired)throw new Error('Sign out was not confirmed.');
      return auth.signOut({scope:'local'});
    }).then(result=>{
      if(!result||result.error!==null)throw result?.error||new Error('Sign out was not confirmed.');
    }).finally(()=>{pending=false});
    try{await Promise.race([operation,new Promise((_,reject)=>{timer=setTimeout(()=>{expired=true;reject(new Error('Sign out timed out; it is not confirmed. Wait, then retry or reload to verify your session.'))},10000)})])}
    finally{clearTimeout(timer)}
  }};
};
})();
