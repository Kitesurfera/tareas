// El asistente del botón 🧠: lo que dices o escribes («recuérdame pagar el
// IBI el lunes», «ya he regado el ficus», «¿qué me toca hoy?») → acciones
// para revisar y preguntas. La IA gratuita (api/_lib/ia.ts) solo ENTIENDE:
// no conoce vuestras tareas ni contesta las preguntas. La app busca a qué
// tarea te refieres y calcula las respuestas con vuestros datos, en el
// móvil. Nada se guarda sin que la persona lo confirme.
//
//
// Con { modo: 'repartir', notas } hace «✨ Repartir con la IA» de la bandeja:
// propone dónde va cada nota (ver repartirLaBandeja, abajo). Van en la misma
// función porque el plan gratuito de Vercel solo deja 12 funciones.
//
// - Solo puede usarlo alguien con sesión y con hogar.
// - A la IA solo le llega lo que dices (o tus notas) y los nombres de la
//   gente, las mascotas, las plantas y las categorías de planes del hogar.
// - Máximo de usos al día por hogar, el mismo para el asistente y repartir.
// - En el registro nunca se apunta el texto, solo números.
import type { SupabaseClient } from '@supabase/supabase-js'
import { ahoraEnEspana, supabaseServidor } from './_lib/avisos.js'
import { apuntarUsoCabeza, esUuid, instrucciones, instruccionesAsistente, leerContexto, notasNumeradas, validarAsistente, validarReparto, type Nota } from './_lib/cabeza.js'
import { faltaConfigurarLaIA, preguntarALaIA, respuestaDeError as error } from './_lib/ia.js'

// Compartido entre el asistente y repartir: los dos cuentan como «cabeza».
const MAX_USOS_AL_DIA = 60
const MAX_LETRAS = 600
const MAX_NOTAS = 30
const MAX_LETRAS_NOTAS = 4000

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
  const cuerpo = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>
  if (cuerpo.modo === 'repartir') return repartirLaBandeja(cuerpo, supabase, miembro.hogar_id, usuario.user.id)
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

// «✨ Repartir con la IA» de la bandeja: recibe tus notas y la IA propone
// dónde va cada cosa (una tarea, la compra, un plan, algo para ver, un
// regalo, el peso de la mascota…). La app no guarda nada hasta que la
// persona lo revisa y lo confirma.
async function repartirLaBandeja(cuerpo: Record<string, unknown>, supabase: SupabaseClient, hogarId: string, userId: string): Promise<Response> {
  // Las notas y lo que hay en el hogar (para entender nombres).
  if (cuerpo.notas !== undefined && !Array.isArray(cuerpo.notas)) return error('Alguna nota no es válida. Recarga la app y prueba otra vez.', 400)
  if (Array.isArray(cuerpo.notas) && cuerpo.notas.length > MAX_NOTAS) return error(`Como mucho ${MAX_NOTAS} notas cada vez.`, 400)
  const notas: Nota[] = []
  for (const x of Array.isArray(cuerpo.notas) ? cuerpo.notas : []) {
    const n = x as Record<string, unknown>
    if (!n || !esUuid(n.id) || typeof n.texto !== 'string' || !n.texto.trim() || n.texto.length > 500) {
      return error('Alguna nota no es válida. Recarga la app y prueba otra vez.', 400)
    }
    notas.push({ id: n.id, texto: n.texto.trim() })
  }
  if (notas.length === 0) return error('Tu bandeja está vacía.', 400)
  if (notas.reduce((s, n) => s + n.texto.length, 0) > MAX_LETRAS_NOTAS) return error('Son demasiadas letras de una vez: reparte unas pocas notas primero.', 400)
  const contexto = leerContexto(cuerpo.contexto)
  if (!contexto) return error('Faltan datos del hogar. Recarga la app y prueba otra vez.', 400)

  // Claves de Cloudflare y límite al día por hogar (se apunta antes de
  // llamar a la IA; sin poder apuntarlo, no se llama).
  const faltaAlgo = faltaConfigurarLaIA()
  if (faltaAlgo) return faltaAlgo
  const fueraDeLimite = await apuntarUsoCabeza(supabase, hogarId, userId, MAX_USOS_AL_DIA)
  if (fueraDeLimite) return fueraDeLimite

  // Se lo pasamos a la IA y comprobamos lo que contesta.
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
