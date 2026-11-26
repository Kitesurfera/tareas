import type { TipoDocumento } from './documentos'
import { hoyComoTexto, sumarDias } from './fechas'
import type { Plan } from './planes'
import { SUGERIDAS, sugeridaParaPlan, type Plantilla } from './plantillas'
import { supabase } from './supabase'
import type { Categoria, TipoTratamiento } from './tipos'
import type { ContextoHogar, Destino, Propuesta, TipoCuidadoHecho, TipoFechaBandeja, TipoVencimientoBandeja } from './bandeja'

// Las acciones que propone la IA (en la bandeja y en el asistente 🧠) como
// borradores que la persona revisa y corrige antes de guardar. Para las que
// cambian algo que ya existe («ya he llamado al fontanero»), la app busca
// aquí, en el móvil, a qué tarea o artículo se refiere: la IA nunca ve
// vuestras tareas.

export type Candidato = { id: string; texto: string; detalle?: string }

// Lo que hace falta para buscar y para guardar (se carga una vez al revisar).
export type DatosAcciones = {
  miMiembroId: string | null
  tareas: TareaCorta[]
  compra: { id: string; nombre: string; cantidad: string | null }[]
  planes: Plan[]
  plantillas: Plantilla[]
}

export type TareaCorta = {
  id: string
  titulo: string
  fecha_limite: string | null
  responsable_id: string | null
  automatica: boolean
  // Para buscar: el título y el nombre de la mascota o la planta.
  busqueda: string
}

export type Borrador = {
  clave: string
  nota: string
  destino: Destino
  texto: string // título, nombre o el texto de la nota
  fecha: string // la fecha principal (o la próxima vez, en lo que se repite)
  fecha2: string // la vuelta de un viaje
  responsable: string
  categoria: Categoria
  mascota: string
  detalles: string
  cantidad: string
  categoriaPlan: string
  para: string // «m:<id>», «p:<id>» o ''
  tipoFecha: TipoFechaBandeja
  dia: number
  mes: number
  anio: string
  kg: string
  planta: string
  tipoCuidado: TipoCuidadoHecho
  frecuencia: string // cada cuántos días
  meses: string // cada cuántos meses ('' = no se repite)
  importe: string
  aviso: string
  tipoTratamiento: TipoTratamiento
  tipoVencimiento: TipoVencimientoBandeja
  tipoDocumento: TipoDocumento
  ubicacion: string
  turnos: boolean
  personas: string[]
  que: string // a qué se refiere (para buscar)
  objetivo: string // el id elegido (tarea, artículo, plan, plantilla) o ''
  objetivos: string[] // las tareas para pedir ayuda
  guardar: boolean
  estado: 'pendiente' | 'guardado'
  error: string | null
}

// Las acciones que no se guardan desde la tarjeta.
export const SIN_GUARDAR: Destino[] = ['sin_clasificar', 'plantilla']

let contador = 0

// ---------------------------------------------------------------------
// Buscar a qué se refiere («llamar al fontanero» → la tarea que lo pone)
// ---------------------------------------------------------------------

const VACIAS = new Set('el la los las lo le les de del a al y e o ya he ha has hemos han que un una unos unas para por con en mi mis tu tus su sus me se te ese esa este esta eso hoy'.split(' '))

export const palabras = (texto: string) =>
  texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9ñ]+/)
    .filter((p) => p.length > 1 && !VACIAS.has(p))

// Lo parecido que es «texto» a lo que se busca (0 = nada, 1 = todas las palabras).
export function parecido(buscado: string, texto: string): number {
  const q = palabras(buscado)
  const t = palabras(texto)
  if (q.length === 0 || t.length === 0) return 0
  const raiz = (p: string) => p.slice(0, 5)
  const aciertos = q.filter((p) => t.some((x) => x.startsWith(raiz(p)) || p.startsWith(raiz(x)))).length
  return aciertos / q.length
}

// Las más parecidas primero (como mucho 6), si se parecen algo.
export function parecidas<T>(buscado: string, cosas: T[], texto: (x: T) => string): T[] {
  return cosas
    .map((x) => ({ x, nota: parecido(buscado, texto(x)) }))
    .filter((c) => c.nota >= 0.34)
    .sort((a, b) => b.nota - a.nota)
    .slice(0, 6)
    .map((c) => c.x)
}

const conFecha = (t: TareaCorta) => (t.fecha_limite ? ` · ${t.fecha_limite.slice(8, 10)}/${t.fecha_limite.slice(5, 7)}` : '')

