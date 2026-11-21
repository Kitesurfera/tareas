export type Hogar = {
  id: string
  nombre: string
}

export type Miembro = {
  id: string
  user_id: string
  nombre_visible: string
  rol: 'admin' | 'miembro'
}

// Lo que necesita la app sobre la persona que ha entrado.
export type Yo = {
  userId: string
  nombre: string
  hogar: Hogar
}

export type Mascota = {
  id: string
  hogar_id: string
  nombre: string
  especie: string
  raza: string | null
  fecha_nacimiento: string | null
  foto_ruta: string | null
  notas: string | null
}

export const ESPECIES = ['Perro', 'Gato', 'Conejo', 'Pájaro'] as const

export type TipoTratamiento =
  | 'vacuna'
  | 'desparasitacion_interna'
  | 'desparasitacion_externa'
  | 'medicacion'
  | 'revision'

// Cómo se muestra cada tipo, su dibujo, un ejemplo y cada cuánto suele tocar.
export const TIPOS_TRATAMIENTO: {
  valor: TipoTratamiento
  texto: string
  dibujo: string
  ejemplo: string
  diasHabituales: number
}[] = [
  { valor: 'vacuna', texto: 'Vacuna', dibujo: '💉', ejemplo: 'Rabia', diasHabituales: 365 },
  { valor: 'desparasitacion_interna', texto: 'Desparasitación interna', dibujo: '💊', ejemplo: 'Pastilla para lombrices', diasHabituales: 90 },
  { valor: 'desparasitacion_externa', texto: 'Desparasitación externa', dibujo: '🛡️', ejemplo: 'Pipeta antipulgas', diasHabituales: 30 },
  { valor: 'medicacion', texto: 'Medicación', dibujo: '🩺', ejemplo: 'Pastilla del corazón', diasHabituales: 30 },
  { valor: 'revision', texto: 'Revisión', dibujo: '🏥', ejemplo: 'Revisión anual', diasHabituales: 365 },
]

export function infoTipo(tipo: TipoTratamiento) {
  return TIPOS_TRATAMIENTO.find((t) => t.valor === tipo) ?? TIPOS_TRATAMIENTO[0]
}

export type Tratamiento = {
  id: string
  hogar_id: string
  mascota_id: string
  tipo: TipoTratamiento
  nombre: string
  fecha_ultima: string
  frecuencia_dias: number
  responsable_id: string | null
  notas: string | null
}

export type Categoria = 'mascota' | 'casa' | 'coche' | 'papeleo' | 'otros'

export const CATEGORIAS: { valor: Categoria; texto: string; dibujo: string }[] = [
  { valor: 'casa', texto: 'Casa', dibujo: '🏠' },
  { valor: 'mascota', texto: 'Mascota', dibujo: '🐾' },
  { valor: 'coche', texto: 'Coche', dibujo: '🚗' },
  { valor: 'papeleo', texto: 'Papeleo', dibujo: '📄' },
  { valor: 'otros', texto: 'Otros', dibujo: '📌' },
]

export function infoCategoria(categoria: Categoria) {
  return CATEGORIAS.find((c) => c.valor === categoria) ?? CATEGORIAS[4]
}

export type Tarea = {
  id: string
  hogar_id: string
  titulo: string
  descripcion: string | null
  fecha_limite: string | null
  responsable_id: string | null
  categoria: Categoria
  mascota_id: string | null
  tratamiento_id: string | null
  creada_por: string | null
  completada: boolean
  completada_por: string | null
  completada_en: string | null
}
