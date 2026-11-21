import { useEffect, useState } from 'react'
import { diasHasta } from '../lib/fechas'
import { ir } from '../lib/ruta'
import { supabase } from '../lib/supabase'
import type { Tarea } from '../lib/tipos'
import { useMiembros } from '../lib/useMiembros'
import { botonSecundario } from './estilos'

type Props = {
  miUserId: string
}

type Resumen = Pick<Tarea, 'id' | 'fecha_limite' | 'responsable_id'>

// Tarjeta del inicio con el resumen de tareas pendientes.
export function TarjetaTareas({ miUserId }: Props) {
  const { miembros } = useMiembros()
  const [pendientes, setPendientes] = useState<Resumen[] | null>(null)

  useEffect(() => {
    if (!supabase) return
    let vigente = true
    supabase
      .from('tareas')
      .select('id, fecha_limite, responsable_id')
      .eq('completada', false)
      .then(({ data }) => {
        if (vigente) setPendientes((data ?? []) as Resumen[])
      })
    return () => {
      vigente = false
    }
  }, [])

  const miMiembroId = miembros?.find((m) => m.user_id === miUserId)?.id
  const mias = pendientes?.filter((t) => t.responsable_id === miMiembroId).length ?? 0
  const atrasadas =
    pendientes?.filter((t) => t.fecha_limite && diasHasta(t.fecha_limite) < 0).length ?? 0

  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm">
      <button
        type="button"
        onClick={() => ir('/tareas')}
        className="flex w-full items-center justify-between text-left"
      >
        <span>
          <span className="block text-lg font-semibold">Tareas</span>
          <span className="block text-sm text-stone-500">
            {pendientes === null
              ? 'Cargando…'
              : pendientes.length === 0
                ? 'No hay nada pendiente 🎉'
                : `${pendientes.length} pendiente${pendientes.length === 1 ? '' : 's'} · ${mias} tuya${mias === 1 ? '' : 's'}`}
          </span>
          {atrasadas > 0 && (
            <span className="block text-sm font-medium text-red-700">
              {atrasadas} atrasada{atrasadas === 1 ? '' : 's'}
            </span>
          )}
        </span>
        <span aria-hidden="true" className="text-2xl text-stone-300">›</span>
      </button>
      <button type="button" onClick={() => ir('/tareas/nueva')} className={`mt-4 ${botonSecundario}`}>
        + Nueva tarea
      </button>
    </section>
  )
}
