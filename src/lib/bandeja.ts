import { useEffect, useState } from 'react'
import { pedirAyuda } from './ayuda'
import { mensajeDeError } from './errores'
import { hoyComoTexto } from './fechas'
import { programar, type Plan } from './planes'
import { supabase } from './supabase'
import type { Categoria, TipoTratamiento } from './tipos'
import type { TipoDocumento } from './documentos'

// «🧠 Vaciar la cabeza»: tu bandeja privada (tabla bandeja) y el reparto
// con la IA (api/asistente, con modo «repartir»). La IA solo propone: aquí se guarda cada
// cosa en su sitio, con las reglas de siempre de la base de datos.

export type NotaBandeja = { id: string; texto: string; creado_en: string }

export const TIPOS_CUIDADO = ['riego', 'abono', 'trasplante', 'poda', 'otro'] as const
export type TipoVencimientoBandeja = 'seguro' | 'suscripcion'
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
  // --- Crear en el resto de pestañas (el asistente y la bandeja)
  | { destino: 'rutina'; nombre: string; frecuencia_dias: number; fecha_ultima: string; responsable_id: string | null; turnos: boolean }
  | { destino: 'tratamiento'; mascota_id: string | null; tipo: TipoTratamiento; nombre: string; frecuencia_dias: number; fecha_ultima: string }
  | { destino: 'planta'; nombre: string; ubicacion: string | null; riego_dias: number | null }
  | { destino: 'cuidado'; planta_id: string | null; tipo: TipoCuidadoHecho; frecuencia_dias: number; fecha_ultima: string; responsable_id: string | null }
  | { destino: 'vencimiento'; tipo: TipoVencimientoBandeja; nombre: string; fecha_renovacion: string | null; frecuencia_meses: number | null; importe: number | null; aviso_dias: number | null }
  | { destino: 'documento'; titulo: string; tipo: TipoDocumento; caduca_el: string | null; persona_id: string | null }
  | { destino: 'viaje'; personas: string[]; ida: string | null; vuelta: string | null; lugar: string | null }
  // «plan_id»: el de vuestra lista (lo busca la app); sin él, se crea el plan.
  | { destino: 'programar'; plan: string; fecha: string | null; plan_id?: string | null }
  // «clave»: la plantilla que encaja (la busca la app). No se guarda: se abre.
  | { destino: 'plantilla'; que: string; fecha: string | null; clave?: string | null }
  // --- Cambiar lo que ya existe: la IA dice «que» con palabras y la app
  //     busca a qué tarea o artículo se refiere (tarea_id, articulo_id…).
  | { destino: 'hecho'; que: string; tarea_id?: string | null }
  | { destino: 'mover'; que: string; fecha: string | null; tarea_id?: string | null }
  | { destino: 'ayuda'; que: string | null; para_id: string | null; tareas?: string[] }
  | { destino: 'comprado'; que: string; articulo_id?: string | null }
  | { destino: 'pausa'; hasta: string | null }
  | { destino: 'sin_clasificar'; texto: string }
)

export type Destino = Propuesta['destino']

