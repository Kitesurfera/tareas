import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { mensajeDeError } from '../lib/errores'
import { cuandoToca, fechaLarga } from '../lib/fechas'
import { ir, volver } from '../lib/ruta'
import { supabase } from '../lib/supabase'
import { CATEGORIAS, rutaDeOrigen, type Categoria, type Tarea } from '../lib/tipos'
import { useMascotasDelHogar } from '../lib/useMascotasDelHogar'
import { useMiembros } from '../lib/useMiembros'
import type { TareaEntendida } from '../lib/tareaNatural'
import { RAPIDAS, UNIDADES, cadaCuanto, repeticionDe, type Repeticion, type UnidadRepetir } from '../lib/repetir'
import { avisoError, botonPrincipal, campo } from './estilos'
import { RellenarConPalabras } from './RellenarConPalabras'

type Comun = {
  hogarId: string
  miUserId: string
}

// Pantalla para crear una tarea.
export function PantallaNuevaTarea(props: Comun) {
  return <Formulario {...props} />
}

// Pantalla para editar una tarea creada a mano.
export function PantallaEditarTarea({ id, ...comun }: Comun & { id: string }) {
  const [estado, setEstado] = useState<{ tarea: Tarea | null; error?: string } | null>(null)

  useEffect(() => {
    if (!supabase) return
    let vigente = true
    supabase
      .from('tareas')
      .select('*')
      .eq('id', id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!vigente) return
        setEstado(error ? { tarea: null, error: mensajeDeError(error) } : { tarea: data as Tarea | null })
      })
    return () => {
      vigente = false
    }
  }, [id])

  if (!estado) return <Aviso texto="Cargando…" />
  if (estado.error) return <Aviso texto={estado.error} />
  if (!estado.tarea) return <Aviso texto="No encontramos esta tarea en tu hogar." />
  const { tarea } = estado
  const origen = rutaDeOrigen(tarea)
  if (origen) {
    return (
      <Aviso texto="Esta tarea es automática: se cambia desde su tratamiento, rutina o vencimiento.">
        <button
          type="button"
          onClick={() => ir(origen)}
          className="rounded-full bg-linear-to-b from-marca to-[#0b5f58] shadow-[0_6px_14px_-6px_rgb(15_118_110/0.6)] px-5 py-2 font-semibold text-white"
        >
          Ir a su origen
        </button>
      </Aviso>
    )
  }
  return <Formulario tarea={tarea} {...comun} />
}

function Aviso({ texto, children }: { texto: string; children?: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col items-center justify-center gap-4 px-5 text-center text-stone-500 md:max-w-2xl md:px-6 lg:max-w-xl lg:px-10">
      <p>{texto}</p>
      {children}
    </main>
  )
}

