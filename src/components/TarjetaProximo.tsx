import { useEffect, useState } from 'react'
import { mensajeDeError } from '../lib/errores'
import { diasHasta, hoyComoTexto, sumarDias } from '../lib/fechas'
import { ir } from '../lib/ruta'
import { supabase } from '../lib/supabase'
import type { Tarea } from '../lib/tipos'
import { useAccionesTarea } from '../lib/useAccionesTarea'
import { useNombres } from '../lib/useNombres'
import { avisoError } from './estilos'
import { AvisoRecienHecha, ListaTareas } from './ListaTareas'

type Props = {
  miUserId: string
}

const DIAS = 30
const MAXIMO_EN_INICIO = 8

// Tarjeta principal del inicio: lo que vence en los próximos 30 días
// (y lo atrasado), ordenado por fecha y con quién se encarga.
export function TarjetaProximo({ miUserId }: Props) {
  const nombres = useNombres(miUserId)
  const [pendientes, setPendientes] = useState<Tarea[] | null>(null)
  const [recarga, setRecarga] = useState(0)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const acciones = useAccionesTarea(() => setRecarga((n) => n + 1))

  useEffect(() => {
    if (!supabase) return
    let vigente = true
    // Gracias a RLS, solo llegan las tareas de tu hogar.
    supabase
      .from('tareas')
      .select('*')
      .eq('completada', false)
      .order('fecha_limite', { ascending: true, nullsFirst: false })
      .order('creado_en')
      .then(({ data, error }) => {
        if (!vigente) return
        if (error) setErrorCarga(mensajeDeError(error))
        else setPendientes(data as Tarea[])
      })
    return () => {
      vigente = false
    }
  }, [recarga])

  const limite = sumarDias(hoyComoTexto(), DIAS)
  // Las fechas «2026-11-21» se pueden comparar como texto.
  const proximas = pendientes?.filter((t) => t.fecha_limite && t.fecha_limite <= limite) ?? []
  const visibles = proximas.slice(0, MAXIMO_EN_INICIO)
  const atrasadas = proximas.filter((t) => t.fecha_limite && diasHasta(t.fecha_limite) < 0).length
  // Cuenta también lo que cubres de quien está de viaje.
  const tuyas = proximas.filter((t) => nombres.esMia(t.responsable_id, t.fecha_limite)).length
  const error = errorCarga ?? acciones.error

  return (
    <section className="tarjeta">
      <h2 className="text-lg font-semibold">⏰ Próximo</h2>
      <p className="text-sm text-stone-500">
        Los próximos {DIAS} días
        {proximas.length > 0 && ` · ${tuyas} ${tuyas === 1 ? 'es tuya' : 'son tuyas'}`}
        {atrasadas > 0 && (
          <span className="font-medium text-red-700">
            {' '}· {atrasadas} atrasada{atrasadas === 1 ? '' : 's'}
          </span>
        )}
      </p>

      <div className="mt-3 flex flex-col gap-3">
        <AvisoRecienHecha acciones={acciones} />
        {error && <p role="alert" className={avisoError}>{error}</p>}
      </div>

      {pendientes === null && !errorCarga && <p className="mt-3 text-sm text-stone-400">Cargando…</p>}

      {pendientes && proximas.length === 0 && (
        <p className="mt-3 text-stone-500">
          {pendientes.length === 0
            ? 'No hay nada pendiente. 🎉 Cuando añadáis tareas o tratamientos, lo que se acerque aparecerá aquí.'
            : `Nada en los próximos ${DIAS} días. 🎉`}
        </p>
      )}

      {visibles.length > 0 && (
        <div className="mt-1">
          <ListaTareas tareas={visibles} acciones={acciones} nombres={nombres} />
        </div>
      )}

      {proximas.length > visibles.length && (
        <p className="text-sm text-stone-500">
          Y {proximas.length - visibles.length} más en los próximos {DIAS} días.
        </p>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => ir('/tareas')}
          className="rounded-full px-3 py-2.5 text-sm font-semibold text-marca ring-1 ring-marca active:scale-[0.98]"
        >
          Ver todas{pendientes && pendientes.length > 0 ? ` (${pendientes.length})` : ''}
        </button>
        <button
          type="button"
          onClick={() => ir('/tareas/nueva')}
          className="rounded-full bg-marca px-3 py-2.5 text-sm font-semibold text-white active:scale-[0.98]"
        >
          + Nueva tarea
        </button>
      </div>
    </section>
  )
}
