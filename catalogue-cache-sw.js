const RELEASE='20260905-phase2c';
const SHELL_CACHE=`brickcircle-shell-${RELEASE}`;
const DATA_CACHE='brickcircle-catalogue-v3';
const IMAGE_CACHE='brickcircle-set-images-v1';
const NETWORK_TIMEOUT_MS=8000;
const SHELL=["/","/v2.html","/app-v3.css?v=20260905-phase2c","/analytics.js?v=20260905-phase2c","/product-analytics.js?v=20260905-phase2c","/observability-v26.js?v=20260905-phase2c","/locations-v3.js?v=20260905-phase2c","/app-v3.js?v=20260905-phase2c","/membership-v31.js?v=20260905-phase2c","/a11y-v1.js?v=20260905-phase2c","/manifest.webmanifest","/assets/brickcircle-logo.webp","/assets/pwa-icon.svg"];

self.addEventListener('install',event=>{
  self.skipWaiting();
  event.waitUntil(caches.open(SHELL_CACHE).then(cache=>cache.addAll(SHELL)).catch(()=>{}));
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k.startsWith('brickcircle-shell-')&&k!==SHELL_CACHE).map(k=>caches.delete(k)));
    await Promise.all(keys.filter(k=>k.startsWith('brickcircle-catalogue-')&&k!==DATA_CACHE).map(k=>caches.delete(k)));
    await Promise.all(keys.filter(k=>k.startsWith('brickcircle-set-images-')&&k!==IMAGE_CACHE).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting();});

async function fetchWithTimeout(request,timeoutMs=NETWORK_TIMEOUT_MS){
  const controller=new AbortController();
  const abort=()=>controller.abort();
  request.signal?.addEventListener?.('abort',abort,{once:true});
  const timer=setTimeout(abort,timeoutMs);
  try{return await fetch(request,{signal:controller.signal})}
  finally{clearTimeout(timer);request.signal?.removeEventListener?.('abort',abort)}
}

async function networkFirst(request,fallback){
  const cache=await caches.open(SHELL_CACHE);
  try{
    const response=await fetchWithTimeout(request);
    if(response.ok)await cache.put(request,response.clone());
    return response;
  }catch(_){
    return (await cache.match(request))||(fallback?await cache.match(fallback):null)||Response.error();
  }
}

async function staleWhileRevalidate(request,cacheName,allowOpaque=false){
  const cache=await caches.open(cacheName);
  const cached=await cache.match(request);
  const network=fetchWithTimeout(request).then(async response=>{
    if(response.ok||(allowOpaque&&response.type==='opaque'))await cache.put(request,response.clone());
    return response;
  }).catch(()=>null);
  return cached||(await network)||Response.error();
}

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  const sameOrigin=url.origin===self.location.origin;
  const isCatalogue=url.hostname.endsWith('.supabase.co')&&url.pathname==='/rest/v1/lego_sets';
  const isSetImage=url.hostname==='images.brickset.com'||url.hostname==='images.weserv.nl';

  if(isCatalogue){event.respondWith(staleWhileRevalidate(request,DATA_CACHE));return;}
  if(isSetImage){event.respondWith(staleWhileRevalidate(request,IMAGE_CACHE,true));return;}
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
