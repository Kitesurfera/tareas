import { useEffect, useState } from 'react'
import { mensajeDeError } from './errores'
import { hoyComoTexto, sumarDias } from './fechas'
import { supabase } from './supabase'

// Planes: vuestra base de datos de planes por categorías, el generador al
// azar y el calendario (tablas categorias_plan, planes y agenda_planes).

export type ColorPlan = 'menta' | 'lavanda' | 'melocoton' | 'cielo' | 'hoja' | 'coral' | 'sol' | 'rosa'
export type Energia = 'poca' | 'normal' | 'mucha'
export type Precio = 'gratis' | 'barato' | 'medio' | 'caro'
export type Duracion = 'rato' | 'medio_dia' | 'dia' | 'varios_dias'

export type CategoriaPlan = {
  id: string
  hogar_id: string
  nombre: string
  dibujo: string
  color: ColorPlan
  orden: number
}

export type Plan = {
  id: string
  hogar_id: string
  categoria_id: string | null
  nombre: string
  energia: Energia | null
  precio: Precio | null
  duracion: Duracion | null
  notas: string | null
  favorito: boolean
}

export type EntradaAgenda = {
  id: string
  hogar_id: string
  plan_id: string
  fecha: string
  hecho: boolean
}

// Cada color con su fondo suave + tinta (contraste ≥ 4,5) y un punto fuerte.
// Las clases van escritas enteras para que Tailwind las encuentre.
export const COLORES_PLAN: Record<ColorPlan, { texto: string; suave: string; punto: string }> = {
  menta: { texto: 'Menta', suave: 'bg-inicio text-inicio-tinta', punto: 'bg-inicio-tinta' },
  lavanda: { texto: 'Lavanda', suave: 'bg-tareas text-tareas-tinta', punto: 'bg-tareas-tinta' },
  melocoton: { texto: 'Melocotón', suave: 'bg-casa text-casa-tinta', punto: 'bg-casa-tinta' },
  cielo: { texto: 'Cielo', suave: 'bg-vencimientos text-vencimientos-tinta', punto: 'bg-vencimientos-tinta' },
  hoja: { texto: 'Hoja', suave: 'bg-plantas text-plantas-tinta', punto: 'bg-plantas-tinta' },
  coral: { texto: 'Coral', suave: 'bg-coral-suave text-coral-tinta', punto: 'bg-coral-tinta' },
  sol: { texto: 'Sol', suave: 'bg-sol text-sol-tinta', punto: 'bg-sol-tinta' },
  rosa: { texto: 'Rosa', suave: 'bg-planes text-planes-tinta', punto: 'bg-planes-tinta' },
}
export const COLORES = Object.keys(COLORES_PLAN) as ColorPlan[]

// Sin categoría: gris.
export const SIN_CATEGORIA = { nombre: 'Sin categoría', dibujo: '📌', suave: 'bg-stone-100 text-stone-600', punto: 'bg-stone-400' }

// Nombre, dibujo y colores de la categoría de un plan (o «Sin categoría»).
export function infoCategoria(categorias: CategoriaPlan[], id: string | null) {
  const categoria = id ? categorias.find((c) => c.id === id) : undefined
  if (!categoria) return SIN_CATEGORIA
  const { suave, punto } = COLORES_PLAN[categoria.color]
  return { nombre: categoria.nombre, dibujo: categoria.dibujo, suave, punto }
}

export const CATEGORIAS_SUGERIDAS: { nombre: string; dibujo: string; color: ColorPlan }[] = [
  { nombre: 'En casa', dibujo: '🏠', color: 'melocoton' },
  { nombre: 'Al aire libre', dibujo: '🌳', color: 'hoja' },
  { nombre: 'Comer fuera', dibujo: '🍽️', color: 'coral' },
  { nombre: 'Cultura', dibujo: '🎭', color: 'lavanda' },
  { nombre: 'Escapadas', dibujo: '🧳', color: 'cielo' },
  { nombre: 'Con amigos', dibujo: '👫', color: 'sol' },
  { nombre: 'Con la mascota', dibujo: '🐾', color: 'menta' },
  { nombre: 'Para cuidarnos', dibujo: '💆', color: 'rosa' },
]

export const DIBUJOS_RAPIDOS = ['🏠', '🌳', '🍽️', '🎭', '🧳', '👫', '🐾', '💆', '🎬', '🎨', '🏖️', '⛰️', '🚴', '☕', '🎮', '📚', '🎵', '🍷', '🛍️', '🎉']

