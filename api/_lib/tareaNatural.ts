// Tareas en lenguaje natural: lo que le decimos a la IA y la comprobación de
// lo que contesta. «hay que renovar el seguro de la furgo en marzo» →
// { titulo: «Renovar el seguro de la furgo», fecha: 2027-03-01, categoria: papeleo… }
// OJO: se ejecuta en el SERVIDOR (funciones de Vercel), nunca en el móvil.
import { resolverCuando } from './cuando.js'

export const CATEGORIAS = ['casa', 'mascota', 'plantas', 'coche', 'papeleo', 'otros'] as const
export type Categoria = (typeof CATEGORIAS)[number]

// Lo que manda la app: la gente y las mascotas del hogar (para entender
// «que lo haga Bea» o «la pipeta de Luna»).
export type Persona = { id: string; nombre: string; yo: boolean }
export type MascotaCorta = { id: string; nombre: string }

export type TareaEntendida = {
  titulo: string
  fecha: string | null
  // Las palabras de la fecha tal como se dijeron («en marzo»), para enseñarlas.
  cuando: string | null
  categoria: Categoria
  // null = no ha dicho quién; { id: null } = ha dicho que no es de nadie.
  responsable: { id: string | null } | null
  mascota_id: string | null
  detalles: string | null
  aviso: string | null
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

// Sin saltos de línea ni comillas: un nombre no puede «colar» instrucciones.
const limpiarNombre = (nombre: string) => nombre.replace(/[\r\n"«»<>{}]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40)

const normalizar = (texto: string) =>
  texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

export function instrucciones(hoy: string, personas: Persona[], mascotas: MascotaCorta[]): string {
  const fecha = new Date(`${hoy}T00:00:00Z`)
  const hoyEnPalabras = `${DIAS[fecha.getUTCDay()]} ${fecha.getUTCDate()} de ${MESES[fecha.getUTCMonth()]} de ${fecha.getUTCFullYear()}`
  const yo = personas.find((p) => p.yo)
  const gente = personas.map((p) => limpiarNombre(p.nombre) + (p.yo ? ' (quien escribe)' : '')).join(', ') || '(nadie más)'
  const animales = mascotas.map((m) => limpiarNombre(m.nombre)).join(', ') || '(ninguna)'
  return `Conviertes lo que alguien escribe o dicta sobre algo que hay que hacer en los datos de una tarea, para una app que usa un hogar compartido. La persona revisará todo antes de guardarlo: es mejor dejar un dato vacío que inventarlo.

Hoy es ${hoyEnPalabras} (${hoy}).
Quien escribe es ${yo ? limpiarNombre(yo.nombre) : 'una persona del hogar'}. En el hogar están: ${gente}.
Mascotas del hogar: ${animales}.

Devuelve:
- «titulo»: la tarea, corta y clara, empezando por un verbo en infinitivo y con mayúscula («Renovar el seguro de la furgo»). Sin la fecha, sin quién se encarga y sin muletillas («hay que», «acuérdate de», «tenemos que», «no te olvides de»). Respeta las palabras de la persona (si dice «furgo», escribe «furgo»).
- «cuando»: las palabras exactas de la fecha o el plazo tal como las ha dicho («en marzo», «el viernes», «mañana», «antes del 15 de enero», «dentro de dos semanas»), o null si no dice cuándo.
- «fecha»: esa fecha en formato AAAA-MM-DD, o null. Si solo dice un mes, el día 1 de ese mes. Nunca una fecha pasada.
- «categoria»: una de estas:
  casa (limpieza, compras de casa, arreglos, basura, cocina, lavadora),
  mascota (veterinario, pienso, paseos, vacunas o cualquier cosa de un animal),
  plantas (regar, abonar, trasplantar, podar),
  coche (coche, moto, furgo o furgoneta, ITV, taller, ruedas, gasolina, aparcamiento),
  papeleo (seguros, impuestos, bancos, citas médicas, documentos, renovaciones, facturas, recibos),
  otros (lo demás: regalos, cumpleaños, llamadas, planes…).
- «responsable»: el nombre exacto, de la lista del hogar, de quien se encarga si lo dice («que lo haga Bea»; «me toca a mí», «lo hago yo» → quien escribe); «nadie» si dice que no es de nadie en concreto o que lo haga cualquiera; null si no lo dice.
- «mascota»: el nombre exacto, de la lista de mascotas, si la tarea es de una de ellas; si no, null.
- «detalles»: información útil que no cabe en el título (un teléfono, una dirección, una marca, una cantidad, una hora), o null. No repitas el título.
- «aviso»: si ha dicho varias tareas distintas, explica en una frase corta que solo has rellenado la primera; si no, null.

Formato de la respuesta: contesta SOLO con un objeto JSON, sin ningún texto antes ni después y sin \`\`\`. Tiene esta forma (lo que va entre < > es lo que tienes que rellenar):
{"titulo": "<título>", "cuando": "<palabras de la fecha o null>", "fecha": "<AAAA-MM-DD o null>", "categoria": "<categoría>", "responsable": "<nombre, nadie o null>", "mascota": "<nombre o null>", "detalles": "<texto o null>", "aviso": "<texto o null>"}`
}

function texto(valor: unknown, maximo: number): string | null {
  if (typeof valor !== 'string') return null
  const limpio = valor.replace(/\s+/g, ' ').trim().slice(0, maximo)
  // A veces la IA escribe «null» como texto en vez de dejarlo vacío.
  if (/^(null|none|ninguna?|-)$/i.test(limpio)) return null
  return limpio || null
}

const conMayuscula = (frase: string) => frase.charAt(0).toUpperCase() + frase.slice(1)

// Una fecha de la IA solo vale si es real, no ha pasado y no está demasiado lejos.
function fechaDeLaIA(valor: unknown, hoy: string): string | null {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return null
  const fecha = new Date(`${valor}T00:00:00Z`)
  if (Number.isNaN(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== valor) return null
  const dentroDe5Anios = `${Number(hoy.slice(0, 4)) + 5}${hoy.slice(4)}`
  return valor >= hoy && valor <= dentroDe5Anios ? valor : null
}

// Busca un nombre de la lista (sin importar mayúsculas ni tildes).
function buscarPorNombre<T extends { nombre: string }>(lista: T[], nombre: string): T | undefined {
  const buscado = normalizar(nombre)
  return (
    lista.find((x) => normalizar(x.nombre) === buscado) ??
    // «Bea» cuando en la app es «Bea García», o al revés.
    lista.find((x) => {
      const n = normalizar(x.nombre)
      return n.split(' ')[0] === buscado.split(' ')[0]
    })
  )
}

// Comprobamos lo que devuelve la IA antes de mandarlo al móvil: solo pasan
// categorías conocidas, personas y mascotas del propio hogar y fechas reales.
// Las fechas se calculan con reglas fijas (cuando.ts) siempre que se pueda.
export function validarTarea(
  datos: unknown,
  original: string,
  hoy: string,
  personas: Persona[],
  mascotas: MascotaCorta[],
): TareaEntendida {
  const d = (datos ?? {}) as Record<string, unknown>
  const titulo = conMayuscula(texto(d.titulo, 120) ?? original.replace(/\s+/g, ' ').trim().slice(0, 120))
  const cuando = texto(d.cuando, 60)
  const fecha = resolverCuando(cuando, hoy) ?? resolverCuando(original, hoy) ?? fechaDeLaIA(d.fecha, hoy)

  let categoria: Categoria = CATEGORIAS.find((c) => c === normalizar(String(d.categoria ?? ''))) ?? 'otros'

  let responsable: TareaEntendida['responsable'] = null
  const nombreResponsable = texto(d.responsable, 60)
  if (nombreResponsable) {
    const quien = normalizar(nombreResponsable)
    if (['nadie', 'cualquiera', 'ninguno', 'sin asignar'].includes(quien)) responsable = { id: null }
    else if (['yo', 'mi'].includes(quien)) responsable = { id: personas.find((p) => p.yo)?.id ?? null }
    else {
      const persona = buscarPorNombre(personas, nombreResponsable)
      if (persona) responsable = { id: persona.id }
    }
  }

  let mascota_id: string | null = null
  const nombreMascota = texto(d.mascota, 60)
  if (nombreMascota) {
    const mascota = buscarPorNombre(mascotas, nombreMascota)
    if (mascota) {
      mascota_id = mascota.id
      categoria = 'mascota'
    }
  }

  return {
    titulo,
    fecha,
    cuando,
    categoria,
    responsable,
    mascota_id,
    detalles: texto(d.detalles, 500),
    aviso: texto(d.aviso, 200),
  }
}
