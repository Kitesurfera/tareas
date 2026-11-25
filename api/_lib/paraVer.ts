// «Para ver»: lo que el servidor le pide a TMDB (la base de datos de cine y
// series) y cómo se entiende lo que contesta. TMDB es gratis para uso
// personal; las plataformas de cada título (Netflix, Max…) se las da
// JustWatch. Aquí solo hay funciones que no llaman a nadie, para poder
// probarlas sin internet.

export type Tipo = 'pelicula' | 'serie'

export type Plataforma = { id: number; nombre: string; logo: string | null }

export type Resultado = {
  tmdb_id: number
  tipo: Tipo
  titulo: string
  titulo_original: string | null
  anio: number | null
  poster: string | null
  sinopsis: string | null
  puntuacion: number | null
  generos: number[]
  plataformas: Plataforma[]
}

// Lo que os apetece (las preguntas de la app) → géneros de TMDB.
// Las series tienen otros números (y no tienen «romance» ni «terror»).
export const ANIMOS = ['reir', 'emocionarnos', 'romance', 'tension', 'miedo', 'accion', 'fantasia', 'aprender', 'animacion'] as const
export type Animo = (typeof ANIMOS)[number]

const GENEROS: Record<Tipo, Record<Animo, number[]>> = {
  pelicula: {
    reir: [35],
    emocionarnos: [18],
    romance: [10749],
    tension: [53, 9648, 80],
    miedo: [27],
    accion: [28, 12],
    fantasia: [878, 14],
    aprender: [99, 36],
    animacion: [16, 10751],
  },
  serie: {
    reir: [35],
    emocionarnos: [18],
    romance: [18, 10766],
    tension: [9648, 80],
    miedo: [9648, 10765],
    accion: [10759],
    fantasia: [10765],
    aprender: [99],
    animacion: [16, 10751],
  },
}

export const generosDe = (tipo: Tipo, animos: Animo[]) => [...new Set(animos.flatMap((a) => GENEROS[tipo][a]))]

export const DURACIONES: Record<Tipo, readonly string[]> = {
  pelicula: ['corta', 'normal', 'da_igual'],
  serie: ['miniserie', 'capitulos_cortos', 'da_igual'],
}
export const EPOCAS = ['nueva', 'reciente', 'clasica', 'da_igual'] as const

export type Filtros = {
  tipo: Tipo
  animos: Animo[]
  duracion: string // una de DURACIONES[tipo]
  epoca: (typeof EPOCAS)[number]
  desde: number | null // años (los dice la IA: «de los 90»)
  hasta: number | null
  idioma: string | null // idioma original: «ko», «es»…
  plataformas: number[] // vuestras plataformas (números de TMDB)
  soloNuestras: boolean
}

const RUTA_IMAGEN = /^\/[A-Za-z0-9_-]{1,64}\.(jpg|png)$/
const ruta = (valor: unknown) => (typeof valor === 'string' && RUTA_IMAGEN.test(valor) ? valor : null)
const texto = (valor: unknown, maximo: number) =>
  typeof valor === 'string' && valor.trim() ? valor.replace(/\s+/g, ' ').trim().slice(0, maximo) : null

export const segmento = (tipo: Tipo) => (tipo === 'pelicula' ? 'movie' : 'tv')

// ---------------------------------------------------------------------
// Lo que pide el servidor
// ---------------------------------------------------------------------

// «Descubrir» de TMDB con vuestras respuestas. Solo lo ya estrenado y con
// bastantes votos (para no sugerir cosas raras); lo más popular primero.
export function parametrosDescubrir(f: Filtros, hoy: string, pagina = 1): URLSearchParams {
  const p = new URLSearchParams({
    language: 'es-ES',
    watch_region: 'ES',
    include_adult: 'false',
    sort_by: 'popularity.desc',
    'vote_count.gte': f.tipo === 'pelicula' ? '150' : '60',
    page: String(pagina),
  })
  const generos = generosDe(f.tipo, f.animos)
  if (generos.length > 0) p.set('with_genres', generos.join('|')) // «|» = cualquiera de ellos

  const fecha = f.tipo === 'pelicula' ? 'primary_release_date' : 'first_air_date'
  p.set(`${fecha}.lte`, hoy)
  const anio = Number(hoy.slice(0, 4))
  if (f.desde !== null || f.hasta !== null) {
    if (f.desde !== null) p.set(`${fecha}.gte`, `${f.desde}-01-01`)
    if (f.hasta !== null && f.hasta < anio) p.set(`${fecha}.lte`, `${f.hasta}-12-31`)
  } else if (f.epoca === 'nueva') p.set(`${fecha}.gte`, `${anio - 2}-01-01`)
  else if (f.epoca === 'reciente') p.set(`${fecha}.gte`, '2010-01-01')
  else if (f.epoca === 'clasica') p.set(`${fecha}.lte`, '1999-12-31')

  if (f.tipo === 'pelicula') {
    p.set('with_runtime.gte', '60') // sin cortos
    if (f.duracion === 'corta') p.set('with_runtime.lte', '100')
    if (f.duracion === 'normal') p.set('with_runtime.lte', '135')
  } else {
    if (f.duracion === 'miniserie') p.set('with_type', '2')
    if (f.duracion === 'capitulos_cortos') p.set('with_runtime.lte', '35')
  }
  if (f.idioma) p.set('with_original_language', f.idioma)
  if (f.soloNuestras && f.plataformas.length > 0) {
    p.set('with_watch_providers', f.plataformas.join('|'))
    p.set('with_watch_monetization_types', 'flatrate|free|ads')
  }
  return p
}

