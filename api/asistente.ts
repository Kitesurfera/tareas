// El asistente del botón 🧠: lo que dices o escribes («recuérdame pagar el
// IBI el lunes», «ya he regado el ficus», «¿qué me toca hoy?») → acciones
// para revisar y preguntas. La IA gratuita (api/_lib/ia.ts) solo ENTIENDE:
// no conoce vuestras tareas ni contesta las preguntas. La app busca a qué
// tarea te refieres y calcula las respuestas con vuestros datos, en el
// móvil. Nada se guarda sin que la persona lo confirme.
//
// - Solo puede usarlo alguien con sesión y con hogar.
// - A la IA solo le llega lo que dices y los nombres de la gente, las
//   mascotas, las plantas y las categorías de planes del hogar.
// - Máximo de usos al día por hogar, compartido con «Repartir» de la bandeja.
// - En el registro nunca se apunta el texto, solo números.
import { ahoraEnEspana, supabaseServidor } from './_lib/avisos.js'
import { apuntarUsoCabeza, instruccionesAsistente, leerContexto, validarAsistente } from './_lib/cabeza.js'
import { faltaConfigurarLaIA, preguntarALaIA, respuestaDeError as error } from './_lib/ia.js'

const MAX_USOS_AL_DIA = 60
const MAX_LETRAS = 600

export async function POST(request: Request): Promise<Response> {
  // 1. ¿Quién eres y de qué hogar?
  const token = request.headers.get('authorization')?.replace(/^Bearer /, '')
  if (!token) return error('Tienes que entrar con tu cuenta.', 401)
  const supabase = supabaseServidor()
  const { data: usuario, error: errorUsuario } = await supabase.auth.getUser(token)
  if (errorUsuario || !usuario.user) return error('Tu sesión no es válida. Vuelve a entrar.', 401)
  const { data: miembro } = await supabase.from('miembros').select('hogar_id').eq('user_id', usuario.user.id).maybeSingle()
  if (!miembro) return error('Primero tienes que crear o unirte a un hogar.', 403)

  // 2. Lo que dices y los nombres del hogar.
  const cuerpo = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const dicho = typeof cuerpo.texto === 'string' ? cuerpo.texto.replace(/\s+/g, ' ').trim() : ''
  if (dicho.length < 2) return error('No te he oído bien. ¿Me lo repites?', 400)
  if (dicho.length > MAX_LETRAS) return error(`Es mucho de una vez (como mucho ${MAX_LETRAS} letras). Guárdalo en la bandeja y repártelo luego.`, 400)
  const contexto = leerContexto(cuerpo.contexto)
  if (!contexto) return error('Faltan datos del hogar. Recarga la app y prueba otra vez.', 400)

  // 3. Claves de Cloudflare y límite al día por hogar.
  const faltaAlgo = faltaConfigurarLaIA()
  if (faltaAlgo) return faltaAlgo
  const fueraDeLimite = await apuntarUsoCabeza(supabase, miembro.hogar_id, usuario.user.id, MAX_USOS_AL_DIA)
  if (fueraDeLimite) return fueraDeLimite

  // 4. Se lo pasamos a la IA y comprobamos lo que contesta.
  const hoy = ahoraEnEspana().dia
  const respuesta = await preguntarALaIA({
    etiqueta: 'Asistente',
    instrucciones: instruccionesAsistente(hoy, contexto),
    contenido: `Lo que dice: ${dicho}`,
    maxTokens: 1500,
    mensajes: { largo: 'Es mucho de una vez para la IA. Guárdalo en la bandeja y repártelo luego.' },
  })
  if ('error' in respuesta) return respuesta.error
  const { acciones, preguntas } = validarAsistente(respuesta.datos, dicho, hoy, contexto)
  console.log('Asistente', { letras: dicho.length, acciones: acciones.length, preguntas: preguntas.length })
  return Response.json({ hoy, acciones, preguntas })
}