// Los candidatos de una acción (los más parecidos primero) y el resto.
export function candidatosDe(b: Pick<Borrador, 'destino' | 'que' | 'texto'>, d: DatosAcciones): { parecidos: Candidato[]; resto: Candidato[] } {
  const buscado = b.que || b.texto
  const tarea = (t: TareaCorta): Candidato => ({ id: t.id, texto: t.titulo, detalle: conFecha(t) })
  const separar = <T,>(todos: T[], texto: (x: T) => string, a: (x: T) => Candidato) => {
    const p = parecidas(buscado, todos, texto)
    return { parecidos: p.map(a), resto: todos.filter((x) => !p.includes(x)).slice(0, 80).map(a) }
  }
  switch (b.destino) {
    case 'hecho':
      return separar(d.tareas, (t) => t.busqueda, tarea)
    case 'mover':
      // Las automáticas se cambian desde su origen (un tratamiento, una rutina…).
      return separar(d.tareas.filter((t) => !t.automatica), (t) => t.busqueda, tarea)
    case 'ayuda':
      return separar(d.tareas.filter((t) => t.responsable_id === d.miMiembroId || t.responsable_id === null), (t) => t.busqueda, tarea)
    case 'comprado':
      return separar(d.compra, (a) => a.nombre, (a) => ({ id: a.id, texto: a.nombre, detalle: a.cantidad ? ` · ${a.cantidad}` : '' }))
    case 'programar':
      return separar(d.planes, (p) => p.nombre, (p) => ({ id: p.id, texto: p.nombre }))
    case 'plantilla':
      return separar(d.plantillas, (p) => p.nombre, (p) => ({ id: p.clave, texto: `${p.dibujo} ${p.nombre}` }))
    default:
      return { parecidos: [], resto: [] }
  }
}

// El objetivo que se elige solo (el más parecido), al crear el borrador o al cambiar de sitio.
export function objetivoInicial(b: Pick<Borrador, 'destino' | 'que' | 'texto'>, d: DatosAcciones | null): { objetivo: string; objetivos: string[] } {
  if (!d) return { objetivo: '', objetivos: [] }
  if (b.destino === 'plantilla') {
    const buscado = b.que || b.texto
    const porNombre = parecidas(buscado, d.plantillas, (p) => p.nombre)[0] ?? sugeridaParaPlan({ nombre: buscado })
    return { objetivo: porNombre?.clave ?? '', objetivos: [] }
  }
  const { parecidos } = candidatosDe(b, d)
  if (b.destino === 'ayuda') {
    // Sin decir cuáles: todo lo tuyo de hoy y lo atrasado.
    const hoy = hoyComoTexto()
    const mias = d.tareas.filter((t) => t.responsable_id === d.miMiembroId)
    const elegidas = b.que ? parecidos.map((c) => c.id).slice(0, 1) : mias.filter((t) => t.fecha_limite && t.fecha_limite <= hoy).map((t) => t.id)
    return { objetivo: '', objetivos: elegidas }
  }
  return { objetivo: parecidos[0]?.id ?? '', objetivos: [] }
}

export async function cargarDatosAcciones(contexto: ContextoHogar): Promise<DatosAcciones> {
  const miMiembroId = contexto.personas.find((p) => p.yo)?.id ?? null
  const vacio: DatosAcciones = { miMiembroId, tareas: [], compra: [], planes: [], plantillas: SUGERIDAS }
  if (!supabase) return vacio
  const [tareas, compra, planes, plantillas] = await Promise.all([
    supabase
      .from('tareas')
      .select('id, titulo, fecha_limite, responsable_id, mascota_id, planta_id, tratamiento_id, rutina_id, cuidado_id, vencimiento_id, documento_id')
      .eq('completada', false)
      .order('fecha_limite', { ascending: true, nullsFirst: false })
      .limit(300),
    supabase.from('lista_compra').select('id, nombre, cantidad').eq('comprado', false).order('nombre'),
    supabase.from('planes').select('*').order('nombre'),
    supabase.from('plantillas').select('id, nombre, dibujo, pregunta, tareas').order('nombre'),
  ])
  const nombre = (lista: { id: string; nombre: string }[], id: unknown) => lista.find((x) => x.id === id)?.nombre ?? ''
  return {
    ...vacio,
    tareas: ((tareas.data ?? []) as Record<string, string | null>[]).map((t) => ({
      id: t.id!,
      titulo: t.titulo!,
      fecha_limite: t.fecha_limite,
      responsable_id: t.responsable_id,
      automatica: Boolean(t.tratamiento_id || t.rutina_id || t.cuidado_id || t.vencimiento_id || t.documento_id),
      busqueda: `${t.titulo} ${nombre(contexto.mascotas, t.mascota_id)} ${nombre(contexto.plantas, t.planta_id)}`,
    })),
    compra: (compra.error ? [] : (compra.data ?? [])) as DatosAcciones['compra'],
    planes: (planes.error ? [] : (planes.data ?? [])) as Plan[],
    // Vuestras plantillas (si está el SQL) y las sugeridas.
    plantillas: [
      ...((plantillas.error ? [] : (plantillas.data ?? [])) as Omit<Plantilla, 'clave' | 'grupo'>[]).map((p) => ({ ...p, clave: p.id!, grupo: 'vuestras' as const })),
      ...SUGERIDAS,
    ],
  }
}

