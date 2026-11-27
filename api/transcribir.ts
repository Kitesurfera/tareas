// 🎤 Dictar en el iPhone. El dictado del propio iPhone deja de funcionar a
// partir de la segunda vez (un fallo de Apple aún sin arreglar), así que en
// el iPhone la app graba lo que dices y aquí se pasa a texto con la IA
// gratuita (Whisper, en Cloudflare). Devuelve { texto }.
//
// - Solo puede usarlo alguien con sesión y con hogar.
// - Solo acepta el audio que graba la app (WAV de 16 kHz, un canal, como
//   mucho un minuto).
// - Máximo de usos al día por hogar (tipo «voz»).
// - El audio no se guarda en ningún sitio; en el registro solo van números.
import { supabaseServidor } from './_lib/avisos.js'
import { faltaConfigurarLaIA, pasarATexto, respuestaDeError as error } from './_lib/ia.js'
import { apuntarUsoVoz, comprobarWav, limpiarTexto, MAX_BYTES, MAX_SEGUNDOS, MIN_SEGUNDOS } from './_lib/voz.js'

const MAX_USOS_AL_DIA = 150

export async function POST(request: Request): Promise<Response> {
  // 1. ¿Quién eres y de qué hogar?
  const token = request.headers.get('authorization')?.replace(/^Bearer /, '')
  if (!token) return error('Tienes que entrar con tu cuenta.', 401)
  const supabase = supabaseServidor()
  const { data: usuario, error: errorUsuario } = await supabase.auth.getUser(token)
  if (errorUsuario || !usuario.user) return error('Tu sesión no es válida. Vuelve a entrar.', 401)
  const { data: miembro } = await supabase.from('miembros').select('hogar_id').eq('user_id', usuario.user.id).maybeSingle()
  if (!miembro) return error('Primero tienes que crear o unirte a un hogar.', 403)

  // 2. El audio: que sea lo que graba la app y no demasiado.
  const largo = Number(request.headers.get('content-length') ?? 0)
  if (largo > MAX_BYTES) return error(`Es demasiado rato de una vez (como mucho ${MAX_SEGUNDOS} segundos). Dilo en dos veces.`, 413)
  const audio = new Uint8Array(await request.arrayBuffer().catch(() => new ArrayBuffer(0)))
  if (audio.length > MAX_BYTES) return error(`Es demasiado rato de una vez (como mucho ${MAX_SEGUNDOS} segundos). Dilo en dos veces.`, 413)
  const wav = comprobarWav(audio)
  if ('error' in wav) return error('No se ha podido leer el audio. Actualiza la app y prueba otra vez.', 400)
  if (wav.segundos < MIN_SEGUNDOS) return error('No te he oído. Pulsa 🎤 y habla cerca del móvil.', 400)

  // 3. Claves de Cloudflare y límite al día por hogar.
  const faltaAlgo = faltaConfigurarLaIA()
  if (faltaAlgo) return faltaAlgo
  const fueraDeLimite = await apuntarUsoVoz(supabase, miembro.hogar_id, usuario.user.id, MAX_USOS_AL_DIA)
  if (fueraDeLimite) return fueraDeLimite

  // 4. A texto.
  const respuesta = await pasarATexto(Buffer.from(audio).toString('base64'), 'Voz')
  if ('error' in respuesta) return respuesta.error
  const texto = limpiarTexto(respuesta.texto)
  console.log('Voz', { segundos: Math.round(wav.segundos * 10) / 10, letras: texto.length })
  return Response.json({ texto })
}
