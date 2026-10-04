'use strict';
const CACHE='haoju-shell-v0.6.0';
const SHELL=['./','./index.html','./style.css','./app.js','./config.js','./supabase.min.js','./manifest.webmanifest','./icon.svg','./icon-192.png','./icon-512.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('haoju-shell-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin)return;
  if(url.pathname.includes('/rest/v1/')||url.pathname.includes('/auth/v1/')||url.pathname.includes('/storage/v1/'))return;
  event.respondWith(fetch(request).then(response=>{
    if(response.ok&&url.origin===self.location.origin){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(request,copy));}
    return response;
  }).catch(async()=>{
    const cached=await caches.match(request);
    if(cached)return cached;
    if(request.mode==='navigate')return caches.match('./index.html');
    return new Response('',{status:503,statusText:'Offline'});
  }));
});
