import { useSyncExternalStore } from 'react'

// Navegación sencilla entre pantallas usando la parte de la dirección
// que va detrás de «#» (por ejemplo …/#/mascotas/nueva).
// Así el botón «atrás» del móvil funciona sin instalar nada más.

function suscribir(avisar: () => void) {
  window.addEventListener('hashchange', avisar)
  return () => window.removeEventListener('hashchange', avisar)
}

function rutaActual(): string {
  const ruta = window.location.hash.slice(1)
  return ruta.startsWith('/') ? ruta : '/'
}

export function useRuta(): string {
  return useSyncExternalStore(suscribir, rutaActual)
}

function avisarCambio() {
  window.dispatchEvent(new HashChangeEvent('hashchange'))
}

// Va a otra pantalla (se puede volver con «atrás»). Marcamos la entrada
// para saber que detrás hay otra pantalla de la app.
export function ir(ruta: string): void {
  window.history.pushState({ dentroDeLaApp: true }, '', `#${ruta}`)
  avisarCambio()
}

// Va a otra pantalla sustituyendo la actual (por ejemplo, después de
// guardar un formulario, para que «atrás» no vuelva al formulario).
export function reemplazar(ruta: string): void {
  window.history.replaceState(window.history.state, '', `#${ruta}`)
  avisarCambio()
}

// Como el botón «atrás», pero sin salir nunca de la app: si no hay una
// pantalla de la app detrás, va a «destino».
export function volver(destino: string): void {
  if (window.history.state?.dentroDeLaApp) window.history.back()
  else reemplazar(destino)
}
