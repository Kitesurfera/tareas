// «Probar aviso»: manda un aviso de prueba a los móviles de quien lo pide
// (y solo a los suyos).
import { enviar, supabaseServidor, type Movil } from './_lib/avisos.js'

export async function POST(request: Request): Promise<Response> {
  // La app manda tu sesión; con ella Supabase nos dice quién eres.
  const token = request.headers.get('authorization')?.replace(/^Bearer /, '')
  if (!token) return Response.json({ error: 'Tienes que entrar con tu cuenta.' }, { status: 401 })

  const supabase = supabaseServidor()
  const { data: usuario, error: errorUsuario } = await supabase.auth.getUser(token)
  if (errorUsuario || !usuario.user) {
    return Response.json({ error: 'Tu sesión no es válida. Vuelve a entrar.' }, { status: 401 })
  }

  const { data: moviles, error } = await supabase
    .from('avisos_push')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', usuario.user.id)
  if (error) return Response.json({ error: 'No se pudieron leer tus móviles.' }, { status: 500 })

  let enviados = 0
  for (const movil of (moviles ?? []) as Movil[]) {
    const resultado = await enviar(movil, {
      title: '¡Los avisos funcionan! 🎉',
      body: 'Cada mañana a las 8:00 te diremos lo que te toca.',
      url: '/',
      tag: 'prueba',
    })
    if (resultado === 'ok') enviados++
    if (resultado === 'borrar') await supabase.from('avisos_push').delete().eq('id', movil.id)
  }
  return Response.json({ enviados })
}
