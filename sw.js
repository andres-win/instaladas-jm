self.addEventListener('install',e=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(clients.claim()));
self.addEventListener('fetch',e=>{});
self.addEventListener('push',e=>{let d={title:'INSTALADAS JM',body:''};try{d=e.data.json()}catch(x){}
 e.waitUntil(self.registration.showNotification(d.title||'INSTALADAS JM',{body:d.body||'',icon:'icon-192.png',badge:'icon-192.png'})
  .then(()=>self.registration.getNotifications()).then(l=>{if(self.navigator.setAppBadge)return self.navigator.setAppBadge(l.length)}))});
self.addEventListener('notificationclick',e=>{e.notification.close();
 e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(l=>l.length?l[0].focus():clients.openWindow('./')))});
