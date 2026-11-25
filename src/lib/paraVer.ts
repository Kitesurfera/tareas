import { useEffect, useState } from 'react'
import { mensajeDeError } from './errores'
import { supabase } from './supabase'
import type { Miembro } from './tipos'

// «🍿 Para ver»: vuestra lista de películas y series (tablas para_ver,
// ganas_para_ver y ajustes_ver), el sorteo «¿Qué vemos?» y lo que se le
// pide al servidor (api/para-ver, que habla con TMDB).

export type TipoVer = 'pelicula' | 'serie'
export type Nivel = 0 | 1 | 2 | 3

export type ParaVer = {
  id: string
  hogar_id: string
  tipo: TipoVer
  titulo: string
  anio: number | null
  tmdb_id: number | null
  poster: string | null
  sinopsis: string | null
  plataformas: string[]
  notas: string | null
  visto: boolean
  visto_en: string | null
  nos_gusto: boolean | null
  creado_en: string
}

export type Ganas = { para_ver_id: string; miembro_id: string; nivel: Nivel }

export type PlataformaTmdb = { id: number; nombre: string; logo: string | null }

// Una película o serie tal como la devuelve el servidor (de TMDB).
export type ResultadoTmdb = {
  tmdb_id: number
  tipo: TipoVer
  titulo: string
  titulo_original: string | null
  anio: number | null
  poster: string | null
  sinopsis: string | null
  puntuacion: number | null
  generos: number[]
  plataformas: PlataformaTmdb[]
}

export const TIPOS: Record<TipoVer, { texto: string; una: string; dibujo: string; vista: string }> = {
  pelicula: { texto: 'Películas', una: 'película', dibujo: '🎬', vista: 'Vista' },
  serie: { texto: 'Series', una: 'serie', dibujo: '📺', vista: 'Terminada' },
}

export const NIVELES: { valor: Nivel; dibujo: string; texto: string }[] = [
  { valor: 0, dibujo: '😴', texto: 'Nada' },
  { valor: 1, dibujo: '🙂', texto: 'Algo' },
  { valor: 2, dibujo: '😃', texto: 'Bastante' },
  { valor: 3, dibujo: '🤩', texto: '¡Muchísimas!' },
]

// Las preguntas de las sugerencias (las mismas claves que entiende el servidor).
export const ANIMOS: { valor: string; texto: string }[] = [
  { valor: 'reir', texto: '😂 Reír' },
  { valor: 'emocionarnos', texto: '🥲 Emocionarnos' },
  { valor: 'romance', texto: '💞 Romance' },
  { valor: 'tension', texto: '😬 Tensión' },
  { valor: 'miedo', texto: '👻 Miedo' },
  { valor: 'accion', texto: '💥 Acción' },
  { valor: 'fantasia', texto: '🚀 Fantasía' },
  { valor: 'aprender', texto: '🧠 Aprender' },
  { valor: 'animacion', texto: '🧸 Animación' },
]
export const DURACIONES: Record<TipoVer, { valor: string; texto: string }[]> = {
  pelicula: [
    { valor: 'corta', texto: '⏱️ Corta (menos de 1 h 40)' },
    { valor: 'normal', texto: '🍿 Normal' },
    { valor: 'da_igual', texto: '🤷 Da igual' },
  ],
  serie: [
    { valor: 'miniserie', texto: '🧩 Miniserie' },
    { valor: 'capitulos_cortos', texto: '⚡ Capítulos cortos' },
    { valor: 'da_igual', texto: '🤷 Da igual' },
  ],
}
export const EPOCAS: { valor: string; texto: string }[] = [
  { valor: 'nueva', texto: '🆕 Lo más nuevo' },
  { valor: 'reciente', texto: '📅 Desde 2010' },
  { valor: 'clasica', texto: '📼 Clásicos' },
  { valor: 'da_igual', texto: '🤷 Da igual' },
]

// La carátula (o el logo de una plataforma) en el tamaño que haga falta.
export const imagenTmdb = (ruta: string | null, ancho: 'w92' | 'w185' | 'w342' = 'w185') =>
  ruta ? `https://image.tmdb.org/t/p/${ancho}${ruta}` : null

export const ganasDe = (itemId: string, miembroId: string | undefined, ganas: Ganas[]): Nivel | null =>
  ganas.find((g) => g.para_ver_id === itemId && g.miembro_id === miembroId)?.nivel ?? null

const sumaDeGanas = (itemId: string, ganas: Ganas[]) =>
  ganas.filter((g) => g.para_ver_id === itemId).reduce((suma, g) => suma + g.nivel, 0)

