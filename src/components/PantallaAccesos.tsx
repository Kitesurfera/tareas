import { useEffect, useState, type FormEvent } from 'react'
import {
  accesoCubre,
  enlaceDeAcceso,
  estadoAcceso,
  useAccesos,
  useNotasEncargo,
  type Acceso,
} from '../lib/accesos'
import { compartir } from '../lib/compartir'
import { mensajeDeError } from '../lib/errores'
import { cuandoToca, diasHasta, hoyComoTexto, sumarDias } from '../lib/fechas'
import { ir, reemplazar, volver } from '../lib/ruta'
import { supabase } from '../lib/supabase'
import { CATEGORIAS, type Categoria, type Tarea } from '../lib/tipos'
import { useMascotasDelHogar } from '../lib/useMascotasDelHogar'
import { diaMes } from '../lib/viajes'
import { avisoError, botonPrincipal, botonSecundario, campo, estiloChip } from './estilos'

const DIAS_MAXIMOS = 92

type Props = {
  nombreHogar: string
}

function textoEstado(acceso: Acceso): { texto: string; color: string } {
  switch (estadoAcceso(acceso)) {
    case 'terminado':
      return { texto: 'Terminado', color: 'text-stone-400' }
    case 'sin aceptar':
      return { texto: '⏳ Aún no ha abierto el enlace', color: 'text-amber-700' }
    case 'futuro':
      return { texto: `Empieza ${cuandoToca(acceso.desde).toLowerCase()}`, color: 'text-stone-500' }
    default:
      return { texto: `✅ Activo hasta el ${diaMes(acceso.hasta)}`, color: 'text-marca' }
  }
}

// «🐾 Mascota · 🏠 Casa · 3 cosas elegidas»
function textoQueVe(acceso: Acceso): string {
  const tipos = CATEGORIAS.filter((c) => acceso.categorias.includes(c.valor)).map((c) => `${c.dibujo} ${c.texto}`)
  const sueltas = acceso.tareas.length + acceso.rutinas.length + acceso.tratamientos.length
  if (sueltas > 0) tipos.push(sueltas === 1 ? '1 cosa elegida' : `${sueltas} cosas elegidas`)
  return tipos.join(' · ')
}

function textoParaCompartir(acceso: Acceso, nombreHogar: string): string {
  return `Te doy acceso a algunas tareas de «${nombreHogar}» en Tareas, del ${diaMes(acceso.desde)} al ${diaMes(acceso.hasta)}. Entra con este enlace (es solo para ti, no lo reenvíes):`
}

function BotonCompartir({ acceso, nombreHogar, principal }: { acceso: Acceso; nombreHogar: string; principal?: boolean }) {
  const [estado, setEstado] = useState<string | null>(null)
  async function pulsar() {
    const resultado = await compartir(
      'Acceso a Tareas',
      textoParaCompartir(acceso, nombreHogar),
      enlaceDeAcceso(acceso.codigo),
    )
    if (resultado === 'copiado') setEstado('¡Copiado! Pégalo en WhatsApp o donde quieras.')
    if (resultado === 'error') setEstado('No se ha podido copiar el enlace.')
  }
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={pulsar}
        className={
          principal
            ? botonPrincipal
            : 'rounded-full px-3 py-1.5 text-sm font-semibold text-marca ring-1 ring-marca active:scale-[0.98]'
        }
      >
        Compartir enlace
      </button>
      {estado && <span className="text-sm text-stone-600">{estado}</span>}
    </div>
  )
}

