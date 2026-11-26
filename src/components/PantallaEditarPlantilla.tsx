import { useState, type FormEvent } from 'react'
import {
  borrarPlantilla,
  buscarPlantilla,
  guardarPlantilla,
  plantillaConIA,
  sufijoPlan,
  textoDias,
  usePlanDeAgenda,
  usePlantillas,
  type PlantillaParaGuardar,
} from '../lib/plantillas'
import { reemplazar, volver } from '../lib/ruta'
import { CATEGORIAS, type Categoria } from '../lib/tipos'
import { useDictado } from '../lib/useDictado'
import { avisoError, botonPrincipal, botonSecundario, campo, campoBase } from './estilos'

export type ModoEditor = 'nueva' | 'editar' | 'copiar' | 'ia'

type Props = { hogarId: string; modo: ModoEditor; clave?: string; agendaId?: string | null }

// #/plantillas/nueva · #/plantillas/<id>/editar · #/plantillas/copiar/<clave>
// · #/plantillas/ia[/plan/<id>] (la IA propone y aquí se revisa).
export function PantallaEditarPlantilla({ hogarId, modo, clave, agendaId = null }: Props) {
  const { datos, error } = usePlantillas()
  const delPlan = usePlanDeAgenda(agendaId)
  if (!datos || delPlan === undefined) return <Mensaje>{error ?? 'Cargando…'}</Mensaje>
  const origen = clave ? buscarPlantilla(clave, datos.vuestras) : null
  if ((modo === 'editar' || modo === 'copiar') && !origen) return <Mensaje>No encontramos esta plantilla.</Mensaje>
  const inicial: PlantillaParaGuardar | null = origen
    ? { nombre: modo === 'copiar' ? `${origen.nombre} (nuestra)` : origen.nombre, dibujo: origen.dibujo, pregunta: origen.pregunta, tareas: origen.tareas }
    : null
  return (
    <Editor
      key={`${modo}-${clave ?? ''}`}
      hogarId={hogarId}
      modo={modo}
      id={modo === 'editar' ? (origen?.id ?? null) : null}
      inicial={inicial}
      agendaId={agendaId}
      textoInicial={delPlan ? [delPlan.plan.nombre, delPlan.plan.notas].filter(Boolean).join('. ').slice(0, 300) : ''}
      planId={delPlan?.plan.id ?? null}
      avisoCarga={error}
    />
  )
}

function Mensaje({ children }: { children: string }) {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md items-center justify-center px-5 text-center text-stone-500 md:max-w-2xl">
      <p>{children}</p>
    </main>
  )
}

type Unidad = 'dias' | 'semanas'
type Cuando = 'antes' | 'mismo' | 'despues'
type Fila = { clave: number; titulo: string; categoria: Categoria; cantidad: number; unidad: Unidad; cuando: Cuando }

function aFila(t: { titulo: string; categoria: Categoria; dias: number }, clave: number): Fila {
  const n = Math.abs(t.dias)
  const semanas = n > 0 && n % 7 === 0
  return { clave, titulo: t.titulo, categoria: t.categoria, cantidad: semanas ? n / 7 : n, unidad: semanas ? 'semanas' : 'dias', cuando: t.dias === 0 ? 'mismo' : t.dias < 0 ? 'antes' : 'despues' }
}

function diasDe(f: Fila): number {
  if (f.cuando === 'mismo') return 0
  const n = Math.round(Math.abs(f.cantidad)) * (f.unidad === 'semanas' ? 7 : 1)
  return f.cuando === 'antes' ? -n : n
}

const DIBUJOS = ['📋', '🎉', '✈️', '🏠', '🎂', '🍖', '🎄', '🧳', '💍', '🐶', '📦', '🏕️', '🎒', '🥂']
let siguienteClave = 1

