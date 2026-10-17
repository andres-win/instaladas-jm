// Cambia este número cuando quieras obligar a todas las apps abiertas a actualizarse
const VER = '2026-10-17a';
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil((async () => {
  await clients.claim();
  const cs = await clients.matchAll({ type: 'window', includeUncontrolled: true });
  cs.forEach(c => { try { c.navigate(c.url); } catch (x) {} });
})()));
// La pantalla siempre se pide fresca a internet, para no quedarse con una versión vieja
self.addEventListener('fetch', e => {
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request, { cache: 'no-store' }).catch(() =>
      new Response('Sin conexión. Conéctate a internet para abrir la app.', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })));
  }
});
self.addEventListener('push',e=>{let d={title:'INSTALADAS JM',body:''};try{d=e.data.json()}catch(x){}
 e.waitUntil(self.registration.showNotification(d.title||'INSTALADAS JM',{body:d.body||'',icon:'icon-192.png',badge:'icon-192.png'})
  .then(()=>self.registration.getNotifications()).then(l=>{if(self.navigator.setAppBadge)return self.navigator.setAppBadge(l.length)}))});
self.addEventListener('notificationclick',e=>{e.notification.close();
 e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(l=>l.length?l[0].focus():clients.openWindow('./')))});
