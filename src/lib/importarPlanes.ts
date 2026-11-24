import {
  CATEGORIAS_SUGERIDAS,
  COLORES,
  type CategoriaPlan,
  type ColorPlan,
  type Duracion,
  type Energia,
  type Plan,
  type Precio,
} from './planes'

// Añadir muchos planes de golpe con una plantilla CSV (la de Excel, Google
// Sheets o Numbers). Aquí solo se lee y se revisa el archivo: no se guarda
// nada hasta que la persona lo confirma.

export const MAX_FILAS = 300
export const MAX_BYTES = 1024 * 1024 // 1 MB: de sobra para 300 planes

const LARGO_NOMBRE = 80 // como en la base de datos
const LARGO_CATEGORIA = 40
const LARGO_NOTAS = 1000

export const COLUMNAS = ['nombre', 'categoria', 'energia', 'precio', 'duracion', 'favorito', 'notas'] as const
type Columna = (typeof COLUMNAS)[number]

// Sin mayúsculas, sin tildes y sin espacios de más («Medio  Día» → «medio dia»).
export const normalizar = (texto: string) =>
  texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[_\s]+/g, ' ')
    .trim()

// ---------------------------------------------------------------------
// Leer el archivo
// ---------------------------------------------------------------------

// Excel en Windows guarda a veces el CSV en «Windows-1252» en vez de UTF-8:
// si no es UTF-8 válido, se lee así (para que salgan bien las tildes).
export function decodificar(bytes: ArrayBuffer): string {
  let texto: string
  try {
    texto = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    texto = new TextDecoder('windows-1252').decode(bytes)
  }
  return texto.replace(/^﻿/, '')
}

// Punto y coma (Excel en español), coma o tabulador (lo que se pega desde
// una hoja de cálculo): el que más aparezca en la primera fila.
export function separadorDe(texto: string): string {
  const primera = texto.split(/\r?\n/).find((linea) => linea.trim() !== '') ?? ''
  const sinComillas = primera.replace(/"[^"]*"/g, '')
  const cuantos = (s: string) => sinComillas.split(s).length - 1
  return [';', '\t', ','].reduce((mejor, s) => (cuantos(s) > cuantos(mejor) ? s : mejor), ';')
}

// Las filas y columnas de un CSV (con comillas, comillas dobles y saltos de
// línea dentro de una celda). Las filas vacías no cuentan.
export function leerCsv(texto: string, separador = separadorDe(texto)): string[][] {
  const filas: string[][] = []
  let fila: string[] = []
  let celda = ''
  let entreComillas = false
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]
    if (entreComillas) {
      if (c === '"' && texto[i + 1] === '"') {
        celda += '"'
        i++
      } else if (c === '"') entreComillas = false
      else celda += c
    } else if (c === '"' && celda.trim() === '') {
      entreComillas = true
      celda = ''
    } else if (c === separador) {
      fila.push(celda)
      celda = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++
      fila.push(celda)
      filas.push(fila)
      fila = []
      celda = ''
    } else celda += c
  }
  if (celda !== '' || fila.length > 0) {
    fila.push(celda)
    filas.push(fila)
  }
  return filas.filter((f) => f.some((c) => c.trim() !== ''))
}

// ---------------------------------------------------------------------
// Entender cada columna
// ---------------------------------------------------------------------

const TITULOS: Record<string, Columna> = {
  nombre: 'nombre',
  plan: 'nombre',
  titulo: 'nombre',
  categoria: 'categoria',
  tipo: 'categoria',
  energia: 'energia',
  esfuerzo: 'energia',
  precio: 'precio',
  presupuesto: 'precio',
  coste: 'precio',
  duracion: 'duracion',
  tiempo: 'duracion',
  favorito: 'favorito',
  favoritos: 'favorito',
  notas: 'notas',
  nota: 'notas',
  descripcion: 'notas',
  detalles: 'notas',
}

// «Nombre (obligatorio)» → nombre
const columnaDe = (titulo: string): Columna | undefined =>
  TITULOS[normalizar(titulo).replace(/\(.*\)/g, '').replace(/[^a-z ]/g, '').trim()]

const ENERGIAS: Record<string, Energia> = {
  poca: 'poca',
  baja: 'poca',
  minima: 'poca',
  'minimo esfuerzo': 'poca',
  normal: 'normal',
  media: 'normal',
  mucha: 'mucha',
  alta: 'mucha',
  'con energia': 'mucha',
}

const PRECIOS: Record<string, Precio> = {
  gratis: 'gratis',
  gratuito: 'gratis',
  '0': 'gratis',
  '0€': 'gratis',
  '€': 'barato',
  barato: 'barato',
  '1': 'barato',
  '€€': 'medio',
  medio: 'medio',
  '2': 'medio',
  '€€€': 'caro',
  caro: 'caro',
  '3': 'caro',
}

