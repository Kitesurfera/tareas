import { useState } from 'react'
import { abiertaComoApp, esIOS, instalar, usePuedeInstalar, useRecienInstalada } from '../lib/instalar'

const CLAVE = 'tareas.instalar.oculto'

function leerOculto(): boolean {
  try {
    return localStorage.getItem(CLAVE) === '1'
  } catch {
    return false
  }
}

// Tarjeta que invita a instalar la app en el móvil. En el inicio se puede
// ocultar con «Ahora no»; en Ajustes («siempre») se enseña igualmente.
export function TarjetaInstalar({ siempre = false }: { siempre?: boolean }) {
  const puedeInstalar = usePuedeInstalar()
  const recienInstalada = useRecienInstalada()
  const [oculto, setOculto] = useState(leerOculto)
  const ios = esIOS()

  if (abiertaComoApp() || recienInstalada || (oculto && !siempre)) return null
  // Solo la mostramos donde sabemos explicar cómo instalarla.
  if (!puedeInstalar && !ios) return null

  function ocultar() {
    try {
      localStorage.setItem(CLAVE, '1')
    } catch {
      // Si el navegador no deja guardar, solo la ocultamos esta vez.
    }
    setOculto(true)
  }

  return (
    <section className="rounded-2xl border border-marca/20 bg-marca-suave p-5">
      <div className="flex items-start gap-3">
        <img src="/apple-touch-icon.png" alt="" className="h-12 w-12 shrink-0 rounded-xl" />
        <div>
          <h2 className="font-semibold text-marca">Instala Tareas en tu móvil</h2>
          <p className="text-sm text-stone-700">
            Se abre a pantalla completa, como cualquier app, desde un icono en
            tu pantalla de inicio.
          </p>
        </div>
      </div>

      {puedeInstalar ? (
        <button
          type="button"
          onClick={instalar}
          className="mt-4 w-full rounded-full bg-marca px-5 py-3 font-semibold text-white shadow-sm active:scale-[0.98]"
        >
          Instalar
        </button>
      ) : (
        <ol className="mt-4 flex flex-col gap-2 text-sm text-stone-700">
          <li>
            1. Pulsa el botón <strong>Compartir</strong>{' '}
            <span aria-hidden="true" className="inline-block rounded border border-stone-400 px-1 text-xs">↑</span>{' '}
            de Safari (abajo o arriba de la pantalla).
          </li>
          <li>
            2. Elige <strong>«Añadir a pantalla de inicio»</strong> y pulsa <strong>Añadir</strong>.
          </li>
        </ol>
      )}

      {!siempre && (
        <button type="button" onClick={ocultar} className="mt-3 w-full text-sm text-stone-500">
          Ahora no
        </button>
      )}
    </section>
  )
}
