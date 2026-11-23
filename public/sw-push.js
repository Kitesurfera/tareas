// Parte del service worker que recibe los avisos y los enseña.
// (vite-plugin-pwa la incluye en el service worker con «importScripts».)

self.addEventListener('push', (evento) => {
  let datos = {}
  try {
    datos = evento.data ? evento.data.json() : {}
  } catch {
    datos = { body: evento.data ? evento.data.text() : '' }
  }
  // Solo abrimos rutas de nuestra propia app (nunca otra web).
  const ruta = typeof datos.url === 'string' && datos.url.startsWith('/') && !datos.url.startsWith('//') ? datos.url : '/'
  evento.waitUntil(
    self.registration.showNotification(datos.title || 'Tareas', {
      body: datos.body || '',
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      tag: datos.tag || 'tareas',
      lang: 'es',
      data: { ruta },
    }),
  )
})

// Al tocar el aviso: si la app ya está abierta, se trae al frente; si no, se abre.
self.addEventListener('notificationclick', (evento) => {
  evento.notification.close()
  const ruta = (evento.notification.data && evento.notification.data.ruta) || '/'
  const url = new URL(ruta, self.location.origin).href
  evento.waitUntil(
    (async () => {
      const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const ventana of ventanas) {
        if (new URL(ventana.url).origin === self.location.origin) {
          // Si el aviso lleva a una pantalla concreta («/#/semana»), la app va allí.
          if (ruta.startsWith('/#/')) ventana.postMessage({ tipo: 'abrir', ruta })
          await ventana.focus()
          return
        }
      }
      await self.clients.openWindow(url)
    })(),
  )
})
