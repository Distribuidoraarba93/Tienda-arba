const C='arba-v7';
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(C).then(c=>c.addAll(['./','./index.html','./manifest.json','./icon-192.png','./icon-512.png'])).catch(()=>{}))});
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==C).map(k=>caches.delete(k)))).then(()=>clients.claim())));
self.addEventListener('fetch',e=>{const q=e.request;if(q.method!=='GET')return;const u=new URL(q.url);
  const fresco=q.mode==='navigate'||(u.origin===location.origin&&/\.(html|txt|json|js)$|\/$/.test(u.pathname));
  e.respondWith(fetch(fresco?new Request(q,{cache:'no-cache'}):q).then(r=>{if(r.ok){const cp=r.clone();caches.open(C).then(c=>c.put(q,cp))}return r}).catch(()=>caches.match(q)))});
self.addEventListener('notificationclick',e=>{e.notification.close();const u=(e.notification.data&&e.notification.data.url)||'./';e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(l=>{for(const c of l){if('focus' in c){c.navigate(u);return c.focus()}}return clients.openWindow(u)}))});
