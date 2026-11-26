import { useEffect, useState } from 'react'
import { mensajeDeError } from '../lib/errores'
import { diasHasta, fechaLarga } from '../lib/fechas'
import { borrarPreparativos, cambiarFechaPreparativos, usePlantillas } from '../lib/plantillas'
import { reemplazar, volver } from '../lib/ruta'
import { supabase } from '../lib/supabase'
import type { Tarea } from '../lib/tipos'
import { useAccionesTarea } from '../lib/useAccionesTarea'
import { useNombres } from '../lib/useNombres'
import { avisoError, campo } from './estilos'
import { AvisoRecienHecha, ListaTareas } from './ListaTareas'
import { BarraProgreso } from './PantallaPlantillas'

// #/preparativos/<id>: unos preparativos («Mudanza, 15 de marzo») con su
// progreso y sus tareas; cambiar la fecha (las pendientes se mueven) o
// borrarlos (se van las pendientes; las hechas se quedan).
export function PantallaPreparativos({ id, miUserId }: { id: string; miUserId: string }) {
  const { datos, error: errorDatos, recargar } = usePlantillas()
  const nombres = useNombres(miUserId)
  const [tareas, setTareas] = useState<Tarea[] | null>(null)
  const [recarga, setRecarga] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [moviendo, setMoviendo] = useState(false)
  const [nuevaFecha, setNuevaFecha] = useState('')
  const [aviso, setAviso] = useState<string | null>(null)
  const acciones = useAccionesTarea(() => {
    setRecarga((n) => n + 1)
    recargar()
  })
  const prep = datos?.preparativos.find((p) => p.id === id)

  useEffect(() => {
    if (!supabase) return
    let vigente = true
    supabase
      .from('tareas')
      .select('*')
      .eq('preparativo_id', id)
      .order('fecha_limite', { ascending: true, nullsFirst: false })
      .order('creado_en')
      .then(({ data, error }) => {
        if (!vigente) return
        if (error) setError(mensajeDeError(error))
        else setTareas(data as Tarea[])
      })
    return () => {
      vigente = false
    }
  }, [id, recarga])

  if (!datos || tareas === null) return <Mensaje>{errorDatos ?? error ?? 'Cargando…'}</Mensaje>
  if (!prep) return <Mensaje>Estos preparativos ya no existen.</Mensaje>

  const pendientes = tareas.filter((t) => !t.completada)
  const hechas = tareas.filter((t) => t.completada)
  const dias = diasHasta(prep.fecha)

  async function mover() {
    if (!prep || !nuevaFecha || nuevaFecha === prep.fecha) return
    const fallo = await cambiarFechaPreparativos(prep.id, nuevaFecha)
    if (fallo) return setError(fallo)
    const diferencia = diasHasta(nuevaFecha) - diasHasta(prep.fecha)
    setAviso(`📅 Hecho: las ${pendientes.length === 1 ? 'tarea pendiente se ha movido' : `${pendientes.length} tareas pendientes se han movido`} ${Math.abs(diferencia) === 1 ? '1 día' : `${Math.abs(diferencia)} días`} ${diferencia > 0 ? 'más tarde' : 'antes'}.`)
    setMoviendo(false)
    setRecarga((n) => n + 1)
  }

  async function borrar() {
    if (!prep) return
    const texto = pendientes.length === 0 ? `¿Borrar «${prep.nombre}»? Las tareas hechas se quedan.` : `¿Borrar «${prep.nombre}»? Se borrarán ${pendientes.length === 1 ? 'la tarea que queda' : `las ${pendientes.length} tareas que quedan`} por hacer; las hechas se quedan.`
    if (!window.confirm(texto)) return
    const fallo = await borrarPreparativos(prep.id)
    if (fallo) return setError(fallo)
    reemplazar('/plantillas')
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col gap-5 px-5 py-8 md:max-w-2xl md:px-6 lg:max-w-3xl lg:px-10 lg:py-10">
      <button type="button" onClick={() => volver('/tareas')} className="self-start text-sm font-medium text-marca">
        ← Tareas
      </button>

      <section className="tarjeta flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="flex h-14 w-14 shrink-0 -rotate-6 items-center justify-center rounded-2xl bg-tareas text-3xl">
            {prep.dibujo}
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl leading-tight font-extrabold text-tareas-tinta">{prep.nombre}</h1>
            <p className="text-sm text-stone-600 first-letter:uppercase">
              {fechaLarga(prep.fecha)} · {dias === 0 ? 'hoy' : dias > 0 ? `faltan ${dias === 1 ? '1 día' : `${dias} días`}` : `hace ${-dias === 1 ? '1 día' : `${-dias} días`}`}
            </p>
          </div>
        </div>
        <BarraProgreso hechas={hechas.length} total={tareas.length} etiqueta={`Progreso de ${prep.nombre}`} />
        <p className="text-sm font-medium text-stone-600">
          {tareas.length > 0 && hechas.length === tareas.length ? '🎉 ¡Todo listo!' : `${hechas.length} de ${tareas.length} hechas`}
        </p>
        {prep.agenda_plan_id && (
          <p className="rounded-xl bg-planes p-3 text-sm text-planes-tinta">
            🎲 Va con un plan del calendario: si cambiáis el día del plan, las tareas se mueven solas; si lo quitáis, se borran las que quedan.
          </p>
        )}
      </section>

      <AvisoRecienHecha acciones={acciones} />
      {aviso && <p role="status" className="rounded-xl bg-marca-suave p-3 text-sm text-marca">{aviso}</p>}
      {(error ?? acciones.error) && <p role="alert" className={avisoError}>{error ?? acciones.error}</p>}

      {pendientes.length > 0 && (
        <section aria-label="Por hacer" className="tarjeta px-5 py-2">
          <h2 className="pt-2 text-sm font-semibold text-stone-500">Por hacer</h2>
          <ListaTareas tareas={pendientes} acciones={acciones} nombres={nombres} />
        </section>
      )}
      {hechas.length > 0 && (
        <section aria-label="Hechas" className="tarjeta px-5 py-2">
          <h2 className="pt-2 text-sm font-semibold text-stone-500">Hechas</h2>
          <ListaTareas tareas={hechas} acciones={acciones} nombres={nombres} />
        </section>
      )}

      <div className="flex flex-wrap justify-center gap-2">
        {!prep.agenda_plan_id && (
          <button type="button" onClick={() => { setMoviendo(!moviendo); setNuevaFecha(prep.fecha) }} aria-expanded={moviendo} className="rounded-full px-4 py-2 text-sm font-semibold text-stone-700 ring-1 ring-stone-300 hover:bg-stone-50">
            📅 Cambiar la fecha
          </button>
        )}
        <button type="button" onClick={borrar} className="rounded-full px-4 py-2 text-sm font-semibold text-red-700 ring-1 ring-red-200 hover:bg-red-50">
          🗑️ Borrar los preparativos
        </button>
      </div>
      {moviendo && (
        <div className="tarjeta flex flex-col gap-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-stone-700">Nueva fecha</span>
            <input type="date" className={campo} value={nuevaFecha} onChange={(e) => setNuevaFecha(e.target.value)} aria-label="Nueva fecha de los preparativos" />
          </label>
          <p className="text-xs text-stone-500">Las tareas que quedan por hacer se moverán los mismos días.</p>
          <button type="button" onClick={mover} disabled={!nuevaFecha || nuevaFecha === prep.fecha} className="rounded-full bg-linear-to-b from-marca to-[#0b5f58] px-5 py-3 font-semibold text-white disabled:opacity-60">
            Mover
          </button>
        </div>
      )}
    </main>
  )
}

function Mensaje({ children }: { children: string }) {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md items-center justify-center px-5 text-center text-stone-500 md:max-w-2xl">
      <p>{children}</p>
    </main>
  )
}
