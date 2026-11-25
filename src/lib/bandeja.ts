import { useEffect, useState } from 'react'
import { mensajeDeError } from './errores'
import { hoyComoTexto } from './fechas'
import { supabase } from './supabase'
import type { Categoria } from './tipos'

// «🧠 Vaciar la cabeza»: tu bandeja privada (tabla bandeja) y el reparto
// con la IA (api/vaciar-cabeza). La IA solo propone: aquí se guarda cada
// cosa en su sitio, con las reglas de siempre de la base de datos.

export type NotaBandeja = { id: string; texto: string; creado_en: string }

export const TIPOS_CUIDADO = ['riego', 'abono', 'trasplante', 'poda', 'otro'] as const
export type TipoCuidadoHecho = (typeof TIPOS_CUIDADO)[number]
export type TipoFechaBandeja = 'cumpleanos' | 'aniversario' | 'otra'

// Lo que devuelve el servidor para cada cosa (ver api/_lib/cabeza.ts).
export type Propuesta = { nota: string } & (
  | { destino: 'tarea'; titulo: string; fecha: string | null; categoria: Categoria; responsable_id: string | null; mascota_id: string | null; detalles: string | null }
  | { destino: 'compra'; nombre: string; cantidad: string | null }
  | { destino: 'plan'; nombre: string; categoria_id: string | null }
  | { destino: 'pelicula' | 'serie'; titulo: string }
  | { destino: 'deseo'; titulo: string }
  | { destino: 'idea_regalo'; titulo: string; miembro_id: string | null; persona_id: string | null }
  | { destino: 'fecha'; titulo: string; tipo: TipoFechaBandeja; dia: number; mes: number; anio: number | null; miembro_id: string | null; persona_id: string | null }
  | { destino: 'peso'; mascota_id: string; kg: number }
  | { destino: 'cuidado_hecho'; planta_id: string; tipo: TipoCuidadoHecho }
  | { destino: 'sin_clasificar'; texto: string }
)

export type Destino = Propuesta['destino']

export const DESTINOS: { valor: Destino; texto: string; dibujo: string }[] = [
  { valor: 'tarea', texto: 'Tarea', dibujo: '📝' },
  { valor: 'compra', texto: 'Compra', dibujo: '🛒' },
  { valor: 'plan', texto: 'Plan', dibujo: '🎉' },
  { valor: 'pelicula', texto: 'Película para ver', dibujo: '🎬' },
  { valor: 'serie', texto: 'Serie para ver', dibujo: '📺' },
  { valor: 'deseo', texto: 'Mi lista de deseos', dibujo: '⭐' },
  { valor: 'idea_regalo', texto: 'Idea de regalo', dibujo: '💡' },
  { valor: 'fecha', texto: 'Fecha especial', dibujo: '🎂' },
  { valor: 'peso', texto: 'Peso de la mascota', dibujo: '⚖️' },
  { valor: 'cuidado_hecho', texto: 'Planta cuidada', dibujo: '🪴' },
  { valor: 'sin_clasificar', texto: 'Dejar en la bandeja', dibujo: '🧠' },
]
export const infoDestino = (d: Destino) => DESTINOS.find((x) => x.valor === d) ?? DESTINOS[DESTINOS.length - 1]

// Lo que hay en el hogar, para que la IA entienda los nombres y para los
// desplegables de la revisión.
export type ContextoHogar = {
  personas: { id: string; nombre: string; yo: boolean }[]
  mascotas: { id: string; nombre: string }[]
  plantas: { id: string; nombre: string }[]
  gente: { id: string; nombre: string }[]
  categoriasPlan: { id: string; nombre: string }[]
}

// ---------------------------------------------------------------------
// La bandeja
// ---------------------------------------------------------------------

function faltaElSql(codigo: string | undefined) {
  return codigo === '42P01' || codigo === 'PGRST205'
}

