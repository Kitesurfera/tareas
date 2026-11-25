import { useState, type FormEvent } from 'react'
import { TIPOS, anadirParaVer, pedirAlServidor, useNombresDeNuestrasPlataformas, useParaVer, type ResultadoTmdb, type TipoVer } from '../lib/paraVer'
import { volver } from '../lib/ruta'
import { useMiembros } from '../lib/useMiembros'
import { avisoError, botonPrincipal, botonSecundario, campo } from './estilos'
import { TituloSeccion } from './Piezas'
import { AvisoTmdb, SelectorTipo } from './PiezasParaVer'
import { ResultadoParaAnadir } from './ResultadoTmdb'

type Props = { hogarId: string; miUserId: string; tipo: TipoVer }

// #/ver/anadir/<pelicula|serie>: buscarla en TMDB (con carátula y dónde
// se puede ver) o escribirla a mano.
export function PantallaAnadirParaVer({ hogarId, miUserId, tipo: tipoInicial }: Props) {
  const { datos, error, recargar } = useParaVer()
  const { miembros } = useMiembros()
  const [tipo, setTipo] = useState<TipoVer>(tipoInicial)
  const [texto, setTexto] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [resultados, setResultados] = useState<ResultadoTmdb[] | null>(null)
  const [errorBusqueda, setErrorBusqueda] = useState<string | null>(null)
  const [aMano, setAMano] = useState(false)
  const nuestras = useNombresDeNuestrasPlataformas(datos?.plataformas ?? [])
  const yo = miembros?.find((m) => m.user_id === miUserId)

  async function buscar(evento: FormEvent) {
    evento.preventDefault()
    const busqueda = texto.trim()
    if (busqueda.length < 2) return
    setBuscando(true)
    setErrorBusqueda(null)
    try {
      const { resultados } = await pedirAlServidor<{ resultados: ResultadoTmdb[] }>({ accion: 'buscar', tipo, texto: busqueda })
      setResultados(resultados)
    } catch (e) {
      setResultados(null)
      setErrorBusqueda(e instanceof Error ? e.message : 'No se ha podido buscar.')
    } finally {
      setBuscando(false)
    }
  }

  function cambiarTipo(t: TipoVer) {
    setTipo(t)
    setResultados(null)
    setErrorBusqueda(null)
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col gap-5 px-5 py-8 md:max-w-2xl md:px-6 lg:max-w-3xl lg:px-10 lg:py-10">
      <button type="button" onClick={() => volver('/ver')} className="self-start text-sm font-medium text-marca">
        ← Para ver
      </button>
      <h1 className="text-2xl font-extrabold text-planes-tinta">Añadir {TIPOS[tipo].una}</h1>

      {error && <p role="alert" className={avisoError}>{error}</p>}
      <SelectorTipo tipo={tipo} onCambiar={cambiarTipo} />

      <section className="tarjeta flex flex-col gap-3">
        <TituloSeccion dibujo="🔎" titulo="Buscarla" subtitulo="Con carátula y dónde se puede ver" color="planes" />
        <form onSubmit={buscar} className="flex gap-2" role="search">
          <input
            type="search"
            className={`${campo} min-w-0`}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={tipo === 'pelicula' ? 'Por ejemplo: Vidas pasadas' : 'Por ejemplo: Fleabag'}
            aria-label={`Título de la ${TIPOS[tipo].una}`}
            maxLength={100}
            autoFocus
          />
          <button type="submit" disabled={buscando || texto.trim().length < 2} className={`${botonPrincipal.replace('w-full ', '')} shrink-0`}>
            {buscando ? '…' : 'Buscar'}
          </button>
        </form>
        {errorBusqueda && (
          <div role="alert" className={avisoError}>
            {errorBusqueda}
            <button type="button" onClick={() => setAMano(true)} className="mt-1 block font-semibold underline">
              Escribirla a mano
            </button>
          </div>
        )}
        {resultados && resultados.length === 0 && <p className="text-sm text-stone-500">No encontramos nada con «{texto.trim()}». Prueba con otro título (o en inglés), o escríbela a mano.</p>}
        {resultados && resultados.length > 0 && datos && (
          <ul className="divide-y divide-stone-100" aria-label="Resultados">
            {resultados.map((r) => (
              <ResultadoParaAnadir key={r.tmdb_id} resultado={r} hogarId={hogarId} datos={datos} yo={yo} nuestras={nuestras} pedirPlataformas onCambio={recargar} />
            ))}
          </ul>
        )}
      </section>

      <section className="tarjeta flex flex-col gap-3">
        {aMano ? (
          <FormularioAMano hogarId={hogarId} tipo={tipo} onListo={() => volver('/ver')} />
        ) : (
          <button type="button" onClick={() => setAMano(true)} className={botonSecundario}>
            ✍️ Escribirla a mano
          </button>
        )}
      </section>

      <AvisoTmdb />
    </main>
  )
}

// Sin TMDB: título, año, dónde se ve y notas.
function FormularioAMano({ hogarId, tipo, onListo }: { hogarId: string; tipo: TipoVer; onListo: () => void }) {
  const [titulo, setTitulo] = useState('')
  const [anio, setAnio] = useState('')
  const [donde, setDonde] = useState('')
  const [notas, setNotas] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function guardar(evento: FormEvent) {
    evento.preventDefault()
    const numero = Number(anio)
    setGuardando(true)
    setError(null)
    const hecho = await anadirParaVer(hogarId, {
      tipo,
      titulo: titulo.trim(),
      anio: anio && Number.isInteger(numero) && numero >= 1880 && numero <= 2100 ? numero : null,
      tmdb_id: null,
      poster: null,
      sinopsis: null,
      plataformas: [...new Set(donde.split(',').map((d) => d.trim().slice(0, 40)).filter(Boolean))].slice(0, 12),
      notas: notas.trim() || null,
    })
    setGuardando(false)
    if ('error' in hecho) return setError(hecho.error)
    onListo()
  }

  return (
    <form onSubmit={guardar} className="flex flex-col gap-4">
      <TituloSeccion dibujo="✍️" titulo="Escribirla a mano" color="planes" />
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-stone-700">Título</span>
        <input className={campo} value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={120} required />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-stone-700">
          Año <span className="font-normal text-stone-400">(opcional)</span>
        </span>
        <input className={`${campo} max-w-32`} value={anio} onChange={(e) => setAnio(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" placeholder="2024" />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-stone-700">
          ¿Dónde se ve? <span className="font-normal text-stone-400">(opcional, separadas por comas)</span>
        </span>
        <input className={campo} value={donde} onChange={(e) => setDonde(e.target.value)} placeholder="Netflix, Filmin…" maxLength={200} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-stone-700">
          Notas <span className="font-normal text-stone-400">(opcional)</span>
        </span>
        <textarea className={`${campo} min-h-20`} value={notas} onChange={(e) => setNotas(e.target.value)} maxLength={1000} placeholder="Nos la recomendó Marta…" />
      </label>
      {error && <p role="alert" className={avisoError}>{error}</p>}
      <button type="submit" disabled={guardando || !titulo.trim()} className={botonPrincipal}>
        {guardando ? 'Guardando…' : `Añadir ${TIPOS[tipo].una}`}
      </button>
    </form>
  )
}
