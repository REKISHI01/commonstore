const CACHE='itemku-profit-v5-2-shell-v1';
const SHELL=['/','/worker','/manifest.webmanifest','/icon.svg'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL).catch(()=>null)));self.skipWaiting()});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim()});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==location.origin||url.pathname.startsWith('/api/'))return;
  event.respondWith(fetch(event.request).then(res=>{const copy=res.clone();caches.open(CACHE).then(c=>c.put(event.request,copy));return res}).catch(()=>caches.match(event.request).then(r=>r||caches.match('/'))));
});

self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(clients=>{for(const c of clients){if('focus' in c)return c.focus()}return self.clients.openWindow('/')}))});
