import { useEffect, useState } from 'react'
import { mensajeDeError } from './errores'
import { leerFecha, sumarDias, sumarMeses } from './fechas'
import { lunesDe, type RutinaTurnos } from './semana'
import { supabase } from './supabase'
import { infoCategoria, infoCuidado, infoTipo, type Tarea, type TipoCuidado, type TipoTratamiento, type TipoVencimiento } from './tipos'

// El calendario del inicio: vista de mes o de semana, con un icono por tipo
// de tarea y el color de la persona que se encarga.

export type Vista = 'mes' | 'semana'
export type Filtro = 'todas' | 'rutinas'

// Los días que se ven: el mes entero en semanas de lunes a domingo, o una semana.
export function rangoDeLaVista(vista: Vista, fecha: string): { desde: string; hasta: string; dias: string[] } {
  const desde = vista === 'mes' ? lunesDe(primeroDelMes(fecha)) : lunesDe(fecha)
  const hasta = vista === 'mes' ? sumarDias(lunesDe(sumarDias(sumarMeses(primeroDelMes(fecha), 1), -1)), 6) : sumarDias(desde, 6)
  const dias: string[] = []
  for (let dia = desde; dia <= hasta; dia = sumarDias(dia, 1)) dias.push(dia)
  return { desde, hasta, dias }
}

export const primeroDelMes = (fecha: string) => `${fecha.slice(0, 7)}-01`

// «noviembre de 2026»
export function nombreDelMes(fecha: string): string {
  return leerFecha(primeroDelMes(fecha)).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
}

// Ir al mes o a la semana de antes (-1) o de después (+1).
export function moverVista(vista: Vista, fecha: string, paso: number): string {
  return vista === 'mes' ? sumarMeses(primeroDelMes(fecha), paso) : sumarDias(lunesDe(fecha), 7 * paso)
}

// Un icono para cada rutina de casa, según su nombre.
const ICONOS_RUTINA: [RegExp, string][] = [
  [/basura|reciclaje|contenedor/i, '🗑️'],
  [/lavadora|colada|ropa|tender|planchar/i, '🧺'],
  [/compra|supermercado|mercado/i, '🛒'],
  [/baño|ducha|váter|wc/i, '🛁'],
  [/fregar|platos|lavavajillas|vajilla/i, '🍽️'],
  [/cocina|nevera|horno/i, '🍳'],
  [/s[aá]banas|cama/i, '🛏️'],
  [/suelo|fregona/i, '🧽'],
  [/ventana|cristal/i, '🪟'],
  [/polvo|aspirad|barrer/i, '🧹'],
  [/arenero|perro|gato|paseo/i, '🐾'],
]
export const ICONO_RUTINA = '🧹'

export function iconoDeRutina(nombre: string): string {
  return ICONOS_RUTINA.find(([patron]) => patron.test(nombre))?.[1] ?? ICONO_RUTINA
}

export type InfoTipos = {
  rutinas: Record<string, string> // id → nombre
  tratamientos: Record<string, TipoTratamiento>
  cuidados: Record<string, TipoCuidado>
  vencimientos: Record<string, TipoVencimiento>
}

// El icono de una tarea y qué tipo es (para la leyenda).
export function iconoDeTarea(tarea: Tarea, info: InfoTipos): { icono: string; tipo: string } {
  if (tarea.rutina_id) {
    const nombre = info.rutinas[tarea.rutina_id] ?? tarea.titulo
    return { icono: iconoDeRutina(nombre), tipo: nombre }
  }
  if (tarea.tratamiento_id && info.tratamientos[tarea.tratamiento_id]) {
    const t = infoTipo(info.tratamientos[tarea.tratamiento_id])
    return { icono: t.dibujo, tipo: t.texto }
  }
  if (tarea.cuidado_id && info.cuidados[tarea.cuidado_id]) {
    const c = infoCuidado(info.cuidados[tarea.cuidado_id])
    return { icono: c.dibujo, tipo: c.texto === 'Otro' ? 'Plantas' : c.texto }
  }
  if (tarea.vencimiento_id) {
    return info.vencimientos[tarea.vencimiento_id] === 'suscripcion'
      ? { icono: '💳', tipo: 'Suscripción' }
      : { icono: '📑', tipo: 'Seguro' }
  }
  if (tarea.documento_id) return { icono: '🪪', tipo: 'Documento' }
  const categoria = infoCategoria(tarea.categoria)
  return { icono: categoria.dibujo, tipo: categoria.texto }
}

export type DatosCalendario = {
  tareas: Tarea[]
  rutinas: RutinaTurnos[]
  frecuencias: Record<string, number>
  info: InfoTipos
}

// Las tareas pendientes con fecha y lo necesario para prever las siguientes
// veces y elegir los iconos. null = cargando.
export function useDatosCalendario() {
  const [datos, setDatos] = useState<DatosCalendario | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [recarga, setRecarga] = useState(0)

  useEffect(() => {
    if (!supabase) return
    let vigente = true
    // Gracias a RLS, solo llega lo de tu hogar.
    Promise.all([
      supabase
        .from('tareas')
        .select('*')
        .eq('completada', false)
        .not('fecha_limite', 'is', null)
        .order('fecha_limite')
        .order('creado_en'),
      supabase.from('rutinas').select('id, nombre, frecuencia_dias, turnos, participantes'),
      supabase.from('tratamientos').select('id, frecuencia_dias, tipo'),
      supabase.from('cuidados').select('id, frecuencia_dias, tipo'),
      supabase.from('vencimientos').select('id, tipo'),
    ]).then(([tareas, rutinas, tratamientos, cuidados, vencimientos]) => {
      if (!vigente) return
      const fallo = tareas.error ?? rutinas.error ?? tratamientos.error ?? cuidados.error ?? vencimientos.error
      if (fallo) return setError(mensajeDeError(fallo))
      setError(null)
      const frecuencias: Record<string, number> = {}
      const info: InfoTipos = { rutinas: {}, tratamientos: {}, cuidados: {}, vencimientos: {} }
      for (const r of (rutinas.data ?? []) as (RutinaTurnos & { nombre: string })[]) info.rutinas[r.id] = r.nombre
      for (const t of (tratamientos.data ?? []) as { id: string; frecuencia_dias: number; tipo: TipoTratamiento }[]) {
        frecuencias[t.id] = t.frecuencia_dias
        info.tratamientos[t.id] = t.tipo
      }
      for (const c of (cuidados.data ?? []) as { id: string; frecuencia_dias: number; tipo: TipoCuidado }[]) {
        frecuencias[c.id] = c.frecuencia_dias
        info.cuidados[c.id] = c.tipo
      }
      for (const v of (vencimientos.data ?? []) as { id: string; tipo: TipoVencimiento }[]) info.vencimientos[v.id] = v.tipo
      setDatos({ tareas: tareas.data as Tarea[], rutinas: rutinas.data as RutinaTurnos[], frecuencias, info })
    })
    return () => {
      vigente = false
    }
  }, [recarga])

  return { datos, error, recargar: () => setRecarga((n) => n + 1) }
}
