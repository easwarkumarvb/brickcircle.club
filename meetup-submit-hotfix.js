(()=>{
'use strict';
function patch(root=document){
  const form=root?.matches?.('#bc-meet-form')?root:root?.querySelector?.('#bc-meet-form');
  if(!form)return;
  const button=form.querySelector('.bc-form-actions .bc-btn.primary');
  if(button&&!button.hasAttribute('type'))button.setAttribute('type','submit');
}
patch();
const observer=new MutationObserver(records=>{
  for(const record of records){
    for(const node of record.addedNodes){
      if(node?.nodeType===1)patch(node);
    }
  }
});
observer.observe(document.documentElement,{childList:true,subtree:true});
})();
