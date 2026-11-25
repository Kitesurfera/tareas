import type { MouseEvent, ReactNode } from 'react'
import { ir, reemplazar } from '../lib/ruta'

export type Pestana = 'inicio' | 'tareas' | 'casa' | 'planes' | 'vencimientos'

// Cada pestaña con su dibujo y su color (las clases van enteras para que
// Tailwind las encuentre).
const PESTANAS: { valor: Pestana; texto: string; dibujo: string; ruta: string; activa: string }[] = [
  { valor: 'inicio', texto: 'Inicio', dibujo: '🏡', ruta: '/', activa: 'bg-inicio text-inicio-tinta' },
  { valor: 'tareas', texto: 'Tareas', dibujo: '📝', ruta: '/tareas', activa: 'bg-tareas text-tareas-tinta' },
  { valor: 'casa', texto: 'Casa', dibujo: '🧹', ruta: '/casa', activa: 'bg-casa text-casa-tinta' },
  { valor: 'planes', texto: 'Planes', dibujo: '🎲', ruta: '/planes', activa: 'bg-planes text-planes-tinta' },
  { valor: 'vencimientos', texto: 'Vencimientos', dibujo: '📅', ruta: '/vencimientos', activa: 'bg-vencimientos text-vencimientos-tinta' },
]

// Lo que no es una pestaña pero está a mano en el menú del ordenador.
const OTRAS: { valor: string; texto: string; dibujo: string; ruta: string }[] = [
  { valor: 'carga', texto: 'En equipo', dibujo: '💚', ruta: '/carga' },
  { valor: 'viajes', texto: 'Viajes', dibujo: '✈️', ruta: '/viajes' },
  { valor: 'accesos', texto: 'Accesos', dibujo: '🔑', ruta: '/accesos' },
  { valor: 'ajustes', texto: 'Ajustes', dibujo: '⚙️', ruta: '/ajustes' },
]

// Las direcciones donde se ve la barra de abajo en el móvil.
const RAICES = PESTANAS.map((p) => p.ruta)

// En qué sección del menú estás (las fichas y formularios cuelgan de su pestaña).
function seccionDe(ruta: string): string {
  const primera = ruta.split('/').filter(Boolean)[0] ?? ''
  if (primera === '' || primera === 'mascotas' || primera === 'tratamientos' || primera === 'semana') return 'inicio'
  if (primera === 'cuidados') return 'casa'
  if (primera === 'documentos') return 'vencimientos'
  if (primera === 'ver') return 'planes'
  if (primera === 'regalos') return 'tareas'
  return primera
}

// Un enlace de verdad (en el ordenador se puede abrir en otra pestaña con
// Ctrl o la rueda), pero que con un clic normal navega dentro de la app.
function alPulsar(ruta: string, sustituir: boolean) {
  return (evento: MouseEvent<HTMLAnchorElement>) => {
    if (evento.button !== 0 || evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.altKey) return
    evento.preventDefault()
    // Cambiar de pestaña no apila pantallas en el «atrás».
    if (sustituir) reemplazar(ruta)
    else ir(ruta)
  }
}

type Props = {
  ruta: string
  hogar: string
  nombre: string
  // Si te han encargado tareas en otro hogar (acceso temporal).
  conEncargos: boolean
  children: ReactNode
}

