/* BrickCircle homepage How It Works animation — fully self-hosted, no Canva permissions required. */
(()=>{
  const style=`
    .bc-hiw-video{margin:28px 0 34px;background:linear-gradient(145deg,#0f172a,#17233a);border:1px solid #23324b;border-radius:24px;padding:20px;box-shadow:0 18px 48px #0f172a18;overflow:hidden}
    .bc-hiw-video-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin:2px 2px 16px;color:#fff}
    .bc-hiw-video-head strong{font-size:20px;letter-spacing:-.02em}.bc-hiw-video-head span{display:block;margin-top:5px;color:#b7c1d2;font-size:13px;line-height:1.45}
    .bc-hiw-video-badge{white-space:nowrap;background:#f4c542;color:#111827;font-size:11px;font-weight:900;letter-spacing:.07em;padding:8px 10px;border-radius:999px}
    .bc-hiw-stage{position:relative;width:100%;aspect-ratio:16/9;border-radius:17px;overflow:hidden;background:#0b1528;border:1px solid #ffffff14;color:#fff}
    .bc-hiw-scene{position:absolute;inset:0;padding:7% 7%;opacity:0;transform:scale(1.015);transition:opacity .55s ease,transform .55s ease;pointer-events:none}
    .bc-hiw-scene.on{opacity:1;transform:scale(1);pointer-events:auto}
    .bc-hiw-kicker{font-size:clamp(9px,1vw,13px);font-weight:900;letter-spacing:.16em;color:#f4c542;text-transform:uppercase}
    .bc-hiw-title{font-size:clamp(24px,4.2vw,54px);line-height:1.02;letter-spacing:-.035em;font-weight:950;max-width:78%;margin:10px 0 12px}
    .bc-hiw-title em{font-style:normal;color:#f4c542}.bc-hiw-copy{color:#cbd5e1;max-width:72%;font-size:clamp(11px,1.4vw,18px);line-height:1.45}
    .bc-hiw-bricks{display:flex;gap:10px;margin-top:24px}.bc-hiw-brick{width:64px;height:38px;border-radius:7px;position:relative}.bc-hiw-brick:before,.bc-hiw-brick:after{content:'';position:absolute;top:-8px;width:16px;height:10px;border-radius:5px 5px 2px 2px;background:inherit}.bc-hiw-brick:before{left:10px}.bc-hiw-brick:after{right:10px}
    .bc-r{background:#e54235}.bc-b{background:#2f7bd4}.bc-g{background:#2aa15f}.bc-y{background:#f0ba24}
    .bc-hiw-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:24px}.bc-hiw-card{background:#ffffff0d;border:1px solid #ffffff13;border-radius:13px;padding:15px}.bc-hiw-card b{display:block;margin:7px 0 5px}.bc-hiw-num{display:inline-grid;place-items:center;width:24px;height:24px;border-radius:50%;background:#f4c542;color:#111827;font-weight:950;font-size:12px}.bc-hiw-card small{color:#b7c1d2;line-height:1.4}
    .bc-hiw-days{display:flex;gap:9px;margin-top:18px}.bc-hiw-day{border:1px solid #d7ae2e;color:#fff7d4;border-radius:9px;padding:8px 12px;font-weight:900;font-size:12px}
    .bc-hiw-stars{color:#f4c542;font-size:clamp(22px,3vw,38px);letter-spacing:.1em;margin-top:20px}.bc-hiw-endbrand{position:absolute;left:7%;bottom:10%;font-size:clamp(28px,5vw,68px);font-weight:950;color:#e6b72e;letter-spacing:.01em}.bc-hiw-tag{display:block;font-size:clamp(8px,1.2vw,14px);letter-spacing:.22em;color:#fff1b6;margin-top:5px}
    .bc-hiw-progress{position:absolute;left:0;right:0;bottom:0;height:4px;background:#ffffff12}.bc-hiw-progress i{display:block;height:100%;background:#f4c542;width:0}
    .bc-hiw-controls{display:flex;align-items:center;gap:9px;margin-top:12px}.bc-hiw-play{border:1px solid #44516a;background:#17233a;color:white;border-radius:10px;padding:8px 12px;font-weight:800;cursor:pointer}.bc-hiw-dots{display:flex;gap:6px}.bc-hiw-dot{width:7px;height:7px;border-radius:50%;background:#64748b}.bc-hiw-dot.on{background:#f4c542}
    .bc-hiw-video-foot{display:flex;align-items:center;justify-content:space-between;gap:14px;margin:10px 2px 0;color:#b7c1d2;font-size:12px}
    @media(max-width:640px){.bc-hiw-video{margin:22px -2px 30px;padding:12px;border-radius:18px}.bc-hiw-video-head{display:block}.bc-hiw-video-badge{display:inline-block;margin-top:10px}.bc-hiw-stage{border-radius:13px;aspect-ratio:4/3}.bc-hiw-title,.bc-hiw-copy{max-width:100%}.bc-hiw-cards{gap:6px}.bc-hiw-card{padding:8px;font-size:10px}.bc-hiw-card small{font-size:8px}.bc-hiw-brick{width:44px;height:27px}.bc-hiw-day{padding:6px 7px;font-size:9px}.bc-hiw-video-foot{align-items:flex-start;flex-direction:column}}
  `;
  function installStyle(){if(document.getElementById('bc-hiw-video-style'))return;const s=document.createElement('style');s.id='bc-hiw-video-style';s.textContent=style;document.head.appendChild(s)}
  function mount(){
    if(((location.hash||'#home').slice(1)||'home')!=='home')return;
    const root=document.querySelector('.bc23');if(!root)return;
    const sections=[...root.querySelectorAll('.bc23-section')];
    const how=sections.find(s=>/How it works/i.test(s.querySelector('.bc23-eyebrow')?.textContent||''));
    if(!how||how.querySelector('.bc-hiw-video'))return;
    installStyle();
    const lead=how.querySelector('.bc23-section-lead');
    const box=document.createElement('div');box.className='bc-hiw-video';
    box.innerHTML=`<div class="bc-hiw-video-head"><div><strong>See BrickCircle in 20 seconds</strong><span>Discover a local AFOL match, meet safely, inspect the sets, exchange temporarily, then return and review.</span></div><div class="bc-hiw-video-badge">HOW IT WORKS</div></div>
      <div class="bc-hiw-stage" aria-label="BrickCircle How It Works animation">
        <section class="bc-hiw-scene on"><div class="bc-hiw-kicker">The local club for adult fans of LEGO</div><div class="bc-hiw-title">Your collection is just <em>the beginning.</em></div><div class="bc-hiw-copy">List the collector sets you own. Discover AFOLs in your city who want to experience something different.</div><div class="bc-hiw-bricks"><i class="bc-hiw-brick bc-r"></i><i class="bc-hiw-brick bc-b"></i><i class="bc-hiw-brick bc-g"></i><i class="bc-hiw-brick bc-y"></i></div></section>
        <section class="bc-hiw-scene"><div class="bc-hiw-kicker">Reciprocal matching</div><div class="bc-hiw-title">Two collectors. Two sets. <em>One match.</em></div><div class="bc-hiw-copy">BrickCircle connects two local collectors when each wants to experience the other's available set.</div><div class="bc-hiw-cards"><div class="bc-hiw-card"><span class="bc-hiw-num">1</span><b>List your set</b><small>Mark it available for a temporary swap.</small></div><div class="bc-hiw-card"><span class="bc-hiw-num">2</span><b>Build a wishlist</b><small>Choose sets you would like to experience.</small></div><div class="bc-hiw-card"><span class="bc-hiw-num">3</span><b>Match locally</b><small>Both collectors want what the other owns.</small></div></div></section>
        <section class="bc-hiw-scene"><div class="bc-hiw-kicker">Local · public · in person</div><div class="bc-hiw-title">Meet. Inspect. <em>Exchange.</em></div><div class="bc-hiw-cards"><div class="bc-hiw-card"><span class="bc-hiw-num">1</span><b>Meet safely</b><small>Choose a public, well-lit location in your city.</small></div><div class="bc-hiw-card"><span class="bc-hiw-num">2</span><b>Inspect together</b><small>Check condition, pieces and set details before handoff.</small></div><div class="bc-hiw-card"><span class="bc-hiw-num">3</span><b>Confirm handoff</b><small>Both collectors confirm before the temporary swap begins.</small></div></div><div class="bc-hiw-days"><span class="bc-hiw-day">30 DAYS</span><span class="bc-hiw-day">60 DAYS</span><span class="bc-hiw-day">90 DAYS</span></div></section>
        <section class="bc-hiw-scene"><div class="bc-hiw-kicker">Enjoy · return · review</div><div class="bc-hiw-title">Experience something new. Then <em>bring it back.</em></div><div class="bc-hiw-copy">Meet again at the end of the swap, inspect the returned sets, confirm completion and build your collector reputation.</div><div class="bc-hiw-stars">★★★★★</div><div class="bc-hiw-endbrand">BRICKCIRCLE<span class="bc-hiw-tag">EXPERIENCE · EXCHANGE · RETURN · REPEAT</span></div></section>
        <div class="bc-hiw-progress"><i></i></div>
      </div><div class="bc-hiw-controls"><button class="bc-hiw-play" type="button">❚❚ Pause</button><div class="bc-hiw-dots"><i class="bc-hiw-dot on"></i><i class="bc-hiw-dot"></i><i class="bc-hiw-dot"></i><i class="bc-hiw-dot"></i></div></div><div class="bc-hiw-video-foot"><span>18+ beta community · Local in-person temporary exchanges only</span><span>Runs directly on BrickCircle — no external login required</span></div>`;
    if(lead)lead.insertAdjacentElement('afterend',box);else how.prepend(box);
    const scenes=[...box.querySelectorAll('.bc-hiw-scene')],dots=[...box.querySelectorAll('.bc-hiw-dot')],bar=box.querySelector('.bc-hiw-progress i'),btn=box.querySelector('.bc-hiw-play');
    let idx=0,playing=true,t0=performance.now(),raf;const cycle=20000,scene=5000;
    function frame(now){if(!playing)return;const elapsed=(now-t0)%cycle;const ni=Math.min(3,Math.floor(elapsed/scene));if(ni!==idx){idx=ni;scenes.forEach((s,i)=>s.classList.toggle('on',i===idx));dots.forEach((d,i)=>d.classList.toggle('on',i===idx))}bar.style.width=(elapsed/cycle*100)+'%';raf=requestAnimationFrame(frame)}
    btn.onclick=()=>{playing=!playing;btn.textContent=playing?'❚❚ Pause':'▶ Play';if(playing){t0=performance.now()-idx*scene;raf=requestAnimationFrame(frame)}else cancelAnimationFrame(raf)};raf=requestAnimationFrame(frame);
  }
  const run=()=>{mount();setTimeout(mount,120);setTimeout(mount,500)};
  document.addEventListener('DOMContentLoaded',run);window.addEventListener('hashchange',run);window.addEventListener('load',run);
  new MutationObserver(()=>mount()).observe(document.documentElement,{subtree:true,childList:true});
})();
