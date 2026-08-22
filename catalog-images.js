/* BrickCircle LEGO image renderer — Catalogue + My Collection */
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

  function imageUrl(set){
    const clean=String(set).trim();
    return FALLBACK[clean] || `${IMAGE_BASE}${encodeURIComponent(clean)}-1.jpg`;
  }

  function render(){
    /* Both Catalogue and My Collection use .sets/.card/.icon.
       The old renderer only searched #setlist, so Collection cards
       were never converted from the emoji placeholder. */
    document.querySelectorAll('.sets .card').forEach(card=>{
      const box=card.querySelector('.icon');
      if(!box || box.querySelector('img.bc-set-image')) return;

      const text=card.textContent||'';
      const m=text.match(/Set\s+(\d{4,6})/i);
      if(!m) return;

      const set=m[1];
      const url=imageUrl(set);

      box.innerHTML=`<img class="bc-set-image" src="${esc(url)}" alt="LEGO set ${esc(set)}" loading="lazy" referrerpolicy="no-referrer">`;
      box.classList.add('bc-image-box');
    });
  }

  const style=document.createElement('style');
  style.textContent=`
    .sets .icon.bc-image-box{
      height:190px!important;
      border-radius:12px;
      background:#fff;
      display:flex;
      align-items:center;
      justify-content:center;
      overflow:hidden;
      padding:8px;
    }
    .sets .bc-set-image{
      display:block;
      width:100%;
      height:100%;
      object-fit:contain;
    }
    .sets .bc-set-image:hover{
      transform:scale(1.02);
      transition:transform .15s ease;
    }
  `;
  document.head.appendChild(style);

  /* Render after initial load and after SPA navigation/rerenders. */
  new MutationObserver(render).observe(document.body,{childList:true,subtree:true});
  window.addEventListener('hashchange',()=>setTimeout(render,50));
  setInterval(render,1000);
  render();
})();
