import type { ReactNode } from 'react'
import { reemplazar } from '../lib/ruta'

export type Pestana = 'inicio' | 'tareas' | 'casa' | 'vencimientos'

// Cada pestaña con su dibujo y su color (las clases van enteras para que
// Tailwind las encuentre).
const PESTANAS: { valor: Pestana; texto: string; dibujo: string; ruta: string; activa: string }[] = [
  { valor: 'inicio', texto: 'Inicio', dibujo: '🏡', ruta: '/', activa: 'bg-inicio text-inicio-tinta' },
  { valor: 'tareas', texto: 'Tareas', dibujo: '📝', ruta: '/tareas', activa: 'bg-tareas text-tareas-tinta' },
  { valor: 'casa', texto: 'Casa', dibujo: '🧹', ruta: '/casa', activa: 'bg-casa text-casa-tinta' },
  { valor: 'vencimientos', texto: 'Vencimientos', dibujo: '📅', ruta: '/vencimientos', activa: 'bg-vencimientos text-vencimientos-tinta' },
]

type Props = {
  actual: Pestana
  children: ReactNode
}

// Pantalla principal con la barra de pestañas flotando abajo.
export function ConPestanas({ actual, children }: Props) {
  return (
    <div className="pb-28">
      {children}
      <nav
        aria-label="Secciones"
        className="fixed inset-x-0 bottom-0 px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]"
      >
        <ul className="mx-auto grid max-w-md grid-cols-4 gap-1 rounded-[1.75rem] bg-white/90 p-1.5 shadow-[0_10px_30px_-12px_rgb(60_40_20/0.35)] ring-1 ring-stone-900/5 backdrop-blur-md">
          {PESTANAS.map((pestana) => {
            const activa = pestana.valor === actual
            return (
              <li key={pestana.valor}>
                <button
                  type="button"
                  // Cambiar de pestaña no apila pantallas en el «atrás».
                  onClick={() => reemplazar(pestana.ruta)}
                  aria-current={activa ? 'page' : undefined}
                  className={`flex w-full flex-col items-center gap-0.5 rounded-[1.35rem] py-1.5 text-[11px] font-semibold transition-colors ${
                    activa ? pestana.activa : 'text-stone-500 active:bg-stone-100'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`text-[1.4rem] leading-none transition-transform ${
                      activa ? '-translate-y-px scale-110' : 'opacity-70 grayscale-[35%]'
                    }`}
                  >
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
