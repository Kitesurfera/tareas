import type { ReactNode } from 'react'

export type ColorCabecera = 'inicio' | 'tareas' | 'casa' | 'vencimientos' | 'ajustes'

// Las clases van escritas enteras para que Tailwind las encuentre.
const COLORES: Record<ColorCabecera, { fondo: string; tinta: string }> = {
  inicio: { fondo: 'bg-inicio', tinta: 'text-inicio-tinta' },
  tareas: { fondo: 'bg-tareas', tinta: 'text-tareas-tinta' },
  casa: { fondo: 'bg-casa', tinta: 'text-casa-tinta' },
  vencimientos: { fondo: 'bg-vencimientos', tinta: 'text-vencimientos-tinta' },
  ajustes: { fondo: 'bg-ajustes', tinta: 'text-ajustes-tinta' },
}

type Props = {
  color: ColorCabecera
  titulo: ReactNode
  subtitulo?: ReactNode
  // Una etiqueta pequeña encima del título (por ejemplo, el nombre del hogar).
  etiqueta?: ReactNode
  // El dibujo grande que flota a la derecha.
  dibujo: string
  // Un botón arriba a la derecha (por ejemplo, ⚙️ en el inicio).
  boton?: ReactNode
}

// Cabecera de color de cada pestaña: título, subtítulo y un dibujo que flota.
// Va pegada arriba y a los lados de la pantalla (por eso los márgenes negativos).
export function CabeceraPestana({ color, titulo, subtitulo, etiqueta, dibujo, boton }: Props) {
  const { fondo, tinta } = COLORES[color]
  return (
    <header className={`relative -mx-5 -mt-8 overflow-hidden rounded-b-[2.25rem] px-5 pt-8 pb-7 ${fondo}`}>
      {/* Burbujas de adorno */}
      <span aria-hidden="true" className="absolute -top-12 -right-10 h-44 w-44 rounded-full bg-white/35" />
      <span aria-hidden="true" className="absolute top-24 right-36 h-6 w-6 rounded-full bg-white/50" />
      <span
        aria-hidden="true"
        className="absolute right-5 bottom-5 inline-block animate-flotar text-5xl leading-none drop-shadow-sm select-none"
      >
        {dibujo}
      </span>

      <div className="relative flex items-start justify-between gap-4">
        <div className="min-w-0 pr-14">
          {etiqueta && (
            <p className={`mb-2 inline-flex items-center gap-1 rounded-full bg-white/60 px-3 py-1 text-xs font-semibold ${tinta}`}>
              {etiqueta}
            </p>
          )}
          <h1 className={`text-[1.75rem] leading-tight font-extrabold ${tinta}`}>{titulo}</h1>
          {subtitulo && <p className="mt-1 pr-6 text-stone-700">{subtitulo}</p>}
        </div>
        {boton}
      </div>
    </header>
  )
}
