// «✨ Hazme una plantilla»: lo que se le dice a la IA y la comprobación de
// lo que contesta. «la boda de mi hermana en Asturias» → una lista de
// tareas, cada una con cuántos días antes o después del día clave toca.
// La IA solo PROPONE: la persona lo revisa y lo guarda la app (con las
// reglas de siempre de la base de datos).
// OJO: se ejecuta en el SERVIDOR (funciones de Vercel), nunca en el móvil.
import { CATEGORIAS, type Categoria } from './tareaNatural.js'

export type PlantillaPropuesta = {
  nombre: string
  dibujo: string
  pregunta: string
  tareas: { titulo: string; categoria: Categoria; dias: number }[]
}

export const MAX_TAREAS_IA = 25

export function instruccionesPlantilla(): string {
  return `Ayudas a una pareja o a un hogar de España a organizar algo que tienen por delante (una mudanza, un viaje, una fiesta, una barbacoa, una boda…). Te dicen qué quieren organizar y tú propones una PLANTILLA: la lista de cosas que hay que hacer, cada una con cuántos días antes o después del día clave conviene hacerla.

Contesta SOLO con un objeto JSON con esta forma exacta:
{"nombre": "...", "dibujo": "...", "pregunta": "...", "tareas": [{"titulo": "...", "categoria": "...", "dias": 0}]}

- nombre: corto, como un título («Boda de mi hermana», «Viaje a Japón»). Máximo 40 letras.
- dibujo: UN solo emoji que lo represente.
- pregunta: la pregunta para pedir el día clave, por ejemplo «¿Cuándo es la boda?» o «¿Cuándo os vais?».
- tareas: entre 4 y 20, las más útiles y concretas, sin repetir.
  - titulo: empieza con un verbo en infinitivo («Reservar el alojamiento», «Comprar el regalo»). Máximo 80 letras. Sin nombres de personas.
  - categoria: una de ${CATEGORIAS.join(', ')} (papeleo = trámites, reservas con papeles, seguros y documentos; casa = compras y cosas de casa; coche = el coche; mascota = los animales; plantas = las plantas; otros = el resto).
  - dias: un número entero. Negativo = días ANTES del día clave (-7 = una semana antes); 0 = el mismo día; positivo = días DESPUÉS (para lo que se hace luego, como recoger o dar las gracias). Entre -365 y 365.
- Ordena las tareas de la primera a la última.
- Si lo que te piden no es algo que organizar (o no tiene sentido), contesta {"tareas": []}.`
}

const limpiar = (texto: string, maximo: number) =>
  texto
    .replace(/[\p{Cc}<>{}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maximo)
    .trim()

const normalizar = (texto: string) =>
  texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()

// La IA a veces contesta «Papeleo», «trámites» o «compras».
const SINONIMOS: Record<string, Categoria> = {
  tramites: 'papeleo',
  tramite: 'papeleo',
  documentos: 'papeleo',
  compras: 'casa',
  compra: 'casa',
  hogar: 'casa',
  animales: 'mascota',
  mascotas: 'mascota',
  planta: 'plantas',
  vehiculo: 'coche',
}

function categoriaDe(valor: unknown): Categoria {
  if (typeof valor !== 'string') return 'otros'
  const n = normalizar(valor)
  if ((CATEGORIAS as readonly string[]).includes(n)) return n as Categoria
  return SINONIMOS[n] ?? 'otros'
}

function diasDe(valor: unknown): number | null {
  const n = typeof valor === 'number' ? valor : typeof valor === 'string' && /^\s*[-+]?\d+(\.\d+)?\s*$/.test(valor) ? Number(valor) : NaN
  if (!Number.isFinite(n)) return null
  return Math.max(-730, Math.min(730, Math.round(n)))
}

// Un emoji corto (sin letras ni números); si no, el de siempre.
function dibujoDe(valor: unknown): string {
  if (typeof valor !== 'string') return '📋'
  const d = valor.trim()
  if (!d || d.length > 8 || /[\p{L}\p{N}\s]/u.test(d) || !/\p{Extended_Pictographic}/u.test(d)) return '📋'
  return d
}

function preguntaDe(valor: unknown): string {
  if (typeof valor !== 'string') return '¿Para cuándo?'
  let p = limpiar(valor, 78).replace(/^¿+|\?+$/g, '').trim()
  if (!p) return '¿Para cuándo?'
  p = p.charAt(0).toUpperCase() + p.slice(1)
  return `¿${p}?`
}

// Comprueba (y arregla) lo que contesta la IA. null = no ha propuesto nada útil.
export function validarPlantilla(datos: unknown, nombrePorDefecto: string): PlantillaPropuesta | null {
  if (!datos || typeof datos !== 'object') return null
  const d = datos as Record<string, unknown>
  if (!Array.isArray(d.tareas)) return null
  const vistos = new Set<string>()
  const tareas: PlantillaPropuesta['tareas'] = []
  for (const t of d.tareas) {
    if (!t || typeof t !== 'object') continue
    const x = t as Record<string, unknown>
    if (typeof x.titulo !== 'string') continue
    const titulo = limpiar(x.titulo, 120)
    const dias = diasDe(x.dias)
    if (!titulo || dias === null || vistos.has(normalizar(titulo))) continue
    vistos.add(normalizar(titulo))
    tareas.push({ titulo: titulo.charAt(0).toUpperCase() + titulo.slice(1), categoria: categoriaDe(x.categoria), dias })
    if (tareas.length === MAX_TAREAS_IA) break
  }
  if (tareas.length === 0) return null
  tareas.sort((a, b) => a.dias - b.dias)
  const nombre = typeof d.nombre === 'string' && limpiar(d.nombre, 60) ? limpiar(d.nombre, 60) : limpiar(nombrePorDefecto, 60) || 'Mi plantilla'
  return { nombre, dibujo: dibujoDe(d.dibujo), pregunta: preguntaDe(d.pregunta), tareas }
}
