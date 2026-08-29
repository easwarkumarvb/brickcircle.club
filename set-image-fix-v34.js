/* BrickCircle V3.4 set-image reliability/performance guard. */
(()=>{
  'use strict';
  const setKey=set=>/-\d+$/.test(String(set||''))?String(set):`${String(set||'')}-1`;
  const directUrl=set=>`https://images.brickset.com/sets/images/${encodeURIComponent(setKey(set))}.jpg`;
  const proxyUrl=set=>`https://images.weserv.nl/?url=${encodeURIComponent(`images.brickset.com/sets/images/${setKey(set)}.jpg`)}&w=700&fit=contain&output=jpg`;

  function prioritize(root=document){
    const grids=[];
    if(root?.matches?.('.bc-set-grid'))grids.push(root);
    root?.querySelectorAll?.('.bc-set-grid').forEach(x=>grids.push(x));
    grids.forEach(grid=>{
      [...grid.querySelectorAll('img[data-set-image]')].forEach((img,index)=>{
        if(index<8){img.loading='eager';img.fetchPriority='high'}
      });
    });
  }

  function correct(img){
    if(!(img instanceof HTMLImageElement)||!img.dataset.setImage)return;
    const set=img.dataset.setImage;
    const direct=directUrl(set);
    if(img.src!==direct){
      img.dataset.bcImageStage='brickset';
      img.hidden=false;
      img.nextElementSibling?.setAttribute('hidden','');
      img.src=direct;
    }else if(!img.dataset.bcImageStage){
      img.dataset.bcImageStage='brickset';
    }
  }

  function scan(root=document){
    if(root?.matches?.('img[data-set-image]'))correct(root);
    root?.querySelectorAll?.('img[data-set-image]').forEach(correct);
    prioritize(root);
  }

  document.addEventListener('error',event=>{
    const img=event.target;
    if(!(img instanceof HTMLImageElement)||!img.dataset.setImage)return;
    event.stopImmediatePropagation();
    const set=img.dataset.setImage;
    const direct=directUrl(set);
    const proxy=proxyUrl(set);
    if(img.src!==direct&&img.dataset.bcImageStage!=='proxy'){
      img.dataset.bcImageStage='brickset';img.hidden=false;img.src=direct;return;
    }
    if(img.dataset.bcImageStage!=='proxy'){
      img.dataset.bcImageStage='proxy';img.hidden=false;img.src=proxy;return;
    }
    img.hidden=true;img.nextElementSibling?.removeAttribute('hidden');
  },true);

  const observer=new MutationObserver(mutations=>{
    for(const mutation of mutations){
      for(const node of mutation.addedNodes){
        if(node.nodeType===1)scan(node);
      }
    }
  });
  observer.observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('DOMContentLoaded',()=>scan());
  setTimeout(()=>scan(),0);

  window.bcSetImageTools={setKey,directUrl,proxyUrl,scan};
})();
