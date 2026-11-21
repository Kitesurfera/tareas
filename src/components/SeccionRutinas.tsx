import { useEffect, useState } from 'react'
import { mensajeDeError } from '../lib/errores'
import { cuandoToca, diasHasta, textoFrecuencia } from '../lib/fechas'
import { ir } from '../lib/ruta'
import { supabase } from '../lib/supabase'
import type { Rutina, Tarea } from '../lib/tipos'
import type { Nombres } from '../lib/useNombres'
import { ConfirmarHecho } from './ConfirmarHecho'
import { avisoError, botonSecundario } from './estilos'

type Fila = {
  rutina: Rutina
  pendiente?: Tarea
}

function colorDeFecha(fecha: string): string {
  const dias = diasHasta(fecha)
  if (dias < 0) return 'text-red-700'
  if (dias <= 1) return 'text-amber-700'
  return 'text-stone-600'
}

// Rutinas de casa: cuándo toca cada una, quién se encarga y «Hecho».
export function SeccionRutinas({ nombres }: { nombres: Nombres }) {
  const [filas, setFilas] = useState<Fila[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [recarga, setRecarga] = useState(0)
  const [marcando, setMarcando] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    if (!supabase) return
    let vigente = true
    Promise.all([
      supabase.from('rutinas').select('*'),
      supabase.from('tareas').select('*').not('rutina_id', 'is', null).eq('completada', false),
    ]).then(([rutinas, tareas]) => {
      if (!vigente) return
      const fallo = rutinas.error ?? tareas.error
      if (fallo) {
        setError(mensajeDeError(fallo))
        return
      }
      const pendientes = tareas.data as Tarea[]
      const lista = (rutinas.data as Rutina[]).map((rutina) => ({
        rutina,
        pendiente: pendientes.find((t) => t.rutina_id === rutina.id),
      }))
      // Primero lo que toca antes.
      lista.sort((a, b) =>
        (a.pendiente?.fecha_limite ?? '9999').localeCompare(b.pendiente?.fecha_limite ?? '9999'),
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
    if (error) {
      setError(mensajeDeError(error))
      return
    }
    setMarcando(null)
    setRecarga((n) => n + 1)
  }

  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold">Rutinas</h2>
      <p className="text-sm text-stone-500">Lo que hay que hacer cada cierto tiempo</p>

      {filas === null && !error && <p className="mt-3 text-sm text-stone-400">Cargando…</p>}
      {filas?.length === 0 && (
        <p className="mt-3 text-stone-500">
          Limpiar el baño, sacar la basura, cambiar las sábanas… Añádelas y la
          app os recordará cuándo toca cada una y a quién.
        </p>
      )}

      {filas && filas.length > 0 && (
        <ul className="mt-2 divide-y divide-stone-100">
          {filas.map(({ rutina, pendiente }) => {
            const abierto = pendiente && marcando === pendiente.id
            const encargada = nombres.responsable(rutina.responsable_id)
            return (
              <li key={rutina.id} className="py-3">
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    onClick={() => ir(`/casa/rutinas/${rutina.id}/editar`)}
                    className="flex-1 text-left"
                    aria-label={`Editar ${rutina.nombre}`}
                  >
                    <span className="block font-medium">{rutina.nombre}</span>
                    <span className="block text-sm text-stone-500">
                      {textoFrecuencia(rutina.frecuencia_dias).replace('cada', 'Cada')} ·{' '}
                      {encargada ?? 'Sin responsable'}
                    </span>
                    {pendiente?.fecha_limite && (
                      <span className={`block text-sm font-medium ${colorDeFecha(pendiente.fecha_limite)}`}>
                        Toca: {cuandoToca(pendiente.fecha_limite)}
                      </span>
                    )}
                  </button>
                  {pendiente && !abierto && (
                    <button
                      type="button"
                      onClick={() => setMarcando(pendiente.id)}
                      className="shrink-0 rounded-full bg-marca px-4 py-2 text-sm font-semibold text-white"
                    >
                      Hecho
                    </button>
                  )}
                </div>
                {abierto && pendiente && (
                  <ConfirmarHecho
                    enviando={enviando}
                    onConfirmar={(fecha) => confirmarHecho(pendiente, fecha)}
                    onCancelar={() => setMarcando(null)}
                  />
                )}
              </li>
            )
          })}
        </ul>
      )}

      {error && <p role="alert" className={`mt-3 ${avisoError}`}>{error}</p>}

      <button type="button" onClick={() => ir('/casa/rutinas/nueva')} className={`mt-4 ${botonSecundario}`}>
        + Añadir rutina
      </button>
    </section>
  )
}