// ---------------------------------------------------------------------
// Propuesta ⇄ borrador
// ---------------------------------------------------------------------

// Lo que se repite se enseña con su PRÓXIMA vez (lo que importa); al guardar,
// la última vez = la próxima menos la frecuencia.
const proximaDe = (ultima: string, dias: number) => sumarDias(ultima, dias)

export function desdePropuesta(p: Propuesta, datos: DatosAcciones | null = null): Borrador {
  const b: Borrador = {
    clave: `b${++contador}`,
    nota: p.nota,
    destino: p.destino,
    texto: '',
    fecha: '',
    fecha2: '',
    responsable: '',
    categoria: 'otros',
    mascota: '',
    detalles: '',
    cantidad: '',
    categoriaPlan: '',
    para: '',
    tipoFecha: 'cumpleanos',
    dia: 1,
    mes: 1,
    anio: '',
    kg: '',
    planta: '',
    tipoCuidado: 'riego',
    frecuencia: '',
    meses: '',
    importe: '',
    aviso: '',
    tipoTratamiento: 'vacuna',
    tipoVencimiento: 'seguro',
    tipoDocumento: 'otros',
    ubicacion: '',
    turnos: false,
    personas: [],
    que: '',
    objetivo: '',
    objetivos: [],
    guardar: !SIN_GUARDAR.includes(p.destino),
    estado: 'pendiente',
    error: null,
  }
  const listo = (x: Borrador): Borrador => ({ ...x, ...objetivoInicial(x, datos) })
  switch (p.destino) {
    case 'tarea':
      return { ...b, texto: p.titulo, fecha: p.fecha ?? '', responsable: p.responsable_id ?? '', categoria: p.categoria, mascota: p.mascota_id ?? '', detalles: p.detalles ?? '' }
    case 'compra':
      return { ...b, texto: p.nombre, cantidad: p.cantidad ?? '' }
    case 'plan':
      return { ...b, texto: p.nombre, categoriaPlan: p.categoria_id ?? '' }
    case 'pelicula':
    case 'serie':
    case 'deseo':
      return { ...b, texto: p.titulo }
    case 'idea_regalo':
      return { ...b, texto: p.titulo, para: p.miembro_id ? `m:${p.miembro_id}` : p.persona_id ? `p:${p.persona_id}` : '' }
    case 'fecha':
      return { ...b, texto: p.titulo, tipoFecha: p.tipo, dia: p.dia, mes: p.mes, anio: p.anio ? String(p.anio) : '', para: p.miembro_id ? `m:${p.miembro_id}` : p.persona_id ? `p:${p.persona_id}` : '' }
    case 'peso':
      return { ...b, mascota: p.mascota_id, kg: String(p.kg).replace('.', ',') }
    case 'cuidado_hecho':
      return { ...b, planta: p.planta_id, tipoCuidado: p.tipo }
    case 'rutina':
      return { ...b, texto: p.nombre, frecuencia: String(p.frecuencia_dias), fecha: proximaDe(p.fecha_ultima, p.frecuencia_dias), responsable: p.responsable_id ?? '', turnos: p.turnos }
    case 'tratamiento':
      return { ...b, texto: p.nombre, mascota: p.mascota_id ?? '', tipoTratamiento: p.tipo, frecuencia: String(p.frecuencia_dias), fecha: proximaDe(p.fecha_ultima, p.frecuencia_dias) }
    case 'planta':
      return { ...b, texto: p.nombre, ubicacion: p.ubicacion ?? '', frecuencia: p.riego_dias ? String(p.riego_dias) : '' }
    case 'cuidado':
      return { ...b, planta: p.planta_id ?? '', tipoCuidado: p.tipo, frecuencia: String(p.frecuencia_dias), fecha: proximaDe(p.fecha_ultima, p.frecuencia_dias), responsable: p.responsable_id ?? '' }
    case 'vencimiento':
      return { ...b, texto: p.nombre, tipoVencimiento: p.tipo, fecha: p.fecha_renovacion ?? '', meses: p.frecuencia_meses ? String(p.frecuencia_meses) : '', importe: p.importe === null ? '' : String(p.importe).replace('.', ','), aviso: p.aviso_dias === null ? '' : String(p.aviso_dias) }
    case 'documento':
      return { ...b, texto: p.titulo, tipoDocumento: p.tipo, fecha: p.caduca_el ?? '', responsable: p.persona_id ?? '' }
    case 'viaje':
      return { ...b, personas: p.personas, fecha: p.ida ?? '', fecha2: p.vuelta ?? '', texto: p.lugar ?? '' }
    case 'programar':
      return listo({ ...b, texto: p.plan, que: p.plan, fecha: p.fecha ?? '' })
    case 'plantilla':
      return listo({ ...b, texto: p.que, que: p.que, fecha: p.fecha ?? '' })
    case 'hecho':
      return listo({ ...b, texto: p.que, que: p.que })
    case 'mover':
      return listo({ ...b, texto: p.que, que: p.que, fecha: p.fecha ?? '' })
    case 'ayuda':
      return listo({ ...b, texto: p.que ?? '', que: p.que ?? '', responsable: p.para_id ?? '' })
    case 'comprado':
      return listo({ ...b, texto: p.que, que: p.que })
    case 'pausa':
      return { ...b, fecha: p.hasta ?? '' }
    case 'sin_clasificar':
      return { ...b, texto: p.texto }
  }
}

