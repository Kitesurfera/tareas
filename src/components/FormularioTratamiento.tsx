import { useEffect, useState, type FormEvent } from 'react'
import { mensajeDeError } from '../lib/errores'
import {
  cuandoToca,
  fechaLarga,
  FRECUENCIAS_HABITUALES,
  hoyComoTexto,
  sumarDias,
  textoFrecuencia,
} from '../lib/fechas'
import { volver } from '../lib/ruta'
import { supabase } from '../lib/supabase'
import {
  infoTipo,
  TIPOS_TRATAMIENTO,
  type TipoTratamiento,
  type Tratamiento,
} from '../lib/tipos'
import { useMascota } from '../lib/useMascota'
import { useMiembros } from '../lib/useMiembros'
import { avisoError, botonPrincipal, campo } from './estilos'

type Comun = {
  hogarId: string
  miUserId: string
}

// Pantalla para añadir un tratamiento a una mascota.
export function PantallaNuevoTratamiento({ mascotaId, ...comun }: Comun & { mascotaId: string }) {
  return <Formulario mascotaId={mascotaId} {...comun} />
}

// Pantalla para editar un tratamiento que ya existe.
export function PantallaEditarTratamiento({ id, ...comun }: Comun & { id: string }) {
  const [estado, setEstado] = useState<{ tratamiento: Tratamiento | null; error?: string } | null>(null)

  useEffect(() => {
    if (!supabase) return
    let vigente = true
    supabase
      .from('tratamientos')
      .select('*')
      .eq('id', id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!vigente) return
        setEstado(
          error
            ? { tratamiento: null, error: mensajeDeError(error) }
            : { tratamiento: data as Tratamiento | null },
        )
      })
    return () => {
      vigente = false
    }
  }, [id])

  if (!estado) return <Aviso texto="Cargando…" />
  if (estado.error) return <Aviso texto={estado.error} />
  if (!estado.tratamiento) return <Aviso texto="No encontramos este tratamiento en tu hogar." />
  return (
    <Formulario
      mascotaId={estado.tratamiento.mascota_id}
      tratamiento={estado.tratamiento}
      {...comun}
    />
  )
}

function Aviso({ texto }: { texto: string }) {
  return (
    <main className="mx-auto flex min-h-svh max-w-md items-center justify-center px-5 text-center text-stone-500">
      {texto}
    </main>
  )
}

type Props = Comun & {
  mascotaId: string
  tratamiento?: Tratamiento
}

