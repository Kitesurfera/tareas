import { useEffect, useState } from 'react'
import { mensajeDeError } from '../lib/errores'
import { diasHasta } from '../lib/fechas'
import { ir } from '../lib/ruta'
import { supabase } from '../lib/supabase'
import type { Tarea } from '../lib/tipos'
import { useAccionesTarea } from '../lib/useAccionesTarea'
import { useNombres } from '../lib/useNombres'
import { avisoError, botonPrincipal } from './estilos'
import { AvisoRecienHecha, ListaTareas } from './ListaTareas'
import { CabeceraPestana } from './CabeceraPestana'
import { Vacio } from './Piezas'

type Props = {
  miUserId: string
}

type Pestana = 'pendientes' | 'hechas'

// Agrupa las pendientes según cuándo vencen.
function grupoDe(tarea: Tarea): string {
  if (!tarea.fecha_limite) return 'Sin fecha'
  const dias = diasHasta(tarea.fecha_limite)
  if (dias < 0) return 'Atrasadas'
  if (dias <= 7) return 'Próximos 7 días'
  return 'Más adelante'
}
const ORDEN_GRUPOS = ['Atrasadas', 'Próximos 7 días', 'Más adelante', 'Sin fecha']

// Lista de tareas del hogar.
export function PantallaTareas({ miUserId }: Props) {
  const nombres = useNombres(miUserId)
  const [pestana, setPestana] = useState<Pestana>('pendientes')
  const [soloMias, setSoloMias] = useState(false)
  const [tareas, setTareas] = useState<{ pestana: Pestana; lista: Tarea[] } | null>(null)
  const [recarga, setRecarga] = useState(0)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const acciones = useAccionesTarea(() => setRecarga((n) => n + 1))

  useEffect(() => {
    if (!supabase) return
    let vigente = true
    const consulta =
      pestana === 'pendientes'
        ? supabase
            .from('tareas')
            .select('*')
            .eq('completada', false)
            .order('fecha_limite', { ascending: true, nullsFirst: false })
            .order('creado_en')
        : supabase
            .from('tareas')
            .select('*')
            .eq('completada', true)
            .order('completada_en', { ascending: false })
            .limit(50)
    consulta.then(({ data, error }) => {
      if (!vigente) return
      if (error) setErrorCarga(mensajeDeError(error))
      else setTareas({ pestana, lista: data as Tarea[] })
    })
    return () => {
      vigente = false
    }
  }, [pestana, recarga])

  // Mientras cambia de pestaña no enseñamos la lista anterior.
  const lista =
    tareas?.pestana === pestana
      ? tareas.lista.filter(
          (t) =>
            !soloMias ||
            // Pendientes: también lo que cubres de quien está de viaje.
            (pestana === 'pendientes'
              ? nombres.esMia(t.responsable_id, t.fecha_limite)
              : t.responsable_id === nombres.miMiembroId),
        )
      : null
  const error = errorCarga ?? acciones.error

  const chip = (activo: boolean) =>
    `rounded-full px-4 py-1.5 text-sm font-medium ring-1 transition ${
      activo ? 'bg-marca text-white ring-marca' : 'bg-white text-stone-700 ring-stone-300'
    }`

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col gap-5 px-5 py-8 md:max-w-2xl md:px-6 lg:max-w-4xl lg:px-10 lg:py-10">
      <CabeceraPestana color="tareas" titulo="Tareas" subtitulo="Todo lo que hay que recordar, sin que se quede en una sola cabeza." dibujo="📝" />

      {/* En el ordenador, todo en una fila: pendientes/hechas, todas/mías y el botón. */}
      <div className="contents lg:flex lg:items-center lg:gap-4">
        <button type="button" onClick={() => ir('/tareas/nueva')} className={`${botonPrincipal} lg:order-last lg:ml-auto lg:w-auto lg:px-6`}>
          + Nueva tarea
        </button>

        <div className="grid grid-cols-2 gap-1 rounded-full bg-stone-200 p-1 lg:w-72" role="tablist">
          {(
            [
              ['pendientes', 'Pendientes'],
              ['hechas', 'Hechas'],
            ] as const
          ).map(([valor, texto]) => (
            <button
              key={valor}
              type="button"
              role="tab"
              aria-selected={pestana === valor}
              onClick={() => {
                setPestana(valor)
                acciones.cancelarMarcado()
                acciones.olvidarRecienHecha()
              }}
              className={`rounded-full px-3 py-2 text-sm font-medium transition ${
                pestana === valor ? 'bg-white text-marca shadow-sm' : 'text-stone-600'
              }`}
            >
              {texto}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <button type="button" aria-pressed={!soloMias} onClick={() => setSoloMias(false)} className={chip(!soloMias)}>
            Todas
          </button>
          <button type="button" aria-pressed={soloMias} onClick={() => setSoloMias(true)} className={chip(soloMias)}>
            Mías
          </button>
        </div>
      </div>

      <AvisoRecienHecha acciones={acciones} />

      {error && <p role="alert" className={avisoError}>{error}</p>}

      {lista === null && !error && <p className="text-center text-stone-400">Cargando…</p>}

      {lista?.length === 0 && (
        <div className="tarjeta">
          <Vacio dibujo={pestana === 'pendientes' ? '🎉' : '🌱'} color="tareas">
            {pestana === 'pendientes'
              ? soloMias
                ? 'No tienes nada pendiente. ¡Disfruta!'
                : 'No hay nada pendiente en el hogar. ¡Disfrutad!'
              : 'Todavía no hay tareas hechas. La primera está al caer.'}
          </Vacio>
        </div>
      )}

      {lista && lista.length > 0 && pestana === 'pendientes' &&
        ORDEN_GRUPOS.map((grupo) => {
          const delGrupo = lista.filter((t) => grupoDe(t) === grupo)
          if (delGrupo.length === 0) return null
          return (
            <section key={grupo} className="tarjeta px-5 py-2">
              <h2 className={`pt-2 text-sm font-semibold ${grupo === 'Atrasadas' ? 'text-red-700' : 'text-stone-500'}`}>
                {grupo}
              </h2>
              <ListaTareas tareas={delGrupo} acciones={acciones} nombres={nombres} />
            </section>
          )
        })}

      {lista && lista.length > 0 && pestana === 'hechas' && (
        <section className="tarjeta px-5 py-2">
          <ListaTareas tareas={lista} acciones={acciones} nombres={nombres} />
        </section>
      )}
    </main>
  )
}
