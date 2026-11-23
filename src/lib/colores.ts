import type { Categoria } from './tipos'

// Colores de la app para cosas que se repiten. Las clases van escritas
// enteras para que Tailwind las encuentre.

export type ColorSuave = 'inicio' | 'tareas' | 'casa' | 'vencimientos' | 'ajustes' | 'plantas' | 'planes' | 'coral'

// Fondo suave + tinta (texto) con buen contraste.
export const SUAVE: Record<ColorSuave, string> = {
  inicio: 'bg-inicio text-inicio-tinta',
  tareas: 'bg-tareas text-tareas-tinta',
  casa: 'bg-casa text-casa-tinta',
  vencimientos: 'bg-vencimientos text-vencimientos-tinta',
  ajustes: 'bg-ajustes text-ajustes-tinta',
  plantas: 'bg-plantas text-plantas-tinta',
  planes: 'bg-planes text-planes-tinta',
  coral: 'bg-coral-suave text-coral-tinta',
}

// Cada tipo de tarea con su color.
export const COLOR_CATEGORIA: Record<Categoria, ColorSuave> = {
  casa: 'casa',
  mascota: 'coral',
  plantas: 'plantas',
  coche: 'vencimientos',
  papeleo: 'tareas',
  otros: 'ajustes',
}

// Cada persona del hogar con su color: uno distinto para cada una, por
// orden de llegada al hogar (useMiembros lo apunta al cargar la gente).
// Fondo fuerte con letra blanca: todos con contraste ≥ 4,5.
const PERSONAS = ['bg-marca', 'bg-[#b8432d]', 'bg-[#6d4fd6]', 'bg-[#b45f16]', 'bg-[#2f6f9f]', 'bg-[#a3366f]']
// El mismo color, para bordes (las cosas previstas, que aún no son tareas).
const BORDES = ['border-marca', 'border-[#b8432d]', 'border-[#6d4fd6]', 'border-[#b45f16]', 'border-[#2f6f9f]', 'border-[#a3366f]']

let ordenDeLlegada: string[] = []

// La gente del hogar, en orden de llegada (miembros.id).
export function recordarOrdenDePersonas(ids: string[]): void {
  ordenDeLlegada = ids
}

function posicion(id: string): number {
  const i = ordenDeLlegada.indexOf(id)
  if (i >= 0) return i % PERSONAS.length
  // Por si aún no ha cargado la gente: siempre el mismo para la misma persona.
  return [...id].reduce((total, letra) => total + letra.charCodeAt(0), 0) % PERSONAS.length
}

export function colorDePersona(id: string | null | undefined): string {
  return id ? PERSONAS[posicion(id)] : 'bg-stone-400'
}

export function bordeDePersona(id: string | null | undefined): string {
  return id ? BORDES[posicion(id)] : 'border-stone-400'
}
