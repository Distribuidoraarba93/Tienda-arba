/* Notificaciones push de Distribuidora ARBA.
   Lee los celulares registrados en la colección "push" y les manda el aviso:
   · Al dueño: pedido nuevo y solicitudes de repartidores.
   · Al cliente: cada cambio de estatus de su pedido.
   · Al repartidor: entrega nueva asignada y avisos que le manda el dueño. */
const {onDocumentCreated, onDocumentUpdated} = require('firebase-functions/v2/firestore');
const {onSchedule} = require('firebase-functions/v2/scheduler');
const {setGlobalOptions} = require('firebase-functions/v2');
const {initializeApp} = require('firebase-admin/app');
const {getFirestore} = require('firebase-admin/firestore');
const {getMessaging} = require('firebase-admin/messaging');

setGlobalOptions({maxInstances: 3, memory: '256MiB'});
initializeApp();
const db = getFirestore();
const TIENDA = 'https://distribuidoraarba93.github.io/Tienda-arba/';
const fechaB = v => { const [y, m, d] = (v || '').split('-').map(Number); if (!y) return ''; return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('es-MX', {weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC'}); };
const num = p => { const m = /^ARBA-(\d+)$/.exec(p || ''); return m ? '#' + m[1] : (p || ''); };

async function tokens(campos) {
  let q = db.collection('push');
  for (const [k, v] of Object.entries(campos)) q = q.where(k, '==', v);
  const s = await q.get();
  return s.docs.map(d => ({id: d.id, t: d.get('t')})).filter(x => x.t);
}

async function enviar(lista, {title, body, url, tag}) {
  const vistos = new Set(); lista = lista.filter(x => !vistos.has(x.t) && vistos.add(x.t));
  if (!lista.length) { console.log('Sin celulares registrados para', title); return; }
  const r = await getMessaging().sendEachForMulticast({
    tokens: lista.map(x => x.t),
    webpush: {headers: {Urgency: 'high', TTL: '86400'}, data: {title, body, url: url || TIENDA, tag: tag || ''}},
  });
  console.log('Aviso:', title, '· enviados', r.successCount, 'de', lista.length, r.responses.map((x, i) => x.success ? '' : lista[i].id + ' → ' + (x.error && x.error.code)).filter(Boolean).join(' | '));
  // Borra los celulares que ya no existen o quitaron el permiso
  await Promise.all(r.responses.map((x, i) => {
    const c = x.error && x.error.code || '';
    if (!x.success && /not-registered|invalid-registration|invalid-argument/.test(c)) return db.doc('push/' + lista[i].id).delete().catch(() => {});
  }));
}

// 1) Pedido nuevo → al dueño
exports.pedidoNuevo = onDocumentCreated('pedidos_priv/{id}', async e => {
  const d = e.data && e.data.data(); if (!d) return;
  const ent = d.e === 'Paso a recoger' ? 'recoge' : d.e === 'Punto medio' ? 'punto medio' : 'a domicilio';
  await enviar(await tokens({rol: 'dueno'}), {
    title: d.pg ? '📅 Pedido programado ' + num(d.p) + ' · ' + fechaB(d.pg) : '🛒 Nuevo pedido ' + num(d.p),
    body: [d.n, d.T, d.g, ent].filter(Boolean).join(' · '),
    url: TIENDA + '?dueno=1#panel-arba', tag: 'ped-' + d.p,
  });
});

// 2) Cambio de estatus → al cliente
const EST = {
  aceptado: ['✅ Pedido aceptado', 'Ya lo estamos preparando.'],
  pagado: ['💳 Pago recibido', 'Gracias, ya quedó tu pago.'],
  camino: ['🚚 Tu pedido va en camino', 'Ya va para allá.'],
  listo: ['📦 Listo para recoger', 'Ya puedes pasar por él.'],
  entregado: ['🎉 Pedido entregado', '¡Gracias por tu compra!'],
  cancelado: ['❌ Pedido cancelado', 'Escríbenos si tienes dudas.'],
};
exports.pedidoEstatus = onDocumentUpdated('pedidos/{id}', async e => {
  const a = e.data.before.data() || {}, b = e.data.after.data() || {};
  if (b.pc && a.pc !== b.pc) {
    await enviar(await tokens({rol: 'cliente', p: e.params.id}), {
      title: '📅 Pedido confirmado · ' + num(b.p), body: 'Te lo llevamos el ' + fechaB(b.pc) + '. ¡Gracias!',
      url: TIENDA + '#estatus?p=' + encodeURIComponent(b.p || ''), tag: 'arba-pc-' + b.p,
    });
  }
  if (a.s === b.s || !EST[b.s]) return;
  const [t, m] = EST[b.s];
  await enviar(await tokens({rol: 'cliente', p: e.params.id}), {
    title: t + ' · ' + num(b.p), body: m + (b.t ? (b.s === 'camino' && /^\d+\s*min|hora/i.test(b.t) ? ' Llega en aprox. ' + b.t + '.' : ' Tiempo: ' + b.t) : ''),
    url: TIENDA + '#estatus?p=' + encodeURIComponent(b.p || ''), tag: 'arba-' + b.p,
  });
});

// 3) Entrega nueva o aviso del dueño → al repartidor
exports.rutaCambio = onDocumentUpdated('rutas/{code}', async e => {
  const a = e.data.before.data() || {}, b = e.data.after.data() || {};
  const lista = await tokens({rol: 'repa', r: e.params.code}); if (!lista.length) return;
  const url = TIENDA + '?r=' + e.params.code;
  const nuevos = (b.ids || []).filter(id => !(a.ids || []).includes(id) && b.e && b.e[id]);
  for (const id of nuevos) {
    const x = b.e[id];
    await enviar(lista, {title: '📦 Nueva entrega ' + num(x.p), body: [x.n, x.d, x.T].filter(Boolean).join(' · '), url, tag: 'ent-' + id});
  }
  const ma = (a.m || []).length ? a.m[a.m.length - 1].f : 0;
  const mb = (b.m || []).length ? b.m[b.m.length - 1] : null;
  if (mb && mb.f !== ma) await enviar(lista, {title: '📢 Aviso de Distribuidora ARBA', body: mb.t, url, tag: 'msg-' + mb.f});
});

// 4) Solicitud de repartidor → al dueño
exports.solicitudNueva = onDocumentCreated('solicitudes/{id}', async e => {
  const d = e.data && e.data.data(); if (!d) return;
  await enviar(await tokens({rol: 'dueno'}), {
    title: (d.t === 'aviso' ? '⚠️ Se está acabando: ' : '🙋 ' + (d.n || 'Repartidor') + ' ocupa: ') + d.pn,
    body: [(d.t === 'aviso' ? d.n : d.q ? d.q + ' pzas' : ''), d.nota].filter(Boolean).join(' · ') || 'Toca para ver',
    url: TIENDA + '?dueno=1#panel-arba', tag: 'sol-' + e.params.id,
  });
});

// 5) Recordatorio diario 8 am (Chihuahua): pedidos programados para mañana y los que faltan de confirmar
exports.recordatorioProgramados = onSchedule({schedule: '0 8 * * *', timeZone: 'America/Chihuahua'}, async () => {
  const hoy = new Date(new Date().toLocaleString('en-US', {timeZone: 'America/Chihuahua'}));
  const f = n => { const d = new Date(hoy); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const s = await db.collection('pedidos_priv').where('pg', '>=', f(0)).where('pg', '<=', f(5)).get();
  const vivos = [];
  for (const doc of s.docs) {
    const pub = await db.doc('pedidos/' + doc.id).get();
    const st = pub.exists ? pub.get('s') : '';
    if (!['cancelado', 'entregado'].includes(st)) vivos.push(doc.data());
  }
  const manana = vivos.filter(x => x.pg === f(1)), sinConf = vivos.filter(x => !x.pc && x.pg !== f(1));
  const dueno = await tokens({rol: 'dueno'});
  if (manana.length) await enviar(dueno, {
    title: '📅 Mañana: ' + manana.length + (manana.length > 1 ? ' pedidos programados' : ' pedido programado'),
    body: manana.map(x => num(x.p) + ' ' + (x.n || '') + ' (' + (x.pf || '') + ')' + (x.pc ? ' ✅' : ' · sin confirmar')).join(' · '),
    url: TIENDA + '?dueno=1#panel-arba', tag: 'prg-' + f(1),
  });
  if (sinConf.length) await enviar(dueno, {
    title: '📅 ' + sinConf.length + (sinConf.length > 1 ? ' pedidos programados sin confirmar' : ' pedido programado sin confirmar'),
    body: sinConf.map(x => num(x.p) + ' ' + (x.n || '') + ' · ' + fechaB(x.pg)).join(' · '),
    url: TIENDA + '?dueno=1#panel-arba', tag: 'prg-sc-' + f(0),
  });
});