export function useBandeja() {
  const [notas, setNotas] = useState<NotaBandeja[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [recarga, setRecarga] = useState(0)

  useEffect(() => {
    if (!supabase) return
    let vigente = true
    // Gracias a RLS, solo llega TU bandeja.
    supabase
      .from('bandeja')
      .select('id, texto, creado_en')
      .order('creado_en')
      .then(({ data, error }) => {
        if (!vigente) return
        if (error) return setError(faltaElSql(error.code) ? 'Falta ejecutar en Supabase el SQL de la bandeja (20261127100000_bandeja.sql).' : mensajeDeError(error))
        setError(null)
        setNotas(data as NotaBandeja[])
      })
    return () => {
      vigente = false
    }
  }, [recarga])

  return { notas, error, recargar: () => setRecarga((n) => n + 1) }
}

// Cuántas cosas hay en tu bandeja (o null si no se sabe).
export async function cuantasEnLaBandeja(): Promise<number | null> {
  if (!supabase) return null
  const { count, error } = await supabase.from('bandeja').select('id', { count: 'exact', head: true })
  return error ? null : (count ?? 0)
}

// Guarda lo que has soltado: cada línea, una nota.
export async function soltar(hogarId: string, texto: string): Promise<{ guardadas: number } | { error: string }> {
  if (!supabase) return { error: 'Sin conexión.' }
  const lineas = texto
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map((l) => l.slice(0, 500))
  if (lineas.length === 0) return { guardadas: 0 }
  const { error } = await supabase.from('bandeja').insert(lineas.map((l) => ({ hogar_id: hogarId, texto: l })))
  if (error) return { error: faltaElSql(error.code) ? 'Falta ejecutar en Supabase el SQL de la bandeja.' : mensajeDeError(error) }
  // Que el botón 🧠 se entere.
  window.dispatchEvent(new Event('bandeja-cambiada'))
  return { guardadas: lineas.length }
}

export async function borrarNotas(ids: string[]): Promise<string | null> {
  if (!supabase || ids.length === 0) return null
  const { error } = await supabase.from('bandeja').delete().in('id', ids)
  window.dispatchEvent(new Event('bandeja-cambiada'))
  return error ? mensajeDeError(error) : null
}

export async function cambiarNota(id: string, texto: string): Promise<string | null> {
  if (!supabase) return 'Sin conexión.'
  const { error } = await supabase.from('bandeja').update({ texto: texto.replace(/\s+/g, ' ').trim().slice(0, 500) }).eq('id', id)
  return error ? mensajeDeError(error) : null
}

// ---------------------------------------------------------------------
// Repartir con la IA
// ---------------------------------------------------------------------

export async function contextoDelHogar(miUserId: string): Promise<ContextoHogar> {
  if (!supabase) throw new Error('Sin conexión.')
  const [miembros, mascotas, plantas, gente, categorias] = await Promise.all([
    supabase.from('miembros').select('id, user_id, nombre_visible').order('creado_en'),
    supabase.from('mascotas').select('id, nombre').order('nombre'),
    supabase.from('plantas').select('id, nombre').order('nombre'),
    supabase.from('personas_regalo').select('id, nombre').order('nombre'),
    supabase.from('categorias_plan').select('id, nombre').order('orden'),
  ])
  const fallo = miembros.error ?? mascotas.error
  if (fallo) throw new Error(mensajeDeError(fallo))
  // Plantas, regalos o planes que aún no existan (SQL sin ejecutar): listas vacías.
  return {
    personas: (miembros.data ?? []).map((m) => ({ id: m.id as string, nombre: m.nombre_visible as string, yo: m.user_id === miUserId })),
    mascotas: (mascotas.data ?? []) as { id: string; nombre: string }[],
    plantas: (plantas.error ? [] : plantas.data ?? []) as { id: string; nombre: string }[],
    gente: (gente.error ? [] : gente.data ?? []) as { id: string; nombre: string }[],
    categoriasPlan: (categorias.error ? [] : categorias.data ?? []) as { id: string; nombre: string }[],
  }
}

export async function repartir(notas: NotaBandeja[], contexto: ContextoHogar): Promise<Propuesta[]> {
  if (!supabase) throw new Error('Sin conexión.')
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Tienes que entrar con tu cuenta.')
  let respuesta: Response
  try {
    respuesta = await fetch('/api/vaciar-cabeza', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ notas: notas.map((n) => ({ id: n.id, texto: n.texto })), contexto }),
    })
  } catch {
    throw new Error('Sin conexión. Prueba otra vez.')
  }
  const cuerpo = (await respuesta.json().catch(() => null)) as { propuestas?: Propuesta[]; error?: string } | null
  if (!respuesta.ok || !cuerpo?.propuestas) throw new Error(cuerpo?.error ?? 'Algo ha fallado. Prueba otra vez.')
  return cuerpo.propuestas
}

