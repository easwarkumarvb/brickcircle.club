/* BrickCircle accessibility hardening: semantic names without rendering ownership. */
(()=>{
  'use strict';
  let seq=0,scheduled=false;
  const nextId=()=>`bc-a11y-${++seq}`;
  function nameField(field){
    const label=field.querySelector(':scope > label');
    const control=field.querySelector(':scope > input, :scope > select, :scope > textarea');
    if(!label||!control)return;
    if(!control.id)control.id=nextId();
    if(!label.htmlFor)label.htmlFor=control.id;
  }
  function nameDialog(dialog){
    if(dialog.getAttribute('aria-label')||dialog.getAttribute('aria-labelledby'))return;
    const title=dialog.querySelector('h1,h2,h3');
    if(title){if(!title.id)title.id=nextId();dialog.setAttribute('aria-labelledby',title.id)}
  }
  function apply(){
    scheduled=false;
    document.querySelectorAll('.bc-field').forEach(nameField);
    document.querySelectorAll('[role="dialog"]').forEach(nameDialog);
    document.querySelectorAll('.bc-close').forEach(b=>{if(!b.getAttribute('aria-label'))b.setAttribute('aria-label','Close dialog')});
    const q=document.getElementById('bc-q');if(q&&!q.getAttribute('aria-label'))q.setAttribute('aria-label','Search LEGO sets by set number, name or theme');
    const theme=document.getElementById('bc-theme');if(theme&&!theme.getAttribute('aria-label'))theme.setAttribute('aria-label','Filter LEGO sets by theme');
    const year=document.getElementById('bc-year');if(year&&!year.getAttribute('aria-label'))year.setAttribute('aria-label','Filter LEGO sets by year');
    document.querySelectorAll('textarea[placeholder]:not([aria-label])').forEach(x=>x.setAttribute('aria-label',x.getAttribute('placeholder')||'Message'));
    document.querySelectorAll('input[placeholder]:not([aria-label])').forEach(x=>x.setAttribute('aria-label',x.getAttribute('placeholder')||'Input'));
  }
  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(apply)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',apply,{once:true});else apply();
  window.addEventListener('hashchange',schedule);
  document.addEventListener('click',schedule,true);
  document.addEventListener('submit',schedule,true);
  document.addEventListener('change',schedule,true);
  [100,400,1000].forEach(ms=>setTimeout(apply,ms));
  window.bcApplyA11y=apply;
})();
