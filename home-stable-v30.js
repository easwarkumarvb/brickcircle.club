/* BrickCircle V3.0 stable Home renderer.
   Single-owner, idempotent, no MutationObserver, no animation loop, no remote imagery.
   The goal is predictable first paint and zero re-render churn on Home. */
(()=>{
  'use strict';
  const VERSION='stable-v30-20260829';
  const isHome=()=>((location.hash||'#home').slice(1)||'home')==='home';
  const reveal=()=>{
    document.documentElement.classList.remove('bc-home-boot');
    document.body?.classList.remove('bc-home-boot');
  };
  const nav=page=>typeof window.bcNav==='function'?window.bcNav(page):(location.hash=page);
  const join=()=>typeof window.bcAuth==='function'&&window.bcAuth();

  const css=`
  .bc23{--ink:#0f172a;--navy:#111827;--gold:#f4c542;--muted:#667085;--line:#e5e7eb;max-width:1240px;margin:0 auto;padding:0 20px 72px;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:var(--ink)}
  .bc23 *{box-sizing:border-box}.bc23 button{font:inherit}.bc23-hero{margin:0 -20px;padding:64px 20px 58px;background:linear-gradient(135deg,#fffdf9 0%,#fff7da 48%,#f4f7fb 100%);border-bottom:1px solid #eee6c9}.bc23-hero-inner{max-width:1240px;margin:auto;display:grid;grid-template-columns:1.05fr .95fr;gap:42px;align-items:center}.bc23-kicker{display:inline-flex;align-items:center;gap:8px;padding:9px 13px;border-radius:999px;background:#111827;color:#fff;font-size:12px;font-weight:900;letter-spacing:.09em;text-transform:uppercase}.bc23-kicker i{width:7px;height:7px;border-radius:50%;background:#f4c542;display:block}.bc23-age{display:inline-flex;margin-left:8px;padding:9px 13px;border-radius:999px;background:#fff;border:1px solid #ead88a;color:#8a6500;font-size:12px;font-weight:900}.bc23 h1{font-size:clamp(46px,6vw,76px);line-height:.98;letter-spacing:-.055em;margin:22px 0 18px;font-weight:950;max-width:780px}.bc23 h1 em{font-style:normal;background:linear-gradient(90deg,#b57d00,#e7b316);-webkit-background-clip:text;background-clip:text;color:transparent}.bc23-lead{font-size:19px;line-height:1.55;color:#475467;max-width:700px;margin:0}.bc23-localcall{margin-top:20px;display:inline-flex;align-items:center;gap:10px;padding:12px 14px;border-radius:13px;background:#111827;color:#fff;font-size:14px;font-weight:850}.bc23-localcall span{color:#f4c542}.bc23-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:25px}.bc23-btn{min-height:46px;border:1px solid #d5d9e0;border-radius:12px;padding:11px 17px;font-weight:850;cursor:pointer;background:#fff;color:#111827}.bc23-primary{background:#111827;color:#fff;border-color:#111827}.bc23-proof{display:flex;gap:18px;flex-wrap:wrap;margin-top:25px;color:#667085;font-size:13px}.bc23-proof b{display:block;color:#111827;font-size:16px;margin-bottom:2px}
  .bc23-visual{min-height:410px;border-radius:28px;background:linear-gradient(145deg,#111827,#23324d);padding:24px;position:relative;overflow:hidden;box-shadow:0 28px 65px #11182720}.bc23-visual:before{content:'';position:absolute;width:280px;height:280px;border-radius:50%;background:#f4c5421f;right:-70px;top:-70px}.bc23-visual-title{position:relative;color:#f4c542;font-size:12px;font-weight:950;letter-spacing:.14em;text-transform:uppercase}.bc23-visual-grid{position:relative;display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:18px}.bc23-setcard{background:#ffffff0d;border:1px solid #ffffff18;border-radius:18px;padding:18px;color:#fff;min-height:150px;display:flex;flex-direction:column;justify-content:space-between}.bc23-setcard:first-child{grid-column:1/-1;min-height:170px}.bc23-setcard .icon{font-size:42px;line-height:1}.bc23-setcard strong{display:block;font-size:17px;margin-top:12px}.bc23-setcard span{color:#cbd5e1;font-size:12px}.bc23-visual-foot{position:relative;margin-top:14px;color:#cbd5e1;font-size:12px;line-height:1.45}.bc23-visual-foot b{color:#fff}
  .bc23-strip{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid var(--line);border-radius:20px;background:#fff;margin-top:18px;box-shadow:0 16px 45px #1118270a}.bc23-strip div{padding:20px;border-right:1px solid var(--line)}.bc23-strip div:last-child{border-right:0}.bc23-strip b{display:block;font-size:21px}.bc23-strip span{font-size:12px;color:var(--muted)}
  .bc23-section{padding:64px 0 0}.bc23-eyebrow{font-size:12px;font-weight:900;letter-spacing:.1em;text-transform:uppercase;color:#9a6700}.bc23-section h2{font-size:clamp(32px,4vw,50px);letter-spacing:-.04em;margin:8px 0 12px;line-height:1.03}.bc23-section-lead{color:var(--muted);font-size:17px;max-width:760px;line-height:1.6}.bc23-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:25px}.bc23-card{background:#fff;border:1px solid var(--line);border-radius:19px;padding:24px;min-height:185px}.bc23-num{width:36px;height:36px;border-radius:10px;background:#111827;color:#fff;display:grid;place-items:center;font-size:12px;font-weight:900}.bc23-card h3{font-size:20px;margin:20px 0 8px}.bc23-card p{color:var(--muted);line-height:1.55;margin:0}
  .bc23-how{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:25px}.bc23-step{background:#111827;color:#fff;border-radius:18px;padding:22px;min-height:190px}.bc23-step:nth-child(even){background:#172236}.bc23-step .n{font-size:11px;font-weight:900;color:#f4c542;letter-spacing:.08em}.bc23-step h3{font-size:19px;margin:14px 0 8px}.bc23-step p{color:#cbd5e1;line-height:1.5;margin:0;font-size:14px}
  .bc23-trust{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:24px}.bc23-trust div{padding:22px;border:1px solid var(--line);border-radius:18px;background:#fff}.bc23-trust strong{display:block;font-size:18px;margin-bottom:6px}.bc23-trust span{color:var(--muted);font-size:14px;line-height:1.5}.bc23-cta{margin-top:64px;padding:42px;border-radius:24px;background:linear-gradient(135deg,#111827,#24324a);color:#fff;display:flex;align-items:center;justify-content:space-between;gap:24px}.bc23-cta h2{font-size:38px;letter-spacing:-.04em;margin:0 0 8px}.bc23-cta p{margin:0;color:#cbd5e1;max-width:700px}.bc23-disclaimer{margin-top:24px;padding-top:18px;border-top:1px solid #e5e7eb;font-size:11px;line-height:1.6;color:#98a2b3;text-align:center}
  @media(max-width:980px){.bc23-hero-inner{grid-template-columns:1fr}.bc23-visual{min-height:360px}.bc23-how{grid-template-columns:repeat(2,1fr)}}
  @media(max-width:760px){.bc23{padding-left:12px;padding-right:12px}.bc23-hero{margin-left:-12px;margin-right:-12px;padding:42px 14px 38px}.bc23 h1{font-size:43px}.bc23-lead{font-size:17px}.bc23-age{margin-top:8px;margin-left:0}.bc23-actions{display:grid;grid-template-columns:1fr}.bc23-btn{width:100%}.bc23-proof{display:grid;grid-template-columns:1fr 1fr;gap:12px}.bc23-visual{min-height:0;padding:18px;border-radius:20px}.bc23-visual-grid{grid-template-columns:1fr}.bc23-setcard:first-child{grid-column:auto}.bc23-setcard{min-height:118px}.bc23-strip{grid-template-columns:1fr 1fr}.bc23-strip div:nth-child(2){border-right:0}.bc23-strip div:nth-child(-n+2){border-bottom:1px solid var(--line)}.bc23-cards,.bc23-trust{grid-template-columns:1fr}.bc23-how{grid-template-columns:1fr}.bc23-section{padding-top:48px}.bc23-cta{padding:28px 20px;flex-direction:column;align-items:flex-start}.bc23-cta h2{font-size:31px}}
  `;

  function installStyle(){
    let style=document.getElementById('bc-home-stable-style');
    if(!style){style=document.createElement('style');style.id='bc-home-stable-style';document.head.appendChild(style);}
    if(style.dataset.version!==VERSION){style.textContent=css;style.dataset.version=VERSION;}
  }

  function bind(root){
    root.querySelector('[data-bc-go="catalogue"]')?.addEventListener('click',()=>nav('catalogue'));
    root.querySelector('[data-bc-go="matches"]')?.addEventListener('click',()=>nav('matches'));
    root.querySelectorAll('[data-bc-join]').forEach(button=>button.addEventListener('click',join));
  }

  function render(){
    if(!isHome()){reveal();return false;}
    const app=document.getElementById('app');if(!app)return false;
    installStyle();
    const existing=app.querySelector('[data-bc-home-stable="1"]');
    if(existing){reveal();return true;}
    app.innerHTML=`<div class="wrap"><div class="bc23" data-bc-home-stable="1" data-bc-home-version="${VERSION}">
      <section class="bc23-hero"><div class="bc23-hero-inner"><div>
        <div><span class="bc23-kicker"><i></i> Adult Fans of LEGO</span><span class="bc23-age">18+ BETA COMMUNITY</span></div>
        <h1>Experience more LEGO <em>without owning every set.</em></h1>
        <p class="bc23-lead">BrickCircle connects adult LEGO collectors in the same city so they can discover reciprocal matches, meet safely, inspect sets in person and exchange temporarily.</p>
        <div class="bc23-localcall">📍 <span>Local by design:</span> face-to-face exchanges first</div>
        <div class="bc23-actions"><button type="button" class="bc23-btn bc23-primary" data-bc-go="catalogue">Explore collectible sets →</button><button type="button" class="bc23-btn" data-bc-join>Join BrickCircle</button></div>
        <div class="bc23-proof"><div><b>🧱 AFOL-first</b>Built for collectors</div><div><b>🤝 Meet first</b>Inspect before handoff</div><div><b>📍 Local</b>City-based discovery</div><div><b>⭐ Reputation</b>Trust grows with exchanges</div></div>
      </div><div class="bc23-visual" aria-label="BrickCircle collection exchange concept"><div class="bc23-visual-title">YOUR CITY · YOUR COLLECTION · NEW EXPERIENCES</div><div class="bc23-visual-grid"><div class="bc23-setcard"><div class="icon">🏎️</div><div><strong>Technic supercar</strong><span>Available to exchange</span></div></div><div class="bc23-setcard"><div class="icon">🚀</div><div><strong>Space icon</strong><span>On your wishlist</span></div></div><div class="bc23-setcard"><div class="icon">✈️</div><div><strong>Collector aircraft</strong><span>Reciprocal match nearby</span></div></div></div><div class="bc23-visual-foot"><b>BrickCircle's job:</b> connect complementary collections so members can experience more of the hobby without constantly buying more sets.</div></div></div></section>
      <div class="bc23-strip"><div><b>List</b><span>Show what you own</span></div><div><b>Wishlist</b><span>Choose what you want next</span></div><div><b>Match</b><span>Find reciprocal collectors</span></div><div><b>Meet</b><span>Inspect and exchange safely</span></div></div>
      <section class="bc23-section"><span class="bc23-eyebrow">Why BrickCircle exists</span><h2>Your collection can create new experiences — without another purchase.</h2><p class="bc23-section-lead">High-end LEGO sets spend most of their life on shelves. BrickCircle turns compatible local collections into a trusted network of experiences while keeping the actual handoff personal and transparent.</p><div class="bc23-cards"><div class="bc23-card"><div class="bc23-num">01</div><h3>Built for adult collectors</h3><p>Collection details, condition, completeness, reputation and repeat relationships matter more than anonymous transactions.</p></div><div class="bc23-card"><div class="bc23-num">02</div><h3>Reciprocal matching</h3><p>A useful match appears when another collector wants something you can offer and has something you genuinely want.</p></div><div class="bc23-card"><div class="bc23-num">03</div><h3>Liquidity grows locally</h3><p>Every collection, wishlist and referral makes a city more useful for everyone already in that BrickCircle.</p></div></div></section>
      <section class="bc23-section"><span class="bc23-eyebrow">How it works</span><h2>Four clear stages from shelf to exchange.</h2><div class="bc23-how"><div class="bc23-step"><span class="n">01 · CATALOGUE</span><h3>Add your sets</h3><p>List the physical sets you own and mark only the ones you are comfortable exchanging.</p></div><div class="bc23-step"><span class="n">02 · DISCOVER</span><h3>Build a wishlist</h3><p>Choose sets you would like to experience so BrickCircle can look for reciprocal demand.</p></div><div class="bc23-step"><span class="n">03 · CONNECT</span><h3>Find a local match</h3><p>Agree with another collector, choose a public meetup location and inspect both sets together.</p></div><div class="bc23-step"><span class="n">04 · EXPERIENCE</span><h3>Exchange and return</h3><p>Use the agreed temporary period, meet again for return, confirm condition and build reputation.</p></div></div></section>
      <section class="bc23-section"><span class="bc23-eyebrow">Trust by design</span><h2>Built around a real-world handshake.</h2><div class="bc23-trust"><div><strong>🛡️ Public meetup</strong><span>Choose well-lit public places and avoid unnecessary advance payments for local swaps.</span></div><div><strong>👀 Inspect first</strong><span>Both collectors inspect condition and completeness before either confirms the handoff.</span></div><div><strong>⭐ Reputation compounds</strong><span>Completed exchanges and reviews create stronger trust signals over time.</span></div></div></section>
      <section class="bc23-cta"><div><h2>Join your city's BrickCircle.</h2><p>Build your collection, add a wishlist and help the first local circles reach real marketplace liquidity.</p></div><button type="button" class="bc23-btn" data-bc-join>Join BrickCircle →</button></section>
      <div class="bc23-disclaimer"><strong>Current BrickCircle scope:</strong> BrickCircle is presently intended for adult LEGO fans (18+) and supports local, in-person exchanges. Members are responsible for choosing safe public meetup locations and inspecting sets before exchanging. LEGO® is a trademark of the LEGO Group, which does not sponsor, authorize or endorse BrickCircle.</div>
    </div></div>`;
    const root=app.querySelector('[data-bc-home-stable="1"]');bind(root);reveal();
    requestAnimationFrame(()=>window.dispatchEvent(new CustomEvent('brickcircle:home-rendered',{detail:{version:VERSION}})));
    return true;
  }

  window.bc23Render=render;
  window.bcHomeStableRender=render;
  const legacyNav=window.bcNav;
  if(typeof legacyNav==='function'){
    window.bcNav=page=>{
      if(page==='home'){
        if(location.hash!=='#home')location.hash='home';
        render();
        return;
      }
      return legacyNav(page);
    };
  }
  window.addEventListener('hashchange',()=>{if(isHome())requestAnimationFrame(render);else reveal();});
  requestAnimationFrame(render);
})();
