// «Dímelo con tus palabras»: recibe una tarea escrita o dictada («hay que
// renovar el seguro de la furgo en marzo»), se la pasa a la IA gratuita
// (api/_lib/ia.ts) y devuelve los datos para rellenar el formulario de
// nueva tarea. La app no guarda nada: la persona lo revisa y pulsa «Crear».
//
// - Solo puede usarlo alguien con sesión y con hogar.
// - Máximo de usos al día por hogar, para no gastar el cupo gratuito.
// - En el registro nunca se apunta el texto, solo números.
import { ahoraEnEspana, supabaseServidor } from './_lib/avisos.js'
import { faltaConfigurarLaIA, preguntarALaIA, respuestaDeError as error } from './_lib/ia.js'
import { instrucciones, validarTarea, type MascotaCorta, type Persona } from './_lib/tareaNatural.js'

const MAX_USOS_AL_DIA = 60
const MAX_CARACTERES = 400
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// La lista de personas o mascotas que manda la app (solo id y nombre).
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
  typeof x.id === 'string' && UUID.test(x.id) && typeof x.nombre === 'string' && x.nombre.trim() && x.nombre.length <= 60
    ? { id: x.id, nombre: x.nombre.trim() }
    : null

export async function POST(request: Request): Promise<Response> {
  // 1. ¿Quién eres? La app manda tu sesión; Supabase nos dice si es válida.
  const token = request.headers.get('authorization')?.replace(/^Bearer /, '')
  if (!token) return error('Tienes que entrar con tu cuenta.', 401)
  const supabase = supabaseServidor()
  const { data: usuario, error: errorUsuario } = await supabase.auth.getUser(token)
  if (errorUsuario || !usuario.user) return error('Tu sesión no es válida. Vuelve a entrar.', 401)

  // 2. ¿De qué hogar eres?
  const { data: miembro } = await supabase
    .from('miembros')
    .select('hogar_id')
    .eq('user_id', usuario.user.id)
    .maybeSingle()
  if (!miembro) return error('Primero tienes que crear o unirte a un hogar.', 403)

  // 3. El texto, y la gente y las mascotas del hogar (para entender nombres).
  let cuerpo: Record<string, unknown>
  try {
    cuerpo = (await request.json()) as Record<string, unknown>
  } catch {
    return error('No se ha recibido el texto.', 400)
  }
  const texto = typeof cuerpo.texto === 'string' ? cuerpo.texto.replace(/\s+/g, ' ').trim() : ''
  if (texto.length < 3) return error('Escribe o dicta qué hay que hacer.', 400)
  if (texto.length > MAX_CARACTERES) return error(`Como mucho ${MAX_CARACTERES} letras. Resúmelo un poco.`, 400)
  const personas = lista<Persona>(cuerpo.personas, 20, (x) => {
    const base = idYNombre(x)
    return base ? { ...base, yo: x.yo === true } : null
  })
  const mascotas = lista<MascotaCorta>(cuerpo.mascotas, 30, idYNombre)
  if (!personas || !mascotas) return error('Faltan datos del hogar. Recarga la app y prueba otra vez.', 400)

  // 4. Claves de Cloudflare y límite al día por hogar.
  const faltaAlgo = faltaConfigurarLaIA()
  if (faltaAlgo) return faltaAlgo
  const haceUnDia = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count, error: errorCuenta } = await supabase
    .from('usos_ia')
    .select('id', { count: 'exact', head: true })
    .eq('hogar_id', miembro.hogar_id)
    .eq('tipo', 'tarea')
    .gte('creado_en', haceUnDia)
  if (errorCuenta) {
    console.error('Tarea: no se pudo contar los usos', errorCuenta.code)
    return error('No se ha podido comprobar el límite de usos.', 500)
  }
  if ((count ?? 0) >= MAX_USOS_AL_DIA) {
    return error(`Ya habéis usado esto ${MAX_USOS_AL_DIA} veces en las últimas 24 horas. Rellena la tarea a mano o prueba mañana.`, 429)
  }
  // Se apunta antes de llamar a la IA: así cuentan también los intentos
  // fallidos. Si no se puede apuntar, no se sigue (sin límite no hay IA).
  const { error: errorApunte } = await supabase
    .from('usos_ia')
    .insert({ hogar_id: miembro.hogar_id, user_id: usuario.user.id, tipo: 'tarea' })
  if (errorApunte) {
    // Si todavía no se ha ejecutado el SQL de esta función, la tabla no existe.
    // (Contar en una tabla que no existe no da error: por eso se mira aquí.)
    const falta = errorApunte.code === '42P01' || errorApunte.code === 'PGRST205'
    console.error('Tarea: no se pudo apuntar el uso', errorApunte.code)
    return error(
      falta
        ? 'Falta ejecutar en Supabase el SQL de las tareas en lenguaje natural (usos_ia).'
        : 'No se ha podido apuntar el uso. Prueba otra vez.',
      500,
    )
  }

  // 5. Se lo pasamos a la IA.
  const hoy = ahoraEnEspana().dia
  const respuesta = await preguntarALaIA({
    etiqueta: 'Tarea',
    instrucciones: instrucciones(hoy, personas, mascotas),
    contenido: `Texto: «${texto}»`,
    maxTokens: 500,
  })
  if ('error' in respuesta) return respuesta.error

  // 6. Comprobado y con la fecha calculada con reglas fijas.
  const tarea = validarTarea(respuesta.datos, texto, hoy, personas, mascotas)
  console.log('Tarea entendida', { conFecha: tarea.fecha !== null, conResponsable: tarea.responsable !== null })
  return Response.json(tarea)
}
