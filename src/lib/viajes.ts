import { useEffect, useState } from 'react'
import { hoyComoTexto } from './fechas'
import { supabase } from './supabase'
import type { Miembro } from './tipos'

// Una fila por persona y viaje. Si se van varias a la vez, comparten «grupo».
export type Viaje = {
  id: string
  grupo: string
  miembro_id: string
  desde: string
  hasta: string
  destino: string | null
}

// Un viaje con todas las personas que se van.
export type GrupoViaje = {
  grupo: string
  personas: string[] // miembros.id
  desde: string
  hasta: string
  destino: string | null
}

// Los viajes de tu hogar que no han terminado (gracias a RLS, nunca llegan
// los de otro hogar). null = cargando.
export function useViajes() {
  const [viajes, setViajes] = useState<Viaje[] | null>(null)
  const [error, setError] = useState(false)
  const [recarga, setRecarga] = useState(0)

  useEffect(() => {
    if (!supabase) return
    let vigente = true
    supabase
      .from('viajes')
      .select('id, grupo, miembro_id, desde, hasta, destino')
      .gte('hasta', hoyComoTexto())
      .order('desde')
      .then(({ data, error }) => {
        if (!vigente) return
        if (error) setError(true)
        else setViajes(data as Viaje[])
      })
    return () => {
      vigente = false
    }
  }, [recarga])

  return { viajes, error, recargar: () => setRecarga((n) => n + 1) }
}

export function agrupar(viajes: Viaje[]): GrupoViaje[] {
  const grupos = new Map<string, GrupoViaje>()
  for (const v of viajes) {
    const grupo = grupos.get(v.grupo)
    if (grupo) grupo.personas.push(v.miembro_id)
    else grupos.set(v.grupo, { grupo: v.grupo, personas: [v.miembro_id], desde: v.desde, hasta: v.hasta, destino: v.destino })
  }
  return [...grupos.values()].sort((a, b) => a.desde.localeCompare(b.desde))
}

export function estaFuera(viajes: Viaje[], miembroId: string, fecha: string): boolean {
  return viajes.some((v) => v.miembro_id === miembroId && v.desde <= fecha && fecha <= v.hasta)
}

// El día que cuenta para una tarea: su fecha, o hoy si ya pasó (lo atrasado
// lo tiene que hacer quien esté en casa HOY) o si no tiene fecha.
export function diaQueCuenta(fecha: string | null): string {
  const hoy = hoyComoTexto()
  return fecha && fecha > hoy ? fecha : hoy
}

export type Cobertura = {
  // La persona responsable está de viaje ese día.
  fuera: boolean
  // Quién está en casa ese día.
  enCasa: Miembro[]
  // No queda nadie en casa.
  nadieEnCasa: boolean
}

export function cobertura(
  responsableId: string | null,
  fecha: string,
  miembros: Miembro[],
  viajes: Viaje[],
): Cobertura {
  const enCasa = miembros.filter((m) => !estaFuera(viajes, m.id, fecha))
  return {
    fuera: responsableId !== null && estaFuera(viajes, responsableId, fecha),
    enCasa,
    nadieEnCasa: miembros.length > 0 && enCasa.length === 0,
  }
}
