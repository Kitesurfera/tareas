// «🍿 Para ver»: todo lo que la app le pide a TMDB (la base de datos de
// cine y series) pasa por aquí, para que la clave de TMDB no salga nunca
// del servidor. Qué se puede pedir («accion»):
//
// - plataformas: las plataformas de España (Netflix, Max, Prime Video…).
// - buscar: buscar una película o serie por su título.
// - detalle: los datos de una y dónde se puede ver en España.
// - sugerencias: con vuestras respuestas (qué os apetece, cuánto dura,
//   de qué época) o parecidas a lo que os gusta, y en vuestras plataformas.
// - palabras: lo pedís con palabras («algo como Fleabag pero más oscuro»):
//   la IA gratuita lo traduce a una búsqueda en TMDB (con límite al día).
//
// Solo puede usarlo alguien con sesión y con hogar. A TMDB solo se le manda
// lo que se busca; nunca quién sois. En el registro, solo números.
import { ahoraEnEspana, supabaseServidor } from './_lib/avisos.js'
import { faltaConfigurarLaIA, preguntarALaIA, respuestaDeError as error } from './_lib/ia.js'
import {
  ANIMOS,
  DURACIONES,
  EPOCAS,
  aResultado,
  generosDe,
  instrucciones,
  intercalar,
  listaDePlataformas,
  parametrosDescubrir,
  plataformasDe,
  resultadosDe,
  segmento,
  validarPeticion,
  type Animo,
  type Filtros,
  type Resultado,
  type Tipo,
} from './_lib/paraVer.js'

const TMDB = 'https://api.themoviedb.org/3'
const ESPERA_TMDB_MS = 10_000
const MAX_USOS_IA_AL_DIA = 30
const MAX_RESULTADOS = 12

// Un fallo de TMDB que hay que contar a la app tal cual (ya en español).
class FalloTmdb extends Error {
  constructor(readonly respuesta: Response) {
    super('TMDB')
  }
}

// La clave de TMDB: vale la «API Read Access Token» (larga) o la «API Key» (32 letras).
function claveTmdb(): string | null {
  return process.env.TMDB_API_TOKEN?.trim() || null
}

async function tmdb(ruta: string, parametros: Record<string, string> | URLSearchParams = {}): Promise<unknown> {
  const clave = claveTmdb()
  if (!clave) throw new FalloTmdb(error('Falta configurar TMDB (TMDB_API_TOKEN) en Vercel.', 500))
  const p = new URLSearchParams(parametros)
  const cabeceras: Record<string, string> = { accept: 'application/json' }
  if (/^[a-f0-9]{32}$/i.test(clave)) p.set('api_key', clave)
  else cabeceras.Authorization = `Bearer ${clave}`

  let respuesta: Response
  try {
    respuesta = await fetch(`${TMDB}${ruta}?${p}`, { headers: cabeceras, signal: AbortSignal.timeout(ESPERA_TMDB_MS) })
  } catch (e) {
    const tiempo = e instanceof Error && e.name === 'TimeoutError'
    console.error('Para ver:', tiempo ? 'TMDB tardó demasiado' : 'sin conexión con TMDB')
    throw new FalloTmdb(
      tiempo ? error('TMDB ha tardado demasiado. Prueba otra vez.', 504) : error('No se ha podido conectar con TMDB. Prueba otra vez.', 502),
    )
  }
  if (respuesta.status === 404) return null
  if (respuesta.ok) return respuesta.json().catch(() => null)
  console.error('Para ver: TMDB respondió', respuesta.status)
  if (respuesta.status === 401) throw new FalloTmdb(error('TMDB no acepta la clave. Revisa TMDB_API_TOKEN en Vercel.', 500))
  if (respuesta.status === 429) throw new FalloTmdb(error('TMDB está muy ocupado ahora mismo. Prueba en un momento.', 503))
  throw new FalloTmdb(error('TMDB no ha respondido bien. Prueba otra vez.', 502))
}

