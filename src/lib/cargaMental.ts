import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { Miembro } from './tipos'

// Contador de carga mental: quién PIENSA las cosas (las apunta, las
// organiza) y quién las HACE, mes a mes. Los datos los apunta la propia
// base de datos (tabla «actividad»); aquí solo se suman.

export type Origen = 'tarea' | 'tratamiento' | 'rutina' | 'vencimiento' | 'compra'

export type Persona = {
  clave: string // user_id, o «otras» para quien ya no está en el hogar
  nombre: string
  color: string
  pensar: number
  hacer: number
  // Desglose: de dónde salen los números.
  pensarPor: Partial<Record<Origen, number>>
  hacerPor: Partial<Record<Origen, number>>
}

// Colores fijos por persona, por orden de llegada al hogar (paleta
// comprobada para daltonismo; cada persona conserva su color siempre).
const COLORES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948']
const COLOR_OTRAS = '#a8a29e'

// «2026-11» → primer día de ese mes y del siguiente.
export function limitesDelMes(mes: string): { desde: string; hasta: string } {
  const [anio, m] = mes.split('-').map(Number)
  const siguiente = m === 12 ? `${anio + 1}-01` : `${anio}-${String(m + 1).padStart(2, '0')}`
  return { desde: `${mes}-01`, hasta: `${siguiente}-01` }
}

export function mesActual(): string {
  const hoy = new Date()
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`
}

export function moverMes(mes: string, cuantos: number): string {
  const [anio, m] = mes.split('-').map(Number)
  const fecha = new Date(anio, m - 1 + cuantos, 1)
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`
}

export function nombreDelMes(mes: string): string {
  const [anio, m] = mes.split('-').map(Number)
  return new Date(anio, m - 1, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
}

type Fila = { user_id: string | null; tipo: 'pensar' | 'hacer'; origen: Origen; cuantas: number }

// Suma lo de cada persona en un mes. null = cargando.
export function useCargaMental(mes: string, miembros: Miembro[] | null, miUserId: string) {
  const [filas, setFilas] = useState<{ mes: string; datos: Fila[] } | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!supabase) return
    let vigente = true
    const { desde, hasta } = limitesDelMes(mes)
    // Gracias a RLS, solo cuenta la actividad de tu hogar.
    supabase.rpc('resumen_carga_mental', { desde, hasta }).then(({ data, error }) => {
      if (!vigente) return
      if (error) setError(true)
      else setFilas({ mes, datos: (data ?? []) as Fila[] })
    })
    return () => {
      vigente = false
    }
  }, [mes])

  if (!miembros || filas?.mes !== mes) return { personas: null, error }

  const personas: Persona[] = miembros.map((m, i) => ({
    clave: m.user_id,
    nombre: m.user_id === miUserId ? 'Tú' : m.nombre_visible,
    color: COLORES[i % COLORES.length],
    pensar: 0,
    hacer: 0,
    pensarPor: {},
    hacerPor: {},
  }))
  for (const fila of filas.datos) {
    let persona = personas.find((p) => p.clave === fila.user_id)
    if (!persona) {
      // Alguien que ya no está en el hogar.
      persona = personas.find((p) => p.clave === 'otras')
      if (!persona) {
        persona = { clave: 'otras', nombre: 'Quien ya no está', color: COLOR_OTRAS, pensar: 0, hacer: 0, pensarPor: {}, hacerPor: {} }
        personas.push(persona)
      }
    }
    persona[fila.tipo] += fila.cuantas
    const desglose = fila.tipo === 'pensar' ? persona.pensarPor : persona.hacerPor
    desglose[fila.origen] = (desglose[fila.origen] ?? 0) + fila.cuantas
  }
  return { personas, error }
}

// Frase neutra y amable sobre el reparto. Nunca reprocha: describe.
export function fraseDelReparto(personas: Persona[]): string {
  const totalPensar = personas.reduce((s, p) => s + p.pensar, 0)
  const totalHacer = personas.reduce((s, p) => s + p.hacer, 0)
  if (totalPensar + totalHacer === 0) return 'Todavía no hay nada apuntado este mes.'
  const conActividad = personas.filter((p) => p.pensar + p.hacer > 0)
  if (personas.filter((p) => p.clave !== 'otras').length < 2) {
    return 'Cuando seáis más en el hogar, aquí veréis cómo os repartís pensar y hacer.'
  }
  if (conActividad.length === 1) {
    const sujeto = conActividad[0].nombre === 'Tú' ? 'Este mes, de momento, todo lo has movido tú' : `Este mes, de momento, todo lo ha movido ${conActividad[0].nombre}`
    return `${sujeto}.`
  }
  const quienMas = (clave: 'pensar' | 'hacer', total: number) => {
    if (total < 4) return null
    const mayor = [...personas].sort((a, b) => b[clave] - a[clave])[0]
    return mayor[clave] / total >= 0.65 ? mayor : null
  }
  const piensa = quienMas('pensar', totalPensar)
  const hace = quienMas('hacer', totalHacer)
  const conVerbo = (p: Persona, resto: string) => (p.nombre === 'Tú' ? `tú has llevado ${resto}` : `${p.nombre} ha llevado ${resto}`)
  if (piensa && hace && piensa.clave !== hace.clave) {
    return `Este mes, ${conVerbo(piensa, 'más la parte de pensar')} y ${hace.nombre === 'Tú' ? 'tú' : hace.nombre}, la de hacer.`
  }
  if (piensa) return `Este mes, ${conVerbo(piensa, 'más la parte de pensar')}. Pensar también es trabajo: apuntar, organizar, acordarse.`
  if (hace) return `Este mes, ${conVerbo(hace, 'más la parte de hacer')}.`
  return 'Este mes el reparto está bastante equilibrado. 🌿'
}
