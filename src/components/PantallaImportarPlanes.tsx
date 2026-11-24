import { useEffect, useRef, useState, type ReactNode } from 'react'
import { mensajeDeError } from '../lib/errores'
import {
  categoriasNuevas,
  decodificar,
  descargar,
  estiloCategoriaNueva,
  interpretar,
  MAX_BYTES,
  MAX_FILAS,
  normalizar,
  plantillaCsv,
  type FilaImportada,
  type Lectura,
} from '../lib/importarPlanes'
import { COLORES_PLAN, DURACIONES, ENERGIAS, PRECIOS, SIN_CATEGORIA, usePlanes, type CategoriaPlan, type DatosPlanes } from '../lib/planes'
import { volver } from '../lib/ruta'
import { supabase } from '../lib/supabase'
import { avisoError, botonPrincipal, botonSecundario, campo } from './estilos'
import { Etiqueta, TituloSeccion } from './Piezas'
import { DatosDelPlan } from './PiezasPlanes'

// #/planes/importar: añadir muchos planes de golpe con la plantilla CSV.
// 1) descargar la plantilla, 2) subirla rellena (o pegar las filas) y
// 3) revisar: no se guarda nada hasta pulsar «Añadir».
export function PantallaImportarPlanes({ hogarId }: { hogarId: string }) {
  const { datos, error } = usePlanes()

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col gap-5 px-5 py-8 md:max-w-2xl md:px-6 lg:max-w-3xl lg:px-10 lg:py-10">
      <button type="button" onClick={() => volver('/planes')} className="self-start text-sm font-medium text-marca">
        ← Volver a Planes
      </button>
      <div>
        <h1 className="text-2xl font-extrabold text-planes-tinta">Añadir varios planes</h1>
        <p className="mt-1 text-stone-600">Con una hoja de cálculo: rellenad la plantilla, subidla y revisad antes de añadir.</p>
      </div>

      {error && <p role="alert" className={avisoError}>{error}</p>}
      {datos === null && !error && <p className="text-center text-stone-400">Cargando…</p>}
      {datos && <Importar hogarId={hogarId} datos={datos} />}
    </main>
  )
}

