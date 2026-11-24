import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CATEGORIAS_SUGERIDAS, usePlanes } from '../lib/planes'
import { mensajeDeError } from '../lib/errores'
import { ir } from '../lib/ruta'
import { supabase } from '../lib/supabase'
import { CabeceraPestana } from './CabeceraPestana'
import { CalendarioPlanes } from './CalendarioPlanes'
import { avisoError, botonCabecera, botonPrincipal } from './estilos'
import { GeneradorPlanes } from './GeneradorPlanes'
import { ListaPlanes } from './ListaPlanes'
import { TituloSeccion } from './Piezas'

// Pestaña «Planes»: el generador al azar, vuestra lista de planes por
// categorías y el calendario.
export function PantallaPlanes({ hogarId }: { hogarId: string }) {
  const { datos, error, recargar } = usePlanes()

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col gap-5 px-5 py-8 md:max-w-2xl md:px-6 lg:max-w-6xl lg:px-10 lg:py-10">
      <CabeceraPestana
        color="planes"
        titulo="Planes"
        subtitulo="¿Qué hacemos? Al azar o elegido, y vuestro calendario."
        dibujo="🎲"
        botonEnOrdenador
        boton={
          <div className="flex shrink-0 gap-2">
            <MenuAnadir />
            {/* En la tablet y el ordenador, Ajustes ya está en el menú de la izquierda. */}
            <button type="button" onClick={() => ir('/ajustes')} aria-label="Ajustes" title="Ajustes" className={`${botonCabecera} md:hidden`}>
              <span aria-hidden="true">⚙️</span>
            </button>
          </div>
        }
      />

      {error && <p role="alert" className={avisoError}>{error}</p>}
      {datos === null && !error && <p className="text-center text-stone-400">Cargando…</p>}

      {datos && datos.categorias.length === 0 && <EmpezarConSugeridas hogarId={hogarId} onListo={recargar} />}

      {datos && (
        // En el móvil: generador, calendario y lista. En el ordenador: el
        // generador y la lista a la izquierda; el calendario a la derecha.
        <div className="contents lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
          <div className="contents lg:flex lg:flex-col lg:gap-6">
            <GeneradorPlanes datos={datos} onCambio={recargar} />
            <div className="order-last lg:order-none">
              <ListaPlanes datos={datos} onCambio={recargar} />
            </div>
          </div>
          <div className="contents lg:sticky lg:top-6 lg:flex lg:flex-col lg:gap-6">
            <CalendarioPlanes datos={datos} onCambio={recargar} />
          </div>
        </div>
      )}
    </main>
  )
}

// La primera vez: crear las categorías sugeridas de un toque.
function EmpezarConSugeridas({ hogarId, onListo }: { hogarId: string; onListo: () => void }) {
  const [creando, setCreando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function crear() {
    if (!supabase) return
    setCreando(true)
    setError(null)
    const { error } = await supabase
      .from('categorias_plan')
      .insert(CATEGORIAS_SUGERIDAS.map((c, i) => ({ hogar_id: hogarId, nombre: c.nombre, dibujo: c.dibujo, color: c.color, orden: i })))
    setCreando(false)
    // Si otra persona del hogar las creó a la vez, ya están: también vale.
    if (error && error.code !== '23505') return setError(mensajeDeError(error))
    onListo()
  }

  return (
    <section className="tarjeta flex flex-col gap-3">
      <TituloSeccion dibujo="🏷️" titulo="Primero, las categorías" subtitulo="Para ordenar vuestros planes" color="planes" />
      <p className="flex flex-wrap gap-1.5 text-sm">
        {CATEGORIAS_SUGERIDAS.map((c) => (
          <span key={c.nombre} className="rounded-full bg-stone-100 px-2.5 py-1 text-stone-700">
            {c.dibujo} {c.nombre}
          </span>
        ))}
      </p>
      <p className="text-sm text-stone-600">Luego podéis cambiarlas, borrarlas o crear las vuestras.</p>
      {error && <p role="alert" className={avisoError}>{error}</p>}
      <button type="button" onClick={crear} disabled={creando} className={botonPrincipal}>
        {creando ? 'Creando…' : '✨ Usar estas categorías'}
      </button>
    </section>
  )
}

// ➕ arriba a la derecha: añadir un plan (con el formulario) o varios a la
// vez (con la plantilla CSV). El menú se dibuja fuera de la cabecera para
// que no lo recorte su borde redondeado.
function MenuAnadir() {
  const [abierto, setAbierto] = useState(false)
  const [sitio, setSitio] = useState({ top: 0, right: 0 })
  const boton = useRef<HTMLButtonElement>(null)
  const primero = useRef<HTMLButtonElement>(null)

  function abrir() {
    const caja = boton.current?.getBoundingClientRect()
    if (caja) setSitio({ top: caja.bottom + 8, right: Math.max(12, window.innerWidth - caja.right) })
    setAbierto(true)
  }

  useEffect(() => {
    if (!abierto) return
    primero.current?.focus()
    const cerrar = () => setAbierto(false)
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setAbierto(false)
      boton.current?.focus()
    }
    window.addEventListener('keydown', tecla)
    window.addEventListener('resize', cerrar)
    window.addEventListener('scroll', cerrar)
    return () => {
      window.removeEventListener('keydown', tecla)
      window.removeEventListener('resize', cerrar)
      window.removeEventListener('scroll', cerrar)
    }
  }, [abierto])

  const opcion = 'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-stone-50 focus-visible:bg-stone-50'

  return (
    <>
      <button
        ref={boton}
        type="button"
        onClick={() => (abierto ? setAbierto(false) : abrir())}
        aria-expanded={abierto}
        aria-controls="menu-anadir-planes"
        aria-label="Añadir planes"
        title="Añadir planes"
        className={`${botonCabecera} md:w-auto md:gap-1.5 md:px-4 md:text-base md:font-semibold md:text-planes-tinta`}
      >
        <span aria-hidden="true">➕</span>
        <span aria-hidden="true" className="hidden md:inline">Añadir</span>
      </button>
      {abierto &&
        createPortal(
          // El fondo transparente cierra el menú al tocar fuera.
          <div className="fixed inset-0 z-40" onClick={() => setAbierto(false)}>
            <div
              id="menu-anadir-planes"
              style={{ top: sitio.top, right: sitio.right }}
              className="fixed flex w-72 max-w-[calc(100vw-1.5rem)] animate-aparecer flex-col rounded-2xl bg-white p-1.5 shadow-xl ring-1 ring-stone-900/10"
              onClick={(e) => e.stopPropagation()}
            >
              <button ref={primero} type="button" onClick={() => ir('/planes/nuevo')} className={opcion}>
                <span aria-hidden="true" className="text-2xl">✏️</span>
                <span>
                  <span className="block font-semibold">Un plan</span>
                  <span className="block text-xs text-stone-500">Rellenando el formulario</span>
                </span>
              </button>
              <button type="button" onClick={() => ir('/planes/importar')} className={opcion}>
                <span aria-hidden="true" className="text-2xl">📄</span>
                <span>
                  <span className="block font-semibold">Varios a la vez</span>
                  <span className="block text-xs text-stone-500">Con una plantilla CSV (Excel, Google Sheets…)</span>
                </span>
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