const DURACIONES: Record<string, Duracion> = {
  rato: 'rato',
  'un rato': 'rato',
  'medio dia': 'medio_dia',
  'media jornada': 'medio_dia',
  dia: 'dia',
  'un dia': 'dia',
  'dia entero': 'dia',
  'todo el dia': 'dia',
  'varios dias': 'varios_dias',
  'fin de semana': 'varios_dias',
  finde: 'varios_dias',
}

const SI = new Set(['si', 's', 'x', '1', 'true', 'verdadero', 'yes', '⭐'])
const NO = new Set(['no', 'n', '0', 'false', 'falso'])

// ---------------------------------------------------------------------
// Revisar las filas
// ---------------------------------------------------------------------

export type CategoriaFila =
  | { tipo: 'ninguna' }
  | { tipo: 'existe'; id: string; nombre: string }
  | { tipo: 'nueva'; nombre: string }

export type FilaImportada = {
  linea: number // en el archivo (la 1 son los títulos)
  nombre: string
  categoria: CategoriaFila
  energia: Energia | null
  precio: Precio | null
  duracion: Duracion | null
  favorito: boolean
  notas: string | null
  avisos: string[] // se puede añadir igual
  error: string | null // no se puede añadir
  // Por qué sale sin marcar (se puede marcar igual).
  desmarcada: 'ya_esta' | 'repetida' | 'ejemplo' | null
}

export type Lectura = {
  filas: FilaImportada[]
  error: string | null // el archivo entero no vale
  sinTitulos: boolean // no tenía la fila de títulos: se leen en el orden de la plantilla
  sobran: number // filas que no caben (más de MAX_FILAS)
}

// Las filas de ejemplo de la plantilla (salen sin marcar si se quedan).
const EJEMPLOS = [
  { nombre: 'Ruta por la sierra', categoria: 'Al aire libre', energia: 'mucha', precio: 'gratis', duracion: 'un día', favorito: 'sí', notas: 'Llevar agua y algo de comer' },
  { nombre: 'Noche de pelis con palomitas', categoria: 'En casa', energia: 'poca', precio: 'gratis', duracion: 'un rato', favorito: 'no', notas: '' },
  { nombre: 'Probar el restaurante nuevo', categoria: 'Comer fuera', energia: 'normal', precio: '€€', duracion: 'un rato', favorito: 'no', notas: 'Aquí podéis pegar el enlace de su web' },
]
const NOMBRES_EJEMPLO = new Set(EJEMPLOS.map((e) => normalizar(e.nombre)))

export function interpretar(texto: string, categorias: CategoriaPlan[], planes: Pick<Plan, 'nombre'>[]): Lectura {
  const filas = leerCsv(texto)
  if (filas.length === 0) return { filas: [], error: 'El archivo está vacío.', sinTitulos: false, sobran: 0 }

  // ¿Qué columna es cada una? Si la primera fila no tiene títulos, se leen
  // en el orden de la plantilla.
  const titulos = filas[0].map(columnaDe)
  const sinTitulos = !titulos.includes('nombre')
  const columnas: (Columna | undefined)[] = sinTitulos ? [...COLUMNAS] : titulos
  const datos = sinTitulos ? filas : filas.slice(1)
  const primeraLinea = sinTitulos ? 1 : 2
  if (datos.length === 0) return { filas: [], error: 'Solo tiene la fila de títulos: falta añadir los planes debajo.', sinTitulos, sobran: 0 }

  const yaEstan = new Set(planes.map((p) => normalizar(p.nombre)))
  const vistos = new Set<string>()
  const resultado = datos.slice(0, MAX_FILAS).map((celdas, i): FilaImportada => {
    const valor = (columna: Columna) => {
      const posicion = columnas.indexOf(columna)
      return posicion === -1 ? '' : (celdas[posicion] ?? '').trim()
    }
    const avisos: string[] = []

    let nombre = valor('nombre').replace(/\s+/g, ' ')
    if (nombre.length > LARGO_NOMBRE) {
      nombre = nombre.slice(0, LARGO_NOMBRE).trim()
      avisos.push(`Nombre recortado a ${LARGO_NOMBRE} letras.`)
    }

    // Categoría: una de las vuestras, una nueva o ninguna.
    let categoria: CategoriaFila = { tipo: 'ninguna' }
    const textoCategoria = valor('categoria').replace(/\s+/g, ' ').slice(0, LARGO_CATEGORIA).trim()
    if (textoCategoria && normalizar(textoCategoria) !== 'sin categoria') {
      const existe = categorias.find((c) => normalizar(c.nombre) === normalizar(textoCategoria))
      categoria = existe ? { tipo: 'existe', id: existe.id, nombre: existe.nombre } : { tipo: 'nueva', nombre: textoCategoria }
    }

    function opcion<T>(columna: Columna, que: string, mapa: Record<string, T>, sinEspacios = false): T | null {
      const texto = valor(columna)
      if (!texto) return null
      const clave = sinEspacios ? normalizar(texto).replace(/\s/g, '') : normalizar(texto)
      if (clave in mapa) return mapa[clave]
      avisos.push(`No entendemos ${que} «${texto}»: se queda sin elegir.`)
      return null
    }
    const energia = opcion('energia', 'la energía', ENERGIAS)
    const precio = opcion('precio', 'el precio', PRECIOS, true)
    const duracion = opcion('duracion', 'la duración', DURACIONES)

    const textoFavorito = normalizar(valor('favorito'))
    if (textoFavorito && !SI.has(textoFavorito) && !NO.has(textoFavorito)) {
      avisos.push(`No entendemos «${valor('favorito')}» en favorito: pon «sí» o «no».`)
    }

    let notas = valor('notas')
    if (notas.length > LARGO_NOTAS) {
      notas = notas.slice(0, LARGO_NOTAS)
      avisos.push(`Notas recortadas a ${LARGO_NOTAS} letras.`)
    }

    // Lo que ya teníais, lo repetido y los ejemplos de la plantilla salen sin marcar.
    const clave = normalizar(nombre)
    let desmarcada: FilaImportada['desmarcada'] = null
    if (clave && yaEstan.has(clave)) desmarcada = 'ya_esta'
    else if (clave && vistos.has(clave)) desmarcada = 'repetida'
    else if (NOMBRES_EJEMPLO.has(clave)) desmarcada = 'ejemplo'
    if (clave) vistos.add(clave)

    return {
      linea: primeraLinea + i,
      nombre,
      categoria,
      energia,
      precio,
      duracion,
      favorito: SI.has(textoFavorito),
      notas: notas || null,
      avisos,
      error: nombre ? null : 'Falta el nombre del plan.',
      desmarcada,
    }
  })

  return { filas: resultado, error: null, sinTitulos, sobran: Math.max(0, datos.length - MAX_FILAS) }
}

