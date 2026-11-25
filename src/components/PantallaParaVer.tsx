import { useState } from 'react'
import { hoyComoTexto } from '../lib/fechas'
import { normalizar } from '../lib/importarPlanes'
import {
  TIPOS,
  cambiarParaVer,
  candidatos,
  elegirQueVer,
  ganasDe,
  marcarGanas,
  ordenar,
  pedirAlServidor,
  quitarParaVer,
  recordarTipo,
  tipoRecordado,
  useNombresDeNuestrasPlataformas,
  useParaVer,
  type DatosParaVer,
  type FiltrosSorteo,
  type Nivel,
  type ParaVer,
  type ResultadoTmdb,
  type TipoVer,
} from '../lib/paraVer'
import { ir, volver } from '../lib/ruta'
import type { Miembro } from '../lib/tipos'
import { useMiembros } from '../lib/useMiembros'
import { avisoError, botonPrincipal, botonSecundario, campo, estiloChip } from './estilos'
import { TituloSeccion, Vacio } from './Piezas'
import { AvisoTmdb, Caratula, GanasDeTodas, Plataformas, SelectorGanas, SelectorTipo } from './PiezasParaVer'

type Props = { hogarId: string; miUserId: string }

// #/ver: «🍿 Para ver», vuestra lista de películas y series (dentro de Planes).
export function PantallaParaVer({ miUserId }: Props) {
  const { datos, error, recargar } = useParaVer()
  const { miembros } = useMiembros()
  const [tipo, setTipo] = useState<TipoVer>(tipoRecordado)
  const nuestras = useNombresDeNuestrasPlataformas(datos?.plataformas ?? [])

  function cambiarTipo(t: TipoVer) {
    setTipo(t)
    recordarTipo(t)
  }

  const pendientes = (t: TipoVer) => datos?.lista.filter((p) => p.tipo === t && !p.visto).length ?? 0
  const yo = miembros?.find((m) => m.user_id === miUserId)

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col gap-5 px-5 py-8 md:max-w-2xl md:px-6 lg:max-w-6xl lg:px-10 lg:py-10">
      <button type="button" onClick={() => volver('/planes')} className="self-start text-sm font-medium text-marca">
        ← Planes
      </button>
      <div>
        <h1 className="text-2xl font-extrabold text-planes-tinta lg:text-3xl">🍿 Para ver</h1>
        <p className="mt-1 text-stone-600">Vuestras pelis y series pendientes: quién tiene ganas y qué vemos hoy.</p>
      </div>

      {error && <p role="alert" className={avisoError}>{error}</p>}
      {(datos === null || miembros === null) && !error && <p className="text-center text-stone-400">Cargando…</p>}

      {datos && miembros && (
        <>
          <SelectorTipo tipo={tipo} onCambiar={cambiarTipo} cuantas={{ pelicula: pendientes('pelicula'), serie: pendientes('serie') }} />
          {/* En el móvil, una columna. En el ordenador: el sorteo y las ideas a la izquierda; la lista a la derecha. */}
          <div className="contents lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] lg:items-start lg:gap-6">
            <div className="contents lg:flex lg:flex-col lg:gap-6">
              <Sorteo key={tipo} datos={datos} tipo={tipo} miembros={miembros} nuestras={nuestras} onCambio={recargar} />
              <section className="tarjeta order-last flex flex-col gap-3 lg:order-none">
                <TituloSeccion dibujo="✨" titulo="Ideas de internet" subtitulo="Según lo que os apetece, vuestras plataformas y lo que os gusta" color="planes" />
                <button type="button" onClick={() => ir(`/ver/sugerencias/${tipo}`)} className={botonSecundario}>
                  ✨ Buscar {tipo === 'pelicula' ? 'películas' : 'series'} para ver
                </button>
              </section>
            </div>
            <div className="contents lg:flex lg:flex-col lg:gap-6">
              <Lista key={tipo} datos={datos} tipo={tipo} miembros={miembros} yo={yo} nuestras={nuestras} onCambio={recargar} />
            </div>
          </div>
          <div className="order-last">
            <AvisoTmdb />
          </div>
        </>
      )}
    </main>
  )
}

