import { useEffect, useState, type FormEvent } from 'react'
import { mensajeDeError } from '../lib/errores'
import { cuandoToca, fechaLarga, hoyComoTexto, sumarDias, textoFrecuencia } from '../lib/fechas'
import { EJEMPLO_NOTAS, FRECUENCIAS_CUIDADO } from '../lib/plantas'
import { volver } from '../lib/ruta'
import { supabase } from '../lib/supabase'
import { infoCuidado, TIPOS_CUIDADO, type Cuidado, type Miembro, type TipoCuidado } from '../lib/tipos'
import { useMiembros } from '../lib/useMiembros'
import { avisoError, botonPrincipal, campo, campoBase, estiloChip } from './estilos'

// ---------------------------------------------------------------------
// Piezas que también usa el formulario de la planta (para el riego)
// ---------------------------------------------------------------------

export function ElegirFrecuencia({
  opciones,
  frecuencia,
  onCambio,
}: {
  opciones: number[]
  frecuencia: number
  onCambio: (dias: number) => void
}) {
  const [otra, setOtra] = useState(!opciones.includes(frecuencia))
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {opciones.map((dias) => (
          <button
            key={dias}
            type="button"
            aria-pressed={!otra && frecuencia === dias}
            onClick={() => {
              setOtra(false)
              onCambio(dias)
            }}
            className={estiloChip(!otra && frecuencia === dias)}
          >
            {textoFrecuencia(dias).replace('cada', 'Cada')}
          </button>
        ))}
        <button type="button" aria-pressed={otra} onClick={() => setOtra(true)} className={estiloChip(otra)}>
          Otra
        </button>
      </div>
      {otra && (
        <label className="flex items-center gap-2 text-stone-700">
          Cada
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={3650}
            className={`${campoBase} w-24 text-center`}
            value={Number.isNaN(frecuencia) ? '' : frecuencia}
            onChange={(e) => onCambio(e.target.valueAsNumber)}
            required
          />
          días
        </label>
      )}
    </div>
  )
}

export function ElegirResponsable({
  miembros,
  miUserId,
  elegido,
  onCambio,
}: {
  miembros: Miembro[]
  miUserId: string
  elegido: string | null | undefined
  onCambio: (id: string | null) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {miembros.map((miembro) => (
        <button
          key={miembro.id}
          type="button"
          aria-pressed={elegido === miembro.id}
          onClick={() => onCambio(miembro.id)}
          className={estiloChip(elegido === miembro.id)}
        >
          {miembro.nombre_visible}
          {miembro.user_id === miUserId && ' (tú)'}
        </button>
      ))}
      <button type="button" aria-pressed={elegido === null} onClick={() => onCambio(null)} className={estiloChip(elegido === null)}>
        Sin asignar
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------
// Formulario de un cuidado
// ---------------------------------------------------------------------

type Comun = {
  hogarId: string
  miUserId: string
}

// #/casa/plantas/<id>/cuidados/nuevo
export function PantallaNuevoCuidado({ plantaId, ...comun }: Comun & { plantaId: string }) {
  return <Formulario plantaId={plantaId} {...comun} />
}

// #/cuidados/<id>/editar
export function PantallaEditarCuidado({ id, ...comun }: Comun & { id: string }) {
  const [estado, setEstado] = useState<{ cuidado: Cuidado | null; error?: string } | null>(null)

  useEffect(() => {
    if (!supabase) return
    let vigente = true
    supabase
      .from('cuidados')
      .select('*')
      .eq('id', id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!vigente) return
        setEstado(error ? { cuidado: null, error: mensajeDeError(error) } : { cuidado: data as Cuidado | null })
      })
    return () => {
      vigente = false
    }
  }, [id])

  if (!estado) return <Aviso texto="Cargando…" />
  if (estado.error) return <Aviso texto={estado.error} />
  if (!estado.cuidado) return <Aviso texto="No encontramos este cuidado en tu hogar." />
  return <Formulario plantaId={estado.cuidado.planta_id} cuidado={estado.cuidado} {...comun} />
}

function Aviso({ texto }: { texto: string }) {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md items-center justify-center px-5 text-center text-stone-500 md:max-w-2xl md:px-6 lg:max-w-xl lg:px-10">
      {texto}
    </main>
  )
}

