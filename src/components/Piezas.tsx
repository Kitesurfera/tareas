import type { CSSProperties, ReactNode } from 'react'
import { colorDePersona, SUAVE, type ColorSuave } from '../lib/colores'

// Título de una tarjeta: el dibujo en un sello de color, el título y, si
// hace falta, una frase debajo y algo a la derecha.
export function TituloSeccion({
  dibujo,
  titulo,
  subtitulo,
  color = 'inicio',
  derecha,
}: {
  dibujo: string
  titulo: ReactNode
  subtitulo?: ReactNode
  color?: ColorSuave
  derecha?: ReactNode
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className={`flex h-11 w-11 shrink-0 -rotate-6 items-center justify-center rounded-2xl text-2xl ${SUAVE[color]}`}
      >
        {dibujo}
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-lg leading-tight font-bold">{titulo}</h2>
        {subtitulo && <p className="text-sm text-stone-500">{subtitulo}</p>}
      </div>
      {derecha}
    </div>
  )
}

// Cuando no hay nada que enseñar: un dibujo grande y una frase amable.
export function Vacio({ dibujo, children, color = 'inicio' }: { dibujo: string; children: ReactNode; color?: ColorSuave }) {
  return (
    <div className="flex flex-col items-center gap-3 py-4 text-center">
      <span
        aria-hidden="true"
        className={`flex h-16 w-16 rotate-3 items-center justify-center rounded-[1.5rem] text-4xl ${SUAVE[color]}`}
      >
        {dibujo}
      </span>
      <p className="max-w-xs text-stone-600">{children}</p>
    </div>
  )
}

// La inicial de una persona en un círculo de su color.
export function Avatar({ id, nombre, pequeno }: { id: string | null | undefined; nombre: string; pequeno?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white ${colorDePersona(id)} ${
        pequeno ? 'h-5 w-5 text-[10px]' : 'h-9 w-9 text-sm'
      }`}
    >
      {nombre.charAt(0).toUpperCase()}
    </span>
  )
}

// Etiqueta pequeña de color («Hoy», «🐾 Luna»…).
export function Etiqueta({ children, className }: { children: ReactNode; className: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${className}`}>
      {children}
    </span>
  )
}

// Confeti: unos trocitos que salen disparados y desaparecen (una vez).
// Si el móvil tiene «reducir movimiento», no se ve nada.
const TROZOS: { dibujo: string; x: string; y: string; giro: string }[] = [
  { dibujo: '🎉', x: '-70px', y: '-46px', giro: '-40deg' },
  { dibujo: '✨', x: '-30px', y: '-60px', giro: '25deg' },
  { dibujo: '💚', x: '10px', y: '-64px', giro: '-15deg' },
  { dibujo: '⭐', x: '52px', y: '-50px', giro: '50deg' },
  { dibujo: '✨', x: '80px', y: '-24px', giro: '-30deg' },
  { dibujo: '🎊', x: '-86px', y: '-10px', giro: '35deg' },
]

export function Confeti() {
  return (
    <span aria-hidden="true" className="pointer-events-none absolute top-1/2 left-6">
      {TROZOS.map((t, i) => (
        <span
          key={i}
          className="absolute animate-estallar text-lg opacity-0"
          style={{ '--x': t.x, '--y': t.y, '--giro': t.giro, animationDelay: `${i * 30}ms` } as CSSProperties}
        >
          {t.dibujo}
        </span>
      ))}
    </span>
  )
}
