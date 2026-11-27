const C='arba-v72',FC='arba-fotos';/* las fotos van en su propia caja y no se borran al actualizar */
const caja=u=>/\/img\//.test(u)?FC:C;
const PRE=['./','./index.html','./panel.html','./productos.txt','./i18n-en.js','./manifest.json','./manifest-panel.json?v=2','./icon-192.png','./icon-512.png','./icon-dueno-192.png'];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(C).then(c=>Promise.all(PRE.map(u=>c.add(u).catch(()=>{})))))});
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==C&&k!==FC).map(k=>caches.delete(k)))).then(()=>clients.claim())));
/* Si el internet está lento, no se queda trabada: después de unos segundos abre la copia guardada y la actualiza por detrás */
const guardado=q=>caches.match(q).then(r=>r||caches.match(q,{ignoreSearch:true})).then(r=>r||(q.mode==='navigate'?caches.match('./index.html'):undefined));
self.addEventListener('fetch',e=>{const q=e.request;if(q.method!=='GET')return;const u=new URL(q.url);if(/\.(mp4|webm)$/i.test(u.pathname))return;
  const propio=u.origin===location.origin;if(!propio&&!/(^|\.)(gstatic\.com|googleapis\.com)$/.test(u.hostname)||/firestore|identitytoolkit|securetoken|fcm|firebasestorage/.test(u.hostname))return;
  const fresco=q.mode==='navigate'||(propio&&/\.(html|txt|json|js)$|\/$/.test(u.pathname));
  const red=fetch(fresco?new Request(q,{cache:'no-cache'}):q).then(r=>{if(r.ok){const cp=r.clone();caches.open(caja(u.pathname)).then(c=>c.put(q,cp))}return r});
  if(!fresco&&!propio){e.respondWith(caches.match(q).then(c=>c||red.catch(()=>Response.error())));return}
  e.respondWith(new Promise(res=>{let listo=false;const da=r=>{if(!listo&&r){listo=true;res(r)}};
    /* Sin señal: abre de inmediato lo guardado */
    const t=setTimeout(()=>guardado(q).then(da),self.navigator&&self.navigator.onLine===false?0:q.mode==='navigate'?4000:6000);
    red.then(r=>{clearTimeout(t);da(r)}).catch(()=>{clearTimeout(t);guardado(q).then(c=>{if(c)da(c);else if(!listo){listo=true;res(Response.error())}})})}))});
self.addEventListener('notificationclick',e=>{e.notification.close();const u=(e.notification.data&&e.notification.data.url)||'./';e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(l=>{for(const c of l){if('focus' in c){c.navigate(u);return c.focus()}}return clients.openWindow(u)}))});

/* Notificaciones push (las manda el servidor de Firebase aunque la app esté cerrada) */
self.addEventListener('push',e=>{let j={};try{j=e.data?e.data.json():{}}catch(x){j={data:{title:'Distribuidora ARBA',body:e.data?e.data.text():''}}}
  const d=j.data||{},n=j.notification||{};const t=d.title||n.title||'Distribuidora ARBA';
  e.waitUntil(self.registration.showNotification(t,{body:d.body||n.body||'',icon:d.icon||'icon-192.png',badge:'badge-96.png?v=2',tag:d.tag||undefined,renotify:!!d.tag,data:{url:d.url||'./'},vibrate:[200,100,200]}))});

/* Con wifi, la tienda pide guardar todas las fotos para verlas sin internet (de poquito en poquito) */
self.addEventListener('message',e=>{const d=e.data||{};if(d.t!=='fotos'||!Array.isArray(d.l))return;
  e.waitUntil(caches.open(FC).then(async c=>{for(const u of d.l.slice(0,400)){if(typeof u!=='string'||/^https?:|^\/\//.test(u))continue;try{if(!(await c.match(u))){const r=await fetch(u);if(r.ok)await c.put(u,r)}}catch(x){}}}))});
