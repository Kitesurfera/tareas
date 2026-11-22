import { useEffect, useState } from 'react'
import { mensajeDeError } from '../lib/errores'
import { cuandoToca, diasHasta, fechaCorta, textoFrecuencia } from '../lib/fechas'
import { ir } from '../lib/ruta'
import { supabase } from '../lib/supabase'
import { infoTipo, type Tarea, type Tratamiento } from '../lib/tipos'
import { useNombres } from '../lib/useNombres'
import { ConfirmarHecho } from './ConfirmarHecho'
import { avisoError, botonSecundario } from './estilos'

type Props = {
  mascotaId: string
  miUserId: string
  nombreMascota: string
}

type Fila = {
  tratamiento: Tratamiento
  pendiente?: Tarea
}

// Color del aviso según lo cerca que esté la fecha.
function colorDeFecha(fecha: string): string {
  const dias = diasHasta(fecha)
  if (dias < 0) return 'text-red-700'
  if (dias <= 7) return 'text-amber-700'
  return 'text-stone-600'
}

// Sección «Salud» de la ficha: tratamientos, cuándo toca cada uno y
// botón para marcarlo como hecho.
export function SeccionSalud({ mascotaId, miUserId, nombreMascota }: Props) {
  const nombres = useNombres(miUserId)
  const [filas, setFilas] = useState<Fila[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [recarga, setRecarga] = useState(0)
  const [marcando, setMarcando] = useState<string | null>(null) // id de la tarea
  const [enviando, setEnviando] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)

  useEffect(() => {
    if (!supabase) return
    let vigente = true
    Promise.all([
      supabase.from('tratamientos').select('*').eq('mascota_id', mascotaId),
      supabase
        .from('tareas')
        .select('*')
        .eq('mascota_id', mascotaId)
        .eq('completada', false),
    ]).then(([tratamientos, tareas]) => {
      if (!vigente) return
      const fallo = tratamientos.error ?? tareas.error
      if (fallo) {
        setError(mensajeDeError(fallo))
        return
      }
      const pendientes = tareas.data as Tarea[]
      const lista = (tratamientos.data as Tratamiento[]).map((tratamiento) => ({
        tratamiento,
        pendiente: pendientes.find((t) => t.tratamiento_id === tratamiento.id),
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
  }, [mascotaId, recarga])

  async function confirmarHecho(fila: Fila, fechaHecho: string) {
    if (!supabase || !fila.pendiente) return
    setEnviando(true)
    setError(null)
    const { error } = await supabase.rpc('completar_tarea', {
      tarea_id: fila.pendiente.id,
      hecha_el: fechaHecho,
    })
    setEnviando(false)
    if (error) {
      setError(mensajeDeError(error))
      return
    }
    setMarcando(null)
    setMensaje(`¡Apuntado! ${fila.tratamiento.nombre} ya tiene su próxima fecha.`)
    setRecarga((n) => n + 1)
  }

  return (
    <section className="tarjeta">
      <h2 className="text-lg font-semibold">🩺 Salud</h2>
      <p className="text-sm text-stone-500">Vacunas, desparasitaciones y medicación</p>

      {mensaje && (
        <p role="status" className="mt-3 rounded-xl bg-marca-suave p-3 text-sm text-marca">
          {mensaje}
        </p>
      )}

      {filas === null && !error && <p className="mt-3 text-sm text-stone-400">Cargando…</p>}

      {filas?.length === 0 && (
        <p className="mt-3 text-stone-500">
          Añade la primera vacuna o desparasitación de {nombreMascota}. La app
          calculará cuándo toca la siguiente y os lo recordará.
        </p>
      )}

      {filas && filas.length > 0 && (
        <ul className="mt-3 flex flex-col divide-y divide-stone-100">
          {filas.map((fila) => {
            const { tratamiento, pendiente } = fila
            const tipo = infoTipo(tratamiento.tipo)
            const encargada = nombres.responsable(tratamiento.responsable_id)
            const notaViaje = pendiente ? nombres.notaViaje(pendiente.responsable_id, pendiente.fecha_limite) : null
            const abierto = pendiente && marcando === pendiente.id
            return (
              <li key={tratamiento.id} className="py-3">
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    onClick={() => ir(`/tratamientos/${tratamiento.id}/editar`)}
                    className="flex flex-1 items-start gap-3 text-left"
                    aria-label={`Editar ${tratamiento.nombre}`}
                  >
                    <span aria-hidden="true" className="text-2xl leading-none">
                      {tipo.dibujo}
                    </span>
                    <span className="flex-1">
                      <span className="block font-medium">{tratamiento.nombre}</span>
                      <span className="block text-sm text-stone-500">
                        {tipo.texto} · {textoFrecuencia(tratamiento.frecuencia_dias)}
                      </span>
                      {pendiente?.fecha_limite && (
                        <span className={`block text-sm font-medium ${colorDeFecha(pendiente.fecha_limite)}`}>
                          Próxima: {fechaCorta(pendiente.fecha_limite)} · {cuandoToca(pendiente.fecha_limite)}
                        </span>
                      )}
                      <span className="block text-sm text-stone-500">
                        {encargada === 'Tú' ? 'Te encargas tú' : encargada ? `Se encarga ${encargada}` : 'Sin responsable'}
                      </span>
                      {notaViaje && <span className="block text-sm text-stone-600">{notaViaje}</span>}
                    </span>
                  </button>
                  {pendiente && !abierto && (
                    <button
                      type="button"
                      onClick={() => {
                        setMarcando(pendiente.id)
                        setMensaje(null)
                        setError(null)
                      }}
                      className="shrink-0 rounded-full bg-marca px-4 py-2 text-sm font-semibold text-white"
                    >
                      Hecho
                    </button>
                  )}
                </div>

                {abierto && (
                  <ConfirmarHecho
                    enviando={enviando}
                    onConfirmar={(fecha) => confirmarHecho(fila, fecha)}
                    onCancelar={() => setMarcando(null)}
                  />
                )}
              </li>
            )
          })}
        </ul>
      )}

      {error && <p role="alert" className={`mt-3 ${avisoError}`}>{error}</p>}

      <button
        type="button"
        onClick={() => ir(`/mascotas/${mascotaId}/tratamientos/nuevo`)}
        className={`mt-4 ${botonSecundario}`}
      >
        + Añadir tratamiento
      </button>
    </section>
  )
}
