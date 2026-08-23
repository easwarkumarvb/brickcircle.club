/* BrickCircle global brand treatment */
(()=>{
 const LOGO='/assets/brickcircle-logo.webp?v=20260822-brand';
 const css=`.nav .logo.bc-brand{display:flex!important;align-items:center!important;padding:3px 0!important;min-width:180px;cursor:pointer}.nav .logo.bc-brand img{display:block;width:178px;max-height:58px;object-fit:contain;object-position:left center}.bc-brand-home{display:flex;justify-content:flex-start;margin:0 0 20px;cursor:pointer}.bc-brand-home img{display:block;width:min(390px,82vw);height:auto;border-radius:14px;box-shadow:0 12px 32px #0002}@media(max-width:640px){.nav .logo.bc-brand{min-width:130px}.nav .logo.bc-brand img{width:132px;max-height:48px}.bc-brand-home img{width:min(320px,90vw)}}`;
 function style(){if(document.getElementById('bc-brand-style'))return;const s=document.createElement('style');s.id='bc-brand-style';s.textContent=css;document.head.appendChild(s)}
 function goHome(e){if(e)e.preventDefault();if(typeof window.bcNav==='function'){window.bcNav('home');return;}if(location.pathname!=='/v2.html'){location.href='/v2.html#home';return;}if(location.hash!=='#home')location.hash='home';else window.dispatchEvent(new HashChangeEvent('hashchange'));}
 function apply(){style();const logo=document.querySelector('.nav .logo');if(logo){logo.classList.add('bc-brand');if(!logo.querySelector('img'))logo.innerHTML=`<img src="${LOGO}" alt="BrickCircle.club — Experience, Exchange, Trade">`;logo.setAttribute('role','link');logo.setAttribute('tabindex','0');logo.setAttribute('aria-label','Go to BrickCircle home');logo.onclick=goHome;logo.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();goHome(e)}};}
   const hero=document.querySelector('.bc23-hero-inner > div:first-child');if(hero&&!hero.querySelector('.bc-brand-home')){const b=document.createElement('div');b.className='bc-brand-home';b.innerHTML=`<img src="${LOGO}" alt="BrickCircle.club — Experience, Exchange, Trade">`;hero.insertBefore(b,hero.firstChild);}
   const homeLogo=document.querySelector('.bc-brand-home');if(homeLogo){homeLogo.setAttribute('role','link');homeLogo.setAttribute('tabindex','0');homeLogo.setAttribute('aria-label','Go to BrickCircle home');homeLogo.onclick=goHome;homeLogo.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();goHome(e)}};}
 }
 document.addEventListener('DOMContentLoaded',apply);window.addEventListener('load',apply);window.addEventListener('hashchange',()=>setTimeout(apply,0));
 new MutationObserver(()=>apply()).observe(document.documentElement,{childList:true,subtree:true});
 apply();
})();