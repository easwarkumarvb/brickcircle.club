/* A deadline is not proof of logout. Never retry while the SDK operation is pending. */
(()=>{'use strict';
window.bcCreateLocalLogout=auth=>{
  let pending=false;
  return {get pending(){return pending},async run(){
    if(pending)throw new Error('Sign out is still pending. Wait for it to finish before retrying.');
    pending=true;
    let timer;
    const operation=Promise.resolve().then(()=>auth.signOut({scope:'local'})).then(result=>{
      if(!result||result.error!==null)throw result?.error||new Error('Sign out was not confirmed.');
    }).finally(()=>{pending=false});
    try{await Promise.race([operation,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Sign out timed out; it is not confirmed. Wait, then retry or reload to verify your session.')),10000)})])}
    finally{clearTimeout(timer)}
  }};
};
})();
