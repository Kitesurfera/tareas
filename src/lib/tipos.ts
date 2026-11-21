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
  vencimiento_id: string | null
  rutina_id: string | null
  creada_por: string | null
  completada: boolean
  completada_por: string | null
  completada_en: string | null
}

// Las tareas automáticas vienen de un tratamiento, un vencimiento o una
// rutina: no se editan ni se reabren a mano.
export function esAutomatica(tarea: Tarea): boolean {
  return Boolean(tarea.tratamiento_id || tarea.vencimiento_id || tarea.rutina_id)
}

// Dónde se edita una tarea automática.
export function rutaDeOrigen(tarea: Tarea): string | null {
  if (tarea.tratamiento_id) return `/tratamientos/${tarea.tratamiento_id}/editar`
  if (tarea.vencimiento_id) return `/vencimientos/${tarea.vencimiento_id}/editar`
  if (tarea.rutina_id) return `/casa/rutinas/${tarea.rutina_id}/editar`
  return null
}

export type TipoVencimiento = 'seguro' | 'suscripcion'

export type Vencimiento = {
  id: string
  hogar_id: string
  tipo: TipoVencimiento
  nombre: string
  fecha_renovacion: string
  frecuencia_meses: number | null
  importe: number | null
  aviso_dias: number | null
  responsable_id: string | null
  notas: string | null
}

export type Rutina = {
  id: string
  hogar_id: string
  nombre: string
  frecuencia_dias: number
  fecha_ultima: string
  responsable_id: string | null
  // Si es true, cada vez que alguien la hace le toca a la siguiente persona.
  turnos: boolean
  // Quién se turna (miembros.id). null = todo el hogar.
  participantes: string[] | null
  notas: string | null
}

// Ideas para empezar rápido: nombre y cada cuántos días.
export const RUTINAS_HABITUALES: { nombre: string; dias: number }[] = [
  { nombre: 'Sacar la basura', dias: 2 },
  { nombre: 'Poner lavadoras', dias: 3 },
  { nombre: 'Hacer la compra', dias: 7 },
  { nombre: 'Limpiar el baño', dias: 7 },
  { nombre: 'Pasar la aspiradora', dias: 7 },
  { nombre: 'Fregar el suelo', dias: 7 },
  { nombre: 'Regar las plantas', dias: 4 },
  { nombre: 'Cambiar las sábanas', dias: 14 },
  { nombre: 'Limpiar la nevera', dias: 30 },
]

export type ArticuloCompra = {
  id: string
  nombre: string
  cantidad: string | null
  comprado: boolean
  anadido_por: string | null
  comprado_por: string | null
}
