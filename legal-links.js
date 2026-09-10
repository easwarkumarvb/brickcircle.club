(()=>{
'use strict';
function ensureFooter(){
  let footer=document.getElementById('bc-legal-footer');
  if(footer)return footer;
  footer=document.createElement('footer');
  footer.id='bc-legal-footer';
  footer.setAttribute('aria-label','Legal');
  footer.innerHTML='<span>© 2026 BrickCircle</span><span aria-hidden="true">·</span><a href="/privacy.html">Privacy Policy</a><span aria-hidden="true">·</span><a href="/terms.html">Terms of Use</a>';
  Object.assign(footer.style,{
    display:'flex',justifyContent:'center',alignItems:'center',gap:'10px',flexWrap:'wrap',
    padding:'22px 16px 86px',fontSize:'13px',color:'#6b7280',background:'#f8fafc',borderTop:'1px solid #e5e7eb'
  });
  footer.querySelectorAll('a').forEach(link=>{link.style.color='#5b21b6';link.style.textDecoration='none';link.style.fontWeight='600'});
  document.body.appendChild(footer);
  return footer;
}
function enhanceAuthDisclosure(root=document){
  root.querySelectorAll?.('.bc-small').forEach(node=>{
    if(node.dataset.legalLinked||!node.textContent.includes('By continuing, you agree'))return;
    node.dataset.legalLinked='1';
    node.innerHTML='By continuing, you agree to our <a href="/terms.html">Terms of Use</a> and acknowledge our <a href="/privacy.html">Privacy Policy</a>. Please use BrickCircle responsibly, meet in safe public places and inspect sets before exchanging.';
  });
}
function init(){
  ensureFooter();enhanceAuthDisclosure();
  document.addEventListener('bc:render',event=>enhanceAuthDisclosure(event.detail?.root||document));
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