// ---------------------------------------------------------------------
// 🎲 ¿Qué vemos?
// ---------------------------------------------------------------------

function Sorteo({ datos, tipo, miembros, nuestras, onCambio }: { datos: DatosParaVer; tipo: TipoVer; miembros: Miembro[]; nuestras: string[]; onCambio: () => void }) {
  const [filtros, setFiltros] = useState<FiltrosSorteo>({ todasConGanas: true, plataforma: null })
  const [elegida, setElegida] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [vista, setVista] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const pendientes = datos.lista.filter((p) => p.tipo === tipo && !p.visto)
  const plataformas = [...new Set(pendientes.flatMap((p) => p.plataformas))].sort((a, b) => a.localeCompare(b))
  const item = datos.lista.find((p) => p.id === elegida && !p.visto) ?? null
  const textoGanas = miembros.length === 2 ? 'Las dos con ganas' : miembros.length === 1 ? 'Con ganas' : 'Todas con ganas'
  const una = TIPOS[tipo].una

  function sortear(siguientes = filtros) {
    const opciones = candidatos(datos.lista, tipo, siguientes, miembros, datos.ganas)
    const nueva = elegirQueVer(opciones, datos.ganas, elegida)
    setVista(null)
    if (nueva) {
      setElegida(nueva.id)
      setMensaje(null)
      return
    }
    setElegida(null)
    setMensaje(
      siguientes.todasConGanas
        ? `Ninguna ${una} en la que ${miembros.length === 2 ? 'las dos tengáis' : 'todas tengáis'} ganas (😃 o 🤩)${siguientes.plataforma ? ` en ${siguientes.plataforma}` : ''}. Quitad el filtro o marcad vuestras ganas en la lista.`
        : `Ninguna ${una} pendiente${siguientes.plataforma ? ` en ${siguientes.plataforma}` : ''}.`,
    )
  }

  async function marcarVista(p: ParaVer) {
    setError(null)
    const fallo = await cambiarParaVer(p.id, { visto: true, visto_en: hoyComoTexto() })
    if (fallo) return setError(fallo)
    setVista(p.id)
    setElegida(null)
    onCambio()
  }

  async function gusto(id: string, nosGusto: boolean) {
    const fallo = await cambiarParaVer(id, { nos_gusto: nosGusto })
    if (fallo) return setError(fallo)
    setVista(null)
    setMensaje(nosGusto ? '👍 ¡Apuntado! Os sugeriremos más parecidas.' : '👎 Apuntado.')
    onCambio()
  }

  const chip = (activo: boolean) => estiloChip(activo, true)

  return (
    <section className="tarjeta flex flex-col gap-4">
      <TituloSeccion dibujo="🎲" titulo="¿Qué vemos?" subtitulo={`Una ${una} al azar de vuestra lista`} color="planes" />

      {pendientes.length === 0 ? (
        <p className="text-sm text-stone-500">Cuando añadáis {tipo === 'pelicula' ? 'películas' : 'series'} a la lista, aquí os elegimos una.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2" aria-label="Filtros del sorteo">
            <button
              type="button"
              aria-pressed={filtros.todasConGanas}
              onClick={() => setFiltros({ ...filtros, todasConGanas: !filtros.todasConGanas })}
              className={chip(filtros.todasConGanas)}
            >
              😃 {textoGanas}
            </button>
            {plataformas.length > 0 && (
              <>
                <button type="button" aria-pressed={filtros.plataforma === null} onClick={() => setFiltros({ ...filtros, plataforma: null })} className={chip(filtros.plataforma === null)}>
                  Cualquier sitio
                </button>
                {plataformas.map((n) => (
                  <button key={n} type="button" aria-pressed={filtros.plataforma === n} onClick={() => setFiltros({ ...filtros, plataforma: n })} className={chip(filtros.plataforma === n)}>
                    {n}
                  </button>
                ))}
              </>
            )}
          </div>
          <button type="button" onClick={() => sortear()} className={botonPrincipal}>
            🎲 {item ? 'Otra' : '¡Sorpréndenos!'}
          </button>
        </>
      )}

      {mensaje && (
        <p role="status" className="rounded-xl bg-stone-50 p-3 text-sm text-stone-600">
          {mensaje}
        </p>
      )}

      {item && (
        <div className="flex animate-aparecer flex-col gap-3 rounded-2xl bg-planes/50 p-3" aria-live="polite">
          <div className="flex gap-3">
            <Caratula poster={item.poster} titulo={item.titulo} tipo={item.tipo} grande />
            <div className="flex min-w-0 flex-col gap-1.5">
              <h3 className="text-lg leading-tight font-bold">
                {item.titulo} {item.anio && <span className="text-sm font-normal text-stone-500">({item.anio})</span>}
              </h3>
              <Plataformas nombres={item.plataformas} nuestras={nuestras} />
              <GanasDeTodas itemId={item.id} miembros={miembros} ganas={datos.ganas} />
              {item.sinopsis && <p className="line-clamp-4 text-sm text-stone-600">{item.sinopsis}</p>}
            </div>
          </div>
          <button type="button" onClick={() => marcarVista(item)} className="self-start rounded-full bg-marca-suave px-4 py-2 text-sm font-semibold text-marca">
            ✅ Ya la hemos {tipo === 'pelicula' ? 'visto' : 'terminado'}
          </button>
        </div>
      )}

      {vista && (
        <div role="status" className="flex flex-wrap items-center gap-2 rounded-xl bg-marca-suave/50 p-3 text-sm">
          <span className="font-semibold text-marca">✅ Apuntada. ¿Os gustó?</span>
          <button type="button" onClick={() => gusto(vista, true)} className="rounded-full bg-white px-3 py-1 font-semibold ring-1 ring-stone-200" aria-label="Nos gustó">
            👍 Sí
          </button>
          <button type="button" onClick={() => gusto(vista, false)} className="rounded-full bg-white px-3 py-1 font-semibold ring-1 ring-stone-200" aria-label="No nos gustó">
            👎 No
          </button>
        </div>
      )}
      {error && <p role="alert" className={avisoError}>{error}</p>}
    </section>
  )
}