// Dónde se puede ver cada uno (una petición por título, todas a la vez).
// Si falla la de alguno, ese se queda sin plataformas.
function conPlataformas(lista: Resultado[]): Promise<Resultado[]> {
  return Promise.all(
    lista.map(async (r) => {
      try {
        return { ...r, plataformas: plataformasDe(await tmdb(`/${segmento(r.tipo)}/${r.tmdb_id}/watch/providers`)) }
      } catch {
        return r
      }
    }),
  )
}

// Las recomendaciones de TMDB para varios títulos, mezcladas.
async function recomendacionesDe(tipo: Tipo, ids: number[], fuera: Set<number>): Promise<Resultado[]> {
  const listas = await Promise.all(
    ids.map(async (id) => resultadosDe(await tmdb(`/${segmento(tipo)}/${id}/recommendations`, { language: 'es-ES', page: '1' }), tipo)),
  )
  return intercalar(listas, new Set([...fuera, ...ids]))
}

// Primero los que son del género que os apetece (sin quitar los demás).
function primeroLosDeGenero(lista: Resultado[], generos: number[]): Resultado[] {
  if (generos.length === 0) return lista
  const encaja = (r: Resultado) => r.generos.some((g) => generos.includes(g))
  return [...lista.filter(encaja), ...lista.filter((r) => !encaja(r))]
}

// Les pone las plataformas y, si son recomendaciones y queréis solo las
// vuestras, deja solo lo que está en ellas.
async function terminar(lista: Resultado[], filtros: Filtros, filtrarAqui: boolean): Promise<Resultado[]> {
  const filtrar = filtrarAqui && filtros.soloNuestras && filtros.plataformas.length > 0
  const conDatos = await conPlataformas(lista.slice(0, filtrar ? MAX_RESULTADOS * 2 : MAX_RESULTADOS))
  const final = filtrar ? conDatos.filter((r) => r.plataformas.some((p) => filtros.plataformas.includes(p.id))) : conDatos
  return final.slice(0, MAX_RESULTADOS)
}

// ---------------------------------------------------------------------
// Comprobar lo que manda la app
// ---------------------------------------------------------------------

type Cuerpo = Record<string, unknown>

const tipoDe = (c: Cuerpo): Tipo | null => (c.tipo === 'pelicula' || c.tipo === 'serie' ? c.tipo : null)

function enteros(valor: unknown, maximo: number): number[] | null {
  if (valor === undefined) return []
  if (!Array.isArray(valor) || valor.length > maximo) return null
  return valor.every((x) => typeof x === 'number' && Number.isInteger(x) && x > 0 && x < 100_000_000) ? [...new Set(valor as number[])] : null
}

function filtrosDe(c: Cuerpo, tipo: Tipo): Filtros | null {
  const animos = Array.isArray(c.animos) ? c.animos : []
  if (animos.length > ANIMOS.length || !animos.every((a) => (ANIMOS as readonly string[]).includes(a as string))) return null
  const duracion = c.duracion ?? 'da_igual'
  const epoca = c.epoca ?? 'da_igual'
  if (typeof duracion !== 'string' || !DURACIONES[tipo].includes(duracion)) return null
  if (typeof epoca !== 'string' || !(EPOCAS as readonly string[]).includes(epoca)) return null
  const plataformas = enteros(c.plataformas, 30)
  if (!plataformas) return null
  return {
    tipo,
    animos: [...new Set(animos as Animo[])],
    duracion,
    epoca: epoca as Filtros['epoca'],
    desde: null,
    hasta: null,
    idioma: null,
    plataformas,
    soloNuestras: c.soloNuestras === true,
  }
}

// ¿Quién eres y de qué hogar? (Como en el resto de funciones.)
async function quienEres(request: Request): Promise<{ userId: string; hogarId: string } | Response> {
  const token = request.headers.get('authorization')?.replace(/^Bearer /, '')
  if (!token) return error('Tienes que entrar con tu cuenta.', 401)
  const supabase = supabaseServidor()
  const { data: usuario, error: errorUsuario } = await supabase.auth.getUser(token)
  if (errorUsuario || !usuario.user) return error('Tu sesión no es válida. Vuelve a entrar.', 401)
  const { data: miembro } = await supabase.from('miembros').select('hogar_id').eq('user_id', usuario.user.id).maybeSingle()
  if (!miembro) return error('Primero tienes que crear o unirte a un hogar.', 403)
  return { userId: usuario.user.id, hogarId: miembro.hogar_id as string }
}