// El marco de todas las pantallas una vez dentro:
// - En el móvil, la barra de pestañas flotando abajo (solo en las pestañas).
// - En la tablet y el ordenador (desde 768 px de ancho), un menú fijo a la
//   izquierda siempre (más estrecho en la tablet).
export function Marco({ ruta, hogar, nombre, conEncargos, children }: Props) {
  const seccion = seccionDe(ruta)
  const enPestana = RAICES.includes(ruta)
  const otras = conEncargos
    ? [...OTRAS.slice(0, 3), { valor: 'encargos', texto: 'Mis encargos', dibujo: '🧺', ruta: '/encargos' }, OTRAS[3]]
    : OTRAS

  return (
    <div className={enPestana ? 'pb-28 md:pb-0' : undefined}>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-52 flex-col gap-6 overflow-y-auto border-r border-stone-900/5 bg-white/75 px-4 py-6 backdrop-blur-md md:flex lg:w-64">
        <a href="#/" onClick={alPulsar('/', true)} aria-label={`Tareas · ${hogar} · ir al inicio`} className="flex items-center gap-3 rounded-2xl px-2 py-1">
          <img src="/pwa-192x192.png" alt="" className="h-11 w-11 rounded-2xl shadow-sm" />
          <span className="min-w-0">
            <span className="block font-redonda text-xl leading-tight font-extrabold text-marca">Tareas</span>
            <span className="block truncate text-xs text-stone-500">🏡 {hogar}</span>
          </span>
        </a>

        <nav aria-label="Secciones">
          <ul className="flex flex-col gap-1">
            {PESTANAS.map((pestana) => {
              const activa = pestana.valor === seccion
              return (
                <li key={pestana.valor}>
                  <a
                    href={`#${pestana.ruta}`}
                    onClick={alPulsar(pestana.ruta, true)}
                    aria-current={activa ? 'page' : undefined}
                    className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 font-semibold transition-colors ${
                      activa ? pestana.activa : 'text-stone-600 hover:bg-stone-100'
                    }`}
                  >
                    <span aria-hidden="true" className={`text-xl leading-none ${activa ? '' : 'grayscale-[35%]'}`}>
                      {pestana.dibujo}
                    </span>
                    {pestana.texto}
                  </a>
                </li>
              )
            })}
          </ul>
        </nav>

        <nav aria-label="Más opciones">
          <p className="px-3 text-xs font-semibold tracking-wide text-stone-400 uppercase">Más</p>
          <ul className="mt-2 flex flex-col gap-1">
            {otras.map((otra) => {
              const activa = otra.valor === seccion
              return (
                <li key={otra.valor}>
                  <a
                    href={`#${otra.ruta}`}
                    onClick={alPulsar(otra.ruta, false)}
                    aria-current={activa ? 'page' : undefined}
                    className={`flex items-center gap-3 rounded-2xl px-3 py-2 text-sm font-medium transition-colors ${
                      activa ? 'bg-ajustes text-ajustes-tinta' : 'text-stone-600 hover:bg-stone-100'
                    }`}
                  >
                    <span aria-hidden="true" className="text-lg leading-none">{otra.dibujo}</span>
                    {otra.texto}
                  </a>
                </li>
              )
            })}
          </ul>
        </nav>

        <a
          href="#/ajustes"
          onClick={alPulsar('/ajustes', false)}
          className="mt-auto flex items-center gap-3 rounded-2xl bg-stone-50 p-3 ring-1 ring-stone-900/5 transition-colors hover:bg-stone-100"
        >
          <span
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-marca text-sm font-bold text-white"
          >
            {nombre.charAt(0).toUpperCase()}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{nombre}</span>
            <span className="block text-xs text-stone-500">Tu perfil y ajustes</span>
          </span>
        </a>
      </aside>

      <div className="md:pl-52 lg:pl-64">{children}</div>

      {enPestana && (
        <nav
          aria-label="Secciones"
          className="fixed inset-x-0 bottom-0 px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] md:hidden"
        >
          <ul className="mx-auto grid max-w-md grid-cols-5 gap-0.5 rounded-[1.75rem] bg-white/90 p-1.5 shadow-[0_10px_30px_-12px_rgb(60_40_20/0.35)] ring-1 ring-stone-900/5 backdrop-blur-md">
            {PESTANAS.map((pestana) => {
              const activa = pestana.valor === seccion
              return (
                <li key={pestana.valor}>
                  <button
                    type="button"
                    // Cambiar de pestaña no apila pantallas en el «atrás».
                    onClick={() => reemplazar(pestana.ruta)}
                    aria-current={activa ? 'page' : undefined}
                    className={`flex w-full flex-col items-center gap-0.5 rounded-[1.35rem] py-1.5 text-[10.5px] font-semibold tracking-tight transition-colors ${
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
      )}
    </div>
  )
}