// ---------------------------------------------------------------------
// Lo que contesta TMDB
// ---------------------------------------------------------------------

type Objeto = Record<string, unknown>
const esObjeto = (x: unknown): x is Objeto => Boolean(x) && typeof x === 'object' && !Array.isArray(x)

// Un título de TMDB (de una búsqueda, de «descubrir» o de recomendaciones).
export function aResultado(x: unknown, tipo: Tipo): Resultado | null {
  if (!esObjeto(x)) return null
  const id = x.id
  if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) return null
  const titulo = texto(tipo === 'pelicula' ? x.title : x.name, 120)
  if (!titulo) return null
  const original = texto(tipo === 'pelicula' ? x.original_title : x.original_name, 120)
  const fecha = tipo === 'pelicula' ? x.release_date : x.first_air_date
  const anio = typeof fecha === 'string' && /^\d{4}/.test(fecha) ? Number(fecha.slice(0, 4)) : null
  const votos = typeof x.vote_count === 'number' ? x.vote_count : 0
  const nota = typeof x.vote_average === 'number' && votos > 0 ? Math.round(x.vote_average * 10) / 10 : null
  const generos = Array.isArray(x.genre_ids)
    ? x.genre_ids.filter((g): g is number => typeof g === 'number')
    : Array.isArray(x.genres)
      ? x.genres.map((g) => (esObjeto(g) ? g.id : null)).filter((g): g is number => typeof g === 'number')
      : []
  return {
    tmdb_id: id,
    tipo,
    titulo,
    titulo_original: original && original !== titulo ? original : null,
    anio: anio && anio >= 1880 && anio <= 2100 ? anio : null,
    poster: ruta(x.poster_path),
    sinopsis: texto(x.overview, 600),
    puntuacion: nota,
    generos,
    plataformas: [],
  }
}

// La lista de resultados de una respuesta de TMDB (sin repetir).
export function resultadosDe(json: unknown, tipo: Tipo): Resultado[] {
  if (!esObjeto(json) || !Array.isArray(json.results)) return []
  const vistos = new Set<number>()
  const lista: Resultado[] = []
  for (const x of json.results) {
    if (esObjeto(x) && x.adult === true) continue
    const r = aResultado(x, tipo)
    if (r && !vistos.has(r.tmdb_id)) {
      vistos.add(r.tmdb_id)
      lista.push(r)
    }
  }
  return lista
}

// Dónde se puede ver en España sin pagar aparte: con suscripción
// («flatrate»), gratis o con anuncios. Ordenado como lo ordena TMDB.
export function plataformasDe(json: unknown): Plataforma[] {
  const resultados = esObjeto(json) ? json.results : null
  const espana = esObjeto(resultados) ? resultados.ES : null
  if (!esObjeto(espana)) return []
  const todas: (Plataforma & { orden: number })[] = []
  for (const clave of ['flatrate', 'free', 'ads']) {
    const lista = espana[clave]
    if (!Array.isArray(lista)) continue
    for (const p of lista) {
      if (!esObjeto(p) || typeof p.provider_id !== 'number') continue
      const nombre = texto(p.provider_name, 40)
      if (!nombre || todas.some((t) => t.id === p.provider_id)) continue
      todas.push({ id: p.provider_id, nombre, logo: ruta(p.logo_path), orden: typeof p.display_priority === 'number' ? p.display_priority : 999 })
    }
  }
  return todas.sort((a, b) => a.orden - b.orden).map(({ id, nombre, logo }) => ({ id, nombre, logo }))
}

