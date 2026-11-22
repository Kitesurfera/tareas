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

// Cada persona del hogar con su color (siempre el mismo para la misma
// persona). Fondo fuerte con letra blanca: todos con contraste ≥ 4,5.
const PERSONAS = ['bg-marca', 'bg-[#b8432d]', 'bg-[#6d4fd6]', 'bg-[#b45f16]']

export function colorDePersona(id: string | null | undefined): string {
  if (!id) return 'bg-stone-400'
  const suma = [...id].reduce((total, letra) => total + letra.charCodeAt(0), 0)
  return PERSONAS[suma % PERSONAS.length]
}
