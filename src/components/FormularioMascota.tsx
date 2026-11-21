import { useEffect, useRef, useState, type FormEvent } from 'react'
import { mensajeDeError } from '../lib/errores'
import { hoyComoTexto } from '../lib/fechas'
import { borrarFoto, prepararFoto, subirFoto } from '../lib/fotos'
import { reemplazar, volver } from '../lib/ruta'
import { supabase } from '../lib/supabase'
import { ESPECIES, type Mascota } from '../lib/tipos'
import { useMascota } from '../lib/useMascota'
import { avisoError, botonPrincipal, campo } from './estilos'
import { FotoMascota } from './FotoMascota'

// Pantalla para añadir una mascota nueva.
export function PantallaNuevaMascota({ hogarId }: { hogarId: string }) {
  return <Formulario hogarId={hogarId} />
}

// Pantalla para editar una mascota que ya existe.
export function PantallaEditarMascota({ id, hogarId }: { id: string; hogarId: string }) {
  const { mascota, foto, error } = useMascota(id)
  if (error) return <Aviso texto={error} />
  if (mascota === undefined) return <Aviso texto="Cargando…" />
  if (mascota === null) return <Aviso texto="No encontramos esta mascota en tu hogar." />
  return <Formulario hogarId={hogarId} mascota={mascota} fotoActual={foto} />
}

function Aviso({ texto }: { texto: string }) {
  return (
    <main className="mx-auto flex min-h-svh max-w-md items-center justify-center px-5 text-center text-stone-500">
      {texto}
    </main>
  )
}

// Qué hacemos con la foto al guardar.
type CambioFoto =
  | { tipo: 'igual' }
  | { tipo: 'nueva'; foto: Blob; vista: string }
  | { tipo: 'quitar' }

type Props = {
  hogarId: string
  mascota?: Mascota
  fotoActual?: string
}