function Importar({ hogarId, datos }: { hogarId: string; datos: DatosPlanes }) {
  const [lectura, setLectura] = useState<Lectura | null>(null)
  const [origen, setOrigen] = useState<string | null>(null) // el nombre del archivo, o «lo que has pegado»
  const [marcadas, setMarcadas] = useState<Set<number>>(new Set())
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null)
  const [pegado, setPegado] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null)
  const [anadidos, setAnadidos] = useState<number | null>(null)
  const revision = useRef<HTMLDivElement>(null)

  // Al leer un archivo, la revisión queda más abajo: se baja hasta ella.
  useEffect(() => {
    if (!lectura) return
    const quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    revision.current?.scrollIntoView({ behavior: quieto ? 'auto' : 'smooth', block: 'start' })
  }, [lectura])

  function revisar(texto: string, de: string) {
    const nueva = interpretar(texto, datos.categorias, datos.planes)
    setErrorArchivo(nueva.error)
    setLectura(nueva.error ? null : nueva)
    setOrigen(de)
    setMarcadas(new Set(nueva.filas.filter((f) => !f.error && !f.desmarcada).map((f) => f.linea)))
    setErrorGuardar(null)
  }

  async function alElegir(archivo: File | undefined) {
    if (!archivo) return
    setErrorArchivo(null)
    if (/\.(xlsx?|numbers|ods)$/i.test(archivo.name)) {
      return setErrorArchivo('Ese archivo es una hoja de cálculo, no un CSV. Guardadla como CSV (mirad «¿Cómo la guardo como CSV?» aquí arriba) y subid ese archivo.')
    }
    if (archivo.size > MAX_BYTES) return setErrorArchivo('El archivo es demasiado grande (como mucho 1 MB).')
    const texto = decodificar(await archivo.arrayBuffer())
    if (texto.includes('\u0000')) return setErrorArchivo('Ese archivo no parece un CSV. Usad la plantilla y guardadla como CSV.')
    revisar(texto, `«${archivo.name}»`)
  }

  const elegidas = lectura ? lectura.filas.filter((f) => !f.error && marcadas.has(f.linea)) : []
  const nuevas = categoriasNuevas(elegidas)

  async function anadir() {
    if (!supabase || elegidas.length === 0) return
    setEnviando(true)
    setErrorGuardar(null)
    try {
      // 1. Las categorías que faltan (mirando las de ahora mismo, por si
      //    alguien del hogar ha creado o borrado alguna mientras tanto).
      let categorias = await leerCategorias()
      const nombres = new Map<string, string>()
      for (const f of elegidas) if (f.categoria.tipo !== 'ninguna') nombres.set(normalizar(f.categoria.nombre), f.categoria.nombre)
      const faltan = [...nombres.values()].filter((n) => !categorias.some((c) => normalizar(c.nombre) === normalizar(n)))
      const orden = Math.max(-1, ...categorias.map((c) => c.orden)) + 1
      for (const [i, nombre] of faltan.entries()) {
        const { dibujo, color } = estiloCategoriaNueva(nombre, categorias, i)
        const { error } = await supabase
          .from('categorias_plan')
          .insert({ hogar_id: hogarId, nombre, dibujo, color, orden: Math.min(orden + i, 1000) })
        // Si otra persona la acaba de crear con el mismo nombre, ya está: también vale.
        if (error && error.code !== '23505') throw error
      }
      if (faltan.length > 0) categorias = await leerCategorias()
      const idDe = (nombre: string) => categorias.find((c) => normalizar(c.nombre) === normalizar(nombre))?.id ?? null

      // 2. Los planes, todos en una sola vez (o se añaden todos o ninguno).
      const { error } = await supabase.from('planes').insert(
        elegidas.map((f) => ({
          hogar_id: hogarId,
          nombre: f.nombre,
          categoria_id: f.categoria.tipo === 'ninguna' ? null : idDe(f.categoria.nombre),
          energia: f.energia,
          precio: f.precio,
          duracion: f.duracion,
          notas: f.notas,
          favorito: f.favorito,
        })),
      )
      if (error) throw error
      setAnadidos(elegidas.length)
    } catch (e) {
      setErrorGuardar(mensajeDeError(e as { message?: string }))
    } finally {
      setEnviando(false)
    }
  }

  if (anadidos !== null) {
    return (
      <section className="tarjeta flex flex-col items-center gap-3 text-center">
        <span aria-hidden="true" className="text-5xl">🎉</span>
        <p role="status" className="text-lg font-bold">
          {anadidos === 1 ? '¡Hecho! Habéis añadido 1 plan.' : `¡Hecho! Habéis añadido ${anadidos} planes.`}
        </p>
        <div className="flex w-full flex-col gap-2 md:flex-row">
          <button type="button" onClick={() => volver('/planes')} className={botonPrincipal}>
            Ver vuestros planes
          </button>
          <button
            type="button"
            onClick={() => {
              setAnadidos(null)
              setLectura(null)
              setOrigen(null)
              setPegado('')
            }}
            className={botonSecundario}
          >
            Añadir más
          </button>
        </div>
      </section>
    )
  }

  return (
    <>
      <section className="tarjeta flex flex-col gap-3">
        <TituloSeccion dibujo="⬇️" titulo="1. Descargad la plantilla" subtitulo="Un plan en cada fila" color="planes" />
        <p className="text-sm text-stone-600">
          Abridla con Excel, Google Sheets o Numbers. Trae tres ejemplos: cambiadlos o borradlos (si se quedan, salen sin marcar).
        </p>
        <button
          type="button"
          onClick={() => descargar('plantilla-planes.csv', plantillaCsv(datos.categorias))}
          className={botonSecundario}
        >
          ⬇️ Descargar la plantilla (CSV)
        </button>
        <Desplegable titulo="¿Qué pongo en cada columna?">
          <Columnas categorias={datos.categorias} />
        </Desplegable>
        <Desplegable titulo="¿Cómo la guardo como CSV?">
          <ul className="flex list-disc flex-col gap-1 pl-5">
            <li><b>Excel:</b> Archivo → Guardar como → «CSV UTF-8».</li>
            <li><b>Google Sheets:</b> Archivo → Descargar → «Valores separados por comas (.csv)».</li>
            <li><b>Numbers:</b> Compartir (o Archivo) → Exportar → CSV.</li>
          </ul>
        </Desplegable>
      </section>

      <section className="tarjeta flex flex-col gap-3">
        <TituloSeccion dibujo="📄" titulo="2. Subid el archivo" subtitulo={`Hasta ${MAX_FILAS} planes de una vez`} color="planes" />
        <label className={`${botonPrincipal} block cursor-pointer text-center focus-within:ring-2 focus-within:ring-marca focus-within:ring-offset-2`}>
          📂 {lectura ? 'Elegir otro archivo' : 'Elegir el archivo CSV'}
          <input
            type="file"
            accept=".csv,.tsv,.txt,text/csv,text/plain,text/tab-separated-values"
            className="sr-only"
            onChange={(e) => {
              void alElegir(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </label>
        <Desplegable titulo="📋 O pegad aquí las filas">
          <div className="flex flex-col gap-2">
            <p>Copiad las celdas de la hoja de cálculo (con la fila de títulos), o escribid un plan en cada línea.</p>
            <textarea
              className={`${campo} min-h-28 font-mono text-sm`}
              value={pegado}
              onChange={(e) => setPegado(e.target.value)}
              aria-label="Filas pegadas"
              placeholder={'nombre;categoria;energia\nIr al cine;Cultura;poca'}
            />
            <button type="button" onClick={() => revisar(pegado, 'lo que habéis pegado')} disabled={!pegado.trim()} className={botonSecundario}>
              Revisar
            </button>
          </div>
        </Desplegable>
        {errorArchivo && <p role="alert" className={avisoError}>{errorArchivo}</p>}
      </section>

      {lectura && (
        <div ref={revision} className="scroll-mt-4">
          <Revision
            lectura={lectura}
            origen={origen}
            categorias={datos.categorias}
            marcadas={marcadas}
            setMarcadas={setMarcadas}
            nuevas={nuevas}
            cuantas={elegidas.length}
            enviando={enviando}
            error={errorGuardar}
            onAnadir={anadir}
          />
        </div>
      )}
    </>
  )
}

async function leerCategorias(): Promise<CategoriaPlan[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from('categorias_plan').select('*')
  if (error) throw error
  return data as CategoriaPlan[]
}

function Desplegable({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <details className="group rounded-2xl bg-stone-50 px-4 py-3 text-sm text-stone-700">
      <summary className="cursor-pointer font-semibold text-stone-700">{titulo}</summary>
      <div className="mt-2">{children}</div>
    </details>
  )
}

// Qué se puede escribir en cada columna.
function Columnas({ categorias }: { categorias: CategoriaPlan[] }) {
  const fila = (columna: string, texto: ReactNode) => (
    <li>
      <code className="rounded bg-white px-1.5 py-0.5 font-semibold text-planes-tinta ring-1 ring-stone-200">{columna}</code> {texto}
    </li>
  )
  return (
    <ul className="flex flex-col gap-2">
      {fila('nombre', <>el plan (obligatorio, hasta 80 letras).</>)}
      {fila(
        'categoria',
        <>
          {categorias.length > 0 ? <>una de las vuestras: {categorias.map((c) => c.nombre).join(', ')}. </> : null}
          Si no existe, se crea. Vacío = sin categoría.
        </>,
      )}
      {fila('energia', ENERGIAS.map((e) => e.valor).join(' · '))}
      {fila('precio', PRECIOS.map((p) => p.texto.toLowerCase()).join(' · '))}
      {fila('duracion', DURACIONES.map((d) => d.texto.toLowerCase()).join(' · '))}
      {fila('favorito', 'sí o no')}
      {fila('notas', 'lo que queráis, también enlaces.')}
      <li className="text-stone-500">Lo que dejéis vacío se queda sin elegir. Da igual usar mayúsculas o tildes.</li>
    </ul>
  )
}

const MOTIVOS: Record<NonNullable<FilaImportada['desmarcada']>, string> = {
  ya_esta: 'Ya lo teníais en vuestros planes.',
  repetida: 'Está repetido en el archivo.',
  ejemplo: 'Es un ejemplo de la plantilla.',
}

type PropsRevision = {
  lectura: Lectura
  origen: string | null
  categorias: CategoriaPlan[]
  marcadas: Set<number>
  setMarcadas: (marcadas: Set<number>) => void
  nuevas: string[]
  cuantas: number
  enviando: boolean
  error: string | null
  onAnadir: () => void
}

function Revision({ lectura, origen, categorias, marcadas, setMarcadas, nuevas, cuantas, enviando, error, onAnadir }: PropsRevision) {
  const validas = lectura.filas.filter((f) => !f.error)
  const conError = lectura.filas.length - validas.length

  function cambiar(linea: number, marcar: boolean) {
    const nuevas = new Set(marcadas)
    if (marcar) nuevas.add(linea)
    else nuevas.delete(linea)
    setMarcadas(nuevas)
  }

  return (
    <section className="tarjeta flex flex-col gap-4">
      <TituloSeccion
        dibujo="👀"
        titulo="3. Revisad y añadid"
        subtitulo={`${lectura.filas.length === 1 ? '1 fila' : `${lectura.filas.length} filas`} en ${origen ?? 'el archivo'}`}
        color="planes"
      />

      {lectura.sinTitulos && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          No hemos encontrado la fila de títulos: leemos las columnas en el orden de la plantilla (nombre, categoría, energía…).
        </p>
      )}
      {lectura.sobran > 0 && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          Solo caben {MAX_FILAS} planes de una vez: las {lectura.sobran} filas del final no se han leído. Subidlas en otro archivo.
        </p>
      )}
      {conError > 0 && (
        <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800">
          {conError === 1 ? '1 fila no se puede añadir' : `${conError} filas no se pueden añadir`} (mirad las marcadas en rojo).
        </p>
      )}
      {nuevas.length > 0 && (
        <p className="rounded-xl bg-planes/50 p-3 text-sm text-planes-tinta">
          🏷️ {nuevas.length === 1 ? 'Se creará la categoría' : 'Se crearán las categorías'}{' '}
          {nuevas.map((n, i) => `${estiloCategoriaNueva(n, categorias, i).dibujo} ${n}`).join(', ')}. Luego podéis cambiarles el dibujo y el color.
        </p>
      )}

      {validas.length > 1 && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="font-semibold text-stone-700">{cuantas === 1 ? '1 elegido' : `${cuantas} elegidos`}</span>
          <button type="button" onClick={() => setMarcadas(new Set(validas.map((f) => f.linea)))} className="font-medium text-marca">
            Elegir todos
          </button>
          <button type="button" onClick={() => setMarcadas(new Set())} className="font-medium text-stone-500">
            Ninguno
          </button>
        </div>
      )}

      <ul className="flex flex-col gap-1.5">
        {lectura.filas.map((fila) => (
          <FilaRevision key={fila.linea} fila={fila} categorias={categorias} marcada={marcadas.has(fila.linea)} onCambiar={(m) => cambiar(fila.linea, m)} />
        ))}
      </ul>

      {/* Pegado abajo mientras se baja por la lista. */}
      <div className="sticky bottom-4 z-10 -mx-2 flex flex-col gap-2 rounded-2xl bg-white/95 p-2 shadow-[0_-6px_20px_-12px_rgb(60_40_20/0.4)] ring-1 ring-stone-900/5 backdrop-blur">
        {error && <p role="alert" className={avisoError}>{error}</p>}
        <button type="button" onClick={onAnadir} disabled={cuantas === 0 || enviando} className={botonPrincipal}>
          {enviando ? 'Añadiendo…' : cuantas === 0 ? 'Elegid qué planes añadir' : cuantas === 1 ? 'Añadir 1 plan' : `Añadir ${cuantas} planes`}
        </button>
      </div>
    </section>
  )
}

