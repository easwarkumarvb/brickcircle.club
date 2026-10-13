/* BrickCircle owner-photo duplicate guard.
   Prevents async hydration races from appending the same counterparty photo more than once.
*/
(()=>{
'use strict';

function dedupeOwnerProofs(root=document){
  const cards=[...root.querySelectorAll?.('.bc-match')||[]];
  for(const card of cards){
    const sides=[...card.querySelectorAll('.bc-match-side')];
    let found=false;
    for(const side of sides){
      const proofs=[...side.querySelectorAll(':scope > .bc-owner-proof')];
      if(!proofs.length)continue;
      found=true;
      const keep=proofs[0];
      keep.dataset.ownerProofCanonical='1';
      for(const duplicate of proofs.slice(1))duplicate.remove();
    }
    if(found)card.dataset.counterpartyPhotoHydrated='1';
  }
}

let scheduled=false;
function schedule(root=document){
  if(scheduled)return;
  scheduled=true;
  queueMicrotask(()=>{
    scheduled=false;
    dedupeOwnerProofs(root);
  });
}

document.addEventListener('bc:render',()=>schedule(document));
window.addEventListener('DOMContentLoaded',()=>dedupeOwnerProofs());
window.addEventListener('load',()=>dedupeOwnerProofs());
dedupeOwnerProofs();
})();
