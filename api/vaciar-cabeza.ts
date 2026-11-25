// «🧠 Vaciar la cabeza»: recibe las notas de tu bandeja y le pide a la IA
// gratuita (api/_lib/ia.ts) que proponga dónde va cada cosa: una tarea, la
// compra, un plan, algo para ver, un regalo, el peso de la mascota… La app
// no guarda nada hasta que la persona lo revisa y lo confirma.
//
// - Solo puede usarlo alguien con sesión y con hogar.
// - Máximo de usos al día por hogar, para no gastar el cupo gratuito.
// - En el registro nunca se apunta el texto, solo números.
import { ahoraEnEspana, supabaseServidor } from './_lib/avisos.js'
import { faltaConfigurarLaIA, preguntarALaIA, respuestaDeError as error } from './_lib/ia.js'
import { instrucciones, notasNumeradas, validarReparto, type Contexto, type Nota } from './_lib/cabeza.js'

const MAX_USOS_AL_DIA = 30
const MAX_NOTAS = 30
const MAX_LETRAS = 4000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Una lista de { id, nombre } (y «yo» en las personas) que manda la app.
function lista<T>(valor: unknown, maximo: number, convertir: (x: Record<string, unknown>) => T | null): T[] | null {
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
  typeof x.id === 'string' && UUID.test(x.id) && typeof x.nombre === 'string' && x.nombre.trim() && x.nombre.length <= 80
    ? { id: x.id, nombre: x.nombre.trim() }
    : null

export async function POST(request: Request): Promise<Response> {
  // 1. ¿Quién eres y de qué hogar?
  const token = request.headers.get('authorization')?.replace(/^Bearer /, '')
  if (!token) return error('Tienes que entrar con tu cuenta.', 401)
  const supabase = supabaseServidor()
  const { data: usuario, error: errorUsuario } = await supabase.auth.getUser(token)
  if (errorUsuario || !usuario.user) return error('Tu sesión no es válida. Vuelve a entrar.', 401)
  const { data: miembro } = await supabase.from('miembros').select('hogar_id').eq('user_id', usuario.user.id).maybeSingle()
  if (!miembro) return error('Primero tienes que crear o unirte a un hogar.', 403)

  // 2. Las notas y lo que hay en el hogar (para entender nombres).
  let cuerpo: Record<string, unknown>
  try {
    cuerpo = (await request.json()) as Record<string, unknown>
  } catch {
    return error('No se han recibido las notas.', 400)
  }
  if (Array.isArray(cuerpo.notas) && cuerpo.notas.length > MAX_NOTAS) return error(`Como mucho ${MAX_NOTAS} notas cada vez.`, 400)
  const notas = lista<Nota>(cuerpo.notas, MAX_NOTAS, (x) =>
    typeof x.id === 'string' && UUID.test(x.id) && typeof x.texto === 'string' && x.texto.trim() && x.texto.length <= 500
      ? { id: x.id, texto: x.texto.trim() }
      : null,
  )
  if (!notas) return error('Alguna nota no es válida. Recarga la app y prueba otra vez.', 400)
  if (notas.length === 0) return error('Tu bandeja está vacía.', 400)
  if (notas.reduce((s, n) => s + n.texto.length, 0) > MAX_LETRAS) return error('Son demasiadas letras de una vez: reparte unas pocas notas primero.', 400)
  const c = (cuerpo.contexto ?? {}) as Record<string, unknown>
  const personas = lista(c.personas, 20, (x) => {
    const base = idYNombre(x)
    return base ? { ...base, yo: x.yo === true } : null
  })
  const contexto = {
    personas,
    mascotas: lista(c.mascotas, 30, idYNombre),
    plantas: lista(c.plantas, 60, idYNombre),
    gente: lista(c.gente, 100, idYNombre),
    categoriasPlan: lista(c.categoriasPlan, 60, idYNombre),
  }
  if (Object.values(contexto).some((v) => v === null)) return error('Faltan datos del hogar. Recarga la app y prueba otra vez.', 400)

  // 3. Claves de Cloudflare y límite al día por hogar (se apunta antes de
  //    llamar a la IA; sin poder apuntarlo, no se llama).
  const faltaAlgo = faltaConfigurarLaIA()
  if (faltaAlgo) return faltaAlgo
  const haceUnDia = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count, error: errorCuenta } = await supabase
    .from('usos_ia')
    .select('id', { count: 'exact', head: true })
    .eq('hogar_id', miembro.hogar_id)
    .eq('tipo', 'cabeza')
    .gte('creado_en', haceUnDia)
  if (errorCuenta) {
    console.error('Cabeza: no se pudo contar los usos', errorCuenta.code)
    return error('No se ha podido comprobar el límite de usos.', 500)
  }
  if ((count ?? 0) >= MAX_USOS_AL_DIA) {
    return error(`Ya habéis repartido ${MAX_USOS_AL_DIA} veces en las últimas 24 horas. Reparte a mano o prueba mañana.`, 429)
  }
  const { error: errorApunte } = await supabase.from('usos_ia').insert({ hogar_id: miembro.hogar_id, user_id: usuario.user.id, tipo: 'cabeza' })
  if (errorApunte) {
    console.error('Cabeza: no se pudo apuntar el uso', errorApunte.code)
    return error(
      errorApunte.code === '23514' || errorApunte.code === '42P01' || errorApunte.code === 'PGRST205'
        ? 'Falta ejecutar en Supabase el SQL de la bandeja (20261127100000_bandeja.sql).'
        : 'No se ha podido apuntar el uso. Prueba otra vez.',
      500,
    )
  }

  // 4. Se lo pasamos a la IA y comprobamos lo que contesta.
  const hoy = ahoraEnEspana().dia
  const respuesta = await preguntarALaIA({
    etiqueta: 'Cabeza',
    instrucciones: instrucciones(hoy, contexto as Contexto),
    contenido: `Notas:\n${notasNumeradas(notas)}`,
    maxTokens: 2000,
    mensajes: { largo: 'Son demasiadas cosas de una vez para la IA. Reparte unas pocas notas primero.' },
  })
  if ('error' in respuesta) return respuesta.error
  const propuestas = validarReparto(respuesta.datos, notas, hoy, contexto as Contexto)
  console.log('Cabeza repartida', { notas: notas.length, propuestas: propuestas.length, sinClasificar: propuestas.filter((p) => p.destino === 'sin_clasificar').length })
  return Response.json({ propuestas })
}