function Formulario({ hogarId, miUserId, tarea }: Comun & { tarea?: Tarea }) {
  const { miembros } = useMiembros()
  const mascotas = useMascotasDelHogar()
  const editando = Boolean(tarea)

  const [titulo, setTitulo] = useState(tarea?.titulo ?? '')
  const [categoria, setCategoria] = useState<Categoria>(tarea?.categoria ?? 'casa')
  const [mascotaId, setMascotaId] = useState<string | null>(tarea?.mascota_id ?? null)
  const [fecha, setFecha] = useState(tarea?.fecha_limite ?? '')
  // undefined = todavía no se ha elegido (se pone «yo» al cargar la gente).
  const [responsable, setResponsable] = useState<string | null | undefined>(
    tarea ? tarea.responsable_id : undefined,
  )
  const [descripcion, setDescripcion] = useState(tarea?.descripcion ?? '')
  const [repetir, setRepetir] = useState<Repeticion | null>(tarea ? repeticionDe(tarea) : null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const miMiembroId = miembros?.find((m) => m.user_id === miUserId)?.id ?? null
  const responsableElegido =
    responsable !== undefined ? responsable : miembros ? miMiembroId : undefined

  async function guardar(evento: FormEvent) {
    evento.preventDefault()
    if (!supabase) return
    setGuardando(true)
    setError(null)
    const datos = {
      titulo: titulo.trim(),
      categoria,
      mascota_id: categoria === 'mascota' ? mascotaId : null,
      fecha_limite: fecha || null,
      responsable_id: responsableElegido ?? null,
      descripcion: descripcion.trim() || null,
      // Para repetirse hace falta una fecha.
      repetir_cada: fecha && repetir ? repetir.cada : null,
      repetir_unidad: fecha && repetir ? repetir.unidad : null,
      repetir_desde: fecha && repetir ? repetir.desde : null,
    }
    const { error } = tarea
      ? await supabase.from('tareas').update(datos).eq('id', tarea.id)
      : await supabase.from('tareas').insert({ hogar_id: hogarId, ...datos })
    if (error) {
      setError(mensajeDeError(error))
      setGuardando(false)
      return
    }
    volver('/tareas')
  }

  async function borrar() {
    if (!supabase || !tarea) return
    if (!window.confirm(`¿Borrar «${tarea.titulo}»? No se puede deshacer.`)) return
    setGuardando(true)
    const { error } = await supabase.from('tareas').delete().eq('id', tarea.id)
    if (error) {
      setError(mensajeDeError(error))
      setGuardando(false)
      return
    }
    volver('/tareas')
  }

  // Lo que ha entendido la IA de «✨ Dímelo con tus palabras» rellena el formulario.
  function rellenarCon(entendida: TareaEntendida) {
    setTitulo(entendida.titulo)
    setCategoria(entendida.categoria)
    setMascotaId(entendida.mascota_id)
    setFecha(entendida.fecha ?? '')
    // Si no dice quién, se queda quien estaba elegido (al empezar, tú).
    if (entendida.responsable) setResponsable(entendida.responsable.id)
    if (entendida.detalles) setDescripcion(entendida.detalles)
  }

  const chip = (activo: boolean) =>
    `rounded-full px-4 py-2 text-sm font-medium ring-1 transition ${
      activo ? 'bg-marca text-white ring-marca' : 'bg-white text-stone-700 ring-stone-300'
    }`

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col gap-6 px-5 py-8 md:max-w-2xl md:px-6 lg:max-w-xl lg:px-10 lg:py-10">
      <button
        type="button"
        onClick={() => volver('/tareas')}
        className="self-start text-sm font-medium text-marca"
      >
        ← Cancelar
      </button>

      <h1 className="text-2xl font-extrabold text-marca">{editando ? 'Editar tarea' : 'Nueva tarea'}</h1>

      {!editando && (
        <RellenarConPalabras
          // Solo id y nombre: es lo único que necesita la IA para entender «Bea» o «Luna».
          personas={miembros?.map((m) => ({ id: m.id, nombre: m.nombre_visible, yo: m.user_id === miUserId })) ?? null}
          mascotas={mascotas?.map((m) => ({ id: m.id, nombre: m.nombre })) ?? null}
          onEntendida={rellenarCon}
        />
      )}

      <form onSubmit={guardar} className="tarjeta flex flex-col gap-5">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-stone-700">¿Qué hay que hacer?</span>
          <input
            className={campo}
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Por ejemplo: Renovar el seguro del coche"
            maxLength={120}
            required
          />
        </label>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-medium text-stone-700">Categoría</legend>
          <div className="flex flex-wrap gap-2">
            {CATEGORIAS.map((opcion) => (
              <button
                key={opcion.valor}
                type="button"
                aria-pressed={categoria === opcion.valor}
                onClick={() => setCategoria(opcion.valor)}
                className={chip(categoria === opcion.valor)}
              >
                <span aria-hidden="true">{opcion.dibujo}</span> {opcion.texto}
              </button>
            ))}
          </div>
        </fieldset>

        {categoria === 'mascota' && mascotas && mascotas.length > 0 && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1.5 text-sm font-medium text-stone-700">¿De qué mascota?</legend>
            <div className="flex flex-wrap gap-2">
              {mascotas.map((mascota) => (
                <button
                  key={mascota.id}
                  type="button"
                  aria-pressed={mascotaId === mascota.id}
                  onClick={() => setMascotaId(mascota.id)}
                  className={chip(mascotaId === mascota.id)}
                >
                  {mascota.nombre}
                </button>
              ))}
              <button
                type="button"
                aria-pressed={mascotaId === null}
                onClick={() => setMascotaId(null)}
                className={chip(mascotaId === null)}
              >
                Ninguna en concreto
              </button>
            </div>
          </fieldset>
        )}

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-stone-700">
            ¿Para cuándo? <span className="font-normal text-stone-400">(opcional)</span>
          </span>
          <div className="flex gap-2">
            <input
              type="date"
              className={campo}
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              min="2000-01-01"
            />
            {fecha && (
              <button
                type="button"
                onClick={() => setFecha('')}
                className="shrink-0 px-2 text-sm text-stone-500"
              >
                Quitar
              </button>
            )}
          </div>
          {fecha && (
            <span className="text-xs text-stone-500">
              {fechaLarga(fecha)} · {cuandoToca(fecha).toLowerCase()}
            </span>
          )}
        </label>

        <SeRepite repetir={repetir} onCambiar={setRepetir} hayFecha={Boolean(fecha)} chip={chip} />

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
            Detalles <span className="font-normal text-stone-400">(opcional)</span>
          </span>
          <textarea
            className={`${campo} min-h-20`}
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            maxLength={2000}
            placeholder="Teléfono, enlace, lo que haga falta recordar…"
          />
        </label>

        {error && <p role="alert" className={avisoError}>{error}</p>}

        <button type="submit" disabled={guardando} className={botonPrincipal}>
          {guardando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear tarea'}
        </button>
      </form>

      {editando && (
        <button
          type="button"
          onClick={borrar}
          disabled={guardando}
          className="self-center px-4 py-2 text-sm font-medium text-red-700"
        >
          Borrar tarea
        </button>
      )}
    </main>
  )
}

