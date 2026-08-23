/* BrickCircle beta community notice */
(()=>{
  const css=`
  .bc-beta-bar{position:relative;z-index:50;background:linear-gradient(90deg,#111827,#1e293b);color:#fff;border-bottom:1px solid #ffffff18;padding:10px 16px;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
  .bc-beta-inner{max-width:1240px;margin:auto;display:flex;align-items:center;justify-content:center;gap:10px;text-align:center;font-size:13px;line-height:1.45}
  .bc-beta-pill{display:inline-flex;align-items:center;justify-content:center;padding:5px 9px;border-radius:999px;background:#f4c542;color:#111827;font-size:11px;font-weight:950;letter-spacing:.08em;white-space:nowrap}
  .bc-beta-message strong{color:#f9dc68}
  .bc-beta-card{max-width:1240px;margin:34px auto 0;padding:0 20px;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
  .bc-beta-cardin{border-radius:22px;padding:30px;background:linear-gradient(135deg,#fff9df,#fff);border:1px solid #ead88a;display:grid;grid-template-columns:auto 1fr;gap:18px;align-items:start;box-shadow:0 10px 30px #1118270a}
  .bc-beta-icon{width:48px;height:48px;border-radius:15px;background:#111827;color:#f4c542;display:grid;place-items:center;font-size:23px}
  .bc-beta-card h3{margin:0 0 7px;font-size:24px;letter-spacing:-.03em;color:#111827}
  .bc-beta-card p{margin:0;color:#667085;line-height:1.6;font-size:15px}
  .bc-beta-card b{color:#111827}
  @media(max-width:600px){.bc-beta-inner{align-items:flex-start;text-align:left}.bc-beta-message{font-size:12px}.bc-beta-cardin{grid-template-columns:1fr;padding:22px}.bc-beta-card h3{font-size:21px}}
  `;
  const s=document.createElement('style');s.textContent=css;document.head.appendChild(s);

  function addBar(){
    if(document.querySelector('.bc-beta-bar'))return;
    const bar=document.createElement('div');
    bar.className='bc-beta-bar';
    bar.innerHTML=`<div class="bc-beta-inner"><span class="bc-beta-pill">BETA</span><span class="bc-beta-message">BrickCircle is currently in beta. <strong>We're building it with the AFOL community</strong> and welcome your support as we grow toward the full release.</span></div>`;
    document.body.insertBefore(bar,document.body.firstChild);
  }

  function addHomeCard(){
    const isHome=((location.hash||'#home').slice(1)||'home')==='home';
    if(!isHome)return;
    const host=document.querySelector('#app .bc23');
    if(!host||host.querySelector('.bc-beta-card'))return;
    const section=document.createElement('section');
    section.className='bc-beta-card';
    section.innerHTML=`<div class="bc-beta-cardin"><div class="bc-beta-icon">🧱</div><div><h3>Help us build BrickCircle with the LEGO community.</h3><p>This is a <b>beta version</b> of BrickCircle. Features, workflows and community safeguards will continue to evolve as real collectors use the platform. Your participation, feedback and responsible use will help us move from beta to a full-fledged AFOL exchange community.</p></div></div>`;
    const disclaimer=host.querySelector('.bc23-disclaimer');
    if(disclaimer)host.insertBefore(section,disclaimer);else host.appendChild(section);
  }

  addBar();
  const refresh=()=>setTimeout(addHomeCard,80);
  document.addEventListener('DOMContentLoaded',()=>{addBar();refresh()});
  window.addEventListener('load',refresh);
  window.addEventListener('hashchange',refresh);
  new MutationObserver(()=>{if(((location.hash||'#home').slice(1)||'home')==='home')addHomeCard()}).observe(document.documentElement,{childList:true,subtree:true});
})();
