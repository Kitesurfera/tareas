import { useEffect, useState, type FormEvent } from 'react'
import { mensajeDeError } from '../lib/errores'
import { cuandoToca, fechaLarga, hoyComoTexto, sumarDias, textoFrecuencia } from '../lib/fechas'
import { volver } from '../lib/ruta'
import { supabase } from '../lib/supabase'
import { RUTINAS_HABITUALES, type Rutina } from '../lib/tipos'
import { useMiembros } from '../lib/useMiembros'
import { avisoError, botonPrincipal, campo, campoBase, estiloChip } from './estilos'

type Comun = {
  hogarId: string
  miUserId: string
}

const FRECUENCIAS = [1, 2, 7, 14, 30]

// Pantalla para añadir una rutina.
export function PantallaNuevaRutina(props: Comun) {
  return <Formulario {...props} />
}

// Pantalla para editar una rutina.
export function PantallaEditarRutina({ id, ...comun }: Comun & { id: string }) {
  const [estado, setEstado] = useState<{ rutina: Rutina | null; error?: string } | null>(null)

  useEffect(() => {
    if (!supabase) return
    let vigente = true
    supabase
      .from('rutinas')
      .select('*')
      .eq('id', id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!vigente) return
        setEstado(error ? { rutina: null, error: mensajeDeError(error) } : { rutina: data as Rutina | null })
      })
    return () => {
      vigente = false
    }
  }, [id])

  if (!estado) return <Aviso texto="Cargando…" />
  if (estado.error) return <Aviso texto={estado.error} />
  if (!estado.rutina) return <Aviso texto="No encontramos esta rutina en tu hogar." />
  return <Formulario rutina={estado.rutina} {...comun} />
}

function Aviso({ texto }: { texto: string }) {
  return (
    <main className="mx-auto flex min-h-svh max-w-md items-center justify-center px-5 text-center text-stone-500">
      {texto}
    </main>
  )
}