// ---------------------------------------------------------------------
// 📋 Vuestra lista
// ---------------------------------------------------------------------

function Lista({
  datos,
  tipo,
  miembros,
  yo,
  nuestras,
  onCambio,
}: {
  datos: DatosParaVer
  tipo: TipoVer
  miembros: Miembro[]
  yo: Miembro | undefined
  nuestras: string[]
  onCambio: () => void
}) {
  const [verVistas, setVerVistas] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [abierta, setAbierta] = useState<string | null>(null)
  const delTipo = datos.lista.filter((p) => p.tipo === tipo)
  const pendientes = delTipo.filter((p) => !p.visto)
  const vistas = delTipo.filter((p) => p.visto)
  const mostradas = ordenar(verVistas ? vistas : pendientes, datos.ganas).filter(
    (p) => !busqueda.trim() || normalizar(`${p.titulo} ${p.notas ?? ''}`).includes(normalizar(busqueda)),
  )
  const plural = tipo === 'pelicula' ? 'películas' : 'series'

  return (
    <section className="tarjeta flex flex-col gap-4">
      <TituloSeccion
        dibujo="📋"
        titulo="Vuestra lista"
        subtitulo={pendientes.length === 1 ? `1 ${TIPOS[tipo].una} pendiente` : `${pendientes.length} ${plural} pendientes`}
        color="planes"
        derecha={
          <button
            type="button"
            onClick={() => ir(`/ver/anadir/${tipo}`)}
            className="shrink-0 rounded-full bg-planes px-3 py-1.5 text-sm font-semibold text-planes-tinta hover:brightness-95"
          >
            ➕ Añadir
          </button>
        }
      />

      {delTipo.length > 0 && (
        <div role="tablist" aria-label="Pendientes o vistas" className="flex gap-2">
          <button type="button" role="tab" aria-selected={!verVistas} onClick={() => setVerVistas(false)} className={estiloChip(!verVistas, true)}>
            Pendientes · {pendientes.length}
          </button>
          <button type="button" role="tab" aria-selected={verVistas} onClick={() => setVerVistas(true)} className={estiloChip(verVistas, true)}>
            {tipo === 'pelicula' ? 'Vistas' : 'Terminadas'} · {vistas.length}
          </button>
        </div>
      )}

      {delTipo.length > 8 && (
        <input type="search" className={campo} value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar en la lista…" aria-label="Buscar en la lista" />
      )}

      {delTipo.length === 0 && (
        <>
          <Vacio dibujo={TIPOS[tipo].dibujo} color="planes">
            Todavía no hay {plural}. Añadid las que os apetezca ver o pedid ideas.
          </Vacio>
          <div className="flex flex-col gap-2 md:flex-row">
            <button type="button" onClick={() => ir(`/ver/anadir/${tipo}`)} className={botonPrincipal}>
              ➕ Añadir {TIPOS[tipo].una}
            </button>
            <button type="button" onClick={() => ir(`/ver/sugerencias/${tipo}`)} className={botonSecundario}>
              ✨ Ideas de internet
            </button>
          </div>
        </>
      )}
      {delTipo.length > 0 && mostradas.length === 0 && (
        <p className="text-sm text-stone-500">
          {busqueda.trim() ? `Nada con «${busqueda}».` : verVistas ? `Todavía no habéis marcado ninguna como ${TIPOS[tipo].vista.toLowerCase()}.` : '¡Lo habéis visto todo! 🎉'}
        </p>
      )}

      <ul className="divide-y divide-stone-100">
        {mostradas.map((p) => (
          <FilaParaVer
            key={p.id}
            item={p}
            miembros={miembros}
            yo={yo}
            nivel={ganasDe(p.id, yo?.id, datos.ganas)}
            datos={datos}
            nuestras={nuestras}
            abierta={abierta === p.id}
            onAbrir={() => setAbierta(abierta === p.id ? null : p.id)}
            onCambio={onCambio}
          />
        ))}
      </ul>
    </section>
  )
}

