import { useState } from 'react'
import { anadirParaVer, desdeTmdb, ganasDe, marcarGanas, pedirAlServidor, type DatosParaVer, type ResultadoTmdb } from '../lib/paraVer'
import type { Miembro } from '../lib/tipos'
import { avisoError } from './estilos'
import { Caratula, Plataformas, SelectorGanas } from './PiezasParaVer'

type Props = {
  resultado: ResultadoTmdb
  hogarId: string
  datos: DatosParaVer
  yo: Miembro | undefined
  nuestras: string[]
  // Los resultados de una búsqueda no traen las plataformas: se piden al añadir.
  pedirPlataformas: boolean
  onCambio: () => void
}

// Una película o serie de TMDB (buscada o sugerida) con «➕ A la lista».
// Una vez en la lista, ahí mismo se marcan tus ganas.
export function ResultadoParaAnadir({ resultado: r, hogarId, datos, yo, nuestras, pedirPlataformas, onCambio }: Props) {
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sinopsisEntera, setSinopsisEntera] = useState(false)
  const enLista = datos.lista.find((p) => p.tipo === r.tipo && p.tmdb_id === r.tmdb_id)

  async function anadir() {
    setEnviando(true)
    setError(null)
    let completo = r
    if (pedirPlataformas) {
      try {
        completo = (await pedirAlServidor<{ resultado: ResultadoTmdb }>({ accion: 'detalle', tipo: r.tipo, tmdb_id: r.tmdb_id })).resultado
      } catch {
        // Sin plataformas: se puede consultar luego con «🔄 ¿Dónde está ahora?».
      }
    }
    const hecho = await anadirParaVer(hogarId, desdeTmdb(completo))
    setEnviando(false)
    if ('error' in hecho) return setError(hecho.error)
    onCambio()
  }

  async function ganas(n: 0 | 1 | 2 | 3 | null) {
    if (!enLista) return
    setEnviando(true)
    const fallo = await marcarGanas(enLista.id, n)
    setEnviando(false)
    if (fallo) return setError(fallo)
    onCambio()
  }

  return (
    <li className="flex gap-3 py-3">
      <Caratula poster={r.poster} titulo={r.titulo} tipo={r.tipo} grande />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <h3 className="leading-tight font-semibold">
          {r.titulo} {r.anio && <span className="text-sm font-normal text-stone-500">({r.anio})</span>}
        </h3>
        {(r.titulo_original || r.puntuacion !== null) && (
          <p className="text-xs text-stone-500">
            {r.titulo_original && <span className="italic">{r.titulo_original}</span>}
            {r.titulo_original && r.puntuacion !== null && ' · '}
            {r.puntuacion !== null && <span>⭐ {r.puntuacion.toLocaleString('es-ES')}</span>}
          </p>
        )}
        <Plataformas nombres={r.plataformas.map((p) => p.nombre)} nuestras={nuestras} />
        {r.sinopsis && (
          <button type="button" onClick={() => setSinopsisEntera(!sinopsisEntera)} className={`text-left text-sm text-stone-600 ${sinopsisEntera ? '' : 'line-clamp-3'}`}>
            {r.sinopsis}
          </button>
        )}
        {enLista ? (
          <span className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-marca">✓ En vuestra lista{enLista.visto ? ' (ya vista)' : ''}</span>
            {yo && !enLista.visto && (
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-stone-500">Tus ganas:</span>
                <SelectorGanas nivel={ganasDe(enLista.id, yo.id, datos.ganas)} titulo={r.titulo} desactivado={enviando} onElegir={ganas} />
              </span>
            )}
          </span>
        ) : (
          <button
            type="button"
            onClick={anadir}
            disabled={enviando}
            className="self-start rounded-full bg-linear-to-b from-marca to-[#0b5f58] px-4 py-2 text-sm font-semibold text-white shadow-sm transition active:scale-[0.98] disabled:opacity-60"
          >
            {enviando ? 'Añadiendo…' : '➕ A la lista'}
          </button>
        )}
        {error && <p role="alert" className={avisoError}>{error}</p>}
      </div>
    </li>
  )
}
