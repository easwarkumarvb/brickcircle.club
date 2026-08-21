/* BrickCircle catalogue image renderer. Loads the catalogue image from the set number instead of the emoji placeholder. */
(()=>{
  const IMAGE_BASE='https://images.brickset.com/sets/images/';
  const FALLBACK={
    '10283':'https://images.brickset.com/sets/images/10283-1.jpg',
    '10307':'https://images.brickset.com/sets/images/10307-1.jpg',
    '10318':'https://images.brickset.com/sets/images/10318-1.jpg',
    '21309':'https://images.brickset.com/sets/images/21309-1.jpg',
    '42115':'https://images.brickset.com/sets/images/42115-1.jpg',
    '42141':'https://images.brickset.com/sets/images/42141-1.jpg',
    '42143':'https://images.brickset.com/sets/images/42143-1.jpg',
    '75313':'https://images.brickset.com/sets/images/75313-1.jpg'
  };
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function render(){
    document.querySelectorAll('#setlist .card').forEach(card=>{
      if(card.querySelector('img.bc-set-image')) return;
      const text=card.textContent||'';
      const m=text.match(/Set\s+(\d{4,6})/i);
      if(!m) return;
      const set=m[1], url=FALLBACK[set]||`${IMAGE_BASE}${set}-1.jpg`;
      const box=card.querySelector('.icon');
      if(!box) return;
      box.innerHTML=`<img class="bc-set-image" src="${esc(url)}" alt="LEGO set ${esc(set)}" loading="lazy" referrerpolicy="no-referrer">`;
      box.style.cssText='height:190px;border-radius:12px;background:#fff;display:flex;align-items:center;justify-content:center;overflow:hidden;padding:8px';
    });
  }
  const style=document.createElement('style');
  style.textContent='.bc-set-image{display:block;width:100%;height:100%;object-fit:contain}.bc-set-image:hover{transform:scale(1.02);transition:transform .15s ease}';
  document.head.appendChild(style);
  new MutationObserver(render).observe(document.body,{childList:true,subtree:true});
  window.addEventListener('hashchange',()=>setTimeout(render,50));
  setInterval(render,1000);
  render();
})();