// Las opciones, de menos a más (el orden sirve para filtrar «hasta…»).
export const ENERGIAS: { valor: Energia; texto: string; dibujo: string }[] = [
  { valor: 'poca', texto: 'Mínimo esfuerzo', dibujo: '🛋️' },
  { valor: 'normal', texto: 'Normal', dibujo: '🙂' },
  { valor: 'mucha', texto: 'Con energía', dibujo: '🔋' },
]
export const PRECIOS: { valor: Precio; texto: string }[] = [
  { valor: 'gratis', texto: 'Gratis' },
  { valor: 'barato', texto: '€' },
  { valor: 'medio', texto: '€€' },
  { valor: 'caro', texto: '€€€' },
]
export const DURACIONES: { valor: Duracion; texto: string }[] = [
  { valor: 'rato', texto: 'Un rato' },
  { valor: 'medio_dia', texto: 'Medio día' },
  { valor: 'dia', texto: 'Un día' },
  { valor: 'varios_dias', texto: 'Varios días' },
]

const posicion = <T extends string>(lista: { valor: T }[], valor: T) => lista.findIndex((x) => x.valor === valor)

export const textoEnergia = (e: Energia) => ENERGIAS[posicion(ENERGIAS, e)]
export const textoPrecio = (p: Precio) => PRECIOS[posicion(PRECIOS, p)].texto
export const textoDuracion = (d: Duracion) => DURACIONES[posicion(DURACIONES, d)].texto

export type Filtros = {
  categoria: string | null // id de la categoría; null = todas
  energia: Energia | null // cómo vais de energía (justo esa)
  precio: Precio | null // presupuesto: hasta ese precio
  duracion: Duracion | null // tiempo que tenéis: hasta esa duración
  favoritos: boolean
}

export const SIN_FILTROS: Filtros = { categoria: null, energia: null, precio: null, duracion: null, favoritos: false }

// ¿Cumple el plan los filtros? (Si filtráis por algo, los planes que no
// tienen ese dato apuntado no salen.)
export function cumpleFiltros(plan: Plan, f: Filtros): boolean {
  if (f.categoria && plan.categoria_id !== f.categoria) return false
  if (f.favoritos && !plan.favorito) return false
  if (f.energia && plan.energia !== f.energia) return false
  if (f.precio && (!plan.precio || posicion(PRECIOS, plan.precio) > posicion(PRECIOS, f.precio))) return false
  if (f.duracion && (!plan.duracion || posicion(DURACIONES, plan.duracion) > posicion(DURACIONES, f.duracion))) return false
  return true
}

// La última vez que lo hicisteis (o null).
export function ultimaVez(planId: string, agenda: EntradaAgenda[]): string | null {
  return agenda
    .filter((e) => e.plan_id === planId && e.hecho)
    .reduce<string | null>((max, e) => (max === null || e.fecha > max ? e.fecha : max), null)
}

// La próxima vez que está en el calendario (sin hacer, de hoy en adelante).
export function proximaVez(planId: string, agenda: EntradaAgenda[], hoy = hoyComoTexto()): EntradaAgenda | null {
  return (
    agenda
      .filter((e) => e.plan_id === planId && !e.hecho && e.fecha >= hoy)
      .sort((a, b) => a.fecha.localeCompare(b.fecha))[0] ?? null
  )
}

// Un plan al azar entre los que cumplen los filtros. Si se puede, sin
// repetir lo que hicisteis hace menos de 30 días ni lo que ya está en el
// calendario, ni el que acaba de salir. Los favoritos salen más a menudo.
export function elegirAlAzar(
  planes: Plan[],
  filtros: Filtros,
  agenda: EntradaAgenda[],
  anterior: string | null,
  azar: () => number = Math.random,
): Plan | null {
  const hoy = hoyComoTexto()
  const haceUnMes = sumarDias(hoy, -30)
  const candidatos = planes.filter((p) => cumpleFiltros(p, filtros))
  const recientes = new Set(
    agenda.filter((e) => (e.hecho && e.fecha >= haceUnMes) || (!e.hecho && e.fecha >= hoy)).map((e) => e.plan_id),
  )
  let lista = candidatos.filter((p) => !recientes.has(p.id))
  if (lista.length === 0) lista = candidatos
  if (lista.length > 1 && anterior) lista = lista.filter((p) => p.id !== anterior)
  if (lista.length === 0) return null
  const pesos = lista.map((p) => (p.favorito ? 3 : 1))
  let tirada = azar() * pesos.reduce((a, b) => a + b, 0)
  for (let i = 0; i < lista.length; i++) {
    tirada -= pesos[i]
    if (tirada < 0) return lista[i]
  }
  return lista[lista.length - 1]
}

