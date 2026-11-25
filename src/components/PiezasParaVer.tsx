import { imagenTmdb, NIVELES, TIPOS, ganasDe, type Ganas, type Nivel, type TipoVer } from '../lib/paraVer'
import type { Miembro } from '../lib/tipos'
import { Avatar } from './Piezas'

// Piezas de «🍿 Para ver».

// La carátula (de TMDB) o, si no tiene, el dibujo de película o serie.
export function Caratula({ poster, titulo, tipo, grande }: { poster: string | null; titulo: string; tipo: TipoVer; grande?: boolean }) {
  const tamano = grande ? 'h-36 w-24' : 'h-[4.5rem] w-12'
  const url = imagenTmdb(poster, grande ? 'w185' : 'w92')
  return url ? (
    <img src={url} alt={`Carátula de ${titulo}`} loading="lazy" className={`${tamano} shrink-0 rounded-xl bg-stone-100 object-cover shadow-sm ring-1 ring-stone-900/5`} />
  ) : (
    <span aria-hidden="true" className={`${tamano} flex shrink-0 items-center justify-center rounded-xl bg-planes text-2xl ring-1 ring-stone-900/5`}>
      {TIPOS[tipo].dibujo}
    </span>
  )
}

// Dónde se puede ver. Las vuestras, resaltadas.
export function Plataformas({ nombres, nuestras = [] }: { nombres: string[]; nuestras?: string[] }) {
  if (nombres.length === 0) return null
  return (
    <span className="flex flex-wrap gap-1">
      {nombres.map((n) => (
        <span
          key={n}
          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            nuestras.includes(n) ? 'bg-marca-suave text-marca ring-1 ring-marca/25' : 'bg-stone-100 text-stone-600'
          }`}
        >
          {nuestras.includes(n) && <span aria-hidden="true">✓ </span>}
          {n}
        </span>
      ))}
    </span>
  )
}

// Tus ganas: 😴 🙂 😃 🤩 (un toque; otro toque en la misma, la quita).
export function SelectorGanas({ nivel, onElegir, titulo, desactivado }: { nivel: Nivel | null; onElegir: (n: Nivel | null) => void; titulo: string; desactivado?: boolean }) {
  return (
    <span role="group" aria-label={`Tus ganas de ver ${titulo}`} className="inline-flex gap-1">
      {NIVELES.map((n) => {
        const elegido = nivel === n.valor
        return (
          <button
            key={n.valor}
            type="button"
            disabled={desactivado}
            onClick={() => onElegir(elegido ? null : n.valor)}
            aria-pressed={elegido}
            aria-label={n.texto}
            title={n.texto}
            className={`flex h-9 w-9 items-center justify-center rounded-full text-lg transition active:scale-90 disabled:opacity-60 ${
              elegido ? 'scale-110 bg-planes ring-2 ring-planes-tinta/50' : nivel === null ? 'bg-stone-100 hover:bg-stone-200' : 'bg-stone-50 opacity-45 grayscale hover:opacity-80'
            }`}
          >
            <span aria-hidden="true">{n.dibujo}</span>
          </button>
        )
      })}
    </span>
  )
}

// Las ganas de cada persona del hogar: su inicial y su carita (o «·» si no ha dicho nada).
export function GanasDeTodas({ itemId, miembros, ganas }: { itemId: string; miembros: Miembro[]; ganas: Ganas[] }) {
  return (
    <span className="flex flex-wrap items-center gap-2">
      {miembros.map((m) => {
        const nivel = ganasDe(itemId, m.id, ganas)
        const info = nivel === null ? null : NIVELES[nivel]
        return (
          <span
            key={m.id}
            className="inline-flex items-center gap-1 rounded-full bg-stone-50 py-0.5 pr-2 pl-0.5 text-xs text-stone-600 ring-1 ring-stone-200"
            title={`${m.nombre_visible}: ${info ? info.texto : 'sin decir'}`}
          >
            <Avatar id={m.id} nombre={m.nombre_visible} pequeno />
            <span className="sr-only">{m.nombre_visible}:</span>
            {info ? (
              <>
                <span aria-hidden="true" className="text-sm">{info.dibujo}</span>
                <span className="sr-only">{info.texto}</span>
              </>
            ) : (
              <span className="text-stone-400">sin decir</span>
            )}
          </span>
        )
      })}
    </span>
  )
}

// 🎬 Películas · 📺 Series
export function SelectorTipo({ tipo, onCambiar, cuantas }: { tipo: TipoVer; onCambiar: (t: TipoVer) => void; cuantas?: Record<TipoVer, number> }) {
  return (
    <div role="tablist" aria-label="Películas o series" className="grid grid-cols-2 gap-1 rounded-full bg-white p-1 shadow-sm ring-1 ring-stone-900/5">
      {(['pelicula', 'serie'] as const).map((t) => (
        <button
          key={t}
          type="button"
          role="tab"
          aria-selected={tipo === t}
          onClick={() => onCambiar(t)}
          className={`rounded-full px-3 py-2.5 text-sm font-semibold transition ${tipo === t ? 'bg-planes text-planes-tinta shadow-sm' : 'text-stone-500 hover:bg-stone-50'}`}
        >
          <span aria-hidden="true">{TIPOS[t].dibujo}</span> {TIPOS[t].texto}
          {cuantas && <span className="ml-1 font-normal opacity-80">· {cuantas[t]}</span>}
        </button>
      ))}
    </div>
  )
}

// La atribución que pide TMDB (y JustWatch, de quien vienen las plataformas).
export function AvisoTmdb() {
  return (
    <p className="text-center text-[11px] leading-relaxed text-stone-400">
      Datos e imágenes de{' '}
      <a href="https://www.themoviedb.org/" target="_blank" rel="noopener noreferrer" className="underline">
        TMDB
      </a>
      . Esta app usa la API de TMDB, pero TMDB no la avala ni la certifica. Plataformas: JustWatch.
    </p>
  )
}