function FilaRevision({ fila, categorias, marcada, onCambiar }: { fila: FilaImportada; categorias: CategoriaPlan[]; marcada: boolean; onCambiar: (marcar: boolean) => void }) {
  return (
    <li>
      <label
        className={`flex items-start gap-3 rounded-2xl p-3 ring-1 transition ${
          fila.error ? 'bg-red-50/60 ring-red-200' : marcada ? 'bg-marca-suave/40 ring-marca/25' : 'cursor-pointer bg-white ring-stone-200 hover:bg-stone-50'
        } ${fila.error ? '' : 'cursor-pointer'}`}
      >
        <input
          type="checkbox"
          className="mt-0.5 h-5 w-5 shrink-0 accent-marca"
          checked={marcada && !fila.error}
          disabled={Boolean(fila.error)}
          onChange={(e) => onCambiar(e.target.checked)}
        />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="font-medium break-words">
            {fila.nombre || <span className="text-stone-400 italic">(sin nombre)</span>}
            {fila.favorito && <span className="ml-1" aria-label="(favorito)">⭐</span>}
          </span>
          <span className="flex flex-wrap gap-1.5">
            <PastillaFila fila={fila} categorias={categorias} />
            <DatosDelPlan plan={fila} />
          </span>
          {fila.notas && <span className="line-clamp-2 text-xs break-words text-stone-500">{fila.notas}</span>}
          {fila.desmarcada && <span className="text-xs font-medium text-stone-500">{MOTIVOS[fila.desmarcada]}</span>}
          {fila.avisos.map((aviso) => (
            <span key={aviso} className="text-xs font-medium text-amber-800">⚠️ {aviso}</span>
          ))}
          {fila.error && <span className="text-xs font-semibold text-red-700">✕ {fila.error}</span>}
          <span className="text-[11px] text-stone-400">Fila {fila.linea}</span>
        </span>
      </label>
    </li>
  )
}

function PastillaFila({ fila, categorias }: { fila: FilaImportada; categorias: CategoriaPlan[] }) {
  if (fila.categoria.tipo === 'ninguna') {
    return <Etiqueta className={SIN_CATEGORIA.suave}>{SIN_CATEGORIA.nombre}</Etiqueta>
  }
  if (fila.categoria.tipo === 'nueva') {
    const { dibujo } = estiloCategoriaNueva(fila.categoria.nombre, categorias, 0)
    return (
      <Etiqueta className="border border-dashed border-planes-tinta/50 bg-white text-planes-tinta">
        <span aria-hidden="true">{dibujo}</span> {fila.categoria.nombre} · nueva
      </Etiqueta>
    )
  }
  const id = fila.categoria.id
  const categoria = categorias.find((c) => c.id === id)
  return (
    <Etiqueta className={categoria ? COLORES_PLAN[categoria.color].suave : SIN_CATEGORIA.suave}>
      <span aria-hidden="true">{categoria?.dibujo}</span> {fila.categoria.nombre}
    </Etiqueta>
  )
}