function FilaParaVer({
  item,
  miembros,
  yo,
  nivel,
  datos,
  nuestras,
  abierta,
  onAbrir,
  onCambio,
}: {
  item: ParaVer
  miembros: Miembro[]
  yo: Miembro | undefined
  nivel: Nivel | null
  datos: DatosParaVer
  nuestras: string[]
  abierta: boolean
  onAbrir: () => void
  onCambio: () => void
}) {
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  async function hacer(accion: () => Promise<string | null>, mensaje?: string) {
    setEnviando(true)
    setError(null)
    setAviso(null)
    const fallo = await accion()
    setEnviando(false)
    if (fallo) return setError(fallo)
    if (mensaje) setAviso(mensaje)
    onCambio()
  }

  async function actualizarPlataformas() {
    if (!item.tmdb_id) return
    setEnviando(true)
    setError(null)
    try {
      const { resultado } = await pedirAlServidor<{ resultado: ResultadoTmdb }>({ accion: 'detalle', tipo: item.tipo, tmdb_id: item.tmdb_id })
      const nombres = resultado.plataformas.map((p) => p.nombre).slice(0, 12)
      setEnviando(false)
      await hacer(() => cambiarParaVer(item.id, { plataformas: nombres }), nombres.length ? `📺 Ahora está en: ${nombres.join(', ')}.` : '📺 Ahora mismo no está en ninguna plataforma de suscripción.')
    } catch (e) {
      setEnviando(false)
      setError(e instanceof Error ? e.message : 'No se ha podido consultar.')
    }
  }

  const boton = 'rounded-full px-3 py-1.5 text-sm font-semibold transition active:scale-[0.98] disabled:opacity-60'

  return (
    <li className="py-3">
      <div className="flex gap-3">
        {/* La carátula también abre (para el dedo); para el lector de pantalla ya está el título. */}
        <button type="button" onClick={onAbrir} tabIndex={-1} aria-hidden="true" className="shrink-0">
          <Caratula poster={item.poster} titulo={item.titulo} tipo={item.tipo} />
        </button>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <button type="button" onClick={onAbrir} aria-expanded={abierta} className="text-left">
            <span className="font-semibold">{item.titulo}</span>
            {item.anio && <span className="text-sm text-stone-500"> ({item.anio})</span>}
            {item.visto && item.nos_gusto !== null && (
              <span className="ml-1" aria-label={item.nos_gusto ? '(os gustó)' : '(no os gustó)'}>
                {item.nos_gusto ? '👍' : '👎'}
              </span>
            )}
          </button>
          <Plataformas nombres={item.plataformas} nuestras={nuestras} />
          <GanasDeTodas itemId={item.id} miembros={miembros} ganas={datos.ganas} />
          {!item.visto && yo && (
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-stone-500">Tus ganas:</span>
              <SelectorGanas nivel={nivel} titulo={item.titulo} desactivado={enviando} onElegir={(n) => hacer(() => marcarGanas(item.id, n))} />
            </span>
          )}
        </div>
      </div>

      {abierta && (
        <div className="mt-3 flex animate-aparecer flex-col gap-3 rounded-2xl bg-stone-50 p-3">
          {item.sinopsis && <p className="text-sm text-stone-600">{item.sinopsis}</p>}
          {item.notas && <p className="text-sm whitespace-pre-line text-stone-600">📝 {item.notas}</p>}
          {item.visto && item.visto_en && <p className="text-xs text-stone-500">{TIPOS[item.tipo].vista} el {new Date(`${item.visto_en}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}.</p>}
          <div className="flex flex-wrap gap-2">
            {!item.visto ? (
              <button
                type="button"
                disabled={enviando}
                onClick={() => hacer(() => cambiarParaVer(item.id, { visto: true, visto_en: hoyComoTexto() }), '✅ ¡Apuntada! Está en «' + (item.tipo === 'pelicula' ? 'Vistas' : 'Terminadas') + '».')}
                className={`${boton} bg-marca-suave text-marca`}
              >
                ✅ {TIPOS[item.tipo].vista}
              </button>
            ) : (
              <>
                <span className="self-center text-sm font-medium text-stone-600">¿Os gustó?</span>
                <button type="button" disabled={enviando} aria-pressed={item.nos_gusto === true} onClick={() => hacer(() => cambiarParaVer(item.id, { nos_gusto: item.nos_gusto === true ? null : true }))} className={`${boton} ${item.nos_gusto === true ? 'bg-marca text-white' : 'bg-white ring-1 ring-stone-200'}`}>
                  👍 Sí
                </button>
                <button type="button" disabled={enviando} aria-pressed={item.nos_gusto === false} onClick={() => hacer(() => cambiarParaVer(item.id, { nos_gusto: item.nos_gusto === false ? null : false }))} className={`${boton} ${item.nos_gusto === false ? 'bg-stone-700 text-white' : 'bg-white ring-1 ring-stone-200'}`}>
                  👎 No
                </button>
                <button type="button" disabled={enviando} onClick={() => hacer(() => cambiarParaVer(item.id, { visto: false, visto_en: null, nos_gusto: null }))} className={`${boton} text-stone-600 ring-1 ring-stone-200`}>
                  ↩️ Aún no la hemos {item.tipo === 'pelicula' ? 'visto' : 'terminado'}
                </button>
              </>
            )}
            {item.tmdb_id && (
              <button type="button" disabled={enviando} onClick={actualizarPlataformas} className={`${boton} text-stone-600 ring-1 ring-stone-200`}>
                🔄 ¿Dónde está ahora?
              </button>
            )}
            <button
              type="button"
              disabled={enviando}
              onClick={() => {
                if (window.confirm(`¿Quitar «${item.titulo}» de la lista?`)) void hacer(() => quitarParaVer(item.id))
              }}
              className={`${boton} text-red-700 ring-1 ring-red-200`}
            >
              🗑️ Quitar
            </button>
          </div>
        </div>
      )}
      {aviso && (
        <p role="status" className="mt-2 text-sm font-medium text-marca">
          {aviso}
        </p>
      )}
      {error && <p role="alert" className={`${avisoError} mt-2`}>{error}</p>}
    </li>
  )
}
