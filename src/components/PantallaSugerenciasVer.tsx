import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  ANIMOS,
  DURACIONES,
  EPOCAS,
  basesDeGustos,
  guardarPlataformas,
  imagenTmdb,
  pedirAlServidor,
  plataformasDeEspana,
  useParaVer,
  type DatosParaVer,
  type PlataformaTmdb,
  type ResultadoTmdb,
  type TipoVer,
} from '../lib/paraVer'
import { volver } from '../lib/ruta'
import type { Miembro } from '../lib/tipos'
import { textoBotonDictar, useDictado } from '../lib/useDictado'
import { useMiembros } from '../lib/useMiembros'
import { avisoError, botonPrincipal, botonSecundario, campo, estiloChip } from './estilos'
import { TituloSeccion } from './Piezas'
import { AvisoTmdb, SelectorTipo } from './PiezasParaVer'
import { ResultadoParaAnadir } from './ResultadoTmdb'

type Props = { hogarId: string; miUserId: string; tipo: TipoVer }
type Modo = 'preguntas' | 'gustos' | 'palabras'

const MAX_LETRAS = 300

// #/ver/sugerencias/<pelicula|serie>: ideas de internet (TMDB) según lo
// que os apetece, vuestras plataformas y lo que os gusta, o pedidas con palabras.
export function PantallaSugerenciasVer({ hogarId, miUserId, tipo: tipoInicial }: Props) {
  const { datos, error, recargar } = useParaVer()
  const { miembros } = useMiembros()
  const [tipo, setTipo] = useState<TipoVer>(tipoInicial)
  const [plataformas, setPlataformas] = useState<PlataformaTmdb[] | null>(null)
  const [errorPlataformas, setErrorPlataformas] = useState<string | null>(null)

  useEffect(() => {
    let vigente = true
    plataformasDeEspana()
      .then((lista) => vigente && setPlataformas(lista))
      .catch((e: unknown) => vigente && setErrorPlataformas(e instanceof Error ? e.message : 'No se han podido cargar.'))
    return () => {
      vigente = false
    }
  }, [])

  const yo = miembros?.find((m) => m.user_id === miUserId)

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col gap-5 px-5 py-8 md:max-w-2xl md:px-6 lg:max-w-6xl lg:px-10 lg:py-10">
      <button type="button" onClick={() => volver('/ver')} className="self-start text-sm font-medium text-marca">
        ← Para ver
      </button>
      <div>
        <h1 className="text-2xl font-extrabold text-planes-tinta lg:text-3xl">✨ Ideas para ver</h1>
        <p className="mt-1 text-stone-600">Sugerencias de internet según lo que os apetece, vuestras plataformas y lo que os gusta.</p>
      </div>
      {error && <p role="alert" className={avisoError}>{error}</p>}
      {datos === null && !error && <p className="text-center text-stone-400">Cargando…</p>}
      {datos && (
        <>
          <SelectorTipo tipo={tipo} onCambiar={setTipo} />
          <Ideas
            key={tipo}
            tipo={tipo}
            hogarId={hogarId}
            datos={datos}
            yo={yo}
            plataformas={plataformas}
            errorPlataformas={errorPlataformas}
            onCambio={recargar}
          />
          <AvisoTmdb />
        </>
      )}
    </main>
  )
}