const enteroEntre = (valor: string, desde: number, hasta: number): number | null => {
  const n = Number(valor.replace(',', '.'))
  return Number.isFinite(n) && n >= desde && n <= hasta ? Math.round(n) : null
}

// El borrador (corregido) → lo que hay que guardar, o por qué no se puede.
export function aPropuesta(b: Borrador): Propuesta | { error: string } {
  const texto = b.texto.replace(/\s+/g, ' ').trim()
  const base = { nota: b.nota }
  const necesitaTexto = ['tarea', 'compra', 'plan', 'pelicula', 'serie', 'deseo', 'idea_regalo', 'fecha', 'rutina', 'tratamiento', 'planta', 'vencimiento', 'documento', 'programar'].includes(b.destino)
  if (necesitaTexto && !texto) return { error: 'Falta el texto.' }
  const para = { miembro_id: b.para.startsWith('m:') ? b.para.slice(2) : null, persona_id: b.para.startsWith('p:') ? b.para.slice(2) : null }
  const cada = enteroEntre(b.frecuencia, 1, 3650)
  switch (b.destino) {
    case 'tarea':
      return { ...base, destino: 'tarea', titulo: texto.slice(0, 120), fecha: b.fecha || null, categoria: b.mascota ? 'mascota' : b.categoria, responsable_id: b.responsable || null, mascota_id: b.mascota || null, detalles: b.detalles.trim() || null }
    case 'compra':
      return { ...base, destino: 'compra', nombre: texto.slice(0, 80), cantidad: b.cantidad.trim().slice(0, 30) || null }
    case 'plan':
      return { ...base, destino: 'plan', nombre: texto.slice(0, 80), categoria_id: b.categoriaPlan || null }
    case 'pelicula':
    case 'serie':
      return { ...base, destino: b.destino, titulo: texto.slice(0, 120) }
    case 'deseo':
      return { ...base, destino: 'deseo', titulo: texto.slice(0, 120) }
    case 'idea_regalo':
      if (!b.para) return { error: 'Elige para quién es la idea.' }
      return { ...base, destino: 'idea_regalo', titulo: texto.slice(0, 120), ...para }
    case 'fecha': {
      const anio = Number(b.anio)
      return { ...base, destino: 'fecha', titulo: texto.slice(0, 80), tipo: b.tipoFecha, dia: b.dia, mes: b.mes, anio: b.anio && Number.isInteger(anio) && anio >= 1900 && anio <= 2100 ? anio : null, ...para }
    }
    case 'peso': {
      const kg = Number(b.kg.replace(',', '.'))
      if (!b.mascota) return { error: 'Elige la mascota.' }
      if (!Number.isFinite(kg) || kg <= 0 || kg >= 500) return { error: 'El peso no es válido.' }
      return { ...base, destino: 'peso', mascota_id: b.mascota, kg: Math.round(kg * 1000) / 1000 }
    }
    case 'cuidado_hecho':
      if (!b.planta) return { error: 'Elige la planta.' }
      return { ...base, destino: 'cuidado_hecho', planta_id: b.planta, tipo: b.tipoCuidado }
    case 'rutina':
      if (!cada) return { error: 'Elige cada cuántos días (de 1 a 3650).' }
      if (!b.fecha) return { error: 'Elige cuándo toca la primera vez.' }
      return { ...base, destino: 'rutina', nombre: texto.slice(0, 80), frecuencia_dias: cada, fecha_ultima: sumarDias(b.fecha, -cada), responsable_id: b.responsable || null, turnos: b.turnos }
    case 'tratamiento':
      if (!b.mascota) return { error: 'Elige la mascota.' }
      if (!cada) return { error: 'Elige cada cuántos días (de 1 a 3650).' }
      if (!b.fecha) return { error: 'Elige cuándo toca la próxima vez.' }
      return { ...base, destino: 'tratamiento', mascota_id: b.mascota, tipo: b.tipoTratamiento, nombre: texto.slice(0, 80), frecuencia_dias: cada, fecha_ultima: sumarDias(b.fecha, -cada) }
    case 'planta':
      return { ...base, destino: 'planta', nombre: texto.slice(0, 60), ubicacion: b.ubicacion.trim().slice(0, 40) || null, riego_dias: b.frecuencia ? enteroEntre(b.frecuencia, 1, 365) : null }
    case 'cuidado':
      if (!b.planta) return { error: 'Elige la planta.' }
      if (!cada) return { error: 'Elige cada cuántos días (de 1 a 3650).' }
      if (!b.fecha) return { error: 'Elige cuándo toca la próxima vez.' }
      return { ...base, destino: 'cuidado', planta_id: b.planta, tipo: b.tipoCuidado, frecuencia_dias: cada, fecha_ultima: sumarDias(b.fecha, -cada), responsable_id: b.responsable || null }
    case 'vencimiento': {
      if (!b.fecha) return { error: 'Elige cuándo se renueva.' }
      const importe = b.importe.trim() ? Number(b.importe.replace(',', '.').replace(/[€\s]/g, '')) : null
      if (importe !== null && (!Number.isFinite(importe) || importe < 0)) return { error: 'El importe no es válido.' }
      return {
        ...base,
        destino: 'vencimiento',
        tipo: b.tipoVencimiento,
        nombre: texto.slice(0, 80),
        fecha_renovacion: b.fecha,
        frecuencia_meses: b.meses ? enteroEntre(b.meses, 1, 120) : null,
        importe: importe === null ? null : Math.round(importe * 100) / 100,
        aviso_dias: b.aviso.trim() ? enteroEntre(b.aviso, 0, 365) : null,
      }
    }
    case 'documento':
      return { ...base, destino: 'documento', titulo: texto.slice(0, 80), tipo: b.tipoDocumento, caduca_el: b.fecha || null, persona_id: b.responsable || null }
    case 'viaje':
      return { ...base, destino: 'viaje', personas: b.personas, ida: b.fecha || null, vuelta: b.fecha2 || null, lugar: texto.slice(0, 80) || null }
    case 'programar':
      return { ...base, destino: 'programar', plan: texto.slice(0, 80), fecha: b.fecha || null, plan_id: b.objetivo || null }
    case 'plantilla':
      return { ...base, destino: 'plantilla', que: texto, fecha: b.fecha || null, clave: b.objetivo || null }
    case 'hecho':
      return { ...base, destino: 'hecho', que: b.que, tarea_id: b.objetivo || null }
    case 'mover':
      return { ...base, destino: 'mover', que: b.que, fecha: b.fecha || null, tarea_id: b.objetivo || null }
    case 'ayuda':
      return { ...base, destino: 'ayuda', que: b.que || null, para_id: b.responsable || null, tareas: b.objetivos }
    case 'comprado':
      return { ...base, destino: 'comprado', que: b.que, articulo_id: b.objetivo || null }
    case 'pausa':
      return { ...base, destino: 'pausa', hasta: b.fecha || null }
    case 'sin_clasificar':
      return { ...base, destino: 'sin_clasificar', texto }
  }
}