export const DESTINOS: { valor: Destino; texto: string; dibujo: string; grupo: 'crear' | 'cambiar' | 'bandeja' }[] = [
  { valor: 'tarea', texto: 'Tarea', dibujo: '📝', grupo: 'crear' },
  { valor: 'compra', texto: 'Compra', dibujo: '🛒', grupo: 'crear' },
  { valor: 'plan', texto: 'Plan', dibujo: '🎉', grupo: 'crear' },
  { valor: 'programar', texto: 'Plan en el calendario', dibujo: '📅', grupo: 'crear' },
  { valor: 'pelicula', texto: 'Película para ver', dibujo: '🎬', grupo: 'crear' },
  { valor: 'serie', texto: 'Serie para ver', dibujo: '📺', grupo: 'crear' },
  { valor: 'deseo', texto: 'Mi lista de deseos', dibujo: '⭐', grupo: 'crear' },
  { valor: 'idea_regalo', texto: 'Idea de regalo', dibujo: '💡', grupo: 'crear' },
  { valor: 'fecha', texto: 'Fecha especial', dibujo: '🎂', grupo: 'crear' },
  { valor: 'rutina', texto: 'Rutina de casa', dibujo: '🔁', grupo: 'crear' },
  { valor: 'tratamiento', texto: 'Tratamiento de la mascota', dibujo: '💉', grupo: 'crear' },
  { valor: 'peso', texto: 'Peso de la mascota', dibujo: '⚖️', grupo: 'crear' },
  { valor: 'planta', texto: 'Planta nueva', dibujo: '🪴', grupo: 'crear' },
  { valor: 'cuidado', texto: 'Cuidado de planta', dibujo: '💧', grupo: 'crear' },
  { valor: 'vencimiento', texto: 'Seguro o suscripción', dibujo: '📑', grupo: 'crear' },
  { valor: 'documento', texto: 'Documento', dibujo: '🪪', grupo: 'crear' },
  { valor: 'viaje', texto: 'Viaje', dibujo: '✈️', grupo: 'crear' },
  { valor: 'plantilla', texto: 'Usar una plantilla', dibujo: '📋', grupo: 'crear' },
  { valor: 'hecho', texto: 'Marcar como hecha', dibujo: '✅', grupo: 'cambiar' },
  { valor: 'cuidado_hecho', texto: 'Planta cuidada', dibujo: '🌿', grupo: 'cambiar' },
  { valor: 'mover', texto: 'Cambiar de día', dibujo: '📆', grupo: 'cambiar' },
  { valor: 'ayuda', texto: 'Hoy no puedo (pedir ayuda)', dibujo: '🙋', grupo: 'cambiar' },
  { valor: 'comprado', texto: 'Ya comprado', dibujo: '🛍️', grupo: 'cambiar' },
  { valor: 'pausa', texto: 'Pausar los avisos', dibujo: '⏸️', grupo: 'cambiar' },
  { valor: 'sin_clasificar', texto: 'Dejar en la bandeja', dibujo: '🧠', grupo: 'bandeja' },
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
    respuesta = await fetch('/api/asistente', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ modo: 'repartir', notas: notas.map((n) => ({ id: n.id, texto: n.texto })), contexto }),
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

// Lo que hace falta del hogar para guardar algunas cosas (quién eres, los planes).
export type Extra = { miMiembroId: string | null; planes: Plan[] }

