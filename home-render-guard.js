/* BrickCircle home render guard.
   The legacy V2.1 client still owns application data/loading. Its legacy Home renderer
   can complete asynchronously after the modern Home has mounted and overwrite it.
   This narrow compatibility guard blocks only that obsolete Home write; all other
   #app renders remain untouched. Remove this file when v2prod.js no longer contains
   the legacy V2.1 Home template. */
(()=>{
  const app=document.getElementById('app');
  const descriptor=Object.getOwnPropertyDescriptor(Element.prototype,'innerHTML');
  if(!app||!descriptor?.get||!descriptor?.set)return;
  const isHome=()=>((location.hash||'#home').slice(1)||'home')==='home';
  const isLegacyHome=value=>{
    const text=String(value??'');
    return text.includes('V2.1 · LIVE PRODUCTION')&&text.includes('Your LEGO collection.');
  };
  Object.defineProperty(app,'innerHTML',{
    configurable:true,
    get(){return descriptor.get.call(this);},
    set(value){
      const stable=this.querySelector?.('[data-bc-home-stable="1"]');
      if(isHome()&&stable&&isLegacyHome(value))return;
      descriptor.set.call(this,value);
    }
  });
})();
