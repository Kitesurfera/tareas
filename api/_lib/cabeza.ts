// «🧠 Vaciar la cabeza» y el asistente del botón 🧠: lo que se le dice a la
// IA y la comprobación de lo que contesta. La IA solo PROPONE: la persona lo
// revisa y la app lo guarda (con las reglas de siempre de la base de datos).
//
// - Repartir la bandeja: cada nota → dónde va cada cosa.
// - Asistente: lo que dices → acciones (crear o cambiar algo) y preguntas.
//   Las preguntas NO las contesta la IA: solo dice qué se pregunta («qué me
//   toca hoy») y la respuesta la busca la app con los datos del hogar. A la
//   IA solo le llega tu texto y los nombres de la gente, las mascotas, las
//   plantas y las categorías de planes (nunca tareas, notas ni documentos).
//   Para «ya he llamado al fontanero», la IA solo dice «Llamar al fontanero»:
//   es la app la que busca esa tarea entre las vuestras.
// OJO: se ejecuta en el SERVIDOR (funciones de Vercel), nunca en el móvil.
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolverCuando, resolverPasado } from './cuando.js'
import { respuestaDeError } from './ia.js'
import { CATEGORIAS, type Categoria } from './tareaNatural.js'

export type Contexto = {
  personas: { id: string; nombre: string; yo: boolean }[]
  mascotas: { id: string; nombre: string }[]
  plantas: { id: string; nombre: string }[]
  gente: { id: string; nombre: string }[] // personas de fuera (Regalos)
  categoriasPlan: { id: string; nombre: string }[]
}

export type Nota = { id: string; texto: string }

export const TIPOS_CUIDADO = ['riego', 'abono', 'trasplante', 'poda', 'otro'] as const
export const TIPOS_FECHA = ['cumpleanos', 'aniversario', 'otra'] as const
export const TIPOS_TRATAMIENTO = ['vacuna', 'desparasitacion_interna', 'desparasitacion_externa', 'medicacion', 'revision'] as const
export const TIPOS_DOCUMENTO = ['identidad', 'seguro', 'coche', 'casa', 'salud', 'mascota', 'garantia', 'otros'] as const

export type Propuesta = { nota: string } & (
  | {
      destino: 'tarea'
      titulo: string
      fecha: string | null
      categoria: Categoria
      responsable_id: string | null
      mascota_id: string | null
      detalles: string | null
    }
  | { destino: 'compra'; nombre: string; cantidad: string | null }
  | { destino: 'plan'; nombre: string; categoria_id: string | null }
  | { destino: 'pelicula' | 'serie'; titulo: string }
  | { destino: 'deseo'; titulo: string }
  | { destino: 'idea_regalo'; titulo: string; miembro_id: string | null; persona_id: string | null }
  | { destino: 'fecha'; titulo: string; tipo: (typeof TIPOS_FECHA)[number]; dia: number; mes: number; anio: number | null; miembro_id: string | null; persona_id: string | null }
  | { destino: 'peso'; mascota_id: string; kg: number }
  | { destino: 'cuidado_hecho'; planta_id: string; tipo: (typeof TIPOS_CUIDADO)[number] }
  // --- Crear en el resto de pestañas
  | { destino: 'rutina'; nombre: string; frecuencia_dias: number; fecha_ultima: string; responsable_id: string | null; turnos: boolean }
  | { destino: 'tratamiento'; mascota_id: string | null; tipo: (typeof TIPOS_TRATAMIENTO)[number]; nombre: string; frecuencia_dias: number; fecha_ultima: string }
  | { destino: 'planta'; nombre: string; ubicacion: string | null; riego_dias: number | null }
  | { destino: 'cuidado'; planta_id: string | null; tipo: (typeof TIPOS_CUIDADO)[number]; frecuencia_dias: number; fecha_ultima: string; responsable_id: string | null }
  | { destino: 'vencimiento'; tipo: 'seguro' | 'suscripcion'; nombre: string; fecha_renovacion: string | null; frecuencia_meses: number | null; importe: number | null; aviso_dias: number | null }
  | { destino: 'documento'; titulo: string; tipo: (typeof TIPOS_DOCUMENTO)[number]; caduca_el: string | null; persona_id: string | null }
  | { destino: 'viaje'; personas: string[]; ida: string | null; vuelta: string | null; lugar: string | null }
  | { destino: 'programar'; plan: string; fecha: string | null }
  | { destino: 'plantilla'; que: string; fecha: string | null }
  // --- Cambiar lo que ya existe (la app busca a qué se refiere)
  | { destino: 'hecho'; que: string }
  | { destino: 'mover'; que: string; fecha: string | null }
  | { destino: 'ayuda'; que: string | null; para_id: string | null }
  | { destino: 'comprado'; que: string }
  | { destino: 'pausa'; hasta: string | null }
  | { destino: 'sin_clasificar'; texto: string }
)

