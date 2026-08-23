/* BrickCircle LEGO image renderer — Catalogue + My Collection.
   Uses resilient external image loading with retry/fallback so mobile beta users do not see broken images. */
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
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const direct=set=>FALLBACK[set]||`${IMAGE_BASE}${encodeURIComponent(set)}-1.jpg`;
  const proxied=set=>`https://images.weserv.nl/?url=${encodeURIComponent(`images.brickset.com/sets/images/${set}-1.jpg`)}&w=900&fit=contain&output=jpg`;

  function placeholder(box,set,name){
    box.innerHTML=`<div class="bc-set-placeholder" role="img" aria-label="LEGO set ${esc(set)} image unavailable"><div class="bc-mini-bricks"><i></i><i></i><i></i><i></i></div><strong>LEGO ${esc(set)}</strong><span>${esc(name||'Collector set')}</span><small>Image temporarily unavailable</small></div>`;
    box.classList.add('bc-image-box');
  }

  function wire(img,box,set,name){
    let stage=0;
    img.addEventListener('error',()=>{
      if(stage===0){stage=1;img.src=proxied(set);return}
      placeholder(box,set,name);
    },{once:false});
    if(img.complete && img.naturalWidth===0) img.dispatchEvent(new Event('error'));
  }

  function render(){
    document.querySelectorAll('.sets .card').forEach(card=>{
      const box=card.querySelector('.icon');
      if(!box || box.dataset.bcImageReady==='1') return;
      const text=card.textContent||'';
      const m=text.match(/(?:Set\s*)?(\d{4,6})(?:\s*·|\b)/i);
      if(!m) return;
      const set=m[1];
      const h3=card.querySelector('h3');
      const name=h3?.textContent?.trim()||'';
      box.dataset.bcImageReady='1';
      box.classList.add('bc-image-box');
      const img=document.createElement('img');
      img.className='bc-set-image';img.alt=`LEGO set ${set}${name?' — '+name:''}`;img.loading='lazy';img.decoding='async';img.src=direct(set);
      box.replaceChildren(img);wire(img,box,set,name);
    });
  }

  const style=document.createElement('style');
  style.textContent=`
    .sets .icon.bc-image-box{height:190px!important;border-radius:12px;background:#fff;display:flex;align-items:center;justify-content:center;overflow:hidden;padding:8px;border:1px solid #eef1f5}
    .sets .bc-set-image{display:block;width:100%;height:100%;object-fit:contain;transition:transform .15s ease}.sets .bc-set-image:hover{transform:scale(1.02)}
    .bc-set-placeholder{width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:14px;background:linear-gradient(145deg,#f8fafc,#fff8dc);color:#172033}.bc-set-placeholder strong{font-size:20px;margin-top:10px}.bc-set-placeholder span{font-size:12px;color:#667085;margin-top:4px;max-width:90%}.bc-set-placeholder small{font-size:10px;color:#98a2b3;margin-top:8px}.bc-mini-bricks{display:flex;gap:4px}.bc-mini-bricks i{width:20px;height:13px;border-radius:3px}.bc-mini-bricks i:nth-child(1){background:#e54235}.bc-mini-bricks i:nth-child(2){background:#2f7bd4}.bc-mini-bricks i:nth-child(3){background:#2aa15f}.bc-mini-bricks i:nth-child(4){background:#f0ba24}
    @media(max-width:640px){.sets .icon.bc-image-box{height:170px!important}}
  `;
  document.head.appendChild(style);
  const observer=new MutationObserver(()=>requestAnimationFrame(render));observer.observe(document.body,{childList:true,subtree:true});
  window.addEventListener('hashchange',()=>setTimeout(render,50));window.addEventListener('load',render);setInterval(render,1500);render();
})();
