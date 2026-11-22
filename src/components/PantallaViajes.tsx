import { useEffect, useState, type FormEvent } from 'react'
import { mensajeDeError } from '../lib/errores'
import { cuandoToca, diasHasta, hoyComoTexto } from '../lib/fechas'
import { ir, reemplazar, volver } from '../lib/ruta'
import { supabase } from '../lib/supabase'
import { useMiembros } from '../lib/useMiembros'
import {
  agrupar,
  diaMes,
  estaEnCurso,
  periodosSinNadie,
  textoPeriodo,
  textoPersonas,
  useViajes,
  type GrupoViaje,
  type Viaje,
} from '../lib/viajes'
import { avisoError, botonPrincipal, campo, estiloChip } from './estilos'

type Props = {
  miUserId: string
}

// «1 dic – 5 dic» o «1 dic» si es un solo día.
function rango(grupo: { desde: string; hasta: string }): string {
  return grupo.desde === grupo.hasta ? diaMes(grupo.desde) : `${diaMes(grupo.desde)} – ${diaMes(grupo.hasta)}`
}

function estado(grupo: GrupoViaje): string {
  if (estaEnCurso(grupo)) return grupo.hasta === hoyComoTexto() ? 'De viaje · vuelve hoy' : 'De viaje ahora'
  return `Empieza ${cuandoToca(grupo.desde).toLowerCase()}`
}

