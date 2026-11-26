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
import { apuntarUsoCabeza, esUuid, instrucciones, leerContexto, notasNumeradas, validarReparto, type Nota } from './_lib/cabeza.js'

// Compartido con el asistente (api/asistente.ts): los dos cuentan como «cabeza».
const MAX_USOS_AL_DIA = 60
const MAX_NOTAS = 30
const MAX_LETRAS = 4000

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
  const notas: Nota[] = []
  for (const x of Array.isArray(cuerpo.notas) ? cuerpo.notas : []) {
    const n = x as Record<string, unknown>
    if (!n || !esUuid(n.id) || typeof n.texto !== 'string' || !n.texto.trim() || n.texto.length > 500) {
      return error('Alguna nota no es válida. Recarga la app y prueba otra vez.', 400)
    }
    notas.push({ id: n.id, texto: n.texto.trim() })
  }
  if (cuerpo.notas !== undefined && !Array.isArray(cuerpo.notas)) return error('Alguna nota no es válida. Recarga la app y prueba otra vez.', 400)
  if (notas.length === 0) return error('Tu bandeja está vacía.', 400)
  if (notas.reduce((s, n) => s + n.texto.length, 0) > MAX_LETRAS) return error('Son demasiadas letras de una vez: reparte unas pocas notas primero.', 400)
  const contexto = leerContexto(cuerpo.contexto)
  if (!contexto) return error('Faltan datos del hogar. Recarga la app y prueba otra vez.', 400)

  // 3. Claves de Cloudflare y límite al día por hogar (se apunta antes de
  //    llamar a la IA; sin poder apuntarlo, no se llama).
  const faltaAlgo = faltaConfigurarLaIA()
  if (faltaAlgo) return faltaAlgo
  const fueraDeLimite = await apuntarUsoCabeza(supabase, miembro.hogar_id, usuario.user.id, MAX_USOS_AL_DIA)
  if (fueraDeLimite) return fueraDeLimite

  // 4. Se lo pasamos a la IA y comprobamos lo que contesta.
  const hoy = ahoraEnEspana().dia
  const respuesta = await preguntarALaIA({
    etiqueta: 'Cabeza',
    instrucciones: instrucciones(hoy, contexto),
    contenido: `Notas:\n${notasNumeradas(notas)}`,
    maxTokens: 2000,
    mensajes: { largo: 'Son demasiadas cosas de una vez para la IA. Reparte unas pocas notas primero.' },
  })
  if ('error' in respuesta) return respuesta.error
  const propuestas = validarReparto(respuesta.datos, notas, hoy, contexto)
  console.log('Cabeza repartida', { notas: notas.length, propuestas: propuestas.length, sinClasificar: propuestas.filter((p) => p.destino === 'sin_clasificar').length })
  return Response.json({ propuestas })
}
