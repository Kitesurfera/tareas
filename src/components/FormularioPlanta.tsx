import { useEffect, useState, type FormEvent } from 'react'
import { mensajeDeError } from '../lib/errores'
import { hoyComoTexto } from '../lib/fechas'
import { FRECUENCIAS_CUIDADO } from '../lib/plantas'
import { reemplazar, volver } from '../lib/ruta'
import { supabase } from '../lib/supabase'
import { UBICACIONES, type Planta } from '../lib/tipos'
import { useMiembros } from '../lib/useMiembros'
import { avisoError, botonPrincipal, campo, estiloChip } from './estilos'
import { ElegirFrecuencia, ElegirResponsable } from './FormularioCuidado'

type Comun = {
  hogarId: string
  miUserId: string
}

// #/casa/plantas/nueva
export function PantallaNuevaPlanta(comun: Comun) {
  return <Formulario {...comun} />
}

// #/casa/plantas/<id>/editar
export function PantallaEditarPlanta({ id, ...comun }: Comun & { id: string }) {
  const [estado, setEstado] = useState<{ planta: Planta | null; error?: string } | null>(null)

  useEffect(() => {
    if (!supabase) return
    let vigente = true
    supabase
      .from('plantas')
      .select('*')
      .eq('id', id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!vigente) return
        setEstado(error ? { planta: null, error: mensajeDeError(error) } : { planta: data as Planta | null })
      })
    return () => {
      vigente = false
    }
  }, [id])

  if (!estado) return <Aviso texto="Cargando…" />
  if (estado.error) return <Aviso texto={estado.error} />
  if (!estado.planta) return <Aviso texto="No encontramos esta planta en tu hogar." />
  return <Formulario planta={estado.planta} {...comun} />
}

function Aviso({ texto }: { texto: string }) {
  return (
    <main className="mx-auto flex min-h-svh max-w-md items-center justify-center px-5 text-center text-stone-500">
      {texto}
    </main>
  )
}

