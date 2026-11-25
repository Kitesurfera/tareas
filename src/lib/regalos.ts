import { useEffect, useState } from 'react'
import { mensajeDeError } from './errores'
import { leerFecha } from './fechas'
import { supabase } from './supabase'

// «🎁 Regalos» (en la pestaña Tareas): fechas especiales, la lista de
// deseos de cada persona del hogar, «Lo regalo yo» e ideas para regalar.
// Las sorpresas las protege la base de datos: la dueña de una lista no
// recibe sus reservas, y nadie recibe las ideas que son para ella.

export type TipoFecha = 'cumpleanos' | 'aniversario' | 'otra'

export const TIPOS_FECHA: Record<TipoFecha, { texto: string; dibujo: string }> = {
  cumpleanos: { texto: 'Cumpleaños', dibujo: '🎂' },
  aniversario: { texto: 'Aniversario', dibujo: '💍' },
  otra: { texto: 'Otra fecha', dibujo: '⭐' },
}

export const PRIORIDADES: { valor: 1 | 2 | 3; texto: string; dibujo: string }[] = [
  { valor: 1, texto: 'Me gustaría', dibujo: '🙂' },
  { valor: 2, texto: 'Me encantaría', dibujo: '😍' },
  { valor: 3, texto: '¡Lo que más!', dibujo: '🤩' },
]

export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

export type PersonaRegalo = { id: string; hogar_id: string; nombre: string; relacion: string | null; gustos: string | null; creado_en: string }

export type FechaEspecial = {
  id: string
  hogar_id: string
  titulo: string
  tipo: TipoFecha
  dia: number
  mes: number
  anio: number | null
  persona_id: string | null
  miembro_id: string | null
  notas: string | null
  creado_en: string
}

export type Deseo = {
  id: string
  hogar_id: string
  miembro_id: string
  titulo: string
  enlace: string | null
  precio: number | null
  notas: string | null
  prioridad: 1 | 2 | 3
  creado_en: string
}

export type Reserva = { deseo_id: string; hogar_id: string; miembro_id: string; comprado: boolean }

export type IdeaRegalo = {
  id: string
  hogar_id: string
  persona_id: string | null
  miembro_id: string | null
  titulo: string
  enlace: string | null
  precio: number | null
  notas: string | null
  comprado: boolean
  creado_en: string
}

// ---------------------------------------------------------------------
// Fechas que se repiten cada año
// ---------------------------------------------------------------------

const dosCifras = (n: number) => String(n).padStart(2, '0')
const esBisiesto = (anio: number) => (anio % 4 === 0 && anio % 100 !== 0) || anio % 400 === 0

// La fecha de ese año («2027-02-28» para un 29 de febrero que no es bisiesto).
export function enElAnio(dia: number, mes: number, anio: number): string {
  const d = mes === 2 && dia === 29 && !esBisiesto(anio) ? 28 : dia
  return `${anio}-${dosCifras(mes)}-${dosCifras(d)}`
}

// La próxima vez que cae, desde «desde» (incluido).
export function proximaVez(f: Pick<FechaEspecial, 'dia' | 'mes'>, desde: string): string {
  const anio = Number(desde.slice(0, 4))
  const este = enElAnio(f.dia, f.mes, anio)
  return este >= desde ? este : enElAnio(f.dia, f.mes, anio + 1)
}

// Las veces que cae entre dos fechas (para el calendario).
export function vecesEntre(f: Pick<FechaEspecial, 'dia' | 'mes'>, desde: string, hasta: string): string[] {
  const veces: string[] = []
  for (let anio = Number(desde.slice(0, 4)); anio <= Number(hasta.slice(0, 4)); anio++) {
    const fecha = enElAnio(f.dia, f.mes, anio)
    if (fecha >= desde && fecha <= hasta) veces.push(fecha)
  }
  return veces
}

// «cumple 60» / «8 años» (o nada si no sabemos el año).
export function cuantosAnios(f: Pick<FechaEspecial, 'anio' | 'tipo'>, fecha: string): string | null {
  if (!f.anio) return null
  const anios = Number(fecha.slice(0, 4)) - f.anio
  if (anios <= 0) return null
  return f.tipo === 'cumpleanos' ? `cumple ${anios}` : anios === 1 ? '1 año' : `${anios} años`
}

// «12 de diciembre»
export const diaYMes = (f: Pick<FechaEspecial, 'dia' | 'mes'>) => `${f.dia} de ${MESES[f.mes - 1]}`

// Días que faltan (0 = hoy).
export const diasQueFaltan = (fecha: string, hoy: string) => Math.round((leerFecha(fecha).getTime() - leerFecha(hoy).getTime()) / 86_400_000)

export function cuandoFalta(dias: number): string {
  if (dias === 0) return '¡Hoy!'
  if (dias === 1) return 'Mañana'
  if (dias < 7) return `En ${dias} días`
  if (dias < 60) return `Dentro de ${dias} días`
  const meses = Math.round(dias / 30)
  return `Dentro de ${meses} meses`
}