// Lo pendiente primero (lo que más ganas da, arriba); luego lo visto (lo último, arriba).
export function ordenar(lista: ParaVer[], ganas: Ganas[]): ParaVer[] {
  return [...lista].sort((a, b) => {
    if (a.visto !== b.visto) return a.visto ? 1 : -1
    if (a.visto) return (b.visto_en ?? '').localeCompare(a.visto_en ?? '') || b.creado_en.localeCompare(a.creado_en)
    return sumaDeGanas(b.id, ganas) - sumaDeGanas(a.id, ganas) || b.creado_en.localeCompare(a.creado_en)
  })
}

// ¿Tiene ganas (bastantes o muchísimas) todo el hogar?
export const todasConGanas = (itemId: string, miembros: Miembro[], ganas: Ganas[]) =>
  miembros.length > 0 && miembros.every((m) => (ganasDe(itemId, m.id, ganas) ?? 0) >= 2)

export type FiltrosSorteo = { todasConGanas: boolean; plataforma: string | null }

// Entre qué se sortea: lo que no habéis visto, con los filtros.
export function candidatos(lista: ParaVer[], tipo: TipoVer, filtros: FiltrosSorteo, miembros: Miembro[], ganas: Ganas[]): ParaVer[] {
  return lista.filter(
    (p) =>
      p.tipo === tipo &&
      !p.visto &&
      (!filtros.todasConGanas || todasConGanas(p.id, miembros, ganas)) &&
      (!filtros.plataforma || p.plataformas.includes(filtros.plataforma)),
  )
}

// «🎲 ¿Qué vemos?»: una al azar entre las candidatas. Cuantas más ganas,
// más fácil que salga (las ganas cuentan al cuadrado: 🤩🤩 sale mucho más
// que 🙂🙂). Si se puede, no repite la que acaba de salir.
export function elegirQueVer(opciones: ParaVer[], ganas: Ganas[], anterior: string | null, azar: () => number = Math.random): ParaVer | null {
  let lista = opciones
  if (lista.length > 1 && anterior) lista = lista.filter((p) => p.id !== anterior)
  if (lista.length === 0) return null
  const pesos = lista.map((p) => 1 + ganas.filter((g) => g.para_ver_id === p.id).reduce((s, g) => s + g.nivel * g.nivel, 0))
  let tirada = azar() * pesos.reduce((a, b) => a + b, 0)
  for (let i = 0; i < lista.length; i++) {
    tirada -= pesos[i]
    if (tirada < 0) return lista[i]
  }
  return lista[lista.length - 1]
}

// En qué basarse para «parecidas a lo que os gusta»: lo que visteis y os
// gustó y lo que más ganas os da (solo lo que viene de TMDB). Como mucho 5.
export function basesDeGustos(lista: ParaVer[], tipo: TipoVer, ganas: Ganas[]): ParaVer[] {
  const puntos = (p: ParaVer) => (p.visto ? (p.nos_gusto ? 10 : -1) : sumaDeGanas(p.id, ganas))
  return lista
    .filter((p) => p.tipo === tipo && p.tmdb_id !== null && puntos(p) >= 4)
    .sort((a, b) => puntos(b) - puntos(a))
    .slice(0, 5)
}

export type DatosParaVer = { lista: ParaVer[]; ganas: Ganas[]; plataformas: number[] }

// Vuestra lista, las ganas y vuestras plataformas. null = cargando.
export function useParaVer() {
  const [datos, setDatos] = useState<DatosParaVer | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [recarga, setRecarga] = useState(0)

  useEffect(() => {
    if (!supabase) return
    let vigente = true
    // Gracias a RLS, solo llega lo de tu hogar.
    Promise.all([
      supabase.from('para_ver').select('*').order('creado_en', { ascending: false }),
      supabase.from('ganas_para_ver').select('para_ver_id, miembro_id, nivel'),
      supabase.from('ajustes_ver').select('plataformas').maybeSingle(),
    ]).then(([lista, ganas, ajustes]) => {
      if (!vigente) return
      const fallo = lista.error ?? ganas.error ?? ajustes.error
      if (fallo) {
        // Si todavía no se ha ejecutado el SQL, la tabla no existe.
        const falta = fallo.code === '42P01' || fallo.code === 'PGRST205'
        return setError(falta ? 'Falta ejecutar en Supabase el SQL de «Para ver» (20261125100000_para_ver.sql).' : mensajeDeError(fallo))
      }
      setError(null)
      setDatos({
        lista: lista.data as ParaVer[],
        ganas: ganas.data as Ganas[],
        plataformas: (ajustes.data?.plataformas as number[] | undefined) ?? [],
      })
    })
    return () => {
      vigente = false
    }
  }, [recarga])

  return { datos, error, recargar: () => setRecarga((n) => n + 1) }
}

// ---------------------------------------------------------------------
// Cambios (devuelven un mensaje de error o null)
// ---------------------------------------------------------------------

async function hacer(consulta: PromiseLike<{ error: { message?: string; code?: string } | null }>): Promise<string | null> {
  const { error } = await consulta
  if (!error) return null
  if (error.code === '23505') return 'Ya está en vuestra lista.'
  return mensajeDeError(error)
}