function Formulario({ hogarId, mascota, fotoActual }: Props) {
  const editando = Boolean(mascota)
  const especieConocida = ESPECIES.some((e) => e === mascota?.especie)

  const [nombre, setNombre] = useState(mascota?.nombre ?? '')
  const [especie, setEspecie] = useState<string>(
    !mascota ? 'Perro' : especieConocida ? mascota.especie : 'Otra',
  )
  const [otraEspecie, setOtraEspecie] = useState(
    mascota && !especieConocida ? mascota.especie : '',
  )
  const [raza, setRaza] = useState(mascota?.raza ?? '')
  const [nacimiento, setNacimiento] = useState(mascota?.fecha_nacimiento ?? '')
  const [notas, setNotas] = useState(mascota?.notas ?? '')
  const [cambioFoto, setCambioFoto] = useState<CambioFoto>({ tipo: 'igual' })
  const [preparandoFoto, setPreparandoFoto] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const selectorFoto = useRef<HTMLInputElement>(null)

  // Libera la vista previa de la foto cuando ya no se usa.
  const vistaPrevia = cambioFoto.tipo === 'nueva' ? cambioFoto.vista : null
  useEffect(() => {
    return () => {
      if (vistaPrevia) URL.revokeObjectURL(vistaPrevia)
    }
  }, [vistaPrevia])

  const fotoVisible =
    cambioFoto.tipo === 'nueva'
      ? cambioFoto.vista
      : cambioFoto.tipo === 'igual'
        ? fotoActual
        : undefined
  const especieFinal = (especie === 'Otra' ? otraEspecie : especie).trim()
  const destinoAlSalir = mascota ? `/mascotas/${mascota.id}` : '/'

  async function elegirFoto(archivo: File | undefined) {
    if (!archivo) return
    setError(null)
    setPreparandoFoto(true)
    try {
      const foto = await prepararFoto(archivo)
      setCambioFoto({ tipo: 'nueva', foto, vista: URL.createObjectURL(foto) })
    } catch {
      setError('No se ha podido leer esa foto. Prueba con otra.')
    } finally {
      setPreparandoFoto(false)
      if (selectorFoto.current) selectorFoto.current.value = ''
    }
  }

  async function guardar(evento: FormEvent) {
    evento.preventDefault()
    if (!supabase) return
    if (!especieFinal) {
      setError('Escribe qué animal es.')
      return
    }
    setGuardando(true)
    setError(null)

    // 1. Si hay foto nueva, la subimos primero.
    let rutaNueva: string | null | undefined // undefined = la foto no cambia
    try {
      if (cambioFoto.tipo === 'nueva') rutaNueva = await subirFoto(hogarId, cambioFoto.foto)
      if (cambioFoto.tipo === 'quitar') rutaNueva = null
    } catch (e) {
      setError(mensajeDeError(e as Error))
      setGuardando(false)
      return
    }

    // 2. Guardamos los datos.
    const datos = {
      nombre: nombre.trim(),
      especie: especieFinal,
      raza: raza.trim() || null,
      fecha_nacimiento: nacimiento || null,
      notas: notas.trim() || null,
      ...(rutaNueva !== undefined && { foto_ruta: rutaNueva }),
    }
    const { data, error } = mascota
      ? await supabase.from('mascotas').update(datos).eq('id', mascota.id).select('id').single()
      : await supabase.from('mascotas').insert({ hogar_id: hogarId, ...datos }).select('id').single()

    if (error || !data) {
      // No dejamos fotos sueltas en el almacén.
      if (rutaNueva) await borrarFoto(rutaNueva)
      setError(mensajeDeError(error))
      setGuardando(false)
      return
    }

    // 3. Si la foto cambió, borramos la antigua.
    if (rutaNueva !== undefined && mascota?.foto_ruta) await borrarFoto(mascota.foto_ruta)

    if (mascota) volver(`/mascotas/${mascota.id}`)
    else reemplazar(`/mascotas/${data.id}`)
  }

  async function borrarMascota() {
    if (!supabase || !mascota) return
    const seguro = window.confirm(
      `¿Seguro que quieres borrar la ficha de ${mascota.nombre}? No se puede deshacer.`,
    )
    if (!seguro) return
    setGuardando(true)
    const { error } = await supabase.from('mascotas').delete().eq('id', mascota.id)
    if (error) {
      setError(mensajeDeError(error))
      setGuardando(false)
      return
    }
    if (mascota.foto_ruta) await borrarFoto(mascota.foto_ruta)
    reemplazar('/')
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col gap-6 px-5 py-8">
      <button
        type="button"
        onClick={() => volver(destinoAlSalir)}
        className="self-start text-sm font-medium text-marca"
      >
        ← Cancelar
      </button>

      <h1 className="text-2xl font-bold text-marca">
        {editando ? `Editar a ${mascota?.nombre}` : 'Nueva mascota'}
      </h1>

      <form onSubmit={guardar} className="flex flex-col gap-5 rounded-2xl bg-white p-5 shadow-sm">
        {/* Foto */}
        <div className="flex items-center gap-4">
          <FotoMascota
            mascota={{ nombre: nombre || 'tu mascota', especie: especieFinal || 'otra' }}
            enlace={fotoVisible}
            tamano="grande"
          />
          <div className="flex flex-col items-start gap-2">
            <input
              ref={selectorFoto}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => elegirFoto(e.target.files?.[0])}
            />
            <button
              type="button"
              onClick={() => selectorFoto.current?.click()}
              disabled={preparandoFoto}
              className="rounded-full px-4 py-2 text-sm font-semibold text-marca ring-1 ring-marca"
            >
              {preparandoFoto ? 'Preparando…' : fotoVisible ? 'Cambiar foto' : 'Añadir foto'}
            </button>
            {fotoVisible && (
              <button
                type="button"
                onClick={() => setCambioFoto(fotoActual ? { tipo: 'quitar' } : { tipo: 'igual' })}
                className="px-1 text-sm text-stone-500"
              >
                Quitar foto
              </button>
            )}
          </div>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-stone-700">Nombre</span>
          <input
            className={campo}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            maxLength={40}
            required
          />
        </label>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-medium text-stone-700">Especie</legend>
          <div className="flex flex-wrap gap-2">
            {[...ESPECIES, 'Otra'].map((opcion) => (
              <button
                key={opcion}
                type="button"
                aria-pressed={especie === opcion}
                onClick={() => setEspecie(opcion)}
                className={`rounded-full px-4 py-2 text-sm font-medium ring-1 transition ${
                  especie === opcion
                    ? 'bg-marca text-white ring-marca'
                    : 'bg-white text-stone-700 ring-stone-300'
                }`}
              >
                {opcion}
              </button>
            ))}
          </div>
          {especie === 'Otra' && (
            <input
              className={campo}
              value={otraEspecie}
              onChange={(e) => setOtraEspecie(e.target.value)}
              placeholder="Por ejemplo: hurón"
              maxLength={30}
              required
              aria-label="Qué animal es"
            />
          )}
        </fieldset>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-stone-700">
            Raza <span className="font-normal text-stone-400">(opcional)</span>
          </span>
          <input
            className={campo}
            value={raza}
            onChange={(e) => setRaza(e.target.value)}
            maxLength={60}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-stone-700">
            Fecha de nacimiento <span className="font-normal text-stone-400">(opcional)</span>
          </span>
          <input
            type="date"
            className={campo}
            value={nacimiento}
            onChange={(e) => setNacimiento(e.target.value)}
            min="1980-01-02"
            max={hoyComoTexto()}
          />
          <span className="text-xs text-stone-500">Si no la sabes exacta, pon una aproximada.</span>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-stone-700">
            Notas <span className="font-normal text-stone-400">(opcional)</span>
          </span>
          <textarea
            className={`${campo} min-h-24`}
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            maxLength={2000}
            placeholder="Alergias, número de chip, veterinario…"
          />
        </label>

        {error && <p role="alert" className={avisoError}>{error}</p>}

        <button type="submit" disabled={guardando || preparandoFoto} className={botonPrincipal}>
          {guardando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Añadir mascota'}
        </button>
      </form>

      {editando && (
        <button
          type="button"
          onClick={borrarMascota}
          disabled={guardando}
          className="self-center px-4 py-2 text-sm font-medium text-red-700"
        >
          Borrar ficha
        </button>
      )}
    </main>
  )
}
