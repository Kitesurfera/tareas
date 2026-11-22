import { useEffect, useState } from 'react'
import { supabase } from './supabase'

// Carga mental EN EQUIPO: no compara a nadie. Enseña lo que habéis pensado
// y hecho entre todas, da las gracias por lo que pensaron las demás
// personas y te enseña TUS números (que solo ves tú). Los datos los apunta
// la propia base de datos (tabla «actividad»).

export type Origen = 'tarea' | 'tratamiento' | 'rutina' | 'vencimiento' | 'compra'

export type Gracia = {
  quien: string
  origen: Origen
  titulo: string
  creado_en: string
}

export type Mio = {
  pensar: number
  hacer: number
  pensarPor: Partial<Record<Origen, number>>
  hacerPor: Partial<Record<Origen, number>>
}

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

// «Bea» + «se acordó de «Vacuna de Luna»»…
export function fraseDeGracias(g: Gracia): string {
  switch (g.origen) {
    case 'compra':
      return `apuntó «${g.titulo}» en la compra`
    case 'tratamiento':
      return `apuntó el tratamiento «${g.titulo}»`
    case 'rutina':
      return `organizó la rutina «${g.titulo}»`
    case 'vencimiento':
      return `apuntó cuándo vence «${g.titulo}»`
    default:
      return `se acordó de «${g.titulo}»`
  }
}

export function cosas(n: number): string {
  return n === 1 ? '1 cosa' : `${n} cosas`
}

type Datos = {
  mes: string
  equipo: { pensar: number; hacer: number }
  gracias: Gracia[]
  mio: Mio
}

// Todo lo del mes. null = cargando.
export function useEquipo(mes: string, cuantasGracias: number) {
  const [datos, setDatos] = useState<Datos | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    const cliente = supabase
    if (!cliente) return
    let vigente = true
    const { desde, hasta } = limitesDelMes(mes)
    Promise.all([
      cliente.rpc('totales_del_hogar', { desde, hasta }),
      cliente.rpc('agradecimientos', { desde, hasta, cuantos: cuantasGracias }),
      // Gracias a RLS, esta solo devuelve TUS números.
      cliente.rpc('resumen_carga_mental', { desde, hasta }),
    ]).then(([totales, gracias, mios]) => {
      if (!vigente) return
      if (totales.error || gracias.error || mios.error) {
        setError(true)
        return
      }
      const fila = ((totales.data ?? []) as { pensar: number; hacer: number }[])[0] ?? { pensar: 0, hacer: 0 }
      const mio: Mio = { pensar: 0, hacer: 0, pensarPor: {}, hacerPor: {} }
      for (const f of (mios.data ?? []) as { tipo: 'pensar' | 'hacer'; origen: Origen; cuantas: number }[]) {
        mio[f.tipo] += f.cuantas
        const desglose = f.tipo === 'pensar' ? mio.pensarPor : mio.hacerPor
        desglose[f.origen] = (desglose[f.origen] ?? 0) + f.cuantas
      }
      setDatos({ mes, equipo: fila, gracias: (gracias.data ?? []) as Gracia[], mio })
    })
    return () => {
      vigente = false
    }
  }, [mes, cuantasGracias])

  return { datos: datos?.mes === mes ? datos : null, error }
}
