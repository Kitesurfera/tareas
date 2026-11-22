import { useSyncExternalStore } from 'react'

// Registro del service worker y versiones nuevas de la app.
//
// Cuando publicamos una versión nueva, el service worker nuevo se descarga
// en segundo plano y toma el control. Entonces:
//   * si acabas de abrir (o volver a) la app, se recarga sola;
//   * si llevas un rato usándola, sale un aviso «Actualizar» para no
//     perder lo que estés escribiendo.

const SEGUNDOS_DE_GRACIA = 15
let ultimaVezAbierta = Date.now()
let hayVersionNueva = false
const avisar = new Set<() => void>()

export function registrarServiceWorker(): void {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return

  // Si al abrir no había service worker, es la primera instalación: no
  // hay ninguna versión antigua que cambiar.
  const habiaVersionAnterior = Boolean(navigator.serviceWorker.controller)
  let recargando = false

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!habiaVersionAnterior || recargando) return
    if (Date.now() - ultimaVezAbierta < SEGUNDOS_DE_GRACIA * 1000) {
      recargando = true
      window.location.reload()
      return
    }
    hayVersionNueva = true
    avisar.forEach((f) => f())
  })

  const registrar = async () => {
    try {
      const registro = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
      // Cada vez que vuelves a la app, mira si hay versión nueva.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') return
        ultimaVezAbierta = Date.now()
        registro.update().catch(() => {})
      })
    } catch {
      // Sin service worker la app funciona igual (solo que sin instalar).
    }
  }
  if (document.readyState === 'complete') registrar()
  else window.addEventListener('load', registrar)
}

function suscribir(f: () => void) {
  avisar.add(f)
  return () => avisar.delete(f)
}

export function useVersionNueva(): boolean {
  return useSyncExternalStore(suscribir, () => hayVersionNueva)
}
