import { useEffect, useState, type FormEvent } from 'react'
import { mensajeDeError } from '../lib/errores'
import { cuandoToca, diasHasta, fechaCorta, hoyComoTexto } from '../lib/fechas'
import { diferenciaKg, formatoKg, leerKg, type Peso } from '../lib/peso'
import { supabase } from '../lib/supabase'
import { avisoError, botonPrincipal, botonSecundario, campoBase, estiloChip } from './estilos'
import { GraficaPeso } from './GraficaPeso'
import { TituloSeccion } from './Piezas'

type Props = {
  mascotaId: string
  hogarId: string
  nombreMascota: string
  fechaNacimiento: string | null
}

const EN_LA_LISTA = 5

// Sección «Peso» de la ficha: último peso, gráfica e historial.
export function SeccionPeso({ mascotaId, hogarId, nombreMascota, fechaNacimiento }: Props) {
  const [pesos, setPesos] = useState<Peso[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [recarga, setRecarga] = useState(0)
  const [abierto, setAbierto] = useState(false)
  const [kgTexto, setKgTexto] = useState('')
  const [fecha, setFecha] = useState(hoyComoTexto)
  const [guardando, setGuardando] = useState(false)
  const [errorForm, setErrorForm] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [verTodos, setVerTodos] = useState(false)
  const [soloUltimoAnio, setSoloUltimoAnio] = useState(true)

  useEffect(() => {
    if (!supabase) return
    let vigente = true
    supabase
      .from('pesos')
      .select('id, fecha, kg')
      .eq('mascota_id', mascotaId)
      .order('fecha')
      .then(({ data, error }) => {
        if (!vigente) return
        if (error) {
          setError(mensajeDeError(error))
          return
        }
        setError(null)
        // Postgres manda los kilos como número o como texto: los pasamos a número.
        setPesos((data as Peso[]).map((p) => ({ ...p, kg: Number(p.kg) })))
      })
    return () => {
      vigente = false
    }
  }, [mascotaId, recarga])

  async function guardar(evento: FormEvent) {
    evento.preventDefault()
    if (!supabase || !pesos) return
    const kg = leerKg(kgTexto)
    if (kg === null) {
      setErrorForm('Escribe el peso en kilos, por ejemplo 4,5.')
      return
    }
    if (!fecha || fecha > hoyComoTexto()) {
      setErrorForm('Elige una fecha de hoy o de antes.')
      return
    }
    if (fechaNacimiento && fecha < fechaNacimiento) {
      setErrorForm(`Esa fecha es de antes de que naciera ${nombreMascota}.`)
      return
    }
    setGuardando(true)
    setErrorForm(null)
    // Como mucho un peso al día: si ya había uno, lo cambiamos.
    const yaHabia = pesos.find((p) => p.fecha === fecha)
    const { error } = yaHabia
      ? await supabase.from('pesos').update({ kg }).eq('id', yaHabia.id)
      : await supabase.from('pesos').insert({ hogar_id: hogarId, mascota_id: mascotaId, fecha, kg })
    setGuardando(false)
    if (error) {
      setErrorForm(mensajeDeError(error))
      return
    }
    setMensaje(
      yaHabia
        ? `Cambiado el peso del ${fechaCorta(fecha)}: ahora ${formatoKg(kg)}.`
        : `Apuntado: ${formatoKg(kg)}.`,
    )
    setKgTexto('')
    setFecha(hoyComoTexto())
    setAbierto(false)
    setRecarga((n) => n + 1)
  }

  async function borrar(peso: Peso) {
    if (!supabase) return
    const seguro = window.confirm(
      `¿Borrar el peso del ${fechaCorta(peso.fecha)} (${formatoKg(peso.kg)})?`,
    )
    if (!seguro) return
    setMensaje(null)
    const { error } = await supabase.from('pesos').delete().eq('id', peso.id)
    if (error) {
      setError(mensajeDeError(error))
      return
    }
    setRecarga((n) => n + 1)
  }

  const ultimo = pesos?.[pesos.length - 1]
  const anterior = pesos && pesos.length > 1 ? pesos[pesos.length - 2] : undefined
  // Si hay pesos de hace más de un año, se puede elegir qué se ve en la gráfica.
  const hayAntiguos = Boolean(pesos?.length && diasHasta(pesos[0].fecha) < -365)
  const enGrafica =
    pesos && hayAntiguos && soloUltimoAnio ? pesos.filter((p) => diasHasta(p.fecha) >= -365) : pesos
  const historial = pesos ? [...pesos].reverse() : []

  return (
    <section className="tarjeta">
      <TituloSeccion dibujo="⚖️" titulo="Peso" color="tareas" />

      {error && <p role="alert" className={`mt-3 ${avisoError}`}>{error}</p>}
      {pesos === null && !error && <p className="mt-3 text-sm text-stone-400">Cargando…</p>}

      {pesos && pesos.length === 0 && (
        <p className="mt-2 text-sm text-stone-500">
          Aún no hay pesos apuntados. Apunta el de hoy y, con el tiempo, verás cómo cambia.
        </p>
      )}

      {ultimo && (
        <div className="mt-3">
          <p className="text-3xl font-semibold text-stone-900">{formatoKg(ultimo.kg)}</p>
          <p className="text-sm text-stone-500">
            Último peso · {cuandoToca(ultimo.fecha).toLowerCase()} ({fechaCorta(ultimo.fecha)})
          </p>
          {anterior && (
            <p className="mt-1 text-sm text-stone-600">
              {diferenciaKg(anterior.kg, ultimo.kg) === 'igual'
                ? `Igual que el ${fechaCorta(anterior.fecha)}`
                : `${diferenciaKg(anterior.kg, ultimo.kg)} desde el ${fechaCorta(anterior.fecha)}`}
            </p>
          )}
        </div>
      )}

      {hayAntiguos && (
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={() => setSoloUltimoAnio(true)} className={estiloChip(soloUltimoAnio)}>
            Último año
          </button>
          <button type="button" onClick={() => setSoloUltimoAnio(false)} className={estiloChip(!soloUltimoAnio)}>
            Todo
          </button>
        </div>
      )}

      {enGrafica && enGrafica.length >= 2 && (
        <div className="mt-4">
          <GraficaPeso key={enGrafica.length} pesos={enGrafica} nombreMascota={nombreMascota} />
          <p className="mt-1 text-xs text-stone-400">Toca la gráfica para ver cada peso.</p>
        </div>
      )}
      {pesos && pesos.length === 1 && (
        <p className="mt-3 text-sm text-stone-500">
          Cuando apuntes otro peso otro día, aquí saldrá una gráfica.
        </p>
      )}

      {mensaje && (
        <p role="status" className="mt-4 rounded-xl bg-marca-suave p-3 text-sm text-stone-800">
          {mensaje}
        </p>
      )}

      {pesos && !abierto && (
        <button
          type="button"
          onClick={() => {
            setAbierto(true)
            setMensaje(null)
          }}
          className={`mt-4 ${botonSecundario}`}
        >
          + Apuntar peso
        </button>
      )}

      {abierto && (
        <form onSubmit={guardar} className="mt-4 flex flex-col gap-3 rounded-xl bg-stone-50 p-4">
          <div className="flex gap-3">
            <label className="flex w-28 flex-col gap-1 text-sm font-medium text-stone-700">
              Kilos
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="4,5"
                value={kgTexto}
                onChange={(e) => setKgTexto(e.target.value)}
                className={`w-full ${campoBase}`}
                autoFocus
              />
            </label>
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm font-medium text-stone-700">
              Día
              <input
                type="date"
                value={fecha}
                max={hoyComoTexto()}
                min={fechaNacimiento ?? undefined}
                onChange={(e) => setFecha(e.target.value)}
                className={`w-full ${campoBase}`}
              />
            </label>
          </div>
          {errorForm && <p role="alert" className={avisoError}>{errorForm}</p>}
          <button type="submit" disabled={guardando} className={botonPrincipal}>
            {guardando ? 'Guardando…' : 'Guardar peso'}
          </button>
          <button
            type="button"
            onClick={() => {
              setAbierto(false)
              setErrorForm(null)
            }}
            className="text-sm text-stone-600"
          >
            Cancelar
          </button>
        </form>
      )}

      {historial.length > 0 && (
        <div className="mt-5">
          <h3 className="text-sm font-medium text-stone-500">Historial</h3>
          <ul className="mt-2 divide-y divide-stone-100">
            {(verTodos ? historial : historial.slice(0, EN_LA_LISTA)).map((peso) => (
              <li key={peso.id} className="flex items-center gap-3 py-2">
                <span className="flex-1 text-stone-600">{fechaCorta(peso.fecha)}</span>
                <span className="font-medium tabular-nums">{formatoKg(peso.kg)}</span>
                <button
                  type="button"
                  onClick={() => borrar(peso)}
                  aria-label={`Borrar el peso del ${fechaCorta(peso.fecha)}`}
                  className="rounded-full px-2 py-1 text-sm text-stone-400"
                >
                  Borrar
                </button>
              </li>
            ))}
          </ul>
          {historial.length > EN_LA_LISTA && (
            <button
              type="button"
              onClick={() => setVerTodos((v) => !v)}
              className="mt-1 text-sm font-medium text-marca"
            >
              {verTodos ? 'Ver menos' : `Ver los ${historial.length} pesos`}
            </button>
          )}
        </div>
      )}
    </section>
  )
}
