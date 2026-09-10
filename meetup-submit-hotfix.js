(()=>{
'use strict';
function patch(root=document){
  const form=root?.matches?.('#bc-meet-form')?root:root?.querySelector?.('#bc-meet-form');
  if(!form)return;
  const button=form.querySelector('.bc-form-actions .bc-btn.primary');
  if(button&&!button.hasAttribute('type'))button.setAttribute('type','submit');
}
patch();
document.addEventListener('bc:render',event=>patch(event.detail?.root||document));
})();