// #/viajes: los viajes apuntados (en curso y próximos).
export function PantallaViajes({ miUserId }: Props) {
  const { miembros } = useMiembros()
  const { viajes, error } = useViajes()
  const miMiembroId = miembros?.find((m) => m.user_id === miUserId)?.id
  const grupos = viajes ? agrupar(viajes) : null
  const sinNadie = miembros && viajes ? periodosSinNadie(miembros, viajes) : []

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col gap-5 px-5 py-8 md:max-w-2xl md:px-6 lg:max-w-3xl lg:px-10 lg:py-10">
      <button type="button" onClick={() => volver('/ajustes')} className="self-start text-sm font-medium text-marca">
        ← Ajustes
      </button>
      <h1 className="text-2xl font-extrabold text-marca">✈️ Modo viaje</h1>

      <section className="rounded-2xl bg-marca-suave p-5 text-sm text-stone-800">
        <p>
          Cuando alguien se va de viaje, <strong>sus tareas, turnos y avisos pasan a quien se queda en
          casa</strong>. Al volver, todo vuelve a ser suyo sin tocar nada.
        </p>
        <p className="mt-2">
          Si os vais todas, la app avisa de que no hay nadie en casa y los avisos siguen llegando como
          siempre, para que nada se olvide.
        </p>
      </section>

      {sinNadie.length > 0 && (
        <section className="rounded-2xl bg-amber-50 p-5 text-sm text-amber-900">
          <p className="font-semibold">🏠 Días sin nadie en casa</p>
          <ul className="mt-1 list-disc pl-5">
            {sinNadie.map((p) => (
              <li key={p.desde}>{textoPeriodo(p).replace(/^./, (l) => l.toUpperCase())}</li>
            ))}
          </ul>
          <p className="mt-2">Pedid a alguien que se ocupe de lo que no puede esperar, como la mascota.</p>
        </section>
      )}

      <button type="button" onClick={() => ir('/viajes/nuevo')} className={botonPrincipal}>
        + Añadir viaje
      </button>

      {error && <p role="alert" className={avisoError}>No se han podido cargar los viajes.</p>}
      {grupos === null && !error && <p className="text-center text-stone-400">Cargando…</p>}
      {grupos?.length === 0 && (
        <p className="tarjeta text-center text-stone-500">
          No hay ningún viaje apuntado.
        </p>
      )}

      {grupos && grupos.length > 0 && miembros && (
        <ul className="flex flex-col gap-3">
          {grupos.map((grupo) => (
            <li key={grupo.grupo}>
              <button
                type="button"
                onClick={() => ir(`/viajes/${grupo.grupo}/editar`)}
                className="tarjeta flex w-full items-start gap-3 p-4 text-left"
              >
                <span aria-hidden="true" className="text-2xl leading-none">✈️</span>
                <span className="flex-1">
                  <span className="block font-medium">
                    {textoPersonas(grupo.personas, miembros, miMiembroId)}
                    {grupo.destino && <span className="font-normal text-stone-500"> · {grupo.destino}</span>}
                  </span>
                  <span className="block text-sm text-stone-600">{rango(grupo)}</span>
                  <span className={`block text-sm font-medium ${estaEnCurso(grupo) ? 'text-marca' : 'text-stone-500'}`}>
                    {estado(grupo)}
                  </span>
                </span>
                <span aria-hidden="true" className="text-stone-400">›</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}

type PropsFormulario = {
  miUserId: string
  // Vacío = viaje nuevo.
  grupo?: string
}

// #/viajes/nuevo y #/viajes/<grupo>/editar
export function FormularioViaje({ miUserId, grupo }: PropsFormulario) {
  const { miembros } = useMiembros()
  const { viajes: otrosViajes } = useViajes()
  const miMiembroId = miembros?.find((m) => m.user_id === miUserId)?.id
  const [cargado, setCargado] = useState(!grupo)
  // null = sin tocar (en un viaje nuevo, se va quien lo apunta).
  const [personas, setPersonas] = useState<string[] | null>(null)
  const [ida, setIda] = useState(hoyComoTexto)
  const [vuelta, setVuelta] = useState('')
  const [destino, setDestino] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Al editar, cargamos el viaje.
  useEffect(() => {
    if (!supabase || !grupo) return
    let vigente = true
    supabase
      .from('viajes')
      .select('id, grupo, miembro_id, desde, hasta, destino')
      .eq('grupo', grupo)
      .then(({ data, error }) => {
        if (!vigente) return
        const filas = (data ?? []) as Viaje[]
        if (error || filas.length === 0) {
          setError(error ? mensajeDeError(error) : 'No encontramos este viaje. Puede que ya se haya borrado.')
        } else {
          setPersonas(filas.map((f) => f.miembro_id))
          setIda(filas[0].desde)
          setVuelta(filas[0].hasta)
          setDestino(filas[0].destino ?? '')
        }
        setCargado(true)
      })
    return () => {
      vigente = false
    }
  }, [grupo])

  const elegidas = personas ?? (!grupo && miMiembroId ? [miMiembroId] : [])
  const todas = Boolean(miembros && miembros.length > 1 && miembros.every((m) => elegidas.includes(m.id)))

  // ¿Quedará alguien en casa? Mira este viaje junto con los demás que ya
  // hay apuntados (aunque sean viajes distintos de otras personas).
  const sinNadie =
    miembros && otrosViajes && ida && vuelta && vuelta >= ida
      ? periodosSinNadie(
          miembros,
          [
            ...otrosViajes.filter((v) => v.grupo !== grupo),
            ...elegidas.map((id) => ({ id, grupo: 'este', miembro_id: id, desde: ida, hasta: vuelta, destino: null })),
          ],
          ida > hoyComoTexto() ? ida : hoyComoTexto(),
        ).filter((p) => p.desde <= vuelta)
      : []

  function alternar(id: string) {
    setPersonas(elegidas.includes(id) ? elegidas.filter((p) => p !== id) : [...elegidas, id])
  }

  async function guardar(evento: FormEvent) {
    evento.preventDefault()
    if (!supabase) return
    if (elegidas.length === 0) return setError('Elige quién se va de viaje.')
    if (!ida || !vuelta) return setError('Elige el día de ida y el de vuelta.')
    if (vuelta < ida) return setError('El día de vuelta no puede ser antes que el de ida.')
    if (diasHasta(vuelta) < 0) return setError('Ese viaje ya habría terminado: elige una vuelta de hoy en adelante.')
    setGuardando(true)
    setError(null)
    const { error } = await supabase.rpc('guardar_viaje', {
      viaje_grupo: grupo ?? null,
      personas: elegidas,
      ida,
      vuelta,
      lugar: destino.trim() || null,
    })
    setGuardando(false)
    if (error) return setError(mensajeDeError(error))
    reemplazar('/viajes')
  }

  async function borrar() {
    if (!supabase || !grupo) return
    if (!window.confirm('¿Borrar este viaje? Las tareas vuelven a ser de quien eran.')) return
    const { error } = await supabase.from('viajes').delete().eq('grupo', grupo)
    if (error) return setError(mensajeDeError(error))
    reemplazar('/viajes')
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col gap-5 px-5 py-8 md:max-w-2xl md:px-6 lg:max-w-xl lg:px-10 lg:py-10">
      <button type="button" onClick={() => volver('/viajes')} className="self-start text-sm font-medium text-marca">
        ← Viajes
      </button>
      <h1 className="text-2xl font-extrabold text-marca">{grupo ? 'Cambiar viaje' : 'Nuevo viaje'}</h1>

      {(!cargado || !miembros) && <p className="text-center text-stone-400">Cargando…</p>}

      {cargado && miembros && (
        <form onSubmit={guardar} className="tarjeta flex flex-col gap-5">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium text-stone-700">¿Quién se va?</legend>
            <div className="flex flex-wrap gap-2">
              {miembros.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={elegidas.includes(m.id)}
                  onClick={() => alternar(m.id)}
                  className={estiloChip(elegidas.includes(m.id))}
                >
                  {m.id === miMiembroId ? 'Tú' : m.nombre_visible}
                </button>
              ))}
              {miembros.length > 1 && (
                <button
                  type="button"
                  aria-pressed={todas}
                  onClick={() => setPersonas(todas ? [] : miembros.map((m) => m.id))}
                  className={estiloChip(todas)}
                >
                  Todas
                </button>
              )}
            </div>
          </fieldset>

          <div className="flex gap-3">
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm font-medium text-stone-700">
              Ida
              <input type="date" value={ida} onChange={(e) => setIda(e.target.value)} className={campo} required />
            </label>
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm font-medium text-stone-700">
              Vuelta
              <input
                type="date"
                value={vuelta}
                min={ida || undefined}
                onChange={(e) => setVuelta(e.target.value)}
                className={campo}
                required
              />
            </label>
          </div>

          <label className="flex flex-col gap-1 text-sm font-medium text-stone-700">
            Destino (si quieres)
            <input
              value={destino}
              onChange={(e) => setDestino(e.target.value)}
              maxLength={60}
              placeholder="Lisboa"
              className={campo}
            />
          </label>

          {sinNadie.length > 0 && (
            <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
              🏠 <strong>No quedará nadie en casa {sinNadie.map(textoPeriodo).join(' ni ')}.</strong> Los avisos
              seguirán llegando como siempre. Pedid a alguien que se ocupe de lo que no puede esperar, como la
              mascota.
            </p>
          )}

          {error && <p role="alert" className={avisoError}>{error}</p>}

          <button type="submit" disabled={guardando} className={botonPrincipal}>
            {guardando ? 'Guardando…' : 'Guardar viaje'}
          </button>
          {grupo && (
            <button type="button" onClick={borrar} className="py-1 text-sm font-medium text-red-700">
              Borrar viaje
            </button>
          )}
        </form>
      )}
    </main>
  )
}
