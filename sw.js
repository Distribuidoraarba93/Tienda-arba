const C='arba-v44';
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(C).then(c=>c.addAll(['./','./index.html','./manifest.json','./icon-192.png','./icon-512.png'])).catch(()=>{}))});
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==C).map(k=>caches.delete(k)))).then(()=>clients.claim())));
self.addEventListener('fetch',e=>{const q=e.request;if(q.method!=='GET')return;const u=new URL(q.url);if(/\.(mp4|webm)$/i.test(u.pathname))return;
  const fresco=q.mode==='navigate'||(u.origin===location.origin&&/\.(html|txt|json|js)$|\/$/.test(u.pathname));
  e.respondWith(fetch(fresco?new Request(q,{cache:'no-cache'}):q).then(r=>{if(r.ok){const cp=r.clone();caches.open(C).then(c=>c.put(q,cp))}return r}).catch(()=>caches.match(q)))});
self.addEventListener('notificationclick',e=>{e.notification.close();const u=(e.notification.data&&e.notification.data.url)||'./';e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(l=>{for(const c of l){if('focus' in c){c.navigate(u);return c.focus()}}return clients.openWindow(u)}))});

/* Notificaciones push (las manda el servidor de Firebase aunque la app esté cerrada) */
self.addEventListener('push',e=>{let j={};try{j=e.data?e.data.json():{}}catch(x){j={data:{title:'Distribuidora ARBA',body:e.data?e.data.text():''}}}
  const d=j.data||{},n=j.notification||{};const t=d.title||n.title||'Distribuidora ARBA';
  e.waitUntil(self.registration.showNotification(t,{body:d.body||n.body||'',icon:d.icon||'icon-192.png',badge:'badge-96.png?v=2',tag:d.tag||undefined,renotify:!!d.tag,data:{url:d.url||'./'},vibrate:[200,100,200]}))});
