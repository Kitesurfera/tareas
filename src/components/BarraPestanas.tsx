import type { ReactNode } from 'react'
import { reemplazar } from '../lib/ruta'

export type Pestana = 'inicio' | 'tareas' | 'casa' | 'vencimientos'

const PESTANAS: { valor: Pestana; texto: string; dibujo: string; ruta: string }[] = [
  { valor: 'inicio', texto: 'Inicio', dibujo: '🏡', ruta: '/' },
  { valor: 'tareas', texto: 'Tareas', dibujo: '✅', ruta: '/tareas' },
  { valor: 'casa', texto: 'Casa', dibujo: '🧹', ruta: '/casa' },
  { valor: 'vencimientos', texto: 'Vencimientos', dibujo: '📅', ruta: '/vencimientos' },
]

type Props = {
  actual: Pestana
  children: ReactNode
}

// Pantalla principal con la barra de pestañas fija abajo.
export function ConPestanas({ actual, children }: Props) {
  return (
    <div className="pb-24">
      {children}
      <nav
        aria-label="Secciones"
        className="fixed inset-x-0 bottom-0 border-t border-stone-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
      >
        <ul className="mx-auto grid max-w-md grid-cols-4">
          {PESTANAS.map((pestana) => {
            const activa = pestana.valor === actual
            return (
              <li key={pestana.valor}>
                <button
                  type="button"
                  // Cambiar de pestaña no apila pantallas en el «atrás».
                  onClick={() => reemplazar(pestana.ruta)}
                  aria-current={activa ? 'page' : undefined}
                  className={`flex w-full flex-col items-center gap-0.5 py-2 text-xs font-medium ${
                    activa ? 'text-marca' : 'text-stone-500'
                  }`}
                >
                  <span aria-hidden="true" className={`text-xl ${activa ? '' : 'opacity-60 grayscale'}`}>
                    {pestana.dibujo}
                  </span>
                  {pestana.texto}
                </button>
              </li>
            )
          })}
        </ul>
      </nav>
    </div>
  )
}
