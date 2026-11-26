import { parecido } from './acciones'
import type { ContextoHogar, Propuesta } from './bandeja'
import { cuandoToca, diasHasta, euros, fechaCorta, hoyComoTexto, proximaRenovacion, sumarDias } from './fechas'
import { cuandoFalta, proximasFechas, TIPOS_FECHA, type FechaEspecial } from './regalos'
import { supabase } from './supabase'

// El asistente del botón 🧠 (api/asistente): lo que dices → acciones para
// revisar (como en la bandeja) y preguntas. Las preguntas las contesta la
// APP con vuestros datos, aquí en el móvil: la IA solo dice qué preguntas
// («qué me toca hoy») y nunca ve vuestras tareas.

export type Pregunta =
  | { tipo: 'que_toca'; quien: string; desde: string; hasta: string }
  | { tipo: 'cuando' | 'ultima_vez'; que: string }
  | { tipo: 'gasto' | 'compra' | 'planes' | 'que_ver' | 'viajes' | 'fechas' }
  | { tipo: 'peso'; mascota_id: string | null }

export type FilaRespuesta = { texto: string; detalle?: string; tareaId?: string }
export type Respuesta = { dibujo: string; titulo: string; filas: FilaRespuesta[]; vacio: string; enlace?: { texto: string; ruta: string } }

export async function preguntarAlAsistente(texto: string, contexto: ContextoHogar): Promise<{ acciones: Propuesta[]; preguntas: Pregunta[] }> {
  if (!supabase) throw new Error('Sin conexión.')
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Tienes que entrar con tu cuenta.')
  let respuesta: Response
  try {
    respuesta = await fetch('/api/asistente', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ texto, contexto }),
    })
  } catch {
    throw new Error('Sin conexión. Prueba otra vez.')
  }
  const cuerpo = (await respuesta.json().catch(() => null)) as { acciones?: Propuesta[]; preguntas?: Pregunta[]; error?: string } | null
  if (!respuesta.ok || !cuerpo?.acciones) throw new Error(cuerpo?.error ?? 'Algo ha fallado. Prueba otra vez.')
  return { acciones: cuerpo.acciones, preguntas: cuerpo.preguntas ?? [] }
}

// ---------------------------------------------------------------------
// Las respuestas (con los datos del hogar, gracias a RLS solo los vuestros)
// ---------------------------------------------------------------------

type Fila = Record<string, unknown>
const sin = (dato: unknown) => (dato ?? null) as string | null
const nombreDe = (lista: { id: string; nombre: string }[], id: unknown) => lista.find((x) => x.id === id)?.nombre ?? ''
const cuantas = (n: number) => (n === 1 ? '1 cosa' : `${n} cosas`)

// «el viernes 28 nov», «hoy», «del 30 nov al 6 dic»
function textoRango(desde: string, hasta: string, hoy: string): string {
  if (desde === hasta) {
    if (desde === hoy) return 'hoy'
    if (desde === sumarDias(hoy, 1)) return 'mañana'
    return `el ${fechaCorta(desde)}`
  }
  return desde === hoy ? `de aquí al ${fechaCorta(hasta)}` : `del ${fechaCorta(desde)} al ${fechaCorta(hasta)}`
}

// Lo más parecido a lo que se busca (como mucho 4), con su fecha.
function mejores<T extends { busqueda: string }>(que: string, cosas: T[], cuantasComoMucho = 4): T[] {
  return cosas
    .map((x) => ({ x, nota: parecido(que, x.busqueda) }))
    .filter((c) => c.nota >= 0.5)
    .sort((a, b) => b.nota - a.nota)
    .slice(0, cuantasComoMucho)
    .map((c) => c.x)
}

