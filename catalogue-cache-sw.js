const RELEASE='20260912-beta-brand-promise-r1';
const SHELL_CACHE=`brickcircle-shell-${RELEASE}`;
const DATA_CACHE='brickcircle-catalogue-v3';
const IMAGE_CACHE='brickcircle-set-images-v1';
const NETWORK_TIMEOUT_MS=8000;
const SHELL=["/","/v2.html","/privacy.html","/terms.html","/app-v3.css?v=20260912-beta-brand-promise-r1","/mobile-ux-v1.css?v=20260912-beta-brand-promise-r1","/zen-ux-v1.css?v=20260912-beta-brand-promise-r1","/analytics.js?v=20260912-beta-brand-promise-r1","/product-analytics.js?v=20260912-beta-brand-promise-r1","/observability-v26.js?v=20260912-beta-brand-promise-r1","/locations-v3.js?v=20260912-beta-brand-promise-r1","/web-push-config.js?v=20260912-beta-brand-promise-r1","/app-v3.js?v=20260912-beta-brand-promise-r1","/catalogue-discovery-v1.js?v=20260912-beta-brand-promise-r1","/zen-ux-v1.js?v=20260912-beta-brand-promise-r1","/assets/brickcircle-logo.webp"];

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

function safePushPayload(event){
  try{
    const payload=event.data?.json?.()||{};
    const type=payload.type;
    if(type!=='reciprocal_match'&&type!=='exchange_proposal')return null;
    const fallback=type==='reciprocal_match'?'/v2.html#matches':'/v2.html#exchanges';
    const candidate=String(payload.url||fallback);
    const url=new URL(candidate,self.location.origin);
    if(url.origin!==self.location.origin||url.pathname!=='/v2.html')url.href=new URL(fallback,self.location.origin).href;
    return {
      type,
      entityId:String(payload.entity_id||'').slice(0,80),
      title:String(payload.title||'BrickCircle update').slice(0,120),
      body:String(payload.body||'Open BrickCircle to see what changed.').slice(0,240),
      url:url.href
    };
  }catch(_){return null}
}

self.addEventListener('push',event=>{
  const payload=safePushPayload(event);
  if(!payload)return;
  event.waitUntil(self.registration.showNotification(payload.title,{
    body:payload.body,
    icon:'/assets/pwa-icon.svg',
    badge:'/assets/pwa-icon.svg',
    tag:`brickcircle:${payload.type}:${payload.entityId||'new'}`,
    renotify:false,
    data:{url:payload.url,type:payload.type,entity_id:payload.entityId}
  }));
});

self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const fallback='/v2.html#home',candidate=String(event.notification.data?.url||fallback);
  let target;
  try{const parsed=new URL(candidate,self.location.origin);target=parsed.origin===self.location.origin&&parsed.pathname==='/v2.html'?parsed.href:new URL(fallback,self.location.origin).href}catch(_){target=new URL(fallback,self.location.origin).href}
  event.waitUntil((async()=>{
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const existing=windows.find(client=>new URL(client.url).origin===self.location.origin);
    if(existing){await existing.navigate?.(target);return existing.focus()}
    return self.clients.openWindow(target);
  })());
});

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
