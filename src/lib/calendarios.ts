import { useEffect, useState } from 'react'
import { mensajeDeError } from './errores'
import { supabase } from './supabase'

// Calendarios de otras apps (iPhone, Google Calendar): cada persona tiene
// un enlace privado (tabla calendarios_externos) que se activa, se desactiva
// o se cambia con funciones de la base de datos.

export type MiCalendario = { token: string; activo: boolean; ultimo_uso: string | null }

// Tu enlace (null = nunca lo has activado; undefined = cargando).
export function useMiCalendario() {
  const [calendario, setCalendario] = useState<MiCalendario | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [recarga, setRecarga] = useState(0)

  useEffect(() => {
    if (!supabase) return
    let vigente = true
    supabase
      .from('calendarios_externos')
      .select('token, activo, ultimo_uso')
      .maybeSingle()
      .then(({ data, error }) => {
        if (!vigente) return
        if (error) setError(mensajeDeError(error))
        else setCalendario(data as MiCalendario | null)
      })
    return () => {
      vigente = false
    }
  }, [recarga])

  return { calendario, error, recargar: () => setRecarga((n) => n + 1) }
}

async function llamar(funcion: 'activar_calendario' | 'desactivar_calendario' | 'cambiar_enlace_calendario'): Promise<void> {
  if (!supabase) throw new Error('Sin conexión.')
  const { error } = await supabase.rpc(funcion)
  if (error) throw new Error(mensajeDeError(error))
}

export const activarCalendario = () => llamar('activar_calendario')
export const desactivarCalendario = () => llamar('desactivar_calendario')
export const cambiarEnlaceCalendario = () => llamar('cambiar_enlace_calendario')

// Los enlaces para suscribirse: el normal (https), el del iPhone (webcal,
// abre directamente «Suscribirse») y el de Google Calendar.
export function enlacesDelCalendario(token: string) {
  const https = `${window.location.origin}/api/calendario?t=${token}`
  const webcal = https.replace(/^https?:/, 'webcal:')
  return {
    https,
    webcal,
    google: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`,
  }
}