// Las fechas ordenadas por la próxima vez que caen.
export function proximasFechas(fechas: FechaEspecial[], hoy: string): { fecha: FechaEspecial; cuando: string; dias: number }[] {
  return fechas
    .map((fecha) => {
      const cuando = proximaVez(fecha, hoy)
      return { fecha, cuando, dias: diasQueFaltan(cuando, hoy) }
    })
    .sort((a, b) => a.dias - b.dias || a.fecha.titulo.localeCompare(b.fecha.titulo))
}

// «25 €», «12,50 €»
export const euros = (precio: number) =>
  precio.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: Number.isInteger(precio) ? 0 : 2 })

// ---------------------------------------------------------------------
// Cargar y cambiar
// ---------------------------------------------------------------------

export type DatosRegalos = {
  personas: PersonaRegalo[]
  fechas: FechaEspecial[]
  deseos: Deseo[]
  reservas: Reserva[] // nunca llegan las de tu propia lista
  ideas: IdeaRegalo[] // nunca llegan las que son para ti
}

export function useRegalos() {
  const [datos, setDatos] = useState<DatosRegalos | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [recarga, setRecarga] = useState(0)

  useEffect(() => {
    if (!supabase) return
    let vigente = true
    Promise.all([
      supabase.from('personas_regalo').select('*').order('nombre'),
      supabase.from('fechas_especiales').select('*'),
      supabase.from('deseos').select('*').order('prioridad', { ascending: false }).order('creado_en'),
      supabase.from('reservas_deseo').select('deseo_id, hogar_id, miembro_id, comprado'),
      supabase.from('ideas_regalo').select('*').order('creado_en'),
    ]).then(([personas, fechas, deseos, reservas, ideas]) => {
      if (!vigente) return
      const fallo = personas.error ?? fechas.error ?? deseos.error ?? reservas.error ?? ideas.error
      if (fallo) {
        const falta = fallo.code === '42P01' || fallo.code === 'PGRST205'
        return setError(falta ? 'Falta ejecutar en Supabase el SQL de los regalos (20261126100000_regalos.sql).' : mensajeDeError(fallo))
      }
      setError(null)
      setDatos({
        personas: personas.data as PersonaRegalo[],
        fechas: fechas.data as FechaEspecial[],
        deseos: deseos.data as Deseo[],
        reservas: reservas.data as Reserva[],
        ideas: ideas.data as IdeaRegalo[],
      })
    })
    return () => {
      vigente = false
    }
  }, [recarga])

  return { datos, error, recargar: () => setRecarga((n) => n + 1) }
}

async function hacer(consulta: PromiseLike<{ error: { message?: string; code?: string } | null }>): Promise<string | null> {
  const { error } = await consulta
  if (!error) return null
  if (error.code === '23505') return 'Alguien se te ha adelantado: ya está reservado.'
  return mensajeDeError(error)
}

type Tabla = 'personas_regalo' | 'fechas_especiales' | 'deseos' | 'ideas_regalo'

// Crear (sin id) o cambiar (con id) una fila de una de las tablas de regalos.
export function guardar(tabla: Tabla, hogarId: string, id: string | null, datos: Record<string, unknown>): Promise<string | null> {
  if (!supabase) return Promise.resolve('Sin conexión.')
  return hacer(id ? supabase.from(tabla).update(datos).eq('id', id) : supabase.from(tabla).insert({ hogar_id: hogarId, ...datos }))
}

export function borrar(tabla: Tabla, id: string): Promise<string | null> {
  if (!supabase) return Promise.resolve('Sin conexión.')
  return hacer(supabase.from(tabla).delete().eq('id', id))
}

// «🎁 Lo regalo yo» (la base de datos pone que eres tú).
export function reservar(hogarId: string, deseoId: string): Promise<string | null> {
  if (!supabase) return Promise.resolve('Sin conexión.')
  return hacer(supabase.from('reservas_deseo').insert({ hogar_id: hogarId, deseo_id: deseoId }))
}

export function cambiarReserva(deseoId: string, comprado: boolean): Promise<string | null> {
  if (!supabase) return Promise.resolve('Sin conexión.')
  return hacer(supabase.from('reservas_deseo').update({ comprado }).eq('deseo_id', deseoId))
}

export function quitarReserva(deseoId: string): Promise<string | null> {
  if (!supabase) return Promise.resolve('Sin conexión.')
  return hacer(supabase.from('reservas_deseo').delete().eq('deseo_id', deseoId))
}

// La persona elegida en la pantalla, recordada en este móvil.
const CLAVE = 'tareas.regalos.quien'
export function quienRecordado(): string {
  try {
    return localStorage.getItem(CLAVE) ?? 'yo'
  } catch {
    return 'yo'
  }
}
export function recordarQuien(quien: string) {
  try {
    localStorage.setItem(CLAVE, quien)
  } catch {
    // Sin almacenamiento: no pasa nada.
  }
}
