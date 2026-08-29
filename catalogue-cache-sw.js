const SHELL_CACHE='brickcircle-shell-v3-20260829-authfix2';
const DATA_CACHE='brickcircle-catalogue-v3';
const SHELL=['/','/v2.html','/seo.css','/app-v3.css?v=20260829-v3','/locations-v3.js?v=20260829-v3','/app-v3.js?v=20260829-v3','/join-entry-v33.js?v=20260829-1','/v3-auth-onboarding-hotfix.js?v=20260829-4','/membership-v31.js?v=20260829-1','/catalog-search-v32.js?v=20260829-1','/manifest.webmanifest','/assets/brickcircle-logo.webp','/assets/pwa-icon.svg'];

self.addEventListener('install',event=>{
  self.skipWaiting();
  event.waitUntil(caches.open(SHELL_CACHE).then(cache=>cache.addAll(SHELL)).catch(()=>{}));
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k.startsWith('brickcircle-shell-')&&k!==SHELL_CACHE).map(k=>caches.delete(k)));
    await Promise.all(keys.filter(k=>k.startsWith('brickcircle-catalogue-')&&k!==DATA_CACHE).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting();});

async function networkFirst(request,fallback){
  const cache=await caches.open(SHELL_CACHE);
  try{
    const response=await fetch(request);
    if(response.ok)await cache.put(request,response.clone());
    return response;
  }catch(_){
    return (await cache.match(request))||(fallback?await cache.match(fallback):null)||Response.error();
  }
}

async function staleWhileRevalidate(request,cacheName){
  const cache=await caches.open(cacheName);
  const cached=await cache.match(request);
  const network=fetch(request).then(async response=>{if(response.ok)await cache.put(request,response.clone());return response;}).catch(()=>null);
  return cached||(await network)||Response.error();
}

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  const sameOrigin=url.origin===self.location.origin;
  const isCatalogue=url.hostname.endsWith('.supabase.co')&&url.pathname==='/rest/v1/lego_sets';

  if(isCatalogue){event.respondWith(staleWhileRevalidate(request,DATA_CACHE));return;}
  if(!sameOrigin)return;

  if(request.mode==='navigate'){
    const fallback=url.pathname.startsWith('/v2')?'/v2.html':'/';
    event.respondWith(networkFirst(request,fallback));
    return;
  }

  if(/\.(?:js|css|webp|png|jpg|jpeg|svg|woff2?|webmanifest)$/i.test(url.pathname)){
    event.respondWith(staleWhileRevalidate(request,SHELL_CACHE));
  }
});