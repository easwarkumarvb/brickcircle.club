/* BrickCircle — one exchangeable set UX rule. Keeps legacy V3 copy/progress aligned with the simplified first-match requirement. */
(()=>{
'use strict';

function rewriteText(node){
  if(!node)return;
  const walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT);
  const replacements=[
    ['Make at least 2 sets available to exchange.','Make at least 1 set available to exchange.'],
    ['2 exchangeable','1 exchangeable'],
    ['Make 2 sets available','Make 1 set available'],
    ['Make 2 owned sets available','Make 1 owned set available']
  ];
  let t;
  while((t=walker.nextNode())){
    let value=t.nodeValue;
    for(const [from,to] of replacements)value=value.replaceAll(from,to);
    if(value!==t.nodeValue)t.nodeValue=value;
  }
}

function syncAvailableStep(){
  const available=document.querySelectorAll('[data-exchangeable]:checked').length;
  document.querySelectorAll('.bc-guided-progress .bc-check').forEach(step=>{
    const title=step.querySelector('b')?.textContent||'';
    if(!title.includes('Available to Exchange'))return;
    rewriteText(step);
    if(available>=1)step.classList.add('done');
    const textNodes=[...step.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE);
    textNodes.forEach(n=>{n.nodeValue=n.nodeValue.replace(/\b\d+\/2 sets available\b/g,`${available}/1 set available`)});
    step.querySelectorAll('*').forEach(el=>{
      if(el.children.length===0&&/\d+\/2 sets available/.test(el.textContent))el.textContent=el.textContent.replace(/\d+\/2 sets available/g,`${available}/1 set available`);
    });
  });

  if(available>=1){
    document.querySelectorAll('button,.bc-btn').forEach(btn=>{
      if(btn.textContent.trim()==='Make one more set available')btn.textContent='Explore more sets';
    });
  }
}

function apply(){
  const main=document.getElementById('bc-main');
  if(!main)return;
  rewriteText(main);
  syncAvailableStep();
}

let queued=false;
const schedule=()=>{
  if(queued)return;
  queued=true;
  requestAnimationFrame(()=>{queued=false;apply()});
};
new MutationObserver(schedule).observe(document.documentElement,{subtree:true,childList:true,characterData:true});
window.addEventListener('hashchange',schedule);
window.addEventListener('bc:v3',schedule);
schedule();
})();
