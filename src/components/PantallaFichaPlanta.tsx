import { useEffect, useState } from 'react'
import { mensajeDeError } from '../lib/errores'
import { cuandoToca, diasHasta, fechaCorta, textoFrecuencia } from '../lib/fechas'
import { ir, volver } from '../lib/ruta'
import { supabase } from '../lib/supabase'
import { infoCuidado, nombreDeCuidado, type Cuidado, type Planta, type Tarea } from '../lib/tipos'
import { useNombres } from '../lib/useNombres'
import { ConfirmarHecho } from './ConfirmarHecho'
import { avisoError, botonSecundario } from './estilos'
import { TituloSeccion } from './Piezas'

type Props = {
  id: string
  miUserId: string
}

type Datos = {
  planta: Planta | null
  cuidados: { cuidado: Cuidado; pendiente?: Tarea }[]
}

function colorDeFecha(fecha: string): string {
  const dias = diasHasta(fecha)
  if (dias < 0) return 'text-red-700'
  if (dias <= 1) return 'text-amber-700'
  return 'text-stone-600'
}

// #/casa/plantas/<id>: la ficha de una planta y sus cuidados.
export function PantallaFichaPlanta({ id, miUserId }: Props) {
  const nombres = useNombres(miUserId)
  const [datos, setDatos] = useState<Datos | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [recarga, setRecarga] = useState(0)
  const [marcando, setMarcando] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)

  useEffect(() => {
    if (!supabase) return
    let vigente = true
    Promise.all([
      supabase.from('plantas').select('*').eq('id', id).maybeSingle(),
      supabase.from('cuidados').select('*').eq('planta_id', id).order('creado_en'),
      supabase.from('tareas').select('*').eq('planta_id', id).eq('completada', false),
    ]).then(([planta, cuidados, tareas]) => {
      if (!vigente) return
      const fallo = planta.error ?? cuidados.error ?? tareas.error
      if (fallo) return setError(mensajeDeError(fallo))
      const pendientes = tareas.data as Tarea[]
      const lista = (cuidados.data as Cuidado[]).map((cuidado) => ({
        cuidado,
        pendiente: pendientes.find((t) => t.cuidado_id === cuidado.id),
      }))
      lista.sort((a, b) =>
        (a.pendiente?.fecha_limite ?? '9999').localeCompare(b.pendiente?.fecha_limite ?? '9999'),
      )
      setDatos({ planta: planta.data as Planta | null, cuidados: lista })
    })
    return () => {
      vigente = false
    }
  }, [id, recarga])

  async function confirmarHecho(cuidado: Cuidado, tarea: Tarea, fecha: string) {
    if (!supabase) return
    setEnviando(true)
    setError(null)
    const { error } = await supabase.rpc('completar_tarea', { tarea_id: tarea.id, hecha_el: fecha })
    setEnviando(false)
    if (error) return setError(mensajeDeError(error))
    setMarcando(null)
    setMensaje(`¡Apuntado! ${nombreDeCuidado(cuidado)} ya tiene su próxima fecha.`)
    setRecarga((n) => n + 1)
  }

  const planta = datos?.planta

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col gap-6 px-5 py-8 lg:max-w-6xl lg:px-10 lg:py-10">
      <button type="button" onClick={() => volver('/casa')} className="self-start text-sm font-medium text-marca">
        ← Casa
      </button>

      {datos === null && !error && <p className="text-center text-stone-400">Cargando…</p>}
      {error && <p role="alert" className={avisoError}>{error}</p>}
      {datos && !planta && <p className="text-center text-stone-500">No encontramos esta planta en tu hogar.</p>}

      {planta && datos && (
        // En el ordenador: la ficha a la izquierda; los cuidados a la derecha.
        <div className="contents lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] lg:items-start lg:gap-6">
          <div className="contents lg:sticky lg:top-6 lg:flex lg:flex-col lg:gap-6">
            <header className="flex flex-col items-center gap-2 text-center lg:rounded-3xl lg:bg-white lg:p-6 lg:shadow-[0_1px_2px_rgb(60_40_20/0.04),0_10px_24px_-14px_rgb(60_40_20/0.22)] lg:ring-1 lg:ring-stone-900/5">
              <span aria-hidden="true" className="flex h-24 w-24 items-center justify-center rounded-full bg-marca-suave text-5xl">
                🪴
              </span>
              <div>
                <h1 className="text-3xl font-extrabold text-marca">{planta.nombre}</h1>
                <p className="text-stone-600">{[planta.tipo, planta.ubicacion].filter(Boolean).join(' · ')}</p>
              </div>
            </header>

            {planta.notas && (
              <section className="tarjeta">
                <h2 className="text-sm text-stone-500">Notas</h2>
                <p className="whitespace-pre-line">{planta.notas}</p>
              </section>
            )}

            <button
              type="button"
              onClick={() => ir(`/casa/plantas/${planta.id}/editar`)}
              // En el móvil va al final de todo; en el ordenador, debajo de la ficha.
              className={`order-last lg:order-none ${botonSecundario}`}
            >
              Editar planta
            </button>
          </div>

          <section className="tarjeta">
            <TituloSeccion dibujo="💧" titulo="Cuidados" subtitulo="Cada uno os avisa cuando toca" color="plantas" />

            {mensaje && (
              <p role="status" className="mt-3 rounded-xl bg-marca-suave p-3 text-sm text-marca">
                {mensaje}
              </p>
            )}

            {datos.cuidados.length === 0 && (
              <p className="mt-3 text-stone-500">
                Añade el riego (y, si quieres, el abono o el trasplante). La app calculará cuándo toca cada uno.
              </p>
            )}

            {datos.cuidados.length > 0 && (
              <ul className="mt-2 divide-y divide-stone-100">
                {datos.cuidados.map(({ cuidado, pendiente }) => {
                  const info = infoCuidado(cuidado.tipo)
                  const abierto = pendiente && marcando === pendiente.id
                  const encargada = nombres.responsable(cuidado.responsable_id)
                  const notaViaje = pendiente ? nombres.notaViaje(pendiente.responsable_id, pendiente.fecha_limite) : null
                  return (
                    <li key={cuidado.id} className="py-3">
                      <div className="flex items-start gap-3">
                        <button
                          type="button"
                          onClick={() => ir(`/cuidados/${cuidado.id}/editar`)}
                          className="flex flex-1 items-start gap-3 text-left"
                          aria-label={`Editar ${nombreDeCuidado(cuidado)}`}
                        >
                          <span aria-hidden="true" className="text-2xl leading-none">{info.dibujo}</span>
                          <span className="flex-1">
                            <span className="block font-medium">{nombreDeCuidado(cuidado)}</span>
                            <span className="block text-sm text-stone-500">
                              {textoFrecuencia(cuidado.frecuencia_dias).replace('cada', 'Cada')}
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
                            {cuidado.notas && <span className="block text-sm text-stone-600">{cuidado.notas}</span>}
                          </span>
                        </button>
                        {pendiente && !abierto && (
                          <button
                            type="button"
                            onClick={() => {
                              setMarcando(pendiente.id)
                              setMensaje(null)
                            }}
                            className="shrink-0 rounded-full bg-linear-to-b from-marca to-[#0b5f58] shadow-[0_6px_14px_-6px_rgb(15_118_110/0.6)] px-4 py-2 text-sm font-semibold text-white"
                          >
                            Hecho
                          </button>
                        )}
                      </div>
                      {abierto && pendiente && (
                        <ConfirmarHecho
                          enviando={enviando}
                          onConfirmar={(fecha) => confirmarHecho(cuidado, pendiente, fecha)}
                          onCancelar={() => setMarcando(null)}
                        />
                      )}
                    </li>
                  )
                })}
              </ul>
            )}

            <button
              type="button"
              onClick={() => ir(`/casa/plantas/${planta.id}/cuidados/nuevo`)}
              className={`mt-4 ${botonSecundario}`}
            >
              + Añadir cuidado
            </button>
          </section>
        </div>
      )}
    </main>
  )
}
