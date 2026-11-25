// «🧠 Vaciar la cabeza»: lo que se le dice a la IA para repartir lo que
// soltaste en tu bandeja, y la comprobación de lo que contesta. La IA solo
// PROPONE: la persona lo revisa y la app lo guarda (con las reglas de
// siempre de la base de datos).
// OJO: se ejecuta en el SERVIDOR (funciones de Vercel), nunca en el móvil.
import { resolverCuando } from './cuando.js'
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
  | { destino: 'sin_clasificar'; texto: string }
)

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

export function instrucciones(hoy: string, c: Contexto): string {
  const yo = c.personas.find((p) => p.yo)
  return `Ayudas a una persona a «vaciar la cabeza»: te pasa notas rápidas que apuntó en su bandeja y tú propones dónde va cada cosa en la app de su hogar. Ella lo revisará todo antes de guardar: es mejor dejar un dato vacío que inventarlo. No añadas cosas que no estén en las notas.

Hoy es ${hoy}. Quien escribe es ${yo ? limpiar(yo.nombre) : 'una persona del hogar'}.
Personas del hogar: ${lista(c.personas)}.
Mascotas: ${lista(c.mascotas)}.
Plantas: ${lista(c.plantas)}.
Gente de fuera a la que regalan: ${lista(c.gente)}.
Categorías de planes: ${lista(c.categoriasPlan)}.

Cada nota puede tener una cosa o varias («pilas y leche» son dos cosas de la compra). Para cada cosa, un objeto con «nota» (el número de la nota) y «destino», más sus datos:
- "tarea" (algo que hay que hacer): «titulo» (empieza por un verbo en infinitivo, sin la fecha ni quién), «cuando» (las palabras exactas de la fecha, o null), «categoria» (casa, mascota, plantas, coche, papeleo u otros), «responsable» (nombre de una persona del hogar, «yo» o null), «mascota» (nombre o null), «detalles» (o null).
- "compra" (algo que comprar en la compra de casa): «nombre», «cantidad» (o null).
- "plan" (algo que hacer juntas por gusto: una exposición, una excursión, un restaurante): «nombre», «categoria» (una de las categorías de planes o null).
- "pelicula" o "serie" (algo que ver): «titulo».
- "deseo" (algo que le gustaría que le regalaran a quien escribe): «titulo».
- "idea_regalo" (una idea para regalar a otra persona): «titulo», «para» (nombre de alguien del hogar o de la gente de fuera).
- "fecha" (un cumpleaños, aniversario u otra fecha que se repite cada año): «titulo» («Cumpleaños de Lucía»), «tipo» (cumpleanos, aniversario u otra), «dia», «mes» (números), «anio» (año en que nació o empezó, o null), «de» (nombre o null).
- "peso" (cuánto pesa una mascota): «mascota», «kg» (número).
- "cuidado_hecho" (ya ha regado, abonado… una planta): «planta», «tipo» (riego, abono, trasplante, poda u otro).
- "otro" (si no encaja en nada): «texto».

Contesta SOLO con un objeto JSON, sin texto antes ni después y sin \`\`\`:
{"cosas": [{"nota": 1, "destino": "compra", "nombre": "Pilas", "cantidad": null}]}`
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

const diasDelMes = (mes: number) => (mes === 2 ? 29 : [4, 6, 9, 11].includes(mes) ? 30 : 31)

// Una cosa de la IA → una propuesta que se puede guardar. Lo que no tiene
// sentido se descarta (null); si una nota se queda sin ninguna, sale
// «sin clasificar» con su texto (ver validarReparto).
function propuesta(x: Objeto, nota: Nota, hoy: string, c: Contexto): Propuesta | null {
  const destino = typeof x.destino === 'string' ? normalizar(x.destino).replace(/ /g, '_') : ''
  const sin = (): null => null
  const yo = c.personas.find((p) => p.yo)

  switch (destino) {
    case 'tarea': {
      const titulo = texto(x.titulo, 120)
      if (!titulo) return sin()
      const cuando = texto(x.cuando, 60)
      let categoria: Categoria = CATEGORIAS.find((k) => k === normalizar(String(x.categoria ?? ''))) ?? 'otros'
      const quien = texto(x.responsable, 60)
      const responsable = quien && ['yo', 'mi'].includes(normalizar(quien)) ? yo : buscar(c.personas, quien)
      const mascota = buscar(c.mascotas, x.mascota)
      if (mascota) categoria = 'mascota'
      return {
        nota: nota.id,
        destino: 'tarea',
        titulo: conMayuscula(titulo),
        fecha: resolverCuando(cuando, hoy),
        categoria,
        responsable_id: responsable?.id ?? null,
        mascota_id: mascota?.id ?? null,
        detalles: texto(x.detalles, 500),
      }
    }
    case 'compra': {
      const nombre = texto(x.nombre, 80)
      return nombre ? { nota: nota.id, destino: 'compra', nombre: conMayuscula(nombre), cantidad: texto(x.cantidad, 30) } : sin()
    }
    case 'plan': {
      const nombre = texto(x.nombre, 80)
      return nombre ? { nota: nota.id, destino: 'plan', nombre: conMayuscula(nombre), categoria_id: buscar(c.categoriasPlan, x.categoria)?.id ?? null } : sin()
    }
    case 'pelicula':
    case 'serie': {
      const titulo = texto(x.titulo, 120)
      return titulo ? { nota: nota.id, destino, titulo } : sin()
    }
    case 'deseo': {
      const titulo = texto(x.titulo, 120)
      return titulo ? { nota: nota.id, destino: 'deseo', titulo: conMayuscula(titulo) } : sin()
    }
    case 'idea_regalo': {
      const titulo = texto(x.titulo, 120)
      if (!titulo) return sin()
      const para = texto(x.para, 60)
      // Una «idea para mí» es un deseo de tu lista.
      if (para && ['yo', 'mi'].includes(normalizar(para))) return { nota: nota.id, destino: 'deseo', titulo: conMayuscula(titulo) }
      const miembro = buscar(c.personas, para)
      if (miembro?.yo) return { nota: nota.id, destino: 'deseo', titulo: conMayuscula(titulo) }
      const persona = miembro ? undefined : buscar(c.gente, para)
      return { nota: nota.id, destino: 'idea_regalo', titulo: conMayuscula(titulo), miembro_id: miembro?.id ?? null, persona_id: persona?.id ?? null }
    }
    case 'fecha': {
      const titulo = texto(x.titulo, 80)
      const mes = entero(x.mes, 1, 12)
      const dia = mes ? entero(x.dia, 1, diasDelMes(mes)) : null
      if (!titulo || !mes || !dia) return sin()
      const tipo = TIPOS_FECHA.find((t) => t === normalizar(String(x.tipo ?? '')).replace('ñ', 'n')) ?? 'otra'
      const de = texto(x.de, 60)
      const miembro = buscar(c.personas, de)
      const persona = miembro ? undefined : buscar(c.gente, de)
      return {
        nota: nota.id,
        destino: 'fecha',
        titulo: conMayuscula(titulo),
        tipo,
        dia,
        mes,
        anio: entero(x.anio, 1900, Number(hoy.slice(0, 4))),
        miembro_id: miembro?.id ?? null,
        persona_id: persona?.id ?? null,
      }
    }
    case 'peso': {
      const mascota = buscar(c.mascotas, x.mascota) ?? (c.mascotas.length === 1 ? c.mascotas[0] : undefined)
      const kg = typeof x.kg === 'number' ? x.kg : Number(String(x.kg ?? '').replace(',', '.'))
      if (!mascota || !Number.isFinite(kg) || kg <= 0 || kg >= 500) return sin()
      return { nota: nota.id, destino: 'peso', mascota_id: mascota.id, kg: Math.round(kg * 1000) / 1000 }
    }
    case 'cuidado_hecho': {
      const planta = buscar(c.plantas, x.planta) ?? (c.plantas.length === 1 ? c.plantas[0] : undefined)
      if (!planta) return sin()
      const tipo = TIPOS_CUIDADO.find((t) => t === normalizar(String(x.tipo ?? ''))) ?? 'riego'
      return { nota: nota.id, destino: 'cuidado_hecho', planta_id: planta.id, tipo }
    }
    case 'otro':
      return { nota: nota.id, destino: 'sin_clasificar', texto: texto(x.texto, 500) ?? nota.texto }
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
    const numero = entero(x.nota, 1, notas.length)
    if (!numero) continue
    const p = propuesta(x, notas[numero - 1], hoy, c)
    if (p) propuestas.push(p)
  }
  for (const nota of notas) {
    if (!propuestas.some((p) => p.nota === nota.id)) propuestas.push({ nota: nota.id, destino: 'sin_clasificar', texto: nota.texto })
  }
  const orden = new Map(notas.map((n, i) => [n.id, i]))
  return propuestas.sort((a, b) => (orden.get(a.nota) ?? 0) - (orden.get(b.nota) ?? 0))
}

// Las notas, numeradas, para mandárselas a la IA (cada una en una línea).
export const notasNumeradas = (notas: Nota[]) => notas.map((n, i) => `${i + 1}. ${n.texto.replace(/\s+/g, ' ').trim()}`).join('\n')