export async function guardarPropuesta(hogarId: string, p: Propuesta, extra: Extra = { miMiembroId: null, planes: [] }): Promise<string | null> {
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
    case 'rutina':
      return hacer(
        db.from('rutinas').insert({
          hogar_id: hogarId,
          nombre: p.nombre,
          frecuencia_dias: p.frecuencia_dias,
          fecha_ultima: p.fecha_ultima,
          // Con turnos, a alguien le tiene que tocar la primera: si no se ha dicho, a ti.
          responsable_id: p.responsable_id ?? (p.turnos ? extra.miMiembroId : null),
          turnos: p.turnos,
          participantes: null,
        }),
      )
    case 'tratamiento':
      if (!p.mascota_id) return 'Elige la mascota.'
      return hacer(
        db.from('tratamientos').insert({
          hogar_id: hogarId,
          mascota_id: p.mascota_id,
          tipo: p.tipo,
          nombre: p.nombre,
          fecha_ultima: p.fecha_ultima,
          frecuencia_dias: p.frecuencia_dias,
        }),
      )
    case 'planta': {
      const { data, error } = await db.from('plantas').insert({ hogar_id: hogarId, nombre: p.nombre, ubicacion: p.ubicacion }).select('id').single()
      if (error || !data) return mensajeDeError(error)
      if (!p.riego_dias) return null
      return hacer(
        db.from('cuidados').insert({ hogar_id: hogarId, planta_id: (data as { id: string }).id, tipo: 'riego', fecha_ultima: hoy, frecuencia_dias: p.riego_dias }),
      )
    }
    case 'cuidado':
      if (!p.planta_id) return 'Elige la planta.'
      return hacer(
        db.from('cuidados').insert({
          hogar_id: hogarId,
          planta_id: p.planta_id,
          tipo: p.tipo,
          nombre: p.tipo === 'otro' ? 'Cuidado' : null,
          fecha_ultima: p.fecha_ultima,
          frecuencia_dias: p.frecuencia_dias,
          responsable_id: p.responsable_id,
        }),
      )
    case 'vencimiento':
      if (!p.fecha_renovacion) return 'Elige cuándo se renueva.'
      return hacer(
        db.from('vencimientos').insert({
          hogar_id: hogarId,
          tipo: p.tipo,
          nombre: p.nombre,
          fecha_renovacion: p.fecha_renovacion,
          frecuencia_meses: p.frecuencia_meses,
          importe: p.importe,
          aviso_dias: p.aviso_dias,
        }),
      )
    case 'documento':
      return hacer(
        db.from('documentos').insert({
          hogar_id: hogarId,
          titulo: p.titulo,
          tipo: p.tipo,
          persona_id: p.persona_id,
          caduca_el: p.caduca_el,
          // Con fecha, aviso un mes antes para quien es (o para ti).
          aviso_dias: p.caduca_el ? 30 : null,
          responsable_id: p.caduca_el ? (p.persona_id ?? extra.miMiembroId) : null,
        }),
      )
    case 'viaje':
      if (p.personas.length === 0) return 'Elige quién se va.'
      if (!p.ida || !p.vuelta) return 'Elige el día de ida y el de vuelta.'
      if (p.vuelta < p.ida) return 'La vuelta no puede ser antes que la ida.'
      if (p.vuelta < hoy) return 'Ese viaje ya habría terminado.'
      return hacer(db.rpc('guardar_viaje', { viaje_grupo: null, personas: p.personas, ida: p.ida, vuelta: p.vuelta, lugar: p.lugar }))
    case 'programar': {
      if (!p.fecha) return 'Elige el día.'
      let plan = extra.planes.find((x) => x.id === p.plan_id)
      if (!plan) {
        // Un plan nuevo: primero a vuestra lista y luego al calendario.
        const { data, error } = await db.from('planes').insert({ hogar_id: hogarId, nombre: p.plan }).select('*').single()
        if (error || !data) return mensajeDeError(error)
        plan = data as Plan
      }
      return programar(plan, p.fecha)
    }
    case 'plantilla':
      // No se guarda: se abre la plantilla para revisarla (ver TarjetaAccion).
      return null
    case 'hecho':
      if (!p.tarea_id) return 'Elige qué tarea has hecho.'
      return hacer(db.rpc('completar_tarea', { tarea_id: p.tarea_id, hecha_el: hoy }))
    case 'mover':
      if (!p.tarea_id) return 'Elige qué tarea cambiar.'
      if (!p.fecha) return 'Elige el día nuevo.'
      return hacer(db.from('tareas').update({ fecha_limite: p.fecha }).eq('id', p.tarea_id).select('id').single())
    case 'ayuda':
      if (!p.para_id) return 'Elige a quién se lo pides.'
      if (!p.tareas || p.tareas.length === 0) return 'Elige qué tareas.'
      return pedirAyuda(p.para_id, p.tareas, '')
    case 'comprado':
      if (!p.articulo_id) return 'Elige qué has comprado.'
      return hacer(db.from('lista_compra').update({ comprado: true }).eq('id', p.articulo_id))
    case 'pausa':
      return hacer(db.from('ajustes_avisos').upsert({ pausa_hasta: p.hasta }, { onConflict: 'user_id' }))
    case 'sin_clasificar':
      return null
  }
}
