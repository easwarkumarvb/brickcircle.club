/* BrickCircle global brand treatment */
(()=>{
 const LOGO='/assets/brickcircle-logo.webp?v=20260822-brand';
 const css=`.nav .logo.bc-brand{display:flex!important;align-items:center!important;padding:3px 0!important;min-width:180px}.nav .logo.bc-brand img{display:block;width:178px;max-height:58px;object-fit:contain;object-position:left center}.bc-brand-home{display:flex;justify-content:flex-start;margin:0 0 20px}.bc-brand-home img{display:block;width:min(390px,82vw);height:auto;border-radius:14px;box-shadow:0 12px 32px #0002}@media(max-width:640px){.nav .logo.bc-brand{min-width:130px}.nav .logo.bc-brand img{width:132px;max-height:48px}.bc-brand-home img{width:min(320px,90vw)}}`;
 function style(){if(document.getElementById('bc-brand-style'))return;const s=document.createElement('style');s.id='bc-brand-style';s.textContent=css;document.head.appendChild(s)}
 function apply(){style();const logo=document.querySelector('.nav .logo');if(logo){logo.classList.add('bc-brand');if(!logo.querySelector('img'))logo.innerHTML=`<img src="${LOGO}" alt="BrickCircle.club — Experience, Exchange, Trade">`;}
   const hero=document.querySelector('.bc23-hero-inner > div:first-child');if(hero&&!hero.querySelector('.bc-brand-home')){const b=document.createElement('div');b.className='bc-brand-home';b.innerHTML=`<img src="${LOGO}" alt="BrickCircle.club — Experience, Exchange, Trade">`;hero.insertBefore(b,hero.firstChild);}
 }
 document.addEventListener('DOMContentLoaded',apply);window.addEventListener('load',apply);window.addEventListener('hashchange',()=>setTimeout(apply,0));
 new MutationObserver(()=>apply()).observe(document.documentElement,{childList:true,subtree:true});
 apply();
})();