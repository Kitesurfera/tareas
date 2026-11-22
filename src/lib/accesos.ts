import { useEffect, useState } from 'react'
import { hoyComoTexto } from './fechas'
import { supabase } from './supabase'
import type { Categoria, Tarea } from './tipos'

// ---------------------------------------------------------------------
// Lado del hogar: los accesos que damos y las notas que nos dejan
// ---------------------------------------------------------------------

export type Acceso = {
  id: string
  nombre: string
  codigo: string
  user_id: string | null
  desde: string
  hasta: string
  categorias: Categoria[]
  tareas: string[]
  rutinas: string[]
  tratamientos: string[]
  cuidados: string[]
  // Con qué cuenta se abrió el enlace (nombre de Google y email a medias).
  aceptado_nombre?: string | null
  aceptado_email?: string | null
  aceptado_en?: string | null
}

export type NotaEncargo = {
  id: string
  autora: string
  tarea_titulo: string | null
  texto: string
  creado_en: string
}

// Los accesos de tu hogar (gracias a RLS, nunca los de otro). null = cargando.
export function useAccesos() {
  const [accesos, setAccesos] = useState<Acceso[] | null>(null)
  const [error, setError] = useState(false)
  const [recarga, setRecarga] = useState(0)

  useEffect(() => {
    if (!supabase) return
    let vigente = true
    supabase
      .from('accesos')
      .select('*')
      .order('desde', { ascending: false })
      .then(({ data, error }) => {
        if (!vigente) return
        if (error) setError(true)
        else setAccesos(data as Acceso[])
      })
    return () => {
      vigente = false
    }
  }, [recarga])

  return { accesos, error, recargar: () => setRecarga((n) => n + 1) }
}

// Las últimas notas de quien os ayuda.
export function useNotasEncargo(cuantas = 30) {
  const [notas, setNotas] = useState<NotaEncargo[] | null>(null)
  const [recarga, setRecarga] = useState(0)

  useEffect(() => {
    if (!supabase) return
    let vigente = true
    supabase
      .from('notas_encargo')
      .select('id, autora, tarea_titulo, texto, creado_en')
      .order('creado_en', { ascending: false })
      .limit(cuantas)
      .then(({ data }) => {
        if (vigente) setNotas((data ?? []) as NotaEncargo[])
      })
    return () => {
      vigente = false
    }
  }, [cuantas, recarga])

  return { notas, recargar: () => setRecarga((n) => n + 1) }
}

export type EstadoAcceso = 'terminado' | 'futuro' | 'sin aceptar' | 'activo'

export function estadoAcceso(acceso: Acceso): EstadoAcceso {
  const hoy = hoyComoTexto()
  if (acceso.hasta < hoy) return 'terminado'
  if (!acceso.user_id) return 'sin aceptar'
  if (acceso.desde > hoy) return 'futuro'
  return 'activo'
}

// ¿Este acceso cubre esta tarea ese día? (Lo mismo que comprueba la base
// de datos en encargo_vigente; aquí solo sirve para enseñarlo.)
export function accesoCubre(acceso: Acceso, tarea: Tarea, dia: string): boolean {
  return (
    acceso.desde <= dia &&
    dia <= acceso.hasta &&
    (!tarea.fecha_limite || tarea.fecha_limite <= acceso.hasta) &&
    (acceso.categorias.includes(tarea.categoria) ||
      acceso.tareas.includes(tarea.id) ||
      (tarea.rutina_id !== null && acceso.rutinas.includes(tarea.rutina_id)) ||
      (tarea.tratamiento_id !== null && acceso.tratamientos.includes(tarea.tratamiento_id)) ||
      (tarea.cuidado_id !== null && acceso.cuidados.includes(tarea.cuidado_id)))
  )
}

export function enlaceDeAcceso(codigo: string): string {
  return `${window.location.origin}/?encargo=${codigo}`
}

// ---------------------------------------------------------------------
// Lado de quien ayuda: sus encargos
// ---------------------------------------------------------------------

export type EncargoTarea = {
  id: string
  titulo: string
  descripcion: string | null
  fecha_limite: string | null
  categoria: Categoria
  mascota: string | null
  planta: string | null
  notas: string | null
}

export type Encargo = {
  id: string
  hogar: string
  nombre: string
  desde: string
  hasta: string
  activo: boolean
  tareas: EncargoTarea[]
  mascotas: { nombre: string; especie: string; raza: string | null; fecha_nacimiento: string | null; notas: string | null }[]
  plantas: { nombre: string; tipo: string | null; ubicacion: string | null; notas: string | null }[]
  hechas: { titulo: string; completada_en: string }[]
}

// Quien abre el enlace (…/?encargo=CODIGO) todavía no ha entrado con
// Google: guardamos el código para no perderlo por el camino.
const CLAVE = 'tareas.encargo'

export function guardarEncargoDeLaUrl(): void {
  const url = new URL(window.location.href)
  const codigo = url.searchParams.get('encargo')
  if (!codigo) return
  try {
    localStorage.setItem(CLAVE, codigo.trim().toUpperCase())
  } catch {
    // Si el navegador no deja guardar, habrá que abrir el enlace otra vez.
  }
  // Quitamos el código de la dirección para que no se quede a la vista.
  url.searchParams.delete('encargo')
  window.history.replaceState(window.history.state, '', url.toString())
}

export function leerEncargoPendiente(): string {
  try {
    return localStorage.getItem(CLAVE) ?? ''
  } catch {
    return ''
  }
}

export function borrarEncargoPendiente(): void {
  try {
    localStorage.removeItem(CLAVE)
  } catch {
    // Nada que hacer.
  }
}
