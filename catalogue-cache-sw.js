const CACHE='brickcircle-catalogue-v1';
self.addEventListener('fetch',event=>{
  const u=new URL(event.request.url);
  const isCatalogue=u.hostname.endsWith('.supabase.co') && u.pathname==='/rest/v1/lego_sets' && event.request.method==='GET';
  if(!isCatalogue)return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    const cached=await cache.match(event.request);
    if(cached)return cached;
    const response=await fetch(event.request);
    if(response.ok)await cache.put(event.request,response.clone());
    return response;
  })());
});