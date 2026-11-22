import { useState } from 'react'
import { CATEGORIAS_SUGERIDAS, usePlanes } from '../lib/planes'
import { mensajeDeError } from '../lib/errores'
import { supabase } from '../lib/supabase'
import { CabeceraPestana } from './CabeceraPestana'
import { CalendarioPlanes } from './CalendarioPlanes'
import { avisoError, botonPrincipal } from './estilos'
import { GeneradorPlanes } from './GeneradorPlanes'
import { ListaPlanes } from './ListaPlanes'
import { TituloSeccion } from './Piezas'

// Pestaña «Planes»: el generador al azar, vuestra lista de planes por
// categorías y el calendario.
export function PantallaPlanes({ hogarId }: { hogarId: string }) {
  const { datos, error, recargar } = usePlanes()

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col gap-5 px-5 py-8 md:max-w-2xl md:px-6 lg:max-w-6xl lg:px-10 lg:py-10">
      <CabeceraPestana color="planes" titulo="Planes" subtitulo="¿Qué hacemos? Al azar o elegido, y vuestro calendario." dibujo="🎲" />

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
