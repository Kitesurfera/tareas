import { useEffect, useState } from 'react'
import { mensajeDeError } from '../lib/errores'
import { cuandoToca, diasHasta } from '../lib/fechas'
import { ir } from '../lib/ruta'
import { supabase } from '../lib/supabase'
import { infoCuidado, nombreDeCuidado, type Cuidado, type Planta, type Tarea } from '../lib/tipos'
import type { Nombres } from '../lib/useNombres'
import { ConfirmarHecho } from './ConfirmarHecho'
import { avisoError, botonSecundario } from './estilos'

type Fila = {
  planta: Planta
  // El cuidado que toca antes, con su tarea pendiente.
  proximo?: { cuidado: Cuidado; tarea: Tarea }
}

function colorDeFecha(fecha: string): string {
  const dias = diasHasta(fecha)
  if (dias < 0) return 'text-red-700'
  if (dias <= 1) return 'text-amber-700'
  return 'text-stone-600'
}

// En la pestaña Casa: las plantas, qué les toca antes y «Hecho».
export function SeccionPlantas({ nombres }: { nombres: Nombres }) {
  const [filas, setFilas] = useState<Fila[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [recarga, setRecarga] = useState(0)
  const [marcando, setMarcando] = useState<string | null>(null) // id de la tarea
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    if (!supabase) return
    let vigente = true
    Promise.all([
      supabase.from('plantas').select('*').order('nombre'),
      supabase.from('cuidados').select('*'),
      supabase.from('tareas').select('*').not('cuidado_id', 'is', null).eq('completada', false),
    ]).then(([plantas, cuidados, tareas]) => {
      if (!vigente) return
      const fallo = plantas.error ?? cuidados.error ?? tareas.error
      if (fallo) return setError(mensajeDeError(fallo))
      const listaCuidados = cuidados.data as Cuidado[]
      const pendientes = (tareas.data as Tarea[]).sort((a, b) =>
        (a.fecha_limite ?? '9999').localeCompare(b.fecha_limite ?? '9999'),
      )
      const lista = (plantas.data as Planta[]).map((planta) => {
        const tarea = pendientes.find((t) => t.planta_id === planta.id)
        const cuidado = tarea && listaCuidados.find((c) => c.id === tarea.cuidado_id)
        return { planta, proximo: tarea && cuidado ? { tarea, cuidado } : undefined }
      })
      // Primero las que necesitan algo antes.
      lista.sort((a, b) =>
        (a.proximo?.tarea.fecha_limite ?? '9999').localeCompare(b.proximo?.tarea.fecha_limite ?? '9999'),
      )
      setFilas(lista)
    })
    return () => {
      vigente = false
    }
  }, [recarga])

  async function confirmarHecho(tarea: Tarea, fecha: string) {
    if (!supabase) return
    setEnviando(true)
    setError(null)
    const { error } = await supabase.rpc('completar_tarea', { tarea_id: tarea.id, hecha_el: fecha })
    setEnviando(false)
    if (error) return setError(mensajeDeError(error))
    setMarcando(null)
    setRecarga((n) => n + 1)
  }

  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold">🪴 Plantas</h2>
      <p className="text-sm text-stone-500">Riego, abono, trasplantes…</p>

      {error && <p role="alert" className={`mt-3 ${avisoError}`}>{error}</p>}
      {filas === null && !error && <p className="mt-3 text-sm text-stone-400">Cargando…</p>}
      {filas?.length === 0 && (
        <p className="mt-3 text-stone-500">
          Añade vuestras plantas y la app os recordará cuándo regar, abonar o trasplantar cada una, y a quién
          le toca.
        </p>
      )}

      {filas && filas.length > 0 && (
        <ul className="mt-2 divide-y divide-stone-100">
          {filas.map(({ planta, proximo }) => {
            const abierto = proximo && marcando === proximo.tarea.id
            const info = proximo && infoCuidado(proximo.cuidado.tipo)
            const encargada =
              proximo && nombres.encargada(proximo.tarea.responsable_id, proximo.tarea.fecha_limite, proximo.tarea)
            return (
              <li key={planta.id} className="py-3">
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    onClick={() => ir(`/casa/plantas/${planta.id}`)}
                    className="flex flex-1 items-start gap-3 text-left"
                  >
                    <span aria-hidden="true" className="text-2xl leading-none">🪴</span>
                    <span className="flex-1">
                      <span className="block font-medium">
                        {planta.nombre}
                        {planta.ubicacion && <span className="font-normal text-stone-500"> · {planta.ubicacion}</span>}
                      </span>
                      {proximo && info && proximo.tarea.fecha_limite ? (
                        <>
                          <span className={`block text-sm font-medium ${colorDeFecha(proximo.tarea.fecha_limite)}`}>
                            {info.dibujo} {nombreDeCuidado(proximo.cuidado)} · {cuandoToca(proximo.tarea.fecha_limite)}
                          </span>
                          <span className="block text-sm text-stone-500">{encargada ?? 'Sin responsable'}</span>
                        </>
                      ) : (
                        <span className="block text-sm text-stone-500">Sin cuidados apuntados</span>
                      )}
                    </span>
                  </button>
                  {proximo && !abierto && (
                    <button
                      type="button"
                      onClick={() => setMarcando(proximo.tarea.id)}
                      className="shrink-0 rounded-full bg-marca px-4 py-2 text-sm font-semibold text-white"
                    >
                      Hecho
                    </button>
                  )}
                </div>
                {abierto && proximo && (
                  <ConfirmarHecho
                    enviando={enviando}
                    onConfirmar={(fecha) => confirmarHecho(proximo.tarea, fecha)}
                    onCancelar={() => setMarcando(null)}
                  />
                )}
              </li>
            )
          })}
        </ul>
      )}

      <button type="button" onClick={() => ir('/casa/plantas/nueva')} className={`mt-4 ${botonSecundario}`}>
        + Añadir planta
      </button>
    </section>
  )
}
