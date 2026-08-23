/* BrickCircle homepage How It Works video embed. */
(()=>{
  const VIDEO_EMBED='https://www.canva.com/design/DAHTGok1-nc/view?embed';
  const VIDEO_VIEW='https://www.canva.com/d/gJxCyMdqQQXbVF7';
  const style=`
    .bc-hiw-video{margin:28px 0 34px;background:linear-gradient(145deg,#0f172a,#17233a);border:1px solid #23324b;border-radius:24px;padding:20px;box-shadow:0 18px 48px #0f172a18;overflow:hidden}
    .bc-hiw-video-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin:2px 2px 16px;color:#fff}
    .bc-hiw-video-head strong{font-size:20px;letter-spacing:-.02em}.bc-hiw-video-head span{display:block;margin-top:5px;color:#b7c1d2;font-size:13px;line-height:1.45}
    .bc-hiw-video-badge{white-space:nowrap;background:#f4c542;color:#111827;font-size:11px;font-weight:900;letter-spacing:.07em;padding:8px 10px;border-radius:999px}
    .bc-hiw-frame{position:relative;width:100%;aspect-ratio:16/9;border-radius:17px;overflow:hidden;background:#07111f;border:1px solid #ffffff14}
    .bc-hiw-frame iframe{position:absolute;inset:0;width:100%;height:100%;border:0;background:#07111f}
    .bc-hiw-video-foot{display:flex;align-items:center;justify-content:space-between;gap:14px;margin:14px 2px 0;color:#b7c1d2;font-size:12px}
    .bc-hiw-video-foot a{color:#f4c542;font-weight:800;text-decoration:none}.bc-hiw-video-foot a:hover{text-decoration:underline}
    @media(max-width:640px){.bc-hiw-video{margin:22px -2px 30px;padding:12px;border-radius:18px}.bc-hiw-video-head{display:block}.bc-hiw-video-badge{display:inline-block;margin-top:10px}.bc-hiw-video-foot{align-items:flex-start;flex-direction:column}.bc-hiw-frame{border-radius:13px}}
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
    box.innerHTML=`<div class="bc-hiw-video-head"><div><strong>See BrickCircle in 20 seconds</strong><span>Discover a local AFOL match, meet safely, inspect the sets, exchange temporarily, then return and review.</span></div><div class="bc-hiw-video-badge">HOW IT WORKS</div></div><div class="bc-hiw-frame"><iframe src="${VIDEO_EMBED}" title="BrickCircle — How it works" loading="lazy" allow="autoplay; fullscreen" allowfullscreen></iframe></div><div class="bc-hiw-video-foot"><span>18+ beta community · Local in-person temporary exchanges only</span><a href="${VIDEO_VIEW}" target="_blank" rel="noopener">Open video ↗</a></div>`;
    if(lead)lead.insertAdjacentElement('afterend',box);else how.prepend(box);
  }
  const run=()=>{mount();setTimeout(mount,120);setTimeout(mount,500)};
  document.addEventListener('DOMContentLoaded',run);window.addEventListener('hashchange',run);window.addEventListener('load',run);
  new MutationObserver(()=>mount()).observe(document.documentElement,{subtree:true,childList:true});
})();