// Límite de usos de la IA al día por hogar (como en las tareas con palabras).
async function apuntarUsoDeLaIA(hogarId: string, userId: string): Promise<Response | null> {
  const supabase = supabaseServidor()
  const haceUnDia = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count, error: errorCuenta } = await supabase
    .from('usos_ia')
    .select('id', { count: 'exact', head: true })
    .eq('hogar_id', hogarId)
    .eq('tipo', 'ver')
    .gte('creado_en', haceUnDia)
  if (errorCuenta) {
    console.error('Para ver: no se pudo contar los usos', errorCuenta.code)
    return error('No se ha podido comprobar el límite de usos.', 500)
  }
  if ((count ?? 0) >= MAX_USOS_IA_AL_DIA) {
    return error(`Ya habéis pedido ${MAX_USOS_IA_AL_DIA} sugerencias con palabras en las últimas 24 horas. Usad las preguntas o probad mañana.`, 429)
  }
  const { error: errorApunte } = await supabase.from('usos_ia').insert({ hogar_id: hogarId, user_id: userId, tipo: 'ver' })
  if (errorApunte) {
    console.error('Para ver: no se pudo apuntar el uso', errorApunte.code)
    // 23514 = la tabla todavía no acepta «ver»: falta el SQL de Para ver.
    return error(
      errorApunte.code === '23514' || errorApunte.code === '42P01' || errorApunte.code === 'PGRST205'
        ? 'Falta ejecutar en Supabase el SQL de «Para ver».'
        : 'No se ha podido apuntar el uso. Prueba otra vez.',
      500,
    )
  }
  return null
}

// ---------------------------------------------------------------------
// La función
// ---------------------------------------------------------------------