export type DatosPlanes = { categorias: CategoriaPlan[]; planes: Plan[]; agenda: EntradaAgenda[] }

// Las categorías, los planes y el calendario (desde hace un año). null = cargando.
export function usePlanes() {
  const [datos, setDatos] = useState<DatosPlanes | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [recarga, setRecarga] = useState(0)

  useEffect(() => {
    if (!supabase) return
    let vigente = true
    Promise.all([
      supabase.from('categorias_plan').select('*').order('orden').order('nombre'),
      supabase.from('planes').select('*').order('nombre'),
      supabase.from('agenda_planes').select('*').gte('fecha', sumarDias(hoyComoTexto(), -400)).order('fecha'),
    ]).then(([categorias, planes, agenda]) => {
      if (!vigente) return
      const fallo = categorias.error ?? planes.error ?? agenda.error
      if (fallo) return setError(mensajeDeError(fallo))
      setError(null)
      setDatos({
        categorias: categorias.data as CategoriaPlan[],
        planes: planes.data as Plan[],
        agenda: agenda.data as EntradaAgenda[],
      })
    })
    return () => {
      vigente = false
    }
  }, [recarga])

  return { datos, error, recargar: () => setRecarga((n) => n + 1) }
}

// ---------------------------------------------------------------------
// Lo que se puede hacer con un plan (devuelven un mensaje de error o null)
// ---------------------------------------------------------------------

async function hacer(consulta: PromiseLike<{ error: { message?: string; code?: string } | null }>): Promise<string | null> {
  const { error } = await consulta
  if (!error) return null
  if (error.code === '23505') return 'Ese plan ya está en el calendario ese día.'
  return mensajeDeError(error)
}

export function programar(plan: Plan, fecha: string): Promise<string | null> {
  if (!supabase) return Promise.resolve('Sin conexión.')
  return hacer(supabase.from('agenda_planes').insert({ hogar_id: plan.hogar_id, plan_id: plan.id, fecha }))
}

// «Lo hicimos» hoy: si ya estaba en el calendario hoy, se marca; si no, se apunta.
export function loHicimosHoy(plan: Plan, agenda: EntradaAgenda[]): Promise<string | null> {
  if (!supabase) return Promise.resolve('Sin conexión.')
  const hoy = hoyComoTexto()
  const deHoy = agenda.find((e) => e.plan_id === plan.id && e.fecha === hoy)
  if (deHoy) return hacer(supabase.from('agenda_planes').update({ hecho: true }).eq('id', deHoy.id))
  return hacer(supabase.from('agenda_planes').insert({ hogar_id: plan.hogar_id, plan_id: plan.id, fecha: hoy, hecho: true }))
}

// Marcar (o desmarcar) un plan del calendario. Si estaba para más adelante
// y ya lo habéis hecho, pasa a hoy.
export function marcarHecho(entrada: EntradaAgenda, hecho: boolean): Promise<string | null> {
  if (!supabase) return Promise.resolve('Sin conexión.')
  const hoy = hoyComoTexto()
  const cambios = hecho && entrada.fecha > hoy ? { hecho, fecha: hoy } : { hecho }
  return hacer(supabase.from('agenda_planes').update(cambios).eq('id', entrada.id))
}

export function cambiarFecha(entrada: EntradaAgenda, fecha: string): Promise<string | null> {
  if (!supabase) return Promise.resolve('Sin conexión.')
  return hacer(supabase.from('agenda_planes').update({ fecha }).eq('id', entrada.id))
}

export function quitarDelCalendario(entrada: EntradaAgenda): Promise<string | null> {
  if (!supabase) return Promise.resolve('Sin conexión.')
  return hacer(supabase.from('agenda_planes').delete().eq('id', entrada.id))
}

export function cambiarFavorito(plan: Plan, favorito: boolean): Promise<string | null> {
  if (!supabase) return Promise.resolve('Sin conexión.')
  return hacer(supabase.from('planes').update({ favorito }).eq('id', plan.id))
}

// Los enlaces de las notas («https://…») se pueden tocar.
export function trozosConEnlaces(texto: string): { texto: string; enlace: boolean }[] {
  return texto
    .split(/(https?:\/\/[^\s]+)/g)
    .filter(Boolean)
    .map((trozo) => ({ texto: trozo, enlace: /^https?:\/\//.test(trozo) }))
}