// 🔁 ¿Se repite? Cada cuánto y desde cuándo se cuenta la siguiente vez.
function SeRepite({
  repetir,
  onCambiar,
  hayFecha,
  chip,
}: {
  repetir: Repeticion | null
  onCambiar: (r: Repeticion | null) => void
  hayFecha: boolean
  chip: (activo: boolean) => string
}) {
  const desde = repetir?.desde ?? 'fecha'
  const esRapida = (cada: number, unidad: UnidadRepetir) => repetir?.cada === cada && repetir.unidad === unidad
  const otra = repetir !== null && !RAPIDAS.some((x) => esRapida(x.cada, x.unidad))
  const [personalizada, setPersonalizada] = useState(otra)

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 text-sm font-medium text-stone-700">🔁 ¿Se repite?</legend>
      {!hayFecha && <p className="text-xs text-stone-500">Para que se repita, elige antes para cuándo es la primera vez.</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" aria-pressed={repetir === null} onClick={() => { setPersonalizada(false); onCambiar(null) }} className={chip(repetir === null)}>
          No
        </button>
        {RAPIDAS.map((x) => {
          const texto = cadaCuanto(x.cada, x.unidad)
          return (
            <button
              key={`${x.cada}-${x.unidad}`}
              type="button"
              disabled={!hayFecha}
              aria-pressed={esRapida(x.cada, x.unidad) && !personalizada}
              onClick={() => {
                setPersonalizada(false)
                onCambiar({ cada: x.cada, unidad: x.unidad, desde })
              }}
              className={`${chip(esRapida(x.cada, x.unidad) && !personalizada)} disabled:opacity-40`}
            >
              {texto.charAt(0).toUpperCase() + texto.slice(1)}
            </button>
          )
        })}
        <button
          type="button"
          disabled={!hayFecha}
          aria-pressed={personalizada}
          onClick={() => {
            setPersonalizada(true)
            onCambiar(repetir ?? { cada: 10, unidad: 'dias', desde })
          }}
          className={`${chip(personalizada)} disabled:opacity-40`}
        >
          Otro…
        </button>
      </div>
      {personalizada && repetir && (
        <div className="flex items-center gap-2 text-sm text-stone-700">
          Cada
          <input
            type="number"
            min={1}
            max={365}
            inputMode="numeric"
            aria-label="Cada cuántos"
            className={`${campo} w-20 py-2`}
            value={repetir.cada}
            onChange={(e) => onCambiar({ ...repetir, cada: Math.min(365, Math.max(1, Number(e.target.value) || 1)) })}
          />
          <select aria-label="Días, semanas, meses o años" className={`${campo} w-36 py-2`} value={repetir.unidad} onChange={(e) => onCambiar({ ...repetir, unidad: e.target.value as UnidadRepetir })}>
            {UNIDADES.map((u) => (
              <option key={u.valor} value={u.valor}>
                {repetir.cada === 1 ? u.una : u.varias}
              </option>
            ))}
          </select>
        </div>
      )}
      {repetir && hayFecha && (
        <div className="flex flex-col gap-2 rounded-2xl bg-stone-50 p-3" role="radiogroup" aria-label="Desde cuándo se cuenta la siguiente vez">
          <label className="flex items-start gap-2 text-sm">
            <input type="radio" name="repetir-desde" className="mt-1 accent-marca" checked={desde === 'fecha'} onChange={() => onCambiar({ ...repetir, desde: 'fecha' })} />
            <span>
              <b>En su fecha</b> <span className="text-stone-500">· como el alquiler: siempre el mismo día, aunque lo hagas tarde</span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="radio" name="repetir-desde" className="mt-1 accent-marca" checked={desde === 'hecha'} onChange={() => onCambiar({ ...repetir, desde: 'hecha' })} />
            <span>
              <b>Desde que se hace</b> <span className="text-stone-500">· como cambiar el cepillo: se cuenta desde el día en que la marcas</span>
            </span>
          </label>
          <p className="text-xs text-stone-500">Al marcarla como hecha, saldrá sola la siguiente.</p>
        </div>
      )}
    </fieldset>
  )
}