function Formulario({ hogarId, miUserId, mascotaId, tratamiento }: Props) {
  const { mascota } = useMascota(mascotaId)
  const { miembros } = useMiembros()
  const editando = Boolean(tratamiento)
  const frecuenciaInicial = tratamiento?.frecuencia_dias ?? 365

  const [tipo, setTipo] = useState<TipoTratamiento>(tratamiento?.tipo ?? 'vacuna')
  const [nombre, setNombre] = useState(tratamiento?.nombre ?? '')
  // ¿Qué fecha conoce la persona: la última vez, o la próxima?
  const [modoFecha, setModoFecha] = useState<'ultima' | 'proxima'>('ultima')
  const [fecha, setFecha] = useState(tratamiento?.fecha_ultima ?? '')
  const [frecuencia, setFrecuencia] = useState(frecuenciaInicial)
  const [otraFrecuencia, setOtraFrecuencia] = useState(
    !FRECUENCIAS_HABITUALES.includes(frecuenciaInicial),
  )
  const [frecuenciaTocada, setFrecuenciaTocada] = useState(editando)
  // undefined = todavía no se ha elegido (se pone «yo» al cargar la gente).
  const [responsable, setResponsable] = useState<string | null | undefined>(
    tratamiento ? tratamiento.responsable_id : undefined,
  )
  const [notas, setNotas] = useState(tratamiento?.notas ?? '')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const miMiembroId = miembros?.find((m) => m.user_id === miUserId)?.id ?? null
  // Mientras se carga la gente del hogar no marcamos a nadie.
  const responsableElegido =
    responsable !== undefined ? responsable : miembros ? miMiembroId : undefined
  const infoDelTipo = infoTipo(tipo)
  const frecuenciaValida = Number.isInteger(frecuencia) && frecuencia >= 1 && frecuencia <= 3650

  // La base de datos guarda la última vez; si la persona sabe la próxima,
  // la calculamos hacia atrás.
  const fechaUltima = !fecha
    ? ''
    : modoFecha === 'ultima'
      ? fecha
      : sumarDias(fecha, -frecuencia)
  const proxima = fecha && frecuenciaValida ? (modoFecha === 'proxima' ? fecha : sumarDias(fecha, frecuencia)) : ''
  const volverA = `/mascotas/${mascotaId}`

  function elegirTipo(nuevo: TipoTratamiento) {
    setTipo(nuevo)
    // Si aún no ha tocado la frecuencia, ponemos la habitual de ese tipo.
    if (!frecuenciaTocada) {
      const habitual = infoTipo(nuevo).diasHabituales
      setFrecuencia(habitual)
      setOtraFrecuencia(!FRECUENCIAS_HABITUALES.includes(habitual))
    }
  }

  async function guardar(evento: FormEvent) {
    evento.preventDefault()
    if (!supabase) return
    if (!frecuenciaValida) {
      setError('Elige cada cuántos días toca (entre 1 y 3650).')
      return
    }
    setGuardando(true)
    setError(null)

    const datos = {
      tipo,
      nombre: nombre.trim(),
      fecha_ultima: fechaUltima,
      frecuencia_dias: frecuencia,
      responsable_id: responsableElegido ?? null,
      notas: notas.trim() || null,
    }
    const { error } = tratamiento
      ? await supabase.from('tratamientos').update(datos).eq('id', tratamiento.id)
      : await supabase
          .from('tratamientos')
          .insert({ hogar_id: hogarId, mascota_id: mascotaId, ...datos })

    if (error) {
      setError(mensajeDeError(error))
      setGuardando(false)
      return
    }
    volver(volverA)
  }

  async function borrar() {
    if (!supabase || !tratamiento) return
    const seguro = window.confirm(
      `¿Borrar «${tratamiento.nombre}»? También se borrarán sus tareas. No se puede deshacer.`,
    )
    if (!seguro) return
    setGuardando(true)
    const { error } = await supabase.from('tratamientos').delete().eq('id', tratamiento.id)
    if (error) {
      setError(mensajeDeError(error))
      setGuardando(false)
      return
    }
    volver(volverA)
  }

  const chip = (activo: boolean) =>
    `rounded-full px-4 py-2 text-sm font-medium ring-1 transition ${
      activo ? 'bg-marca text-white ring-marca' : 'bg-white text-stone-700 ring-stone-300'
    }`

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col gap-6 px-5 py-8">
      <button
        type="button"
        onClick={() => volver(volverA)}
        className="self-start text-sm font-medium text-marca"
      >
        ← Cancelar
      </button>

      <header>
        <h1 className="text-2xl font-bold text-marca">
          {editando ? 'Editar tratamiento' : 'Nuevo tratamiento'}
        </h1>
        {mascota && <p className="text-stone-600">de {mascota.nombre}</p>}
      </header>

      <form onSubmit={guardar} className="flex flex-col gap-5 rounded-2xl bg-white p-5 shadow-sm">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-medium text-stone-700">Tipo</legend>
          <div className="flex flex-wrap gap-2">
            {TIPOS_TRATAMIENTO.map((opcion) => (
              <button
                key={opcion.valor}
                type="button"
                aria-pressed={tipo === opcion.valor}
                onClick={() => elegirTipo(opcion.valor)}
                className={chip(tipo === opcion.valor)}
              >
                <span aria-hidden="true">{opcion.dibujo}</span> {opcion.texto}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-stone-700">Nombre</span>
          <input
            className={campo}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder={`Por ejemplo: ${infoDelTipo.ejemplo}`}
            maxLength={60}
            required
          />
        </label>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-medium text-stone-700">¿Cada cuánto toca?</legend>
          <div className="flex flex-wrap gap-2">
            {FRECUENCIAS_HABITUALES.map((dias) => (
              <button
                key={dias}
                type="button"
                aria-pressed={!otraFrecuencia && frecuencia === dias}
                onClick={() => {
                  setFrecuencia(dias)
                  setOtraFrecuencia(false)
                  setFrecuenciaTocada(true)
                }}
                className={chip(!otraFrecuencia && frecuencia === dias)}
              >
                {textoFrecuencia(dias).replace('cada', 'Cada')}
              </button>
            ))}
            <button
              type="button"
              aria-pressed={otraFrecuencia}
              onClick={() => {
                setOtraFrecuencia(true)
                setFrecuenciaTocada(true)
              }}
              className={chip(otraFrecuencia)}
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
                max={3650}
                className={`${campo} w-24 text-center`}
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
              aria-pressed={modoFecha === 'ultima'}
              onClick={() => {
                setModoFecha('ultima')
                setFecha(fechaUltima)
              }}
              className={chip(modoFecha === 'ultima')}
            >
              La última vez
            </button>
            <button
              type="button"
              aria-pressed={modoFecha === 'proxima'}
              onClick={() => {
                setModoFecha('proxima')
                setFecha(proxima)
              }}
              className={chip(modoFecha === 'proxima')}
            >
              Cuándo toca la próxima
            </button>
          </div>
          <input
            type="date"
            className={campo}
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            max={modoFecha === 'ultima' ? hoyComoTexto() : undefined}
            min="1980-01-02"
            required
            aria-label={modoFecha === 'ultima' ? 'Fecha de la última vez' : 'Fecha de la próxima vez'}
          />
          <span className="text-xs text-stone-500">
            {modoFecha === 'ultima'
              ? 'Si no la sabes exacta, pon una aproximada.'
              : 'Útil si el veterinario te apuntó la próxima fecha en la cartilla.'}
          </span>
        </fieldset>

        {proxima && (
          <p className="rounded-xl bg-marca-suave p-3 text-sm text-marca">
            {modoFecha === 'ultima' ? 'La próxima vez será' : 'Toca'} el{' '}
            <strong>{fechaLarga(proxima)}</strong> ({cuandoToca(proxima).toLowerCase()}).
          </p>
        )}

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-medium text-stone-700">¿Quién se encarga?</legend>
          <div className="flex flex-wrap gap-2">
            {miembros?.map((miembro) => (
              <button
                key={miembro.id}
                type="button"
                aria-pressed={responsableElegido === miembro.id}
                onClick={() => setResponsable(miembro.id)}
                className={chip(responsableElegido === miembro.id)}
              >
                {miembro.nombre_visible}
                {miembro.user_id === miUserId && ' (tú)'}
              </button>
            ))}
            <button
              type="button"
              aria-pressed={responsableElegido === null}
              onClick={() => setResponsable(null)}
              className={chip(responsableElegido === null)}
            >
              Sin asignar
            </button>
          </div>
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
            placeholder="Dosis, marca, veterinario…"
          />
        </label>

        {error && <p role="alert" className={avisoError}>{error}</p>}

        <button type="submit" disabled={guardando} className={botonPrincipal}>
          {guardando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Añadir tratamiento'}
        </button>
      </form>

      {editando && (
        <button
          type="button"
          onClick={borrar}
          disabled={guardando}
          className="self-center px-4 py-2 text-sm font-medium text-red-700"
        >
          Borrar tratamiento
        </button>
      )}
    </main>
  )
}