// #/accesos: los accesos temporales del hogar y las notas que os dejan.
export function PantallaAccesos({ nombreHogar }: Props) {
  const { accesos, error, recargar } = useAccesos()
  const { notas, recargar: recargarNotas } = useNotasEncargo(30)
  const [fallo, setFallo] = useState<string | null>(null)

  async function quitar(acceso: Acceso) {
    if (!supabase) return
    if (!window.confirm(`¿Quitar el acceso de ${acceso.nombre}? Dejará de ver sus encargos en ese mismo momento.`)) return
    const { error } = await supabase.from('accesos').delete().eq('id', acceso.id)
    if (error) return setFallo(mensajeDeError(error))
    recargar()
  }

  async function borrarNota(id: string) {
    if (!supabase) return
    if (!window.confirm('¿Borrar esta nota?')) return
    const { error } = await supabase.from('notas_encargo').delete().eq('id', id)
    if (error) return setFallo(mensajeDeError(error))
    recargarNotas()
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col gap-5 px-5 py-8">
      <button type="button" onClick={() => volver('/ajustes')} className="self-start text-sm font-medium text-marca">
        ← Ajustes
      </button>
      <h1 className="text-2xl font-bold text-marca">🔑 Acceso temporal</h1>

      <section className="rounded-2xl bg-marca-suave p-5 text-sm text-stone-800">
        <p>
          Para quien os eche una mano unos días (cuidar a la mascota, regar…). <strong>Solo ve las tareas
          que elijáis</strong> y la ficha de esas mascotas, puede marcarlas como hechas y dejaros notas.
          No ve nada más del hogar.
        </p>
        <p className="mt-2">Entra con su cuenta de Google desde un enlace que solo vale para esa persona.</p>
      </section>

      <button type="button" onClick={() => ir('/accesos/nuevo')} className={botonPrincipal}>
        + Dar acceso temporal
      </button>

      {(error || fallo) && <p role="alert" className={avisoError}>{fallo ?? 'No se han podido cargar los accesos.'}</p>}
      {accesos === null && !error && <p className="text-center text-stone-400">Cargando…</p>}
      {accesos?.length === 0 && (
        <p className="rounded-2xl bg-white p-5 text-center text-stone-500 shadow-sm">Aún no habéis dado ningún acceso.</p>
      )}

      {accesos && accesos.length > 0 && (
        <ul className="flex flex-col gap-3">
          {accesos.map((acceso) => {
            const estado = textoEstado(acceso)
            const terminado = estadoAcceso(acceso) === 'terminado'
            return (
              <li key={acceso.id} className="rounded-2xl bg-white p-4 shadow-sm">
                <button
                  type="button"
                  onClick={() => ir(`/accesos/${acceso.id}/editar`)}
                  className="flex w-full items-start gap-3 text-left"
                >
                  <span aria-hidden="true" className="text-2xl leading-none">🔑</span>
                  <span className="flex-1">
                    <span className="block font-medium">{acceso.nombre}</span>
                    <span className="block text-sm text-stone-600">
                      {diaMes(acceso.desde)} – {diaMes(acceso.hasta)} · {textoQueVe(acceso)}
                    </span>
                    <span className={`block text-sm font-medium ${estado.color}`}>{estado.texto}</span>
                  </span>
                  <span aria-hidden="true" className="text-stone-400">›</span>
                </button>
                <div className="mt-3 flex flex-wrap items-start gap-2 pl-9">
                  {!terminado && <BotonCompartir acceso={acceso} nombreHogar={nombreHogar} />}
                  <button
                    type="button"
                    onClick={() => quitar(acceso)}
                    className="rounded-full px-3 py-1.5 text-sm text-red-700 ring-1 ring-red-200"
                  >
                    {terminado ? 'Borrar' : 'Quitar acceso'}
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {notas && notas.length > 0 && (
        <section className="rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="font-semibold">📝 Notas de quien os ayuda</h2>
          <ul className="mt-2 divide-y divide-stone-100">
            {notas.map((nota) => (
              <li key={nota.id} className="flex items-start gap-3 py-3">
                <span className="flex-1">
                  <span className="block text-sm text-stone-500">
                    {nota.autora} ·{' '}
                    {new Date(nota.creado_en).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                    {nota.tarea_titulo && ` · al hacer «${nota.tarea_titulo}»`}
                  </span>
                  <span className="block whitespace-pre-line">{nota.texto}</span>
                </span>
                <button
                  type="button"
                  onClick={() => borrarNota(nota.id)}
                  aria-label="Borrar nota"
                  className="shrink-0 text-sm text-stone-400"
                >
                  Borrar
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}

type PropsFormulario = {
  hogarId: string
  nombreHogar: string
  // Vacío = acceso nuevo.
  id?: string
}

type Cosa = { id: string; texto: string; categoria: Categoria }

// #/accesos/nuevo y #/accesos/<id>/editar
export function FormularioAcceso({ hogarId, nombreHogar, id }: PropsFormulario) {
  const mascotas = useMascotasDelHogar()
  const [cargado, setCargado] = useState(!id)
  const [nombre, setNombre] = useState('')
  const [desde, setDesde] = useState(hoyComoTexto)
  const [hasta, setHasta] = useState(() => sumarDias(hoyComoTexto(), 7))
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [tareas, setTareas] = useState<string[]>([])
  const [rutinas, setRutinas] = useState<string[]>([])
  const [tratamientos, setTratamientos] = useState<string[]>([])
  const [pendientes, setPendientes] = useState<Tarea[] | null>(null)
  const [listaRutinas, setListaRutinas] = useState<{ id: string; nombre: string }[]>([])
  const [listaTratamientos, setListaTratamientos] = useState<{ id: string; nombre: string; mascota_id: string }[]>([])
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Al crear un acceso, después de guardar sale el botón de compartir.
  const [creado, setCreado] = useState<Acceso | null>(null)

  // Lo que se puede elegir una a una.
  useEffect(() => {
    if (!supabase) return
    let vigente = true
    Promise.all([
      supabase.from('tareas').select('*').eq('completada', false).order('fecha_limite', { nullsFirst: false }),
      supabase.from('rutinas').select('id, nombre').order('nombre'),
      supabase.from('tratamientos').select('id, nombre, mascota_id').order('nombre'),
    ]).then(([t, r, tr]) => {
      if (!vigente) return
      setPendientes((t.data ?? []) as Tarea[])
      setListaRutinas((r.data ?? []) as { id: string; nombre: string }[])
      setListaTratamientos((tr.data ?? []) as { id: string; nombre: string; mascota_id: string }[])
    })
    return () => {
      vigente = false
    }
  }, [])

  // Al editar, cargamos el acceso.
  useEffect(() => {
    if (!supabase || !id) return
    let vigente = true
    supabase
      .from('accesos')
      .select('id, nombre, codigo, user_id, desde, hasta, categorias, tareas, rutinas, tratamientos')
      .eq('id', id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!vigente) return
        const acceso = data as Acceso | null
        if (error || !acceso) {
          setError(error ? mensajeDeError(error) : 'No encontramos este acceso. Puede que ya se haya quitado.')
        } else {
          setNombre(acceso.nombre)
          setDesde(acceso.desde)
          setHasta(acceso.hasta)
          setCategorias(acceso.categorias)
          setTareas(acceso.tareas)
          setRutinas(acceso.rutinas)
          setTratamientos(acceso.tratamientos)
        }
        setCargado(true)
      })
    return () => {
      vigente = false
    }
  }, [id])

  const nombreMascota = (mascotaId: string) => mascotas?.find((m) => m.id === mascotaId)?.nombre
  const sueltas: Cosa[] = (pendientes ?? [])
    .filter((t) => !t.rutina_id && !t.tratamiento_id && !t.vencimiento_id)
    .map((t) => ({ id: t.id, texto: t.titulo, categoria: t.categoria }))
  const grupos: { titulo: string; cosas: Cosa[]; elegidas: string[]; cambiar: (ids: string[]) => void }[] = [
    {
      titulo: '🔄 Rutinas de casa',
      cosas: listaRutinas.map((r) => ({ id: r.id, texto: r.nombre, categoria: 'casa' })),
      elegidas: rutinas,
      cambiar: setRutinas,
    },
    {
      titulo: '💊 Tratamientos de las mascotas',
      cosas: listaTratamientos.map((t) => ({
        id: t.id,
        texto: nombreMascota(t.mascota_id) ? `${t.nombre} (${nombreMascota(t.mascota_id)})` : t.nombre,
        categoria: 'mascota',
      })),
      elegidas: tratamientos,
      cambiar: setTratamientos,
    },
    { titulo: '📝 Tareas sueltas', cosas: sueltas, elegidas: tareas, cambiar: setTareas },
  ]

  // Cuántas tareas pendientes vería con lo elegido (para que se vea el efecto).
  const borrador: Acceso = { id: '', nombre, codigo: '', user_id: null, desde, hasta, categorias, tareas, rutinas, tratamientos }
  const dia = desde > hoyComoTexto() ? desde : hoyComoTexto()
  const veria = pendientes?.filter((t) => accesoCubre(borrador, t, dia)).length ?? 0

  function alternarCategoria(valor: Categoria) {
    setError(null)
    setCategorias(categorias.includes(valor) ? categorias.filter((c) => c !== valor) : [...categorias, valor])
  }

  async function guardar(evento: FormEvent) {
    evento.preventDefault()
    if (!supabase) return
    if (!nombre.trim()) return setError('Escribe a quién le das acceso.')
    if (!desde || !hasta) return setError('Elige desde y hasta cuándo.')
    if (hasta < desde) return setError('El último día no puede ser antes que el primero.')
    if (diasHasta(hasta) < 0) return setError('Ese acceso ya habría terminado: elige un último día de hoy en adelante.')
    if (diasHasta(hasta) - diasHasta(desde) > DIAS_MAXIMOS) return setError('Un acceso temporal dura como mucho 3 meses.')
    if (categorias.length + tareas.length + rutinas.length + tratamientos.length === 0) {
      return setError('Elige qué tareas podrá ver: un tipo entero o alguna cosa suelta.')
    }
    setGuardando(true)
    setError(null)
    const datos = { nombre: nombre.trim(), desde, hasta, categorias, tareas, rutinas, tratamientos }
    if (id) {
      const { error } = await supabase.from('accesos').update(datos).eq('id', id)
      setGuardando(false)
      if (error) return setError(mensajeDeError(error))
      return reemplazar('/accesos')
    }
    const { data, error } = await supabase
      .from('accesos')
      .insert({ ...datos, hogar_id: hogarId })
      .select('id, nombre, codigo, user_id, desde, hasta, categorias, tareas, rutinas, tratamientos')
      .single()
    setGuardando(false)
    if (error) return setError(mensajeDeError(error))
    setCreado(data as Acceso)
  }

  if (creado) {
    return (
      <main className="mx-auto flex min-h-svh max-w-md flex-col gap-5 px-5 py-8">
        <h1 className="text-2xl font-bold text-marca">¡Listo! 🔑</h1>
        <section className="flex flex-col gap-3 rounded-2xl bg-white p-5 shadow-sm">
          <p>
            Ahora mándale el enlace a <strong>{creado.nombre}</strong>. Tendrá que entrar con su cuenta de Google y, del{' '}
            {diaMes(creado.desde)} al {diaMes(creado.hasta)}, verá sus encargos.
          </p>
          <p className="text-sm text-stone-600">
            El enlace solo vale para la primera persona que lo abra. Si se lo mandas a alguien por error, quita el
            acceso y crea otro.
          </p>
          <BotonCompartir acceso={creado} nombreHogar={nombreHogar} principal />
        </section>
        <button type="button" onClick={() => reemplazar('/accesos')} className={botonSecundario}>
          Volver a los accesos
        </button>
      </main>
    )
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col gap-5 px-5 py-8">
      <button type="button" onClick={() => volver('/accesos')} className="self-start text-sm font-medium text-marca">
        ← Accesos
      </button>
      <h1 className="text-2xl font-bold text-marca">{id ? 'Cambiar acceso' : 'Dar acceso temporal'}</h1>

      {(!cargado || pendientes === null) && !error && <p className="text-center text-stone-400">Cargando…</p>}

      {cargado && pendientes !== null && (
        <form onSubmit={guardar} className="flex flex-col gap-5 rounded-2xl bg-white p-5 shadow-sm">
          <label className="flex flex-col gap-1 text-sm font-medium text-stone-700">
            ¿A quién?
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              maxLength={40}
              placeholder="Marta (vecina)"
              className={campo}
              required
            />
          </label>

          <div className="flex gap-3">
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm font-medium text-stone-700">
              Desde
              <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={campo} required />
            </label>
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm font-medium text-stone-700">
              Hasta
              <input
                type="date"
                value={hasta}
                min={desde || undefined}
                max={desde ? sumarDias(desde, DIAS_MAXIMOS) : undefined}
                onChange={(e) => setHasta(e.target.value)}
                className={campo}
                required
              />
            </label>
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium text-stone-700">¿Qué tareas podrá ver? Tipos enteros:</legend>
            <div className="flex flex-wrap gap-2">
              {CATEGORIAS.map((c) => (
                <button
                  key={c.valor}
                  type="button"
                  aria-pressed={categorias.includes(c.valor)}
                  onClick={() => alternarCategoria(c.valor)}
                  className={estiloChip(categorias.includes(c.valor))}
                >
                  {c.dibujo} {c.texto}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-sm font-medium text-stone-700">…o elige cosas sueltas:</legend>
            {grupos.map((grupo) =>
              grupo.cosas.length === 0 ? null : (
                <div key={grupo.titulo}>
                  <p className="text-sm text-stone-500">{grupo.titulo}</p>
                  <ul className="mt-1 flex flex-col">
                    {grupo.cosas.map((cosa) => {
                      const porTipo = categorias.includes(cosa.categoria)
                      return (
                        <li key={cosa.id}>
                          <label className={`flex items-center gap-3 py-1.5 ${porTipo ? 'text-stone-400' : ''}`}>
                            <input
                              type="checkbox"
                              className="h-5 w-5 accent-marca"
                              checked={porTipo || grupo.elegidas.includes(cosa.id)}
                              disabled={porTipo}
                              onChange={(e) => {
                                setError(null)
                                grupo.cambiar(
                                  e.target.checked
                                    ? [...grupo.elegidas, cosa.id]
                                    : grupo.elegidas.filter((x) => x !== cosa.id),
                                )
                              }}
                            />
                            <span>{cosa.texto}</span>
                          </label>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ),
            )}
          </fieldset>

          <p className="rounded-xl bg-stone-50 p-3 text-sm text-stone-700">
            {veria === 0
              ? 'Con esto, ahora mismo no vería ninguna tarea pendiente.'
              : `Con esto vería ${veria === 1 ? '1 tarea pendiente' : `${veria} tareas pendientes`} (y las que vayan saliendo hasta el ${hasta ? diaMes(hasta) : '…'}).`}
          </p>

          {error && <p role="alert" className={avisoError}>{error}</p>}

          <button type="submit" disabled={guardando} className={botonPrincipal}>
            {guardando ? 'Guardando…' : id ? 'Guardar cambios' : 'Crear acceso'}
          </button>
        </form>
      )}
      {error && !cargado && <p role="alert" className={avisoError}>{error}</p>}
    </main>
  )
}