// Las categorías que hay que crear para las filas elegidas (sin repetir).
export function categoriasNuevas(filas: FilaImportada[]): string[] {
  const nombres = new Map<string, string>()
  for (const fila of filas) {
    if (fila.categoria.tipo === 'nueva' && !nombres.has(normalizar(fila.categoria.nombre))) {
      nombres.set(normalizar(fila.categoria.nombre), fila.categoria.nombre)
    }
  }
  return [...nombres.values()]
}

// El dibujo y el color de una categoría nueva: los de la sugerida si se
// llama igual («Cultura» → 🎭 lavanda); si no, ✨ y un color que no tengáis.
export function estiloCategoriaNueva(nombre: string, existentes: CategoriaPlan[], posicion: number): { dibujo: string; color: ColorPlan } {
  const sugerida = CATEGORIAS_SUGERIDAS.find((c) => normalizar(c.nombre) === normalizar(nombre))
  if (sugerida) return { dibujo: sugerida.dibujo, color: sugerida.color }
  const libres = COLORES.filter((c) => !existentes.some((e) => e.color === c))
  const colores = libres.length > 0 ? libres : COLORES
  return { dibujo: '✨', color: colores[posicion % colores.length] }
}

// ---------------------------------------------------------------------
// La plantilla
// ---------------------------------------------------------------------

// Una celda del CSV: entre comillas si hace falta. Si empieza por = + - o @,
// Excel la tomaría por una fórmula: se le pone un apóstrofo delante.
function celdaCsv(texto: string): string {
  const seguro = /^[=+\-@]/.test(texto) ? `'${texto}` : texto
  return /[;"\r\n]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro
}

// La plantilla para descargar: los títulos y tres ejemplos con vuestras
// categorías. Con punto y coma, que es lo que espera Excel en español, y
// con la marca de UTF-8 para que salgan bien las tildes.
export function plantillaCsv(categorias: CategoriaPlan[]): string {
  const nombres = categorias.map((c) => c.nombre)
  const filas = EJEMPLOS.map((e, i) => {
    const suya = nombres.find((n) => normalizar(n) === normalizar(e.categoria))
    const categoria = suya ?? (nombres.length > 0 ? nombres[i % nombres.length] : e.categoria)
    return [e.nombre, categoria, e.energia, e.precio, e.duracion, e.favorito, e.notas]
  })
  return '﻿' + [[...COLUMNAS], ...filas].map((fila) => fila.map(celdaCsv).join(';')).join('\r\n') + '\r\n'
}

// Descargar un texto como archivo (sin servidor: se crea en el propio móvil).
export function descargar(nombre: string, contenido: string, tipo = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }))
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = nombre
  document.body.append(enlace)
  enlace.click()
  enlace.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
