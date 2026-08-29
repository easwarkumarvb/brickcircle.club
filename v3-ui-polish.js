/* BrickCircle V3 UI polish — delegates secondary actions to the single V3 router. */
(()=>{
  'use strict';
  const routable=new Set(['home','browse','sets','matches','exchanges','profile']);

  document.addEventListener('click',event=>{
    const action=event.target.closest?.('[data-action]');
    if(action&&routable.has(action.dataset.action)&&action.dataset.action==='profile'){
      event.preventDefault();
      window.bcNav?.(action.dataset.action);
    }
  });

  document.addEventListener('keydown',event=>{
    if(event.key!=='Escape')return;
    document.getElementById('bc-overlay')?.remove();
    document.getElementById('bc-drawer-overlay')?.remove();
  });

  const style=document.createElement('style');
  style.id='bc-v3-polish-style';
  style.textContent=`
    @media(max-width:820px){
      .bc-top-actions .bc-icon-btn{display:grid!important;width:38px!important;min-width:38px!important;height:38px!important;border-radius:11px!important}
      .bc-top-actions{gap:4px!important;margin-left:4px!important}
      .bc-avatar-btn{width:38px!important;min-width:38px!important;height:38px!important}
    }
    @media(max-width:420px){
      .bc-logo img{max-width:132px!important;object-fit:contain}
      .bc-topbar-in{gap:6px!important}
    }
    @media(prefers-reduced-motion:reduce){
      *,*::before,*::after{scroll-behavior:auto!important;animation-duration:.001ms!important;animation-iteration-count:1!important;transition-duration:.001ms!important}
    }
  `;
  document.head.appendChild(style);
})();
