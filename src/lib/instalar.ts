import { useSyncExternalStore } from 'react'

// Ayudas para instalar la app en el móvil (PWA).

// El navegador (Chrome en Android) avisa con este evento de que la app se
// puede instalar. Llega muy pronto al abrir la página, así que lo
// escuchamos nada más cargar y lo guardamos para usarlo luego.
type EventoInstalar = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let eventoGuardado: EventoInstalar | null = null
let instalada = false
const avisar = new Set<() => void>()
const cambiar = () => avisar.forEach((f) => f())

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault() // que no salga el aviso del navegador: usamos el nuestro
  eventoGuardado = e as EventoInstalar
  cambiar()
})
window.addEventListener('appinstalled', () => {
  instalada = true
  eventoGuardado = null
  cambiar()
})

function suscribir(f: () => void) {
  avisar.add(f)
  return () => avisar.delete(f)
}

// ¿Se puede mostrar el botón «Instalar» (Android/Chrome)?
export function usePuedeInstalar(): boolean {
  return useSyncExternalStore(suscribir, () => eventoGuardado !== null)
}

export function useRecienInstalada(): boolean {
  return useSyncExternalStore(suscribir, () => instalada)
}

// Abre la ventana de instalación del navegador.
export async function instalar(): Promise<void> {
  if (!eventoGuardado) return
  await eventoGuardado.prompt()
  await eventoGuardado.userChoice
  eventoGuardado = null
  cambiar()
}

// ¿Ya estamos dentro de la app instalada?
export function abiertaComoApp(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

// iPhone o iPad (el iPad moderno dice ser un Mac, pero tiene pantalla táctil).
export function esIOS(): boolean {
  const ua = navigator.userAgent
  return /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
}