// Las preguntas que sabe contestar la app (la respuesta la busca la app).
export type Pregunta =
  | { tipo: 'que_toca'; quien: string; desde: string; hasta: string }
  | { tipo: 'cuando' | 'ultima_vez'; que: string }
  | { tipo: 'gasto' | 'compra' | 'planes' | 'que_ver' | 'viajes' | 'fechas' }
  | { tipo: 'peso'; mascota_id: string | null }

// Sin saltos de línea ni comillas: un nombre no puede «colar» instrucciones.
const limpiar = (texto: string) => texto.replace(/[\r\n"«»<>{}[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40)

const normalizar = (texto: string) =>
  texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

const lista = (cosas: { nombre: string }[]) => cosas.map((c) => limpiar(c.nombre)).join(', ') || '(ninguna)'

function quienEres(hoy: string, c: Contexto): string {
  const yo = c.personas.find((p) => p.yo)
  return `Hoy es ${hoy}. Quien escribe es ${yo ? limpiar(yo.nombre) : 'una persona del hogar'}.
Personas del hogar: ${lista(c.personas)}.
Mascotas: ${lista(c.mascotas)}.
Plantas: ${lista(c.plantas)}.
Gente de fuera a la que regalan: ${lista(c.gente)}.
Categorías de planes: ${lista(c.categoriasPlan)}.`
}

// Todo lo que se puede hacer (igual para la bandeja y para el asistente).
const DESTINOS = `- "tarea" (algo que hay que hacer una vez): «titulo» (empieza por un verbo en infinitivo, sin la fecha ni quién), «cuando» (las palabras exactas de la fecha, o null), «categoria» (casa, mascota, plantas, coche, papeleo u otros), «responsable» (nombre de una persona del hogar, «yo» o null), «mascota» (nombre o null), «detalles» (o null).
- "compra" (algo que comprar en la compra de casa; una cosa por objeto): «nombre», «cantidad» (o null).
- "plan" (una idea de algo que hacer juntas por gusto, sin día: una exposición, una excursión, un restaurante): «nombre», «categoria» (una de las categorías de planes o null).
- "programar" (poner un plan en el calendario un día concreto: «el sábado vamos al museo»): «plan» (nombre del plan), «cuando».
- "pelicula" o "serie" (algo que ver): «titulo».
- "deseo" (algo que le gustaría que le regalaran a quien escribe): «titulo».
- "idea_regalo" (una idea para regalar a otra persona): «titulo», «para» (nombre de alguien del hogar o de la gente de fuera).
- "fecha" (un cumpleaños, aniversario u otra fecha que se repite cada año): «titulo» («Cumpleaños de Lucía»), «tipo» (cumpleanos, aniversario u otra), «dia», «mes» (números), «anio» (año en que nació o empezó, o null), «de» (nombre o null).
- "rutina" (una tarea de casa que se repite siempre, como sacar la basura o cambiar las sábanas): «nombre», «cada» (cada cuántos días, un número: 7 = cada semana, 14 = cada dos semanas, 30 = cada mes), «responsable» (nombre, «yo» o null), «turnos» (true si se van turnando), «empieza» (palabras de cuándo toca la primera vez, o null).
- "tratamiento" (vacuna, desparasitación, medicación o revisión de una mascota que se repite): «mascota», «tipo» (vacuna, desparasitacion_interna, desparasitacion_externa, medicacion o revision), «nombre» («Rabia», «Pipeta»), «cada» (días: 365 = cada año, 90 = cada 3 meses, 30 = cada mes), «ultima» (palabras de cuándo fue la última vez, o null), «proxima» (palabras de cuándo toca la siguiente, o null).
- "peso" (cuánto pesa una mascota hoy): «mascota», «kg» (número).
- "planta" (una planta nueva en casa): «nombre», «ubicacion» (o null), «riego» (cada cuántos días se riega, o null).
- "cuidado" (un cuidado que se repite de una planta que ya tienen: regarla cada X días, abonarla…): «planta», «tipo» (riego, abono, trasplante, poda u otro), «cada» (días), «responsable» (o null).
- "cuidado_hecho" (ya ha regado, abonado… una planta): «planta», «tipo» (riego, abono, trasplante, poda u otro).
- "vencimiento" (un seguro o una suscripción que se renueva): «tipo» (seguro o suscripcion), «nombre», «renovacion» (palabras de cuándo se renueva, o null), «cada_meses» (1 = cada mes, 12 = cada año, o null), «importe» (número en euros, o null), «aviso» (cuántos días antes avisar, o null).
- "documento" (un documento que caduca: DNI, pasaporte, carné, ITV, garantía…): «titulo», «tipo» (identidad, seguro, coche, casa, salud, mascota, garantia u otros), «caduca» (palabras de la fecha en que caduca, o null), «de» (nombre de alguien del hogar o null).
- "viaje" (alguien de casa se va fuera unos días): «quienes» (lista de nombres, «yo» o «todas»), «ida», «vuelta» (palabras de las fechas), «lugar» (o null).
- "plantilla" (organizar algo grande que tiene muchas cosas que preparar: una mudanza, un viaje, una fiesta, Navidad, una barbacoa, una boda…): «que» (qué es, en una o dos palabras: «mudanza», «barbacoa»), «cuando».
- "hecho" (algo pendiente que YA ha hecho: «ya he llamado al fontanero», «le he dado la pastilla a Luna»): «que» (la tarea dicha como estaría apuntada, en infinitivo: «Llamar al fontanero»).
- "mover" (cambiar el día de algo pendiente): «que» (la tarea, en infinitivo), «cuando» (el día nuevo).
- "ayuda" (pedir a otra persona de casa que haga sus tareas porque no puede: «hoy no puedo, que lo haga Bea»): «que» (qué tarea, en infinitivo, o null si es todo lo de hoy), «para» (nombre).
- "comprado" (ya ha comprado algo de la lista de la compra; una cosa por objeto): «que».
- "pausa" (no quiere avisos en el móvil unos días): «hasta» (palabras de la fecha), o «quitar»: true para volver a tener avisos.`

export function instrucciones(hoy: string, c: Contexto): string {
  return `Ayudas a una persona a «vaciar la cabeza»: te pasa notas rápidas que apuntó en su bandeja y tú propones dónde va cada cosa en la app de su hogar. Ella lo revisará todo antes de guardar: es mejor dejar un dato vacío que inventarlo. No añadas cosas que no estén en las notas.

${quienEres(hoy, c)}

Cada nota puede tener una cosa o varias («pilas y leche» son dos cosas de la compra). Para cada cosa, un objeto con «nota» (el número de la nota) y «destino», más sus datos:
${DESTINOS}
- "otro" (si no encaja en nada): «texto».

Contesta SOLO con un objeto JSON, sin texto antes ni después y sin \`\`\`:
{"cosas": [{"nota": 1, "destino": "compra", "nombre": "Pilas", "cantidad": null}]}`
}

export function instruccionesAsistente(hoy: string, c: Contexto): string {
  return `Eres el asistente de una app para organizar un hogar (tareas, casa, mascota, plantas, planes, regalos, seguros y documentos). La persona te dice algo escrito o dictado y tú lo conviertes en ACCIONES (crear o cambiar algo en la app) y PREGUNTAS (lo que quiere saber). Ella lo revisará todo antes de guardar: es mejor dejar un dato vacío que inventarlo. No añadas cosas que no haya dicho. Tú no conoces sus tareas ni sus datos: nunca contestes tú las preguntas.

${quienEres(hoy, c)}

Acciones: una lista «cosas», cada una con «destino» y sus datos:
${DESTINOS}

Preguntas: una lista «preguntas», cada una con «tipo»:
- "que_toca" (qué hay que hacer): «quien» («yo», un nombre o «todas»), «cuando» (palabras: «hoy», «mañana», «esta semana», «el viernes»… o null).
- "cuando" (cuándo toca o caduca algo): «que» («la vacuna de Luna», «el seguro del coche»).
- "ultima_vez" (cuándo se hizo algo por última vez): «que».
- "gasto" (cuánto pagan de seguros y suscripciones).
- "compra" (qué hay en la lista de la compra).
- "planes" (qué planes tienen o qué podrían hacer).
- "que_ver" (qué película o serie ver).
- "viajes" (quién está o estará de viaje).
- "fechas" (próximos cumpleaños y fechas especiales).
- "peso" (cuánto pesa la mascota): «mascota» (o null).

Contesta SOLO con un objeto JSON, sin texto antes ni después y sin \`\`\`:
{"cosas": [{"destino": "compra", "nombre": "Leche", "cantidad": null}], "preguntas": [{"tipo": "que_toca", "quien": "yo", "cuando": "hoy"}]}`
}

// ---------------------------------------------------------------------
// Comprobar lo que contesta la IA
// ---------------------------------------------------------------------

type Objeto = Record<string, unknown>
const esObjeto = (x: unknown): x is Objeto => Boolean(x) && typeof x === 'object' && !Array.isArray(x)

function texto(valor: unknown, maximo: number): string | null {
  if (typeof valor !== 'string' && typeof valor !== 'number') return null
  const limpio = String(valor).replace(/\s+/g, ' ').trim().slice(0, maximo)
  if (/^(null|none|ninguna?|nadie|-)$/i.test(limpio)) return null
  return limpio || null
}

const conMayuscula = (frase: string) => frase.charAt(0).toUpperCase() + frase.slice(1)

function buscar<T extends { nombre: string }>(cosas: T[], nombre: unknown): T | undefined {
  const t = texto(nombre, 60)
  if (!t) return undefined
  const buscado = normalizar(t)
  return cosas.find((x) => normalizar(x.nombre) === buscado) ?? cosas.find((x) => normalizar(x.nombre).split(' ')[0] === buscado.split(' ')[0])
}

function entero(valor: unknown, desde: number, hasta: number): number | null {
  const n = typeof valor === 'string' ? Number(valor) : valor
  return typeof n === 'number' && Number.isInteger(n) && n >= desde && n <= hasta ? n : null
}

function numero(valor: unknown, desde: number, hasta: number): number | null {
  const n = typeof valor === 'number' ? valor : Number(String(valor ?? '').replace(',', '.').replace(/[€\s]/g, ''))
  return Number.isFinite(n) && n >= desde && n <= hasta && String(valor ?? '').trim() !== '' ? n : null
}

const diasDelMes = (mes: number) => (mes === 2 ? 29 : [4, 6, 9, 11].includes(mes) ? 30 : 31)

// «yo», «mi», un nombre del hogar, o nadie.
function persona(c: Contexto, valor: unknown) {
  const quien = texto(valor, 60)
  if (!quien) return undefined
  if (['yo', 'mi', 'me'].includes(normalizar(quien))) return c.personas.find((p) => p.yo)
  return buscar(c.personas, quien)
}

function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

// La última vez de algo que se repite: la dicha («la última fue en marzo»),
// o la siguiente menos la frecuencia («toca el viernes»), u hoy.
function ultimaVez(x: Objeto, frecuencia: number, hoy: string, campoUltima: string, campoProxima: string, hastaHoy: boolean): string {
  const ultima = resolverPasado(texto(x[campoUltima], 60), hoy)
  if (ultima) return ultima
  const proxima = resolverCuando(texto(x[campoProxima], 60), hoy)
  if (proxima) {
    const calculada = sumarDias(proxima, -frecuencia)
    return hastaHoy && calculada > hoy ? hoy : calculada
  }
  return hoy
}

const verdad = (v: unknown) => v === true || (typeof v === 'string' && ['true', 'si', 'sí'].includes(normalizar(v)))

// Una cosa de la IA → una propuesta que se puede guardar. Lo que no tiene
// sentido se descarta (null); si una nota se queda sin ninguna, sale
// «sin clasificar» con su texto (ver validarReparto).
function propuesta(x: Objeto, nota: Nota, hoy: string, c: Contexto): Propuesta | null {
  const destino = typeof x.destino === 'string' ? normalizar(x.destino).replace(/ /g, '_') : ''
  const sin = (): null => null
  const yo = c.personas.find((p) => p.yo)
  const n = nota.id

  switch (destino) {
    case 'tarea': {
      const titulo = texto(x.titulo, 120)
      if (!titulo) return sin()
      const cuando = texto(x.cuando, 60)
      let categoria: Categoria = CATEGORIAS.find((k) => k === normalizar(String(x.categoria ?? ''))) ?? 'otros'
      const mascota = buscar(c.mascotas, x.mascota)
      if (mascota) categoria = 'mascota'
      return {
        nota: n,
        destino: 'tarea',
        titulo: conMayuscula(titulo),
        fecha: resolverCuando(cuando, hoy),
        categoria,
        responsable_id: persona(c, x.responsable)?.id ?? null,
        mascota_id: mascota?.id ?? null,
        detalles: texto(x.detalles, 500),
      }
    }
    case 'compra': {
      const nombre = texto(x.nombre, 80)
      return nombre ? { nota: n, destino: 'compra', nombre: conMayuscula(nombre), cantidad: texto(x.cantidad, 30) } : sin()
    }
    case 'plan': {
      const nombre = texto(x.nombre, 80)
      return nombre ? { nota: n, destino: 'plan', nombre: conMayuscula(nombre), categoria_id: buscar(c.categoriasPlan, x.categoria)?.id ?? null } : sin()
    }
    case 'pelicula':
    case 'serie': {
      const titulo = texto(x.titulo, 120)
      return titulo ? { nota: n, destino, titulo } : sin()
    }
    case 'deseo': {
      const titulo = texto(x.titulo, 120)
      return titulo ? { nota: n, destino: 'deseo', titulo: conMayuscula(titulo) } : sin()
    }
    case 'idea_regalo': {
      const titulo = texto(x.titulo, 120)
      if (!titulo) return sin()
      const para = texto(x.para, 60)
      // Una «idea para mí» es un deseo de tu lista.
      if (para && ['yo', 'mi'].includes(normalizar(para))) return { nota: n, destino: 'deseo', titulo: conMayuscula(titulo) }
      const miembro = buscar(c.personas, para)
      if (miembro?.yo) return { nota: n, destino: 'deseo', titulo: conMayuscula(titulo) }
      const fuera = miembro ? undefined : buscar(c.gente, para)
      return { nota: n, destino: 'idea_regalo', titulo: conMayuscula(titulo), miembro_id: miembro?.id ?? null, persona_id: fuera?.id ?? null }
    }
    case 'fecha': {
      const titulo = texto(x.titulo, 80)
      const mes = entero(x.mes, 1, 12)
      const dia = mes ? entero(x.dia, 1, diasDelMes(mes)) : null
      if (!titulo || !mes || !dia) return sin()
      const tipo = TIPOS_FECHA.find((t) => t === normalizar(String(x.tipo ?? '')).replace('ñ', 'n')) ?? 'otra'
      const de = texto(x.de, 60)
      const miembro = buscar(c.personas, de)
      const fuera = miembro ? undefined : buscar(c.gente, de)
      return {
        nota: n,
        destino: 'fecha',
        titulo: conMayuscula(titulo),
        tipo,
        dia,
        mes,
        anio: entero(x.anio, 1900, Number(hoy.slice(0, 4))),
        miembro_id: miembro?.id ?? null,
        persona_id: fuera?.id ?? null,
      }
    }
    case 'peso': {
      const mascota = buscar(c.mascotas, x.mascota) ?? (c.mascotas.length === 1 ? c.mascotas[0] : undefined)
      const kg = typeof x.kg === 'number' ? x.kg : Number(String(x.kg ?? '').replace(',', '.'))
      if (!mascota || !Number.isFinite(kg) || kg <= 0 || kg >= 500) return sin()
      return { nota: n, destino: 'peso', mascota_id: mascota.id, kg: Math.round(kg * 1000) / 1000 }
    }
    case 'cuidado_hecho': {
      const planta = buscar(c.plantas, x.planta) ?? (c.plantas.length === 1 ? c.plantas[0] : undefined)
      if (!planta) return sin()
      const tipo = TIPOS_CUIDADO.find((t) => t === normalizar(String(x.tipo ?? ''))) ?? 'riego'
      return { nota: n, destino: 'cuidado_hecho', planta_id: planta.id, tipo }
    }
    case 'rutina': {
      const nombre = texto(x.nombre, 80)
      const dias = numero(x.cada, 1, 3650)
      const cada = dias ? Math.round(dias) : null
      if (!nombre || !cada) return sin()
      // La primera vez toca «empieza» (o dentro de «cada» días).
      const empieza = resolverCuando(texto(x.empieza, 60), hoy)
      return {
        nota: n,
        destino: 'rutina',
        nombre: conMayuscula(nombre),
        frecuencia_dias: cada,
        fecha_ultima: empieza ? sumarDias(empieza, -cada) : hoy,
        responsable_id: persona(c, x.responsable)?.id ?? null,
        turnos: verdad(x.turnos),
      }
    }
    case 'tratamiento': {
      const tipo = TIPOS_TRATAMIENTO.find((t) => t === normalizar(String(x.tipo ?? '')).replace(/ /g, '_')) ?? (/vacun/.test(normalizar(String(x.tipo ?? ''))) ? 'vacuna' : 'medicacion')
      const nombre = texto(x.nombre, 80)
      const cada = numero(x.cada, 1, 3650)
      if (!nombre || !cada) return sin()
      const frecuencia = Math.round(cada)
      const mascota = buscar(c.mascotas, x.mascota) ?? (c.mascotas.length === 1 ? c.mascotas[0] : undefined)
      return { nota: n, destino: 'tratamiento', mascota_id: mascota?.id ?? null, tipo, nombre: conMayuscula(nombre), frecuencia_dias: frecuencia, fecha_ultima: ultimaVez(x, frecuencia, hoy, 'ultima', 'proxima', true) }
    }
    case 'planta': {
      const nombre = texto(x.nombre, 60)
      if (!nombre) return sin()
      const riego = numero(x.riego, 1, 365)
      return { nota: n, destino: 'planta', nombre: conMayuscula(nombre), ubicacion: texto(x.ubicacion, 40), riego_dias: riego ? Math.round(riego) : null }
    }
    case 'cuidado': {
      const cada = numero(x.cada, 1, 3650)
      if (!cada) return sin()
      const planta = buscar(c.plantas, x.planta) ?? (c.plantas.length === 1 ? c.plantas[0] : undefined)
      const tipo = TIPOS_CUIDADO.find((t) => t === normalizar(String(x.tipo ?? ''))) ?? 'riego'
      return { nota: n, destino: 'cuidado', planta_id: planta?.id ?? null, tipo, frecuencia_dias: Math.round(cada), fecha_ultima: ultimaVez(x, Math.round(cada), hoy, 'ultima', 'proxima', true), responsable_id: persona(c, x.responsable)?.id ?? null }
    }
    case 'vencimiento': {
      const nombre = texto(x.nombre, 80)
      if (!nombre) return sin()
      const tipo = normalizar(String(x.tipo ?? '')).startsWith('seguro') ? 'seguro' : 'suscripcion'
      const cadaMeses = numero(x.cada_meses, 1, 120)
      const meses = cadaMeses ? Math.round(cadaMeses) : null
      const importe = numero(x.importe, 0, 100000)
      const aviso = numero(x.aviso, 0, 365)
      // Como el formulario: los seguros avisan un mes antes; las mensuales, nunca; el resto, una semana.
      const avisoHabitual = tipo === 'seguro' ? 30 : meses === 1 ? null : 7
      return {
        nota: n,
        destino: 'vencimiento',
        tipo,
        nombre: conMayuscula(nombre),
        fecha_renovacion: resolverCuando(texto(x.renovacion, 60), hoy),
        frecuencia_meses: meses,
        importe: importe === null ? null : Math.round(importe * 100) / 100,
        aviso_dias: aviso === null ? avisoHabitual : Math.round(aviso),
      }
    }
    case 'documento': {
      const titulo = texto(x.titulo, 80)
      if (!titulo) return sin()
      const tipo = TIPOS_DOCUMENTO.find((t) => t === normalizar(String(x.tipo ?? ''))) ?? 'otros'
      return { nota: n, destino: 'documento', titulo: conMayuscula(titulo), tipo, caduca_el: resolverCuando(texto(x.caduca, 60), hoy), persona_id: persona(c, x.de)?.id ?? null }
    }
    case 'viaje': {
      const lista = Array.isArray(x.quienes) ? x.quienes : x.quienes ? [x.quienes] : ['yo']
      const ids = new Set<string>()
      for (const q of lista.slice(0, 20)) {
        const t = normalizar(String(q ?? ''))
        if (['todas', 'todos', 'todo el mundo', 'nosotras', 'nosotros'].includes(t)) c.personas.forEach((p) => ids.add(p.id))
        else {
          const p = persona(c, q)
          if (p) ids.add(p.id)
        }
      }
      if (ids.size === 0 && yo) ids.add(yo.id)
      const ida = resolverCuando(texto(x.ida, 60), hoy)
      let vuelta = resolverCuando(texto(x.vuelta, 60), hoy)
      if (ida && vuelta && vuelta < ida) vuelta = null
      return { nota: n, destino: 'viaje', personas: [...ids], ida, vuelta, lugar: texto(x.lugar, 80) }
    }
    case 'programar': {
      const plan = texto(x.plan, 80)
      return plan ? { nota: n, destino: 'programar', plan: conMayuscula(plan), fecha: resolverCuando(texto(x.cuando, 60), hoy) } : sin()
    }
    case 'plantilla': {
      const que = texto(x.que, 60)
      return que ? { nota: n, destino: 'plantilla', que, fecha: resolverCuando(texto(x.cuando, 60), hoy) } : sin()
    }
    case 'hecho': {
      const que = texto(x.que, 120)
      return que ? { nota: n, destino: 'hecho', que } : sin()
    }
    case 'mover': {
      const que = texto(x.que, 120)
      return que ? { nota: n, destino: 'mover', que, fecha: resolverCuando(texto(x.cuando, 60), hoy) } : sin()
    }
    case 'ayuda': {
      const para = persona(c, x.para)
      return { nota: n, destino: 'ayuda', que: texto(x.que, 120), para_id: para && !para.yo ? para.id : null }
    }
    case 'comprado': {
      const que = texto(x.que, 80)
      return que ? { nota: n, destino: 'comprado', que } : sin()
    }
    case 'pausa': {
      if (verdad(x.quitar)) return { nota: n, destino: 'pausa', hasta: null }
      const palabras = texto(x.hasta, 60)
      const fecha = resolverCuando(palabras, hoy)
      if (!fecha) return sin()
      // «hasta el lunes» = el lunes ya vuelven: sin avisos hasta el domingo.
      const hasta = palabras && /^hasta\b/i.test(palabras) && fecha > hoy ? sumarDias(fecha, -1) : fecha
      return { nota: n, destino: 'pausa', hasta }
    }
    case 'otro':
      return { nota: n, destino: 'sin_clasificar', texto: texto(x.texto, 500) ?? nota.texto }
    default:
      return sin()
  }
}

// Todas las propuestas, en el orden de las notas. Las notas de las que la
// IA no dice nada salen «sin clasificar» (para que no se pierda ninguna).
export function validarReparto(datos: unknown, notas: Nota[], hoy: string, c: Contexto): Propuesta[] {
  const cosas = esObjeto(datos) && Array.isArray(datos.cosas) ? datos.cosas : Array.isArray(datos) ? datos : []
  const propuestas: Propuesta[] = []
  for (const x of cosas.slice(0, 100)) {
    if (!esObjeto(x)) continue
    const numeroNota = entero(x.nota, 1, notas.length)
    if (!numeroNota) continue
    const p = propuesta(x, notas[numeroNota - 1], hoy, c)
    if (p) propuestas.push(p)
  }
  for (const nota of notas) {
    if (!propuestas.some((p) => p.nota === nota.id)) propuestas.push({ nota: nota.id, destino: 'sin_clasificar', texto: nota.texto })
  }
  const orden = new Map(notas.map((n, i) => [n.id, i]))
  return propuestas.sort((a, b) => (orden.get(a.nota) ?? 0) - (orden.get(b.nota) ?? 0))
}

// ---------------------------------------------------------------------
// El asistente: acciones y preguntas de un solo mensaje
// ---------------------------------------------------------------------

const domingoDe = (fecha: string) => sumarDias(fecha, (7 - new Date(`${fecha}T00:00:00Z`).getUTCDay()) % 7)

// «hoy», «mañana», «esta semana», «la semana que viene», «el finde», «el viernes»…
function rango(cuando: string | null, hoy: string): { desde: string; hasta: string } {
  const t = ` ${normalizar(cuando ?? '')} `
  if (!cuando || / hoy /.test(t)) return { desde: hoy, hasta: hoy }
  if (/ (semana que viene|proxima semana|semana proxima) /.test(t)) {
    const lunes = resolverCuando('la semana que viene', hoy) ?? hoy
    return { desde: lunes, hasta: sumarDias(lunes, 6) }
  }
  // (Antes que «semana»: «el fin de semana» también lleva esa palabra.)
  if (/ (fin de semana|finde) /.test(t)) {
    const sabado = resolverCuando(cuando, hoy) ?? hoy
    return { desde: sabado, hasta: domingoDe(sabado) }
  }
  if (/ (esta semana|semana) /.test(t)) return { desde: hoy, hasta: domingoDe(hoy) }
  if (/ (este mes|mes) /.test(t)) return { desde: hoy, hasta: resolverCuando('este mes', hoy) ?? hoy }
  const dia = resolverCuando(cuando, hoy)
  return dia ? { desde: dia, hasta: dia } : { desde: hoy, hasta: hoy }
}

function pregunta(x: Objeto, hoy: string, c: Contexto): Pregunta | null {
  const tipo = typeof x.tipo === 'string' ? normalizar(x.tipo).replace(/ /g, '_') : ''
  switch (tipo) {
    case 'que_toca': {
      const q = texto(x.quien, 60)
      const quien = !q || ['yo', 'mi', 'me'].includes(normalizar(q)) ? 'yo' : ['todas', 'todos', 'nosotras', 'nosotros', 'casa'].includes(normalizar(q)) ? 'todas' : (buscar(c.personas, q)?.id ?? 'yo')
      return { tipo: 'que_toca', quien, ...rango(texto(x.cuando, 60), hoy) }
    }
    case 'cuando':
    case 'ultima_vez': {
      const que = texto(x.que, 120)
      return que ? { tipo, que } : null
    }
    case 'gasto':
    case 'compra':
    case 'planes':
    case 'que_ver':
    case 'viajes':
    case 'fechas':
      return { tipo }
    case 'peso': {
      const mascota = buscar(c.mascotas, x.mascota)
      return { tipo: 'peso', mascota_id: mascota?.id ?? null }
    }
    default:
      return null
  }
}

export function validarAsistente(datos: unknown, dicho: string, hoy: string, c: Contexto): { acciones: Propuesta[]; preguntas: Pregunta[] } {
  const nota: Nota = { id: 'dicho', texto: dicho }
  const o = esObjeto(datos) ? datos : {}
  const cosas = Array.isArray(o.cosas) ? o.cosas : []
  const acciones: Propuesta[] = []
  for (const x of cosas.slice(0, 30)) {
    if (!esObjeto(x)) continue
    const p = propuesta(x, nota, hoy, c)
    if (p && p.destino !== 'sin_clasificar') acciones.push(p)
  }
  const preguntas: Pregunta[] = []
  for (const x of (Array.isArray(o.preguntas) ? o.preguntas : []).slice(0, 5)) {
    if (!esObjeto(x)) continue
    const p = pregunta(x, hoy, c)
    // Sin repetir la misma pregunta.
    if (p && !preguntas.some((q) => JSON.stringify(q) === JSON.stringify(p))) preguntas.push(p)
  }
  return { acciones, preguntas }
}


// ---------------------------------------------------------------------
// Lo que manda la app: la gente, las mascotas, las plantas… del hogar
// (solo ids y nombres). null = algo no es válido.
// ---------------------------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const esUuid = (x: unknown): x is string => typeof x === 'string' && UUID.test(x)

function listaDe<T>(valor: unknown, maximo: number, convertir: (x: Record<string, unknown>) => T | null): T[] | null {
  if (valor === undefined) return []
  if (!Array.isArray(valor) || valor.length > maximo) return null
  const resultado: T[] = []
  for (const item of valor) {
    const convertido = item && typeof item === 'object' ? convertir(item as Record<string, unknown>) : null
    if (!convertido) return null
    resultado.push(convertido)
  }
  return resultado
}

const idYNombre = (x: Record<string, unknown>) =>
  esUuid(x.id) && typeof x.nombre === 'string' && x.nombre.trim() && x.nombre.length <= 80 ? { id: x.id, nombre: x.nombre.trim() } : null

export function leerContexto(valor: unknown): Contexto | null {
  const c = (valor ?? {}) as Record<string, unknown>
  const personas = listaDe(c.personas, 20, (x) => {
    const base = idYNombre(x)
    return base ? { ...base, yo: x.yo === true } : null
  })
  const contexto = {
    personas,
    mascotas: listaDe(c.mascotas, 30, idYNombre),
    plantas: listaDe(c.plantas, 60, idYNombre),
    gente: listaDe(c.gente, 100, idYNombre),
    categoriasPlan: listaDe(c.categoriasPlan, 60, idYNombre),
  }
  return Object.values(contexto).some((v) => v === null) ? null : (contexto as Contexto)
}

// Las notas, numeradas, para mandárselas a la IA (cada una en una línea).
export const notasNumeradas = (notas: Nota[]) => notas.map((n, i) => `${i + 1}. ${n.texto.replace(/\s+/g, ' ').trim()}`).join('\n')

// El límite al día por hogar (repartir y el asistente cuentan juntos, como
// «cabeza»). Se apunta ANTES de llamar a la IA; sin poder apuntarlo, no se
// llama. Devuelve la respuesta de error, o null si se puede seguir.
export async function apuntarUsoCabeza(supabase: SupabaseClient, hogarId: string, userId: string, maximo: number): Promise<Response | null> {
  const haceUnDia = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count, error: errorCuenta } = await supabase
    .from('usos_ia')
    .select('id', { count: 'exact', head: true })
    .eq('hogar_id', hogarId)
    .eq('tipo', 'cabeza')
    .gte('creado_en', haceUnDia)
  if (errorCuenta) {
    console.error('Cabeza: no se pudo contar los usos', errorCuenta.code)
    return respuestaDeError('No se ha podido comprobar el límite de usos.', 500)
  }
  if ((count ?? 0) >= maximo) {
    return respuestaDeError(`Ya habéis usado la IA de la cabeza ${maximo} veces en las últimas 24 horas (entre el asistente y repartir). Hazlo a mano o prueba mañana.`, 429)
  }
  const { error: errorApunte } = await supabase.from('usos_ia').insert({ hogar_id: hogarId, user_id: userId, tipo: 'cabeza' })
  if (errorApunte) {
    console.error('Cabeza: no se pudo apuntar el uso', errorApunte.code)
    return respuestaDeError(
      errorApunte.code === '23514' || errorApunte.code === '42P01' || errorApunte.code === 'PGRST205'
        ? 'Falta ejecutar en Supabase el SQL de la bandeja (20261127100000_bandeja.sql).'
        : 'No se ha podido apuntar el uso. Prueba otra vez.',
      500,
    )
  }
  return null
}