function Formulario({ hogarId, miUserId, planta }: Comun & { planta?: Planta }) {
  const { miembros } = useMiembros()
  const editando = Boolean(planta)
  const [nombre, setNombre] = useState(planta?.nombre ?? '')
  const [tipo, setTipo] = useState(planta?.tipo ?? '')
  const [ubicacion, setUbicacion] = useState(planta?.ubicacion ?? '')
  const [notas, setNotas] = useState(planta?.notas ?? '')
  // Solo al crear: apuntar ya el riego.
  const [conRiego, setConRiego] = useState(true)
  const [frecuencia, setFrecuencia] = useState(7)
  const [ultimoRiego, setUltimoRiego] = useState(hoyComoTexto)
  const [responsable, setResponsable] = useState<string | null | undefined>(undefined)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const miMiembroId = miembros?.find((m) => m.user_id === miUserId)?.id ?? null
  const responsableElegido = responsable !== undefined ? responsable : miembros ? miMiembroId : undefined
  const volverA = planta ? `/casa/plantas/${planta.id}` : '/casa'

  async function guardar(evento: FormEvent) {
    evento.preventDefault()
    if (!supabase) return
    if (!nombre.trim()) return setError('Ponle un nombre a la planta.')
    if (!editando && conRiego) {
      if (!(Number.isInteger(frecuencia) && frecuencia >= 1 && frecuencia <= 3650)) {
        return setError('Elige cada cuántos días se riega (entre 1 y 3650).')
      }
      if (!ultimoRiego || ultimoRiego > hoyComoTexto()) return setError('El último riego no puede ser en el futuro.')
    }
    setGuardando(true)
    setError(null)
    const datos = {
      nombre: nombre.trim(),
      tipo: tipo.trim() || null,
      ubicacion: ubicacion.trim() || null,
      notas: notas.trim() || null,
    }

    if (planta) {
      const { error } = await supabase.from('plantas').update(datos).eq('id', planta.id)
      if (error) {
        setGuardando(false)
        return setError(mensajeDeError(error))
      }
      return volver(volverA)
    }

    const { data, error } = await supabase
      .from('plantas')
      .insert({ hogar_id: hogarId, ...datos })
      .select('id')
      .single()
    if (error || !data) {
      setGuardando(false)
      return setError(mensajeDeError(error))
    }
    const plantaId = (data as { id: string }).id
    if (conRiego) {
      const { error: errorRiego } = await supabase.from('cuidados').insert({
        hogar_id: hogarId,
        planta_id: plantaId,
        tipo: 'riego',
        fecha_ultima: ultimoRiego,
        frecuencia_dias: frecuencia,
        responsable_id: responsableElegido ?? null,
      })
      if (errorRiego) {
        // La planta ya está creada: vamos a su ficha y desde ahí se puede añadir el riego.
        setGuardando(false)
        return reemplazar(`/casa/plantas/${plantaId}`)
      }
    }
    reemplazar(`/casa/plantas/${plantaId}`)
  }

  async function borrar() {
    if (!supabase || !planta) return
    if (!window.confirm(`¿Borrar «${planta.nombre}»? También se borrarán sus cuidados y sus tareas. No se puede deshacer.`)) return
    setGuardando(true)
    const { error } = await supabase.from('plantas').delete().eq('id', planta.id)
    if (error) {
      setGuardando(false)
      return setError(mensajeDeError(error))
    }
    reemplazar('/casa')
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col gap-6 px-5 py-8">
      <button type="button" onClick={() => volver(volverA)} className="self-start text-sm font-medium text-marca">
        ← Cancelar
      </button>
      <h1 className="text-2xl font-bold text-marca">{editando ? 'Editar planta' : 'Nueva planta'}</h1>

      <form onSubmit={guardar} className="flex flex-col gap-5 rounded-2xl bg-white p-5 shadow-sm">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-stone-700">Nombre</span>
          <input
            className={campo}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="El ficus grande"
            maxLength={40}
            required
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-stone-700">
            Tipo de planta <span className="font-normal text-stone-400">(opcional)</span>
          </span>
          <input
            className={campo}
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
            placeholder="Ficus, potos, cactus…"
            maxLength={60}
          />
        </label>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-medium text-stone-700">
            ¿Dónde está? <span className="font-normal text-stone-400">(opcional)</span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {UBICACIONES.map((sitio) => (
              <button
                key={sitio}
                type="button"
                aria-pressed={ubicacion === sitio}
                onClick={() => setUbicacion(ubicacion === sitio ? '' : sitio)}
                className={estiloChip(ubicacion === sitio)}
              >
                {sitio}
              </button>
            ))}
          </div>
          <input
            className={campo}
            value={ubicacion}
            onChange={(e) => setUbicacion(e.target.value)}
            placeholder="U otro sitio: «Ventana de la cocina»"
            maxLength={40}
            aria-label="Dónde está"
          />
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
            placeholder="Luz indirecta, no le gusta el frío…"
          />
        </label>

        {!editando && (
          <fieldset className="flex flex-col gap-3 rounded-xl bg-stone-50 p-4">
            <legend className="sr-only">Riego</legend>
            <label className="flex items-center gap-3 font-medium">
              <input
                type="checkbox"
                className="h-5 w-5 accent-marca"
                checked={conRiego}
                onChange={(e) => setConRiego(e.target.checked)}
              />
              💧 Apuntar ya el riego
            </label>
            {conRiego && (
              <>
                <div className="flex flex-col gap-2">
                  <span className="text-sm font-medium text-stone-700">¿Cada cuánto se riega?</span>
                  <ElegirFrecuencia opciones={FRECUENCIAS_CUIDADO.riego} frecuencia={frecuencia} onCambio={setFrecuencia} />
                </div>
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-stone-700">¿Cuándo se regó por última vez?</span>
                  <input
                    type="date"
                    className={campo}
                    value={ultimoRiego}
                    max={hoyComoTexto()}
                    onChange={(e) => setUltimoRiego(e.target.value)}
                    required
                  />
                </label>
                <div className="flex flex-col gap-2">
                  <span className="text-sm font-medium text-stone-700">¿Quién la riega?</span>
                  {miembros && (
                    <ElegirResponsable
                      miembros={miembros}
                      miUserId={miUserId}
                      elegido={responsableElegido}
                      onCambio={setResponsable}
                    />
                  )}
                </div>
                <p className="text-xs text-stone-500">El abono, el trasplante y lo demás se añaden luego desde su ficha.</p>
              </>
            )}
          </fieldset>
        )}

        {error && <p role="alert" className={avisoError}>{error}</p>}

        <button type="submit" disabled={guardando} className={botonPrincipal}>
          {guardando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Añadir planta'}
        </button>
      </form>

      {editando && (
        <button
          type="button"
          onClick={borrar}
          disabled={guardando}
          className="self-center px-4 py-2 text-sm font-medium text-red-700"
        >
          Borrar planta
        </button>
      )}
    </main>
  )
}