// La lista de plataformas de España (de películas y de series, juntas),
// las más usadas primero.
export function listaDePlataformas(peliculas: unknown, series: unknown, cuantas = 40): Plataforma[] {
  const todas = new Map<number, Plataforma & { orden: number }>()
  for (const json of [peliculas, series]) {
    if (!esObjeto(json) || !Array.isArray(json.results)) continue
    for (const p of json.results) {
      if (!esObjeto(p) || typeof p.provider_id !== 'number') continue
      const nombre = texto(p.provider_name, 40)
      if (!nombre) continue
      const prioridades = esObjeto(p.display_priorities) ? p.display_priorities : {}
      const orden = typeof prioridades.ES === 'number' ? prioridades.ES : typeof p.display_priority === 'number' ? p.display_priority : 999
      const antes = todas.get(p.provider_id)
      if (!antes || orden < antes.orden) todas.set(p.provider_id, { id: p.provider_id, nombre, logo: ruta(p.logo_path), orden })
    }
  }
  return [...todas.values()]
    .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre))
    .slice(0, cuantas)
    .map(({ id, nombre, logo }) => ({ id, nombre, logo }))
}

// Mezcla varias listas de recomendaciones de una en una (la 1.ª de cada
// lista, luego la 2.ª…), sin repetir ni lo que hay que dejar fuera.
export function intercalar(listas: Resultado[][], fuera: Set<number>): Resultado[] {
  const resultado: Resultado[] = []
  const vistos = new Set(fuera)
  const largo = Math.max(0, ...listas.map((l) => l.length))
  for (let i = 0; i < largo; i++) {
    for (const lista of listas) {
      const r = lista[i]
      if (r && !vistos.has(r.tmdb_id)) {
        vistos.add(r.tmdb_id)
        resultado.push(r)
      }
    }
  }
  return resultado
}

// ---------------------------------------------------------------------
// Pedirlo con palabras: lo que se le dice a la IA y la comprobación
// ---------------------------------------------------------------------

export function instrucciones(tipo: Tipo, anio: number): string {
  const que = tipo === 'pelicula' ? 'una película' : 'una serie'
  const duraciones = tipo === 'pelicula' ? '"corta" (si pide algo corto) o "da_igual"' : '"miniserie", "capitulos_cortos" o "da_igual"'
  return [
    `Una pareja te dice qué le apetece ver: ${que}. Tradúcelo a filtros de búsqueda.`,
    'NO recomiendes títulos tú: solo traduce la petición. Contesta SOLO con un JSON con esta forma exacta:',
    '{"animos": [], "parecido_a": [], "desde": null, "hasta": null, "idioma": null, "duracion": "da_igual", "resumen": ""}',
    'Reglas:',
    '- "animos": de 0 a 3 de esta lista: "reir" (comedia), "emocionarnos" (drama), "romance", "tension" (thriller, misterio, crimen), "miedo" (terror), "accion" (acción, aventura), "fantasia" (ciencia ficción, fantasía), "aprender" (documental, historia), "animacion" (animación, para toda la familia).',
    '- "parecido_a": los títulos de películas o series que nombre como referencia («algo como Fleabag»), tal cual los escribe. Como mucho 3. Si no nombra ninguno, [].',
    `- "desde" y "hasta": años, si habla de una época («de los 90» → 1990 y 1999; «reciente» → desde ${anio - 3}). Si no, null.`,
    '- "idioma": código ISO 639-1 del idioma original si lo pide («coreana» → "ko", «española» → "es", «británica» → "en", «francesa» → "fr"). Si no, null.',
    `- "duracion": ${duraciones}.`,
    '- "resumen": una frase corta en español con lo que has entendido (como mucho 100 letras), sin títulos que no haya dicho.',
  ].join('\n')
}

export type Peticion = {
  animos: Animo[]
  parecidoA: string[]
  desde: number | null
  hasta: number | null
  idioma: string | null
  duracion: string
  resumen: string | null
}

// Lo que contesta la IA, comprobado: lo que no tenga sentido se ignora.
export function validarPeticion(datos: unknown, tipo: Tipo, anio: number): Peticion {
  const d = esObjeto(datos) ? datos : {}
  const animos = Array.isArray(d.animos)
    ? [...new Set(d.animos.filter((a): a is Animo => typeof a === 'string' && (ANIMOS as readonly string[]).includes(a)))].slice(0, 3)
    : []
  const parecidoA = Array.isArray(d.parecido_a)
    ? [...new Set(d.parecido_a.map((t) => texto(t, 80)).filter((t): t is string => t !== null))].slice(0, 3)
    : []
  const fechaValida = (x: unknown) => (typeof x === 'number' && Number.isInteger(x) && x >= 1900 && x <= anio + 1 ? x : null)
  let desde = fechaValida(d.desde)
  let hasta = fechaValida(d.hasta)
  if (desde !== null && hasta !== null && desde > hasta) [desde, hasta] = [hasta, desde]
  const idioma = typeof d.idioma === 'string' && /^[a-z]{2}$/.test(d.idioma) ? d.idioma : null
  const duracion = typeof d.duracion === 'string' && DURACIONES[tipo].includes(d.duracion) ? d.duracion : 'da_igual'
  return { animos, parecidoA, desde, hasta, idioma, duracion, resumen: texto(d.resumen, 140) }
}
