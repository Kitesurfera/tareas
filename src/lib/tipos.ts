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