function Formulario({ hogarId, miUserId, plantaId, cuidado }: Comun & { plantaId: string; cuidado?: Cuidado }) {
  const { miembros } = useMiembros()
  const [nombrePlanta, setNombrePlanta] = useState<string | null>(null)
  const editando = Boolean(cuidado)
  const [tipo, setTipo] = useState<TipoCuidado>(cuidado?.tipo ?? 'riego')
  const [nombre, setNombre] = useState(cuidado?.nombre ?? '')
  const [frecuencia, setFrecuencia] = useState(cuidado?.frecuencia_dias ?? infoCuidado('riego').diasHabituales)
  const [frecuenciaTocada, setFrecuenciaTocada] = useState(editando)
  const [fecha, setFecha] = useState(cuidado?.fecha_ultima ?? hoyComoTexto())
  // undefined = todavía no se ha elegido (se pone «yo» al cargar la gente).
  const [responsable, setResponsable] = useState<string | null | undefined>(cuidado ? cuidado.responsable_id : undefined)
  const [notas, setNotas] = useState(cuidado?.notas ?? '')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!supabase) return
    let vigente = true
    supabase
      .from('plantas')
      .select('nombre')
      .eq('id', plantaId)
      .maybeSingle()
      .then(({ data }) => {
        if (vigente) setNombrePlanta((data as { nombre: string } | null)?.nombre ?? null)
      })
    return () => {
      vigente = false
    }
  }, [plantaId])

  const miMiembroId = miembros?.find((m) => m.user_id === miUserId)?.id ?? null
  const responsableElegido = responsable !== undefined ? responsable : miembros ? miMiembroId : undefined
  const frecuenciaValida = Number.isInteger(frecuencia) && frecuencia >= 1 && frecuencia <= 3650
  const proxima = fecha && frecuenciaValida ? sumarDias(fecha, frecuencia) : ''
  const volverA = `/casa/plantas/${plantaId}`

  function elegirTipo(nuevo: TipoCuidado) {
    setTipo(nuevo)
    setError(null)
    // Si aún no ha tocado la frecuencia, ponemos la habitual de ese cuidado.
    if (!frecuenciaTocada) setFrecuencia(infoCuidado(nuevo).diasHabituales)
  }

  async function guardar(evento: FormEvent) {
    evento.preventDefault()
    if (!supabase) return
    if (tipo === 'otro' && !nombre.trim()) return setError('Escribe qué cuidado es (por ejemplo, «Limpiar las hojas»).')
    if (!frecuenciaValida) return setError('Elige cada cuántos días toca (entre 1 y 3650).')
    if (!fecha || fecha > hoyComoTexto()) return setError('La última vez no puede ser en el futuro: revisa la fecha.')
    setGuardando(true)
    setError(null)
    const datos = {
      tipo,
      nombre: tipo === 'otro' ? nombre.trim() : null,
      fecha_ultima: fecha,
      frecuencia_dias: frecuencia,
      responsable_id: responsableElegido ?? null,
      notas: notas.trim() || null,
    }
    const { error } = cuidado
      ? await supabase.from('cuidados').update(datos).eq('id', cuidado.id)
      : await supabase.from('cuidados').insert({ hogar_id: hogarId, planta_id: plantaId, ...datos })
    if (error) {
      setError(mensajeDeError(error))
      setGuardando(false)
      return
    }
    volver(volverA)
  }

  async function borrar() {
    if (!supabase || !cuidado) return
    if (!window.confirm('¿Borrar este cuidado? También se borrará su tarea pendiente.')) return
    setGuardando(true)
    const { error } = await supabase.from('cuidados').delete().eq('id', cuidado.id)
    if (error) {
      setError(mensajeDeError(error))
      setGuardando(false)
      return
    }
    volver(volverA)
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col gap-6 px-5 py-8 md:max-w-2xl md:px-6 lg:max-w-xl lg:px-10 lg:py-10">
      <button type="button" onClick={() => volver(volverA)} className="self-start text-sm font-medium text-marca">
        ← Cancelar
      </button>

      <header>
        <h1 className="text-2xl font-extrabold text-marca">{editando ? 'Editar cuidado' : 'Nuevo cuidado'}</h1>
        {nombrePlanta && <p className="text-stone-600">de {nombrePlanta}</p>}
      </header>

      <form onSubmit={guardar} className="tarjeta flex flex-col gap-5">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-medium text-stone-700">¿Qué hay que hacer?</legend>
          <div className="flex flex-wrap gap-2">
            {TIPOS_CUIDADO.map((opcion) => (
              <button
                key={opcion.valor}
                type="button"
                aria-pressed={tipo === opcion.valor}
                onClick={() => elegirTipo(opcion.valor)}
                className={estiloChip(tipo === opcion.valor)}
              >
                <span aria-hidden="true">{opcion.dibujo}</span> {opcion.texto}
              </button>
            ))}
          </div>
        </fieldset>

        {tipo === 'otro' && (
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-stone-700">¿Cuál?</span>
            <input
              className={campo}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Limpiar las hojas"
              maxLength={60}
              required
            />
          </label>
        )}

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-medium text-stone-700">¿Cada cuánto?</legend>
          <ElegirFrecuencia
            key={tipo}
            opciones={FRECUENCIAS_CUIDADO[tipo]}
            frecuencia={frecuencia}
            onCambio={(dias) => {
              setFrecuencia(dias)
              setFrecuenciaTocada(true)
            }}
          />
        </fieldset>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-stone-700">¿Cuándo fue la última vez?</span>
          <input
            type="date"
            className={campo}
            value={fecha}
            max={hoyComoTexto()}
            min="1980-01-02"
            onChange={(e) => setFecha(e.target.value)}
            required
          />
          <span className="text-xs text-stone-500">Si no la sabes exacta, pon una aproximada.</span>
        </label>

        {proxima && (
          <p className="rounded-xl bg-marca-suave p-3 text-sm text-marca">
            La próxima vez será el <strong>{fechaLarga(proxima)}</strong> ({cuandoToca(proxima).toLowerCase()}).
          </p>
        )}

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-medium text-stone-700">¿Quién se encarga?</legend>
          {miembros && (
            <ElegirResponsable
              miembros={miembros}
              miUserId={miUserId}
              elegido={responsableElegido}
              onCambio={setResponsable}
            />
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
            placeholder={EJEMPLO_NOTAS[tipo]}
          />
        </label>

        {error && <p role="alert" className={avisoError}>{error}</p>}

        <button type="submit" disabled={guardando} className={botonPrincipal}>
          {guardando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Añadir cuidado'}
        </button>
      </form>

      {editando && (
        <button
          type="button"
          onClick={borrar}
          disabled={guardando}
          className="self-center px-4 py-2 text-sm font-medium text-red-700"
        >
          Borrar cuidado
        </button>
      )}
    </main>
  )
}