export async function responder(p: Pregunta, contexto: ContextoHogar): Promise<Respuesta> {
  const db = supabase
  if (!db) return { dibujo: '⚠️', titulo: 'Sin conexión', filas: [], vacio: 'Prueba otra vez en un momento.' }
  const hoy = hoyComoTexto()
  const yo = contexto.personas.find((x) => x.yo)

  switch (p.tipo) {
    case 'que_toca': {
      const { data } = await db
        .from('tareas')
        .select('id, titulo, fecha_limite, responsable_id')
        .eq('completada', false)
        .lte('fecha_limite', p.hasta)
        .order('fecha_limite')
        .limit(200)
      const { data: agenda } = await db.from('agenda_planes').select('fecha, hecho, plan_id').gte('fecha', p.desde).lte('fecha', p.hasta).eq('hecho', false)
      const { data: planes } = (agenda ?? []).length > 0 ? await db.from('planes').select('id, nombre') : { data: [] }
      // Desde hoy: también lo atrasado.
      const tareas = ((data ?? []) as Fila[]).filter((t) => (p.desde === hoy || String(t.fecha_limite) >= p.desde))
      const deQuien = tareas.filter((t) =>
        p.quien === 'todas' ? true : p.quien === 'yo' ? t.responsable_id === yo?.id || t.responsable_id === null : t.responsable_id === p.quien,
      )
      const quien = p.quien === 'yo' ? 'Te toca' : p.quien === 'todas' ? 'En casa toca' : `A ${nombreDe(contexto.personas, p.quien)} le toca`
      const filas: FilaRespuesta[] = [
        ...deQuien.map((t) => ({
          texto: String(t.titulo),
          detalle: `${cuandoToca(String(t.fecha_limite))}${p.quien !== 'yo' && t.responsable_id ? ` · ${nombreDe(contexto.personas, t.responsable_id)}` : ''}`,
          tareaId: String(t.id),
        })),
        ...((agenda ?? []) as Fila[]).map((e) => ({ texto: `🎉 ${nombreDe((planes ?? []) as { id: string; nombre: string }[], e.plan_id)}`, detalle: cuandoToca(String(e.fecha)) })),
      ]
      return {
        dibujo: '📋',
        titulo: `${quien} ${textoRango(p.desde, p.hasta, hoy)}: ${cuantas(filas.length)}`,
        filas,
        vacio: 'Nada pendiente. ¡A disfrutar! 🎉',
      }
    }

    case 'cuando': {
      const [tareas, vencimientos, documentos, fechas, agenda, planes] = await Promise.all([
        db.from('tareas').select('titulo, fecha_limite, mascota_id, planta_id').eq('completada', false).not('fecha_limite', 'is', null).limit(300),
        db.from('vencimientos').select('nombre, fecha_renovacion, frecuencia_meses'),
        db.from('documentos').select('titulo, caduca_el').not('caduca_el', 'is', null),
        db.from('fechas_especiales').select('*'),
        db.from('agenda_planes').select('fecha, plan_id').gte('fecha', hoy).eq('hecho', false),
        db.from('planes').select('id, nombre'),
      ])
      const opciones: { busqueda: string; texto: string; fecha: string }[] = [
        ...((tareas.data ?? []) as Fila[]).map((t) => {
          const extra = nombreDe(contexto.mascotas, t.mascota_id) || nombreDe(contexto.plantas, t.planta_id)
          return { busqueda: `${t.titulo} ${extra}`, texto: `${t.titulo}${extra ? ` (${extra})` : ''}`, fecha: String(t.fecha_limite) }
        }),
        ...((vencimientos.error ? [] : vencimientos.data ?? []) as Fila[]).map((v) => ({ busqueda: `${v.nombre} renovar renovacion`, texto: `Renovación: ${v.nombre}`, fecha: proximaRenovacion(String(v.fecha_renovacion), (v.frecuencia_meses as number | null) ?? null) })),
        ...((documentos.error ? [] : documentos.data ?? []) as Fila[]).map((d) => ({ busqueda: `${d.titulo} caduca caducidad`, texto: `Caduca: ${d.titulo}`, fecha: String(d.caduca_el) })),
        ...(fechas.error ? [] : proximasFechas((fechas.data ?? []) as FechaEspecial[], hoy)).map((f) => ({ busqueda: f.fecha.titulo, texto: `${TIPOS_FECHA[f.fecha.tipo].dibujo} ${f.fecha.titulo}`, fecha: f.cuando })),
        ...((agenda.error ? [] : agenda.data ?? []) as Fila[]).map((e) => {
          const nombre = nombreDe((planes.data ?? []) as { id: string; nombre: string }[], e.plan_id)
          return { busqueda: nombre, texto: `🎉 ${nombre}`, fecha: String(e.fecha) }
        }),
      ]
      const encontradas = mejores(p.que, opciones).sort((a, b) => a.fecha.localeCompare(b.fecha))
      return {
        dibujo: '📅',
        titulo: `¿Cuándo toca «${p.que}»?`,
        filas: encontradas.map((o) => ({ texto: o.texto, detalle: `${fechaCorta(o.fecha)} · ${cuandoToca(o.fecha)}` })),
        vacio: 'No encuentro nada pendiente que se parezca. Prueba con otras palabras.',
      }
    }

    case 'ultima_vez': {
      const [hechas, tratamientos, cuidados, rutinas, agenda, planes, miembros] = await Promise.all([
        db.from('tareas').select('titulo, completada_en, completada_por, mascota_id, planta_id').eq('completada', true).order('completada_en', { ascending: false }).limit(400),
        db.from('tratamientos').select('nombre, fecha_ultima, mascota_id'),
        db.from('cuidados').select('tipo, nombre, fecha_ultima, planta_id'),
        db.from('rutinas').select('nombre, fecha_ultima'),
        db.from('agenda_planes').select('fecha, plan_id').eq('hecho', true).order('fecha', { ascending: false }).limit(200),
        db.from('planes').select('id, nombre'),
        db.from('miembros').select('user_id, nombre_visible'),
      ])
      const porUsuario = (id: unknown) => ((miembros.data ?? []) as Fila[]).find((m) => m.user_id === id)?.nombre_visible as string | undefined
      const opciones: { busqueda: string; texto: string; fecha: string; quien?: string }[] = [
        ...((hechas.data ?? []) as Fila[]).map((t) => {
          const extra = nombreDe(contexto.mascotas, t.mascota_id) || nombreDe(contexto.plantas, t.planta_id)
          return { busqueda: `${t.titulo} ${extra}`, texto: `${t.titulo}${extra ? ` (${extra})` : ''}`, fecha: String(t.completada_en).slice(0, 10), quien: porUsuario(t.completada_por) }
        }),
        ...((tratamientos.data ?? []) as Fila[]).map((t) => ({ busqueda: `${t.nombre} ${nombreDe(contexto.mascotas, t.mascota_id)}`, texto: `${t.nombre} (${nombreDe(contexto.mascotas, t.mascota_id)})`, fecha: String(t.fecha_ultima) })),
        ...((cuidados.error ? [] : cuidados.data ?? []) as Fila[]).map((c) => ({ busqueda: `${c.tipo} ${c.tipo === 'riego' ? 'regar' : ''} ${sin(c.nombre) ?? ''} ${nombreDe(contexto.plantas, c.planta_id)}`, texto: `${String(c.tipo).charAt(0).toUpperCase()}${String(c.tipo).slice(1)}: ${nombreDe(contexto.plantas, c.planta_id)}`, fecha: String(c.fecha_ultima) })),
        ...((rutinas.data ?? []) as Fila[]).map((r) => ({ busqueda: String(r.nombre), texto: String(r.nombre), fecha: String(r.fecha_ultima) })),
        ...((agenda.error ? [] : agenda.data ?? []) as Fila[]).map((e) => {
          const nombre = nombreDe((planes.data ?? []) as { id: string; nombre: string }[], e.plan_id)
          return { busqueda: nombre, texto: `🎉 ${nombre}`, fecha: String(e.fecha) }
        }),
      ].filter((o) => o.fecha <= hoy)
      // De cada cosa, solo la más reciente.
      const unicas = new Map<string, (typeof opciones)[number]>()
      for (const o of mejores(p.que, opciones, 40)) {
        const ya = unicas.get(o.texto)
        if (!ya || ya.fecha < o.fecha) unicas.set(o.texto, o)
      }
      const filas = [...unicas.values()].slice(0, 4).map((o) => {
        const dias = -diasHasta(o.fecha)
        return { texto: o.texto, detalle: `${dias === 0 ? 'hoy' : dias === 1 ? 'ayer' : `hace ${dias} días`} (${fechaCorta(o.fecha)})${o.quien ? ` · lo hizo ${o.quien}` : ''}` }
      })
      return { dibujo: '🔎', titulo: `La última vez de «${p.que}»`, filas, vacio: 'No encuentro que se haya hecho. Prueba con otras palabras.' }
    }

    case 'gasto': {
      const { data } = await db.from('vencimientos').select('tipo, nombre, importe, frecuencia_meses').order('nombre')
      const lista = (data ?? []) as { tipo: string; nombre: string; importe: number | null; frecuencia_meses: number | null }[]
      const alMes = (v: (typeof lista)[number]) => (v.importe && v.frecuencia_meses ? v.importe / v.frecuencia_meses : 0)
      const suscripciones = lista.filter((v) => v.tipo === 'suscripcion').reduce((s, v) => s + alMes(v), 0)
      const seguros = lista.filter((v) => v.tipo === 'seguro').reduce((s, v) => s + alMes(v) * 12, 0)
      return {
        dibujo: '💶',
        titulo: `Suscripciones: ${euros(suscripciones)} al mes · Seguros: ${euros(seguros)} al año`,
        filas: lista.filter((v) => v.importe).map((v) => ({ texto: `${v.tipo === 'seguro' ? '📑' : '💳'} ${v.nombre}`, detalle: `${euros(v.importe!)} ${v.frecuencia_meses === 1 ? 'al mes' : v.frecuencia_meses === 12 ? 'al año' : v.frecuencia_meses ? `cada ${v.frecuencia_meses} meses` : 'una vez'}` })),
        vacio: 'No tenéis seguros ni suscripciones con importe.',
        enlace: { texto: 'Ver Vencimientos ›', ruta: '/vencimientos' },
      }
    }

    case 'compra': {
      const { data } = await db.from('lista_compra').select('nombre, cantidad').eq('comprado', false).order('nombre')
      const filas = ((data ?? []) as Fila[]).map((a) => ({ texto: String(a.nombre), detalle: sin(a.cantidad) ?? undefined }))
      return { dibujo: '🛒', titulo: `En la lista de la compra: ${cuantas(filas.length)}`, filas, vacio: 'La lista de la compra está vacía.', enlace: { texto: 'Abrir la compra ›', ruta: '/casa' } }
    }

    case 'planes': {
      const [agenda, planes] = await Promise.all([db.from('agenda_planes').select('fecha, plan_id').gte('fecha', hoy).eq('hecho', false).order('fecha').limit(6), db.from('planes').select('id, nombre')])
      const filas = ((agenda.data ?? []) as Fila[]).map((e) => ({ texto: `🎉 ${nombreDe((planes.data ?? []) as { id: string; nombre: string }[], e.plan_id)}`, detalle: `${fechaCorta(String(e.fecha))} · ${cuandoToca(String(e.fecha))}` }))
      return { dibujo: '🎲', titulo: 'Vuestros próximos planes', filas, vacio: 'No tenéis planes en el calendario.', enlace: { texto: '🎲 ¿Qué hacemos? (uno al azar) ›', ruta: '/planes' } }
    }

    case 'que_ver': {
      const { data } = await db.from('para_ver').select('titulo, tipo, plataformas').eq('visto', false)
      const lista = (data ?? []) as { titulo: string; tipo: string; plataformas: string[] | null }[]
      const mezcladas = [...lista].sort(() => Math.random() - 0.5).slice(0, 3)
      return {
        dibujo: '🍿',
        titulo: mezcladas.length ? `¿Qué tal «${mezcladas[0].titulo}»?` : '¿Qué vemos?',
        filas: mezcladas.map((v) => ({ texto: `${v.tipo === 'serie' ? '📺' : '🎬'} ${v.titulo}`, detalle: v.plataformas?.length ? v.plataformas.join(', ') : undefined })),
        vacio: 'Vuestra lista para ver está vacía.',
        enlace: { texto: '🍿 Abrir «Para ver» ›', ruta: '/ver' },
      }
    }

    case 'viajes': {
      const { data } = await db.from('viajes').select('grupo, miembro_id, desde, hasta, destino').gte('hasta', hoy).order('desde')
      const grupos = new Map<string, { quienes: string[]; desde: string; hasta: string; destino: string | null }>()
      for (const v of (data ?? []) as Fila[]) {
        const g = grupos.get(String(v.grupo)) ?? { quienes: [], desde: String(v.desde), hasta: String(v.hasta), destino: sin(v.destino) }
        g.quienes.push(nombreDe(contexto.personas, v.miembro_id))
        grupos.set(String(v.grupo), g)
      }
      const filas = [...grupos.values()].map((g) => ({ texto: `✈️ ${g.quienes.join(' y ')}${g.destino ? ` · ${g.destino}` : ''}`, detalle: `${g.desde <= hoy ? 'ahora, ' : ''}del ${fechaCorta(g.desde)} al ${fechaCorta(g.hasta)}` }))
      return { dibujo: '✈️', titulo: 'Viajes', filas, vacio: 'Nadie tiene un viaje apuntado.', enlace: { texto: 'Ver los viajes ›', ruta: '/viajes' } }
    }

    case 'fechas': {
      const { data, error } = await db.from('fechas_especiales').select('*')
      const filas = (error ? [] : proximasFechas((data ?? []) as FechaEspecial[], hoy))
        .slice(0, 5)
        .map((f) => ({ texto: `${TIPOS_FECHA[f.fecha.tipo].dibujo} ${f.fecha.titulo}`, detalle: `${fechaCorta(f.cuando)} · ${cuandoFalta(f.dias)}` }))
      return { dibujo: '🎂', titulo: 'Próximas fechas especiales', filas, vacio: 'No tenéis fechas especiales apuntadas.', enlace: { texto: '🎁 Abrir Regalos ›', ruta: '/regalos' } }
    }

    case 'peso': {
      const { data } = await db.from('pesos').select('mascota_id, fecha, kg').order('fecha', { ascending: false }).limit(100)
      const ultimos = new Map<string, Fila>()
      for (const x of (data ?? []) as Fila[]) if (!ultimos.has(String(x.mascota_id))) ultimos.set(String(x.mascota_id), x)
      const filas = [...ultimos.values()]
        .filter((x) => !p.mascota_id || x.mascota_id === p.mascota_id)
        .map((x) => ({ texto: `🐾 ${nombreDe(contexto.mascotas, x.mascota_id)}: ${String(x.kg).replace('.', ',')} kg`, detalle: `${fechaCorta(String(x.fecha))} · ${cuandoToca(String(x.fecha))}` }))
      return { dibujo: '⚖️', titulo: 'Último peso', filas, vacio: 'Aún no hay ningún peso apuntado.' }
    }
  }
}