// Tus ganas (siempre las tuyas: la base de datos mira quién eres). null = quitarlas.
export function marcarGanas(itemId: string, nivel: Nivel | null): Promise<string | null> {
  if (!supabase) return Promise.resolve('Sin conexión.')
  return hacer(supabase.rpc('marcar_ganas', { para_ver_id: itemId, nivel }))
}

export function cambiarParaVer(itemId: string, cambios: Partial<Pick<ParaVer, 'visto' | 'visto_en' | 'nos_gusto' | 'plataformas' | 'notas'>>) {
  if (!supabase) return Promise.resolve('Sin conexión.')
  return hacer(supabase.from('para_ver').update(cambios).eq('id', itemId))
}

export function quitarParaVer(itemId: string): Promise<string | null> {
  if (!supabase) return Promise.resolve('Sin conexión.')
  return hacer(supabase.from('para_ver').delete().eq('id', itemId))
}

export type NuevoParaVer = Pick<ParaVer, 'tipo' | 'titulo' | 'anio' | 'tmdb_id' | 'poster' | 'sinopsis' | 'plataformas' | 'notas'>

// Añadir a la lista. Devuelve el id nuevo, o el error.
export async function anadirParaVer(hogarId: string, nuevo: NuevoParaVer): Promise<{ id: string } | { error: string }> {
  if (!supabase) return { error: 'Sin conexión.' }
  const { data, error } = await supabase
    .from('para_ver')
    .insert({ hogar_id: hogarId, ...nuevo })
    .select('id')
    .single()
  if (error) return { error: error.code === '23505' ? 'Ya está en vuestra lista.' : mensajeDeError(error) }
  return { id: (data as { id: string }).id }
}

// Lo que viene de TMDB, listo para guardar en la lista.
export const desdeTmdb = (r: ResultadoTmdb): NuevoParaVer => ({
  tipo: r.tipo,
  titulo: r.titulo,
  anio: r.anio,
  tmdb_id: r.tmdb_id,
  poster: r.poster,
  sinopsis: r.sinopsis,
  plataformas: r.plataformas.map((p) => p.nombre).slice(0, 12),
  notas: null,
})

export function guardarPlataformas(hogarId: string, plataformas: number[]): Promise<string | null> {
  if (!supabase) return Promise.resolve('Sin conexión.')
  return hacer(supabase.from('ajustes_ver').upsert({ hogar_id: hogarId, plataformas }, { onConflict: 'hogar_id' }))
}

// ---------------------------------------------------------------------
// El servidor (TMDB y la IA)
// ---------------------------------------------------------------------

export async function pedirAlServidor<T>(cuerpo: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('Sin conexión.')
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Tienes que entrar con tu cuenta.')
  let respuesta: Response
  try {
    respuesta = await fetch('/api/para-ver', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    })
  } catch {
    throw new Error('Sin conexión. Prueba otra vez.')
  }
  const datos = (await respuesta.json().catch(() => null)) as (T & { error?: string }) | null
  if (!respuesta.ok || !datos) throw new Error(datos?.error ?? 'Algo ha fallado. Prueba otra vez.')
  return datos
}

// Las plataformas de España (se piden una vez por visita).
let plataformasGuardadas: Promise<PlataformaTmdb[]> | null = null
export function plataformasDeEspana(): Promise<PlataformaTmdb[]> {
  plataformasGuardadas ??= pedirAlServidor<{ plataformas: PlataformaTmdb[] }>({ accion: 'plataformas' })
    .then((d) => d.plataformas)
    .catch((e: unknown) => {
      plataformasGuardadas = null
      throw e
    })
  return plataformasGuardadas
}

// Los nombres de vuestras plataformas (para resaltarlas). Si TMDB no está
// configurado todavía, ninguna.
export function useNombresDeNuestrasPlataformas(ids: number[]): string[] {
  const [nombres, setNombres] = useState<string[]>([])
  const clave = ids.join(',')
  useEffect(() => {
    if (!clave) return
    let vigente = true
    const elegidas = clave.split(',').map(Number)
    plataformasDeEspana()
      .then((todas) => vigente && setNombres(todas.filter((p) => elegidas.includes(p.id)).map((p) => p.nombre)))
      .catch(() => undefined)
    return () => {
      vigente = false
    }
  }, [clave])
  return clave ? nombres : []
}

// La pestaña elegida (películas o series), recordada en este móvil.
const CLAVE_TIPO = 'tareas.ver.tipo'
export function tipoRecordado(): TipoVer {
  try {
    return localStorage.getItem(CLAVE_TIPO) === 'serie' ? 'serie' : 'pelicula'
  } catch {
    return 'pelicula'
  }
}
export function recordarTipo(tipo: TipoVer) {
  try {
    localStorage.setItem(CLAVE_TIPO, tipo)
  } catch {
    // Sin almacenamiento (modo privado): no pasa nada.
  }
}
