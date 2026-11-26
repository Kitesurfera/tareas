import { useEffect, useState } from 'react'
import { mensajeDeError } from './errores'
import { supabase } from './supabase'

// «🙋 Hoy no puedo»: pedir a otra persona de casa que se encargue de tus
// tareas (tabla peticiones_ayuda, funciones pedir_ayuda, responder_ayuda y
// cancelar_ayuda). El aviso al móvil lo manda api/aviso-ayuda.

export type EstadoPeticion = 'pendiente' | 'aceptada' | 'rechazada' | 'cancelada'

export type PeticionAyuda = {
  id: string
  hogar_id: string
  de_miembro: string
  para_miembro: string
  tareas: string[]
  mensaje: string | null
  estado: EstadoPeticion
  creado_en: string
  respondida_en: string | null
}

// Mensajes rápidos (o lo que quieras escribir).
export const MOTIVOS = ['🤒 Estoy mala', '😴 Estoy agotada', '💼 Mucho trabajo', '🏃 No llego a tiempo', '💆 Necesito un respiro']

// Las peticiones contigo de los últimos 2 días (gracias a RLS, solo las que
// has pedido tú o te han pedido a ti). null = cargando.
export function usePeticionesAyuda() {
  const [peticiones, setPeticiones] = useState<PeticionAyuda[] | null>(null)
  const [recarga, setRecarga] = useState(0)

  useEffect(() => {
    if (!supabase) return
    let vigente = true
    const desde = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
    supabase
      .from('peticiones_ayuda')
      .select('id, hogar_id, de_miembro, para_miembro, tareas, mensaje, estado, creado_en, respondida_en')
      .gte('creado_en', desde)
      .order('creado_en', { ascending: false })
      .then(({ data, error }) => {
        if (!vigente) return
        // Si todavía no se ha ejecutado el SQL, sin peticiones (la app sigue igual).
        setPeticiones(error ? [] : (data as PeticionAyuda[]))
      })
    const alCambiar = () => setRecarga((n) => n + 1)
    window.addEventListener('ayuda-cambiada', alCambiar)
    return () => {
      vigente = false
      window.removeEventListener('ayuda-cambiada', alCambiar)
    }
  }, [recarga])

  return { peticiones, recargar: () => setRecarga((n) => n + 1) }
}

// Que se entere el resto de la app (las tarjetas y las listas).
const avisarALaApp = () => window.dispatchEvent(new Event('ayuda-cambiada'))

// El aviso al móvil (si falla, la petición sigue hecha: la verá en el inicio).
async function avisarAlMovil(peticion: string) {
  if (!supabase) return
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) return
  try {
    await fetch('/api/aviso-ayuda', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ peticion }),
    })
  } catch {
    // Sin conexión: no pasa nada, la tarjeta del inicio sigue ahí.
  }
}

function faltaElSql(codigo: string | undefined) {
  return codigo === '42883' || codigo === 'PGRST202' || codigo === '42P01' || codigo === 'PGRST205'
}

export async function pedirAyuda(para: string, tareas: string[], mensaje: string): Promise<string | null> {
  if (!supabase) return 'Sin conexión.'
  const { data, error } = await supabase.rpc('pedir_ayuda', { para, las_tareas: tareas, mensaje: mensaje.trim() || null })
  if (error) return faltaElSql(error.code) ? 'Falta ejecutar en Supabase el SQL de «Hoy no puedo».' : mensajeDeError(error)
  await avisarAlMovil(data as string)
  avisarALaApp()
  return null
}

export async function responderAyuda(peticion: string, acepta: boolean): Promise<string | null> {
  if (!supabase) return 'Sin conexión.'
  const { error } = await supabase.rpc('responder_ayuda', { peticion, acepta })
  if (error) return mensajeDeError(error)
  await avisarAlMovil(peticion)
  avisarALaApp()
  return null
}

export async function cancelarAyuda(peticion: string): Promise<string | null> {
  if (!supabase) return 'Sin conexión.'
  const { error } = await supabase.rpc('cancelar_ayuda', { peticion })
  if (error) return mensajeDeError(error)
  avisarALaApp()
  return null
}

// «1 cosa», «3 cosas»
export const cosas = (n: number) => (n === 1 ? '1 cosa' : `${n} cosas`)

// Lo ya contestado que ya has visto (para no enseñarlo más), en este móvil.
const CLAVE_VISTAS = 'tareas.ayuda.vistas'
export function respuestasVistas(): string[] {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_VISTAS) ?? '[]') as string[]
  } catch {
    return []
  }
}
export function marcarRespuestaVista(id: string) {
  try {
    localStorage.setItem(CLAVE_VISTAS, JSON.stringify([...respuestasVistas(), id].slice(-30)))
  } catch {
    // Sin almacenamiento: volverá a salir, no pasa nada.
  }
}