function Ideas({
  tipo,
  hogarId,
  datos,
  yo,
  plataformas,
  errorPlataformas,
  onCambio,
}: {
  tipo: TipoVer
  hogarId: string
  datos: DatosParaVer
  yo: Miembro | undefined
  plataformas: PlataformaTmdb[] | null
  errorPlataformas: string | null
  onCambio: () => void
}) {
  const [animos, setAnimos] = useState<string[]>([])
  const [duracion, setDuracion] = useState('da_igual')
  const [epoca, setEpoca] = useState('da_igual')
  const [soloNuestras, setSoloNuestras] = useState(true)
  const [frase, setFrase] = useState('')
  const [antesDeDictar, setAntesDeDictar] = useState('')
  const [cargando, setCargando] = useState<Modo | null>(null)
  const [ultimo, setUltimo] = useState<{ modo: Modo; pagina: number } | null>(null)
  const [resultados, setResultados] = useState<ResultadoTmdb[] | null>(null)
  const [entendido, setEntendido] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const caja = useRef<HTMLElement>(null)
  const dictado = useDictado((t) => setFrase(`${antesDeDictar} ${t}`.trim().slice(0, MAX_LETRAS)))

  const nuestras = datos.plataformas
  const nombresNuestras = (plataformas ?? []).filter((p) => nuestras.includes(p.id)).map((p) => p.nombre)
  const bases = basesDeGustos(datos.lista, tipo, datos.ganas)
  const excluir = datos.lista.filter((p) => p.tipo === tipo && p.tmdb_id !== null).map((p) => p.tmdb_id as number)
  const usarNuestras = soloNuestras && nuestras.length > 0
  const plural = tipo === 'pelicula' ? 'películas' : 'series'

  // Al llegar las ideas, se baja hasta ellas.
  useEffect(() => {
    if (!resultados) return
    const quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    caja.current?.scrollIntoView({ behavior: quieto ? 'auto' : 'smooth', block: 'start' })
  }, [resultados])

  async function pedir(modo: Modo, pagina = 1) {
    if (dictado.escuchando) dictado.parar()
    setCargando(modo)
    setError(null)
    const comun = { tipo, plataformas: nuestras, soloNuestras: usarNuestras, excluir }
    const cuerpo =
      modo === 'palabras'
        ? { accion: 'palabras', ...comun, texto: frase }
        : modo === 'gustos'
          ? { accion: 'sugerencias', ...comun, animos, basadas_en: bases.map((b) => b.tmdb_id) }
          : { accion: 'sugerencias', ...comun, animos, duracion, epoca, pagina }
    try {
      const respuesta = await pedirAlServidor<{ resultados: ResultadoTmdb[]; entendido?: { resumen: string | null; parecidoA: string[] } }>(cuerpo)
      setResultados(respuesta.resultados)
      setUltimo({ modo, pagina })
      setEntendido(
        respuesta.entendido
          ? [respuesta.entendido.resumen, respuesta.entendido.parecidoA.length ? `Parecidas a: ${respuesta.entendido.parecidoA.join(', ')}.` : null].filter(Boolean).join(' ')
          : null,
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se han podido buscar ideas.')
    } finally {
      setCargando(null)
    }
  }

  const alternar = (lista: string[], valor: string) => (lista.includes(valor) ? lista.filter((x) => x !== valor) : [...lista, valor])

  return (
    // En el ordenador: las preguntas a la izquierda y las ideas a la derecha.
    <div className="contents lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:items-start lg:gap-6">
      <div className="contents lg:flex lg:flex-col lg:gap-6">
        <Plataformas hogarId={hogarId} todas={plataformas} error={errorPlataformas} elegidas={nuestras} onCambio={onCambio} />

        <section className="tarjeta flex flex-col gap-4">
          <TituloSeccion dibujo="❓" titulo="¿Qué os apetece?" subtitulo="Contestad lo que queráis" color="planes" />
          <Pregunta titulo="Algo para…">
            {ANIMOS.map((a) => (
              <button key={a.valor} type="button" aria-pressed={animos.includes(a.valor)} onClick={() => setAnimos(alternar(animos, a.valor))} className={estiloChip(animos.includes(a.valor), true)}>
                {a.texto}
              </button>
            ))}
          </Pregunta>
          <Pregunta titulo={tipo === 'pelicula' ? '¿Cuánto tiempo tenéis?' : '¿Qué tipo de serie?'}>
            {DURACIONES[tipo].map((d) => (
              <button key={d.valor} type="button" aria-pressed={duracion === d.valor} onClick={() => setDuracion(d.valor)} className={estiloChip(duracion === d.valor, true)}>
                {d.texto}
              </button>
            ))}
          </Pregunta>
          <Pregunta titulo="¿De qué época?">
            {EPOCAS.map((e) => (
              <button key={e.valor} type="button" aria-pressed={epoca === e.valor} onClick={() => setEpoca(e.valor)} className={estiloChip(epoca === e.valor, true)}>
                {e.texto}
              </button>
            ))}
          </Pregunta>
          {nuestras.length > 0 && (
            <label className="flex items-center gap-3 text-sm font-medium text-stone-700">
              <input type="checkbox" className="h-5 w-5 accent-marca" checked={soloNuestras} onChange={(e) => setSoloNuestras(e.target.checked)} />
              Solo en vuestras plataformas{nombresNuestras.length > 0 ? ` (${nombresNuestras.join(', ')})` : ''}
            </label>
          )}
          <button type="button" onClick={() => pedir('preguntas')} disabled={cargando !== null} className={botonPrincipal}>
            {cargando === 'preguntas' ? 'Buscando…' : `✨ Buscar ${plural}`}
          </button>
        </section>

        <section className="tarjeta flex flex-col gap-3">
          <TituloSeccion dibujo="💜" titulo="Parecidas a lo que os gusta" color="planes" />
          {bases.length > 0 ? (
            <>
              <p className="text-sm text-stone-600">Según {bases.map((b) => `«${b.titulo}»`).join(', ')}.</p>
              <button type="button" onClick={() => pedir('gustos')} disabled={cargando !== null} className={botonSecundario}>
                {cargando === 'gustos' ? 'Buscando…' : '💜 Buscar parecidas'}
              </button>
            </>
          ) : (
            <p className="text-sm text-stone-500">
              Cuando tengáis {plural} de TMDB con muchas ganas (😃 o 🤩) o que visteis y os gustaron (👍), aquí buscaremos parecidas.
            </p>
          )}
        </section>

        <section className="tarjeta flex flex-col gap-3">
          <TituloSeccion dibujo="💬" titulo="Pedidlo con palabras" subtitulo="La IA lo traduce a una búsqueda" color="planes" />
          <textarea
            className={`${campo} min-h-20`}
            value={frase}
            onChange={(e) => setFrase(e.target.value.slice(0, MAX_LETRAS))}
            maxLength={MAX_LETRAS}
            aria-label="Qué os apetece ver, con vuestras palabras"
            placeholder={tipo === 'pelicula' ? 'Una peli coreana de miedo pero no muy gore' : 'Algo como Fleabag pero más oscuro'}
          />
          <div className="flex gap-2">
            {dictado.soportado && (
              <button
                type="button"
                onClick={() => {
                  if (dictado.escuchando) return dictado.parar()
                  setAntesDeDictar(frase)
                  dictado.empezar()
                }}
                aria-pressed={dictado.escuchando}
                disabled={dictado.pasando}
                className={`${botonSecundario.replace('w-full ', '')} shrink-0 px-4 ${dictado.escuchando ? 'animate-pulse bg-coral-suave text-coral-tinta ring-coral/30' : ''}`}
              >
                {textoBotonDictar(dictado, '🎤 Dictar')}
              </button>
            )}
            <button type="button" onClick={() => pedir('palabras')} disabled={cargando !== null || frase.trim().length < 3} className={botonPrincipal}>
              {cargando === 'palabras' ? 'Pensando…' : '✨ Pedir ideas'}
            </button>
          </div>
          {dictado.error && <p role="alert" className={avisoError}>{dictado.error}</p>}
        </section>
      </div>

      <div className="contents lg:sticky lg:top-6 lg:flex lg:flex-col lg:gap-6">
        {error && <p role="alert" className={avisoError}>{error}</p>}
        {resultados && (
          <section ref={caja} className="tarjeta flex scroll-mt-4 flex-col gap-2" aria-live="polite">
            <TituloSeccion
              dibujo="🍿"
              titulo="Ideas"
              subtitulo={resultados.length === 1 ? '1 idea' : `${resultados.length} ideas`}
              color="planes"
            />
            {entendido && <p className="rounded-xl bg-planes/50 p-3 text-sm text-planes-tinta">💬 Hemos entendido: {entendido}</p>}
            {resultados.length === 0 && (
              <p className="text-sm text-stone-500">
                No hemos encontrado {plural} con eso{usarNuestras ? ' en vuestras plataformas' : ''}. Probad a quitar alguna respuesta
                {usarNuestras ? ' o a buscar en todas las plataformas' : ''}.
              </p>
            )}
            <ul className="divide-y divide-stone-100">
              {resultados.map((r) => (
                <ResultadoParaAnadir key={r.tmdb_id} resultado={r} hogarId={hogarId} datos={datos} yo={yo} nuestras={nombresNuestras} pedirPlataformas={false} onCambio={onCambio} />
              ))}
            </ul>
            {ultimo?.modo === 'preguntas' && resultados.length > 0 && ultimo.pagina < 5 && (
              <button type="button" onClick={() => pedir('preguntas', ultimo.pagina + 1)} disabled={cargando !== null} className={botonSecundario}>
                {cargando === 'preguntas' ? 'Buscando…' : '🔄 Otras ideas'}
              </button>
            )}
          </section>
        )}
      </div>
    </div>
  )
}

function Pregunta({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 text-sm font-semibold text-stone-700">{titulo}</legend>
      <div className="flex flex-wrap gap-2">{children}</div>
    </fieldset>
  )
}

// 📺 Vuestras plataformas: se guardan para todo el hogar al tocarlas.
function Plataformas({
  hogarId,
  todas,
  error,
  elegidas,
  onCambio,
}: {
  hogarId: string
  todas: PlataformaTmdb[] | null
  error: string | null
  elegidas: number[]
  onCambio: () => void
}) {
  const [marcadas, setMarcadas] = useState<number[]>(elegidas)
  const [abierto, setAbierto] = useState(elegidas.length === 0)
  const [guardando, setGuardando] = useState(false)
  const [fallo, setFallo] = useState<string | null>(null)
  const nombres = (todas ?? []).filter((p) => marcadas.includes(p.id)).map((p) => p.nombre)

  async function cambiar(id: number) {
    const nuevas = marcadas.includes(id) ? marcadas.filter((x) => x !== id) : [...marcadas, id]
    setMarcadas(nuevas)
    setGuardando(true)
    setFallo(null)
    const problema = await guardarPlataformas(hogarId, nuevas)
    setGuardando(false)
    if (problema) {
      setMarcadas(marcadas)
      return setFallo(problema)
    }
    onCambio()
  }

  return (
    <section className="tarjeta flex flex-col gap-3">
      <TituloSeccion
        dibujo="📺"
        titulo="Vuestras plataformas"
        subtitulo={nombres.length > 0 ? nombres.join(', ') : 'Para sugeriros lo que podéis ver'}
        color="planes"
        derecha={
          todas && todas.length > 0 ? (
            <button type="button" onClick={() => setAbierto(!abierto)} aria-expanded={abierto} className="shrink-0 text-sm font-semibold text-marca">
              {abierto ? 'Listo' : 'Cambiar'}
            </button>
          ) : undefined
        }
      />
      {error && <p role="alert" className={avisoError}>{error}</p>}
      {!todas && !error && <p className="text-sm text-stone-400">Cargando plataformas…</p>}
      {todas && abierto && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Elegid vuestras plataformas">
          {todas.map((p) => {
            const elegida = marcadas.includes(p.id)
            const logo = imagenTmdb(p.logo, 'w92')
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={elegida}
                onClick={() => cambiar(p.id)}
                className={`flex items-center gap-1.5 rounded-full py-1 pr-3 pl-1 text-sm font-medium ring-1 transition ${
                  elegida ? 'bg-marca text-white ring-marca' : 'bg-white text-stone-700 ring-stone-300 hover:bg-stone-50'
                }`}
              >
                {logo ? <img src={logo} alt="" className="h-6 w-6 rounded-full object-cover" /> : <span aria-hidden="true" className="h-6 w-6 rounded-full bg-stone-200" />}
                {p.nombre}
              </button>
            )
          })}
        </div>
      )}
      {guardando && <p className="text-xs text-stone-400">Guardando…</p>}
      {fallo && <p role="alert" className={avisoError}>{fallo}</p>}
    </section>
  )
}