function Formulario({ hogarId, miUserId, rutina }: Comun & { rutina?: Rutina }) {
  const { miembros } = useMiembros()
  const editando = Boolean(rutina)
  const frecuenciaInicial = rutina?.frecuencia_dias ?? 7

  const [nombre, setNombre] = useState(rutina?.nombre ?? '')
  const [frecuencia, setFrecuencia] = useState(frecuenciaInicial)
  const [otraFrecuencia, setOtraFrecuencia] = useState(!FRECUENCIAS.includes(frecuenciaInicial))
  // En las rutinas nuevas suele saberse cuándo toca la próxima vez.
  const [modoFecha, setModoFecha] = useState<'ultima' | 'proxima'>(editando ? 'ultima' : 'proxima')
  const [fecha, setFecha] = useState(rutina?.fecha_ultima ?? '')
  const [responsable, setResponsable] = useState<string | null | undefined>(
    rutina ? rutina.responsable_id : undefined,
  )
  const [turnos, setTurnos] = useState(rutina?.turnos ?? false)
  // Quién se turna: null = todo el hogar (también quien entre más adelante).
  const [participantes, setParticipantes] = useState<string[] | null>(rutina?.participantes ?? null)
  const [notas, setNotas] = useState(rutina?.notas ?? '')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const miMiembroId = miembros?.find((m) => m.user_id === miUserId)?.id ?? null
  // Las personas que se turnan, en orden de llegada al hogar.
  const enElTurno = (miembros ?? []).filter((m) => participantes === null || participantes.includes(m.id))
  const idsEnElTurno = enElTurno.map((m) => m.id)

  // ¿A quién le toca ahora? Si no se ha elegido a nadie, a ti. Con turnos,
  // tiene que ser alguien que participa (si no, la primera que participa).
  const elegido = responsable !== undefined ? responsable : miembros ? miMiembroId : undefined
  const responsableElegido = !turnos
    ? elegido
    : elegido && idsEnElTurno.includes(elegido)
      ? elegido
      : miembros
        ? (idsEnElTurno.includes(miMiembroId ?? '') ? miMiembroId : (idsEnElTurno[0] ?? null))
        : undefined

  // Para la explicación: a quién le tocará después.
  const posicion = enElTurno.findIndex((m) => m.id === responsableElegido)
  const despues =
    enElTurno.length > 1 && posicion >= 0 ? enElTurno[(posicion + 1) % enElTurno.length].nombre_visible : null

  // Marca o desmarca a alguien. Si quedan todas marcadas, es «todo el hogar».
  function cambiarParticipante(id: string) {
    if (!miembros) return
    const actuales = participantes ?? miembros.map((m) => m.id)
    const quitar = actuales.includes(id)
    // Siempre en orden de llegada al hogar.
    const nuevas = miembros
      .map((m) => m.id)
      .filter((x) => (x === id ? !quitar : actuales.includes(x)))
    setParticipantes(nuevas.length === miembros.length ? null : nuevas)
    setError(null)
  }
  const frecuenciaValida = Number.isInteger(frecuencia) && frecuencia >= 1 && frecuencia <= 365
  const fechaUltima = !fecha ? '' : modoFecha === 'ultima' ? fecha : sumarDias(fecha, -frecuencia)
  // La próxima vez no puede ser más tarde que «hoy + frecuencia»: eso
  // querría decir que la última vez fue en el futuro (suele ser el año
  // mal puesto en el selector de fecha del móvil).
  const proximaMaxima = frecuenciaValida ? sumarDias(hoyComoTexto(), frecuencia) : ''
  const proxima =
    fecha && frecuenciaValida ? (modoFecha === 'proxima' ? fecha : sumarDias(fecha, frecuencia)) : ''

  function elegirFrecuencia(dias: number) {
    setFrecuencia(dias)
    setOtraFrecuencia(!FRECUENCIAS.includes(dias))
  }

  async function guardar(evento: FormEvent) {
    evento.preventDefault()
    if (!supabase) return
    if (!frecuenciaValida) {
      setError('Elige cada cuántos días toca (entre 1 y 365).')
      return
    }
    if (fechaUltima > hoyComoTexto()) {
      setError(
        `Con «${textoFrecuencia(frecuencia)}», la próxima vez no puede ser más tarde del ${fechaLarga(proximaMaxima)}. Revisa el año de la fecha.`,
      )
      return
    }
    if (turnos && enElTurno.length === 0) {
      setError('Elige al menos una persona para los turnos.')
      return
    }
    setGuardando(true)
    setError(null)
    const datos = {
      nombre: nombre.trim(),
      frecuencia_dias: frecuencia,
      fecha_ultima: fechaUltima,
      responsable_id: responsableElegido ?? null,
      turnos,
      // Sin turnos no hace falta guardar quién participa.
      participantes: turnos ? participantes : null,
      notas: notas.trim() || null,
    }
    const { error } = rutina
      ? await supabase.from('rutinas').update(datos).eq('id', rutina.id)
      : await supabase.from('rutinas').insert({ hogar_id: hogarId, ...datos })
    if (error) {
      setError(mensajeDeError(error))
      setGuardando(false)
      return
    }
    volver('/casa')
  }

  async function borrar() {
    if (!supabase || !rutina) return
    if (!window.confirm(`¿Borrar la rutina «${rutina.nombre}»? También se borrarán sus tareas.`)) return
    setGuardando(true)
    const { error } = await supabase.from('rutinas').delete().eq('id', rutina.id)
    if (error) {
      setError(mensajeDeError(error))
      setGuardando(false)
      return
    }
    volver('/casa')
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col gap-6 px-5 py-8">
      <button type="button" onClick={() => volver('/casa')} className="self-start text-sm font-medium text-marca">
        ← Cancelar
      </button>

      <h1 className="text-2xl font-extrabold text-marca">{editando ? 'Editar rutina' : 'Nueva rutina'}</h1>

      <form onSubmit={guardar} className="tarjeta flex flex-col gap-5">
        {!editando && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1.5 text-sm font-medium text-stone-700">Ideas rápidas</legend>
            <div className="flex flex-wrap gap-2">
              {RUTINAS_HABITUALES.map((idea) => (
                <button
                  key={idea.nombre}
                  type="button"
                  aria-pressed={nombre === idea.nombre}
                  onClick={() => {
                    setNombre(idea.nombre)
                    elegirFrecuencia(idea.dias)
                  }}
                  className={estiloChip(nombre === idea.nombre)}
                >
                  {idea.nombre}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-stone-700">¿Qué hay que hacer?</span>
          <input
            className={campo}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Por ejemplo: Limpiar el baño"
            maxLength={60}
            required
          />
        </label>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-medium text-stone-700">¿Cada cuánto?</legend>
          <div className="flex flex-wrap gap-2">
            {FRECUENCIAS.map((dias) => (
              <button
                key={dias}
                type="button"
                aria-pressed={!otraFrecuencia && frecuencia === dias}
                onClick={() => elegirFrecuencia(dias)}
                className={estiloChip(!otraFrecuencia && frecuencia === dias)}
              >
                {textoFrecuencia(dias).replace('cada', 'Cada')}
              </button>
            ))}
            <button
              type="button"
              aria-pressed={otraFrecuencia}
              onClick={() => setOtraFrecuencia(true)}
              className={estiloChip(otraFrecuencia)}
            >
              Otra
            </button>
          </div>
          {otraFrecuencia && (
            <label className="flex items-center gap-2 text-stone-700">
              Cada
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={365}
                className={`${campoBase} w-24 text-center`}
                value={Number.isNaN(frecuencia) ? '' : frecuencia}
                onChange={(e) => setFrecuencia(e.target.valueAsNumber)}
                required
              />
              días
            </label>
          )}
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-medium text-stone-700">¿Qué fecha sabes?</legend>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              aria-pressed={modoFecha === 'proxima'}
              onClick={() => {
                setModoFecha('proxima')
                setFecha(proxima)
              }}
              className={estiloChip(modoFecha === 'proxima')}
            >
              Cuándo toca la próxima
            </button>
            <button
              type="button"
              aria-pressed={modoFecha === 'ultima'}
              onClick={() => {
                setModoFecha('ultima')
                setFecha(fechaUltima)
              }}
              className={estiloChip(modoFecha === 'ultima')}
            >
              La última vez
            </button>
          </div>
          <input
            type="date"
            className={campo}
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            max={modoFecha === 'ultima' ? hoyComoTexto() : proximaMaxima || undefined}
            min="2000-01-02"
            required
            aria-label={modoFecha === 'ultima' ? 'Fecha de la última vez' : 'Fecha de la próxima vez'}
          />
        </fieldset>

        {proxima && (
          <p className="rounded-xl bg-marca-suave p-3 text-sm text-marca">
            Toca el <strong>{fechaLarga(proxima)}</strong> ({cuandoToca(proxima).toLowerCase()}) y
            después {textoFrecuencia(frecuencia)}.
          </p>
        )}

        <label className="flex items-start gap-3 rounded-xl bg-stone-50 p-3">
          <input
            type="checkbox"
            checked={turnos}
            onChange={(e) => setTurnos(e.target.checked)}
            className="mt-1 h-5 w-5 shrink-0 accent-marca"
          />
          <span className="flex flex-col gap-0.5">
            <span className="font-medium text-stone-800">Turnos que rotan</span>
            <span className="text-sm text-stone-600">
              Cada vez que alguien la hace, pasa el turno a la siguiente persona
              que participa. Si haces la de otra persona, cuenta como tu turno.
            </span>
            {turnos && miembros && miembros.length < 2 && (
              <span className="text-sm text-stone-500">
                Cuando haya más gente en el hogar, os iréis turnando.
              </span>
            )}
          </span>
        </label>

        {turnos && miembros && miembros.length > 1 && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1.5 text-sm font-medium text-stone-700">¿Quién participa?</legend>
            <div className="flex flex-wrap gap-2">
              {miembros.map((miembro) => {
                const dentro = idsEnElTurno.includes(miembro.id)
                return (
                  <button
                    key={miembro.id}
                    type="button"
                    aria-pressed={dentro}
                    onClick={() => cambiarParticipante(miembro.id)}
                    className={estiloChip(dentro)}
                  >
                    {dentro ? '✓ ' : ''}
                    {miembro.nombre_visible}
                    {miembro.user_id === miUserId && ' (tú)'}
                  </button>
                )
              })}
            </div>
            <span className="text-xs text-stone-500">
              {participantes === null
                ? 'Participa todo el hogar, también quien entre más adelante.'
                : 'Solo se turnan las personas marcadas.'}
            </span>
          </fieldset>
        )}

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-medium text-stone-700">
            {turnos ? '¿A quién le toca ahora?' : '¿Quién se encarga?'}
          </legend>
          <div className="flex flex-wrap gap-2">
            {(turnos ? enElTurno : (miembros ?? [])).map((miembro) => (
              <button
                key={miembro.id}
                type="button"
                aria-pressed={responsableElegido === miembro.id}
                onClick={() => setResponsable(miembro.id)}
                className={estiloChip(responsableElegido === miembro.id)}
              >
                {miembro.nombre_visible}
                {miembro.user_id === miUserId && ' (tú)'}
              </button>
            ))}
            {!turnos && (
              <button
                type="button"
                aria-pressed={responsableElegido === null}
                onClick={() => setResponsable(null)}
                className={estiloChip(responsableElegido === null)}
              >
                Sin asignar
              </button>
            )}
          </div>
          {turnos && despues && posicion >= 0 && (
            <span className="text-sm font-medium text-marca">
              Ahora le toca a {enElTurno[posicion].nombre_visible}; después, a {despues}.
            </span>
          )}
        </fieldset>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-stone-700">
            Notas <span className="font-normal text-stone-400">(opcional)</span>
          </span>
          <textarea
            className={`${campo} min-h-20`}
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            maxLength={2000}
            placeholder="Qué productos usar, qué día viene el camión de la basura…"
          />
        </label>

        {error && <p role="alert" className={avisoError}>{error}</p>}

        <button type="submit" disabled={guardando} className={botonPrincipal}>
          {guardando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Añadir rutina'}
        </button>
      </form>

      {editando && (
        <button
          type="button"
          onClick={borrar}
          disabled={guardando}
          className="self-center px-4 py-2 text-sm font-medium text-red-700"
        >
          Borrar rutina
        </button>
      )}
    </main>
  )
}