// ---------------------------------------------------------------------
// Guardar cada cosa en su sitio (devuelve un mensaje de error o null)
// ---------------------------------------------------------------------

async function hacer(consulta: PromiseLike<{ error: { message?: string; code?: string } | null }>): Promise<string | null> {
  const { error } = await consulta
  if (!error) return null
  if (error.code === '23505') return 'Ya estaba apuntado.'
  if (faltaElSql(error.code)) return 'Falta ejecutar en Supabase el SQL de esta parte de la app.'
  return mensajeDeError(error)
}

export async function guardarPropuesta(hogarId: string, p: Propuesta): Promise<string | null> {
  const db = supabase
  if (!db) return 'Sin conexión.'
  const hoy = hoyComoTexto()
  switch (p.destino) {
    case 'tarea':
      return hacer(
        db.from('tareas').insert({
          hogar_id: hogarId,
          titulo: p.titulo,
          categoria: p.mascota_id ? 'mascota' : p.categoria,
          mascota_id: p.mascota_id,
          fecha_limite: p.fecha,
          responsable_id: p.responsable_id,
          descripcion: p.detalles,
        }),
      )
    case 'compra':
      return hacer(db.from('lista_compra').insert({ hogar_id: hogarId, nombre: p.nombre, cantidad: p.cantidad }))
    case 'plan':
      return hacer(db.from('planes').insert({ hogar_id: hogarId, nombre: p.nombre, categoria_id: p.categoria_id }))
    case 'pelicula':
    case 'serie':
      return hacer(db.from('para_ver').insert({ hogar_id: hogarId, tipo: p.destino, titulo: p.titulo }))
    case 'deseo':
      return hacer(db.from('deseos').insert({ hogar_id: hogarId, titulo: p.titulo }))
    case 'idea_regalo':
      if (!p.miembro_id && !p.persona_id) return 'Elige para quién es la idea.'
      return hacer(db.from('ideas_regalo').insert({ hogar_id: hogarId, titulo: p.titulo, miembro_id: p.miembro_id, persona_id: p.miembro_id ? null : p.persona_id }))
    case 'fecha':
      return hacer(
        db.from('fechas_especiales').insert({
          hogar_id: hogarId,
          titulo: p.titulo,
          tipo: p.tipo,
          dia: p.dia,
          mes: p.mes,
          anio: p.anio,
          miembro_id: p.miembro_id,
          persona_id: p.miembro_id ? null : p.persona_id,
        }),
      )
    case 'peso': {
      // Como mucho un peso por día: si ya hay uno hoy, se cambia.
      const { data: yaHabia, error } = await db.from('pesos').select('id').eq('mascota_id', p.mascota_id).eq('fecha', hoy).maybeSingle()
      if (error) return mensajeDeError(error)
      return hacer(
        yaHabia
          ? db.from('pesos').update({ kg: p.kg }).eq('id', yaHabia.id)
          : db.from('pesos').insert({ hogar_id: hogarId, mascota_id: p.mascota_id, fecha: hoy, kg: p.kg }),
      )
    }
    case 'cuidado_hecho': {
      // Se marca como hecha la tarea pendiente de ese cuidado (y la base de
      // datos crea la siguiente, como siempre).
      const { data: cuidados, error } = await db.from('cuidados').select('id').eq('planta_id', p.planta_id).eq('tipo', p.tipo)
      if (error) return mensajeDeError(error)
      const ids = (cuidados ?? []).map((c) => c.id as string)
      if (ids.length === 0) return 'Esa planta no tiene ese cuidado apuntado.'
      const { data: tarea, error: errorTarea } = await db
        .from('tareas')
        .select('id')
        .in('cuidado_id', ids)
        .eq('completada', false)
        .order('fecha_limite')
        .limit(1)
        .maybeSingle()
      if (errorTarea) return mensajeDeError(errorTarea)
      if (!tarea) return 'No hay ningún cuidado pendiente de esa planta.'
      return hacer(db.rpc('completar_tarea', { tarea_id: tarea.id, hecha_el: hoy }))
    }
    case 'sin_clasificar':
      return null
  }
}