export async function POST(request: Request): Promise<Response> {
  const quien = await quienEres(request)
  if (quien instanceof Response) return quien

  let cuerpo: Cuerpo
  try {
    cuerpo = (await request.json()) as Cuerpo
    if (!cuerpo || typeof cuerpo !== 'object') throw new Error()
  } catch {
    return error('No se ha recibido la petición.', 400)
  }
  if (!claveTmdb()) return error('Falta configurar TMDB (TMDB_API_TOKEN) en Vercel.', 500)

  try {
    const accion = cuerpo.accion

    if (accion === 'plataformas') {
      const [peliculas, series] = await Promise.all([
        tmdb('/watch/providers/movie', { language: 'es-ES', watch_region: 'ES' }),
        tmdb('/watch/providers/tv', { language: 'es-ES', watch_region: 'ES' }),
      ])
      return Response.json({ plataformas: listaDePlataformas(peliculas, series) })
    }

    const tipo = tipoDe(cuerpo)
    if (!tipo) return error('¿Película o serie?', 400)

    if (accion === 'buscar') {
      const texto = typeof cuerpo.texto === 'string' ? cuerpo.texto.replace(/\s+/g, ' ').trim() : ''
      if (texto.length < 2 || texto.length > 100) return error('Escribe el título (entre 2 y 100 letras).', 400)
      const json = await tmdb(`/search/${segmento(tipo)}`, { query: texto, language: 'es-ES', include_adult: 'false', page: '1' })
      const resultados = resultadosDe(json, tipo).slice(0, 8)
      console.log('Para ver: búsqueda', { resultados: resultados.length })
      return Response.json({ resultados })
    }

    if (accion === 'detalle') {
      const id = cuerpo.tmdb_id
      if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) return error('Falta cuál.', 400)
      const json = await tmdb(`/${segmento(tipo)}/${id}`, { language: 'es-ES', append_to_response: 'watch/providers' })
      const resultado = aResultado(json, tipo)
      if (!resultado) return error('No encontramos ese título en TMDB.', 404)
      const proveedores = json && typeof json === 'object' ? (json as Record<string, unknown>)['watch/providers'] : null
      return Response.json({ resultado: { ...resultado, plataformas: plataformasDe(proveedores) } })
    }

    const filtros = filtrosDe(cuerpo, tipo)
    const fuera = enteros(cuerpo.excluir, 1000)
    if (!filtros || !fuera) return error('La petición no es válida. Recarga la app y prueba otra vez.', 400)
    const hoy = ahoraEnEspana().dia

    if (accion === 'sugerencias') {
      const basadas = enteros(cuerpo.basadas_en, 5)
      const pagina = typeof cuerpo.pagina === 'number' && Number.isInteger(cuerpo.pagina) ? Math.min(5, Math.max(1, cuerpo.pagina)) : 1
      if (!basadas) return error('La petición no es válida.', 400)
      const sinRepetir = new Set(fuera)
      let lista: Resultado[]
      if (basadas.length > 0) {
        // Parecidas a lo que os gusta.
        lista = primeroLosDeGenero(await recomendacionesDe(tipo, basadas, sinRepetir), generosDe(tipo, filtros.animos))
      } else {
        lista = resultadosDe(await tmdb(`/discover/${segmento(tipo)}`, parametrosDescubrir(filtros, hoy, pagina)), tipo).filter(
          (r) => !sinRepetir.has(r.tmdb_id),
        )
      }
      const resultados = await terminar(lista, filtros, basadas.length > 0)
      console.log('Para ver: sugerencias', { tipo, gustos: basadas.length > 0, resultados: resultados.length })
      return Response.json({ resultados })
    }

    if (accion === 'palabras') {
      const texto = typeof cuerpo.texto === 'string' ? cuerpo.texto.replace(/\s+/g, ' ').trim() : ''
      if (texto.length < 3) return error('Escribe qué os apetece ver.', 400)
      if (texto.length > 300) return error('Como mucho 300 letras. Resúmelo un poco.', 400)
      const faltaIA = faltaConfigurarLaIA()
      if (faltaIA) return faltaIA
      const limite = await apuntarUsoDeLaIA(quien.hogarId, quien.userId)
      if (limite) return limite

      const anio = Number(hoy.slice(0, 4))
      const respuesta = await preguntarALaIA({
        etiqueta: 'Para ver',
        instrucciones: instrucciones(tipo, anio),
        contenido: `Petición: «${texto}»`,
        maxTokens: 300,
      })
      if ('error' in respuesta) return respuesta.error
      const peticion = validarPeticion(respuesta.datos, tipo, anio)
      const conPeticion: Filtros = {
        ...filtros,
        animos: peticion.animos,
        duracion: peticion.duracion,
        epoca: 'da_igual',
        desde: peticion.desde,
        hasta: peticion.hasta,
        idioma: peticion.idioma,
      }

      // Si nombra títulos («como Fleabag»), se buscan y se piden sus parecidos.
      const referencias: Resultado[] = []
      for (const titulo of peticion.parecidoA) {
        const encontrado = resultadosDe(await tmdb(`/search/${segmento(tipo)}`, { query: titulo, language: 'es-ES', include_adult: 'false' }), tipo)[0]
        if (encontrado) referencias.push(encontrado)
      }
      let lista: Resultado[] = []
      if (referencias.length > 0) {
        lista = primeroLosDeGenero(
          await recomendacionesDe(
            tipo,
            referencias.map((r) => r.tmdb_id),
            new Set(fuera),
          ),
          generosDe(tipo, peticion.animos),
        )
      }
      const sonParecidas = lista.length > 0
      // Si no nombra ninguno (o no se encuentran), con los filtros.
      if (!sonParecidas) {
        lista = resultadosDe(await tmdb(`/discover/${segmento(tipo)}`, parametrosDescubrir(conPeticion, hoy)), tipo).filter(
          (r) => !fuera.includes(r.tmdb_id),
        )
      }
      const resultados = await terminar(lista, conPeticion, sonParecidas)
      console.log('Para ver: con palabras', { tipo, referencias: referencias.length, resultados: resultados.length })
      return Response.json({
        resultados,
        entendido: { resumen: peticion.resumen, parecidoA: referencias.map((r) => r.titulo), animos: peticion.animos },
      })
    }

    return error('No sé qué hacer con eso.', 400)
  } catch (e) {
    if (e instanceof FalloTmdb) return e.respuesta
    console.error('Para ver: error inesperado', e instanceof Error ? e.name : typeof e)
    return error('Algo ha fallado. Prueba otra vez.', 500)
  }
}