function Editor({
  hogarId,
  modo,
  id,
  inicial,
  agendaId,
  textoInicial,
  planId,
  avisoCarga,
}: {
  hogarId: string
  modo: ModoEditor
  id: string | null
  inicial: PlantillaParaGuardar | null
  agendaId: string | null
  textoInicial: string
  planId: string | null
  avisoCarga: string | null
}) {
  const [nombre, setNombre] = useState(inicial?.nombre ?? '')
  const [dibujo, setDibujo] = useState(inicial?.dibujo ?? '📋')
  const [pregunta, setPregunta] = useState(inicial?.pregunta ?? '¿Para cuándo?')
  const [filas, setFilas] = useState<Fila[]>(() => (inicial?.tareas ?? [{ titulo: '', categoria: 'otros' as Categoria, dias: -7 }]).map((t) => aFila(t, siguienteClave++)))
  // Con la IA, el editor sale cuando ya ha propuesto algo.
  const [propuesta, setPropuesta] = useState(modo !== 'ia')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const validas = filas.filter((f) => f.titulo.trim())
  const puedeGuardar = nombre.trim() && validas.length > 0 && validas.length <= 40 && !guardando

  function rellenar(p: PlantillaParaGuardar) {
    setNombre(p.nombre)
    setDibujo(p.dibujo)
    setPregunta(p.pregunta)
    setFilas(p.tareas.map((t) => aFila(t, siguienteClave++)))
    setPropuesta(true)
  }

  function cambiar(clave: number, cambio: Partial<Fila>) {
    setFilas((antes) => antes.map((f) => (f.clave === clave ? { ...f, ...cambio } : f)))
  }

  async function guardar(evento: FormEvent, usarDespues: boolean) {
    evento.preventDefault()
    if (!puedeGuardar) return
    setGuardando(true)
    setError(null)
    const tareas = validas.map((f) => ({ titulo: f.titulo.trim().slice(0, 120), categoria: f.categoria, dias: Math.max(-730, Math.min(730, diasDe(f))) }))
    const { id: guardada, error } = await guardarPlantilla(hogarId, { nombre, dibujo, pregunta, tareas }, id)
    setGuardando(false)
    if (error || !guardada) return setError(error ?? 'No se ha podido guardar.')
    reemplazar(usarDespues ? `/plantillas/usar/${guardada}${sufijoPlan(agendaId)}` : '/plantillas')
  }

  async function borrar() {
    if (!id || !window.confirm(`¿Borrar la plantilla «${nombre}»? Lo que ya creasteis con ella se queda.`)) return
    setGuardando(true)
    const fallo = await borrarPlantilla(id)
    setGuardando(false)
    if (fallo) return setError(fallo)
    reemplazar('/plantillas')
  }

  const titulo = { nueva: 'Nueva plantilla', editar: 'Editar plantilla', copiar: 'Vuestra versión', ia: '✨ Hazme una plantilla' }[modo]

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col gap-5 px-5 py-8 md:max-w-2xl md:px-6 lg:max-w-3xl lg:px-10 lg:py-10">
      <button type="button" onClick={() => volver(agendaId ? '/planes' : '/plantillas')} className="self-start text-sm font-medium text-marca">
        ← Cancelar
      </button>
      <h1 className="text-2xl font-extrabold text-tareas-tinta">{titulo}</h1>
      {modo === 'copiar' && <p className="-mt-3 text-sm text-stone-600">Cámbiala a vuestro gusto: se guarda como vuestra y la sugerida se queda como estaba.</p>}
      {avisoCarga && <p role="alert" className={avisoError}>{avisoCarga}</p>}

      {modo === 'ia' && <PedirALaIA textoInicial={textoInicial} hayPropuesta={propuesta} onPropuesta={rellenar} />}

      {propuesta && (
        <form onSubmit={(e) => guardar(e, false)} className="flex flex-col gap-5">
          <section className="tarjeta flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-stone-700">Nombre</span>
              <input className={campo} value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={60} required placeholder="Por ejemplo: Nuestra Navidad" />
            </label>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-semibold text-stone-700">Dibujo</legend>
              <div className="flex flex-wrap items-center gap-1.5">
                {DIBUJOS.map((d) => (
                  <button key={d} type="button" aria-pressed={dibujo === d} aria-label={`Dibujo ${d}`} onClick={() => setDibujo(d)} className={`flex h-10 w-10 items-center justify-center rounded-xl text-xl ring-1 ${dibujo === d ? 'bg-tareas ring-2 ring-tareas-tinta' : 'bg-white ring-stone-200'}`}>
                    {d}
                  </button>
                ))}
                <input className={`${campoBase} w-20 px-3 text-center text-xl`} value={dibujo} onChange={(e) => setDibujo(e.target.value.slice(0, 8))} aria-label="Otro dibujo (un emoji)" />
              </div>
            </fieldset>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-stone-700">La pregunta del día clave</span>
              <input className={campo} value={pregunta} onChange={(e) => setPregunta(e.target.value)} maxLength={80} placeholder="¿Cuándo es la mudanza?" />
              <span className="text-xs text-stone-500">Al usarla, la app pregunta esto y calcula la fecha de cada tarea desde ese día.</span>
            </label>
          </section>

          <section aria-labelledby="titulo-tareas-editor" className="tarjeta flex flex-col gap-3">
            <h2 id="titulo-tareas-editor" className="text-lg font-bold">
              Tareas <span className="text-sm font-normal text-stone-500">({validas.length})</span>
            </h2>
            <ul className="flex flex-col gap-3">
              {filas.map((f, i) => (
                <li key={f.clave} className="flex flex-col gap-2 rounded-2xl bg-stone-50 p-3 ring-1 ring-stone-900/5">
                  <div className="flex items-center gap-2">
                    <input className={`${campoBase} min-w-0 flex-1 px-3 py-2`} value={f.titulo} onChange={(e) => cambiar(f.clave, { titulo: e.target.value })} maxLength={120} aria-label={`Tarea ${i + 1}`} placeholder="Por ejemplo: Comprar cajas" />
                    <button type="button" onClick={() => setFilas((antes) => antes.filter((x) => x.clave !== f.clave))} aria-label={`Quitar tarea ${i + 1}`} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-stone-500 hover:bg-stone-200">
                      ✕
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <select value={f.categoria} onChange={(e) => cambiar(f.clave, { categoria: e.target.value as Categoria })} aria-label={`Tipo de la tarea ${i + 1}`} className="rounded-xl bg-white px-2 py-1.5 ring-1 ring-stone-300">
                      {CATEGORIAS.map((c) => (
                        <option key={c.valor} value={c.valor}>
                          {c.dibujo} {c.texto}
                        </option>
                      ))}
                    </select>
                    {f.cuando !== 'mismo' && (
                      <>
                        <input type="number" min={1} max={f.unidad === 'semanas' ? 104 : 730} value={f.cantidad} onChange={(e) => cambiar(f.clave, { cantidad: Math.max(0, Number(e.target.value) || 0) })} aria-label={`Cuántos, tarea ${i + 1}`} className="w-16 rounded-xl bg-white px-2 py-1.5 ring-1 ring-stone-300" />
                        <select value={f.unidad} onChange={(e) => cambiar(f.clave, { unidad: e.target.value as Unidad })} aria-label={`Días o semanas, tarea ${i + 1}`} className="rounded-xl bg-white px-2 py-1.5 ring-1 ring-stone-300">
                          <option value="dias">días</option>
                          <option value="semanas">semanas</option>
                        </select>
                      </>
                    )}
                    <select value={f.cuando} onChange={(e) => cambiar(f.clave, { cuando: e.target.value as Cuando, cantidad: f.cantidad || 1 })} aria-label={`Antes o después, tarea ${i + 1}`} className="rounded-xl bg-white px-2 py-1.5 ring-1 ring-stone-300">
                      <option value="antes">antes</option>
                      <option value="mismo">el mismo día</option>
                      <option value="despues">después</option>
                    </select>
                    <span className="text-xs text-stone-500">→ {textoDias(diasDe(f))}</span>
                  </div>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setFilas((antes) => [...antes, { clave: siguienteClave++, titulo: '', categoria: 'otros', cantidad: 1, unidad: 'dias', cuando: 'antes' }])}
              disabled={filas.length >= 40}
              className={botonSecundario}
            >
              ➕ Añadir tarea
            </button>
          </section>

          {error && <p role="alert" className={avisoError}>{error}</p>}
          <div className="flex flex-col gap-2 md:flex-row">
            <button type="button" onClick={(e) => guardar(e, true)} disabled={!puedeGuardar} className={botonPrincipal}>
              {guardando ? 'Guardando…' : planId ? '💾 Guardar y usarla para el plan' : '💾 Guardar y usarla'}
            </button>
            <button type="submit" disabled={!puedeGuardar} className={botonSecundario}>
              {modo === 'editar' ? 'Guardar cambios' : 'Solo guardar'}
            </button>
          </div>
          {modo === 'editar' && (
            <button type="button" onClick={borrar} disabled={guardando} className="self-center px-4 py-2 text-sm font-medium text-red-700">
              🗑️ Borrar la plantilla
            </button>
          )}
        </form>
      )}
    </main>
  )
}

// «✨ Hazme una plantilla»: escribes o dictas qué queréis organizar.
function PedirALaIA({ textoInicial, hayPropuesta, onPropuesta }: { textoInicial: string; hayPropuesta: boolean; onPropuesta: (p: PlantillaParaGuardar) => void }) {
  const [texto, setTexto] = useState(textoInicial)
  const [antesDeDictar, setAntesDeDictar] = useState('')
  const [pensando, setPensando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dictado = useDictado((dicho) => setTexto(`${antesDeDictar} ${dicho}`.trim().slice(0, 300)))

  async function pedir() {
    if (texto.trim().length < 3 || pensando) return
    if (dictado.escuchando) dictado.parar()
    setPensando(true)
    setError(null)
    const { plantilla, error } = await plantillaConIA(texto.trim())
    setPensando(false)
    if (error || !plantilla) return setError(error ?? 'No ha salido. Prueba otra vez.')
    onPropuesta(plantilla)
  }

  return (
    <section className="tarjeta flex flex-col gap-3 ring-2 ring-tareas">
      <label className="flex flex-col gap-1.5">
        <span className="font-semibold">¿Qué queréis organizar?</span>
        <textarea className={`${campo} min-h-20`} value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={300} aria-label="Qué queréis organizar" placeholder="Por ejemplo: la boda de mi hermana en Asturias, o una escapada a la montaña con la perra" />
      </label>
      <div className="flex gap-2">
        {dictado.soportado && (
          <button
            type="button"
            onClick={() => {
              if (dictado.escuchando) return dictado.parar()
              setAntesDeDictar(texto)
              dictado.empezar()
            }}
            aria-pressed={dictado.escuchando}
            className={`${botonSecundario.replace('w-full ', '')} shrink-0 px-4 ${dictado.escuchando ? 'animate-pulse bg-coral-suave text-coral-tinta ring-coral/30' : ''}`}
          >
            {dictado.escuchando ? '⏹️ Parar' : '🎤 Dictar'}
          </button>
        )}
        <button type="button" onClick={pedir} disabled={texto.trim().length < 3 || pensando} className={`${botonPrincipal} flex-1`}>
          {pensando ? 'Pensando…' : hayPropuesta ? '✨ Otra propuesta' : '✨ Proponer tareas'}
        </button>
      </div>
      {dictado.error && <p role="alert" className={avisoError}>{dictado.error}</p>}
      {error && <p role="alert" className={avisoError}>{error}</p>}
      {hayPropuesta && !pensando && <p role="status" className="rounded-xl bg-marca-suave p-3 text-sm text-marca">✅ Aquí la tienes. Revísala, cambia lo que quieras y guárdala.</p>}
      <p className="text-xs text-stone-500">🔒 Lo lee una IA gratuita (Gemma, en Cloudflare) solo con lo que escribes aquí; no se guarda.</p>
    </section>
  )
}
