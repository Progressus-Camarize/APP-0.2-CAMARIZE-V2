// Service Worker para Camarize - Notificações Push
const CACHE_NAME = 'camarize-v1';

// Instalar: ativa imediatamente sem bloquear em cache
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// Ativar: assume controle de todas as abas imediatamente e limpa caches antigos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) return caches.delete(name);
        })
      ))
      .then(() => self.clients.claim())
  );
});

// Receber notificações push
self.addEventListener('push', (event) => {
  console.log('Push recebido:', event);

  const payload = event.data ? event.data.json() : {};

  const options = {
    body: payload.body || 'Nova notificação do Camarize!',
    icon: payload.icon || '/images/logo_camarize1.png',
    badge: payload.badge || '/images/logo_camarize2.png',
    vibrate: [100, 50, 100],
    data: payload.data || {}
  };

  event.waitUntil(
    self.registration.showNotification(payload.title || 'Camarize', options)
  );
});

// Clique na notificação — navega para o cativeiro do alerta
self.addEventListener('notificationclick', (event) => {
  console.log('Notificação clicada:', event);

  event.notification.close();

  const url = event.notification.data?.url || '/';
  event.waitUntil(clients.openWindow(url));
});

// Fechar notificação
self.addEventListener('notificationclose', (event) => {
  console.log('Notificação fechada:', event);
});

// Sincronização em background
self.addEventListener('sync', (event) => {
  console.log('Sync em background:', event);
}); 