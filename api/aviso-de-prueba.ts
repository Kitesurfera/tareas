// «Probar aviso»: manda un aviso de prueba a los móviles de quien lo pide
// (y solo a los suyos). Con { tipo: 'semana' }, le manda su resumen de la
// semana de verdad (el del domingo), aunque no haya nada o ya lo recibiera.
import { ahoraEnEspana, enviar, supabaseServidor, type Aviso, type Movil } from './_lib/avisos.js'
import { ajustesDe } from './_lib/horarios.js'
import { avisoDeLaSemana, lunesDe, sumarDias, type CuentasSemana } from './_lib/semana.js'

export async function POST(request: Request): Promise<Response> {
  // La app manda tu sesión; con ella Supabase nos dice quién eres.
  const token = request.headers.get('authorization')?.replace(/^Bearer /, '')
  if (!token) return Response.json({ error: 'Tienes que entrar con tu cuenta.' }, { status: 401 })

  const supabase = supabaseServidor()
  const { data: usuario, error: errorUsuario } = await supabase.auth.getUser(token)
  if (errorUsuario || !usuario.user) {
    return Response.json({ error: 'Tu sesión no es válida. Vuelve a entrar.' }, { status: 401 })
  }

  const cuerpo = (await request.json().catch(() => ({}))) as { tipo?: unknown }
  if (cuerpo.tipo === 'semana') return probarResumen(supabase, usuario.user.id)

  const { data: moviles, error } = await supabase
    .from('avisos_push')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', usuario.user.id)
  if (error) return Response.json({ error: 'No se pudieron leer tus móviles.' }, { status: 500 })

  // «a las 9:00», la hora que eligió (⏰ Avisos a tu medida).
  const { hora } = await ajustesDe(supabase, usuario.user.id)
  let enviados = 0
  for (const movil of (moviles ?? []) as Movil[]) {
    if (await enviarYLimpiar(supabase, movil, {
      title: '¡Los avisos funcionan! 🎉',
      body: `Cada día a las ${hora}:00 te diremos lo que te toca.`,
      url: '/',
      tag: 'prueba',
    })) enviados++
  }
  return Response.json({ enviados })
}

type Servidor = ReturnType<typeof supabaseServidor>

async function enviarYLimpiar(supabase: Servidor, movil: Movil, aviso: Aviso): Promise<boolean> {
  const resultado = await enviar(movil, aviso)
  if (resultado === 'borrar') await supabase.from('avisos_push').delete().eq('id', movil.id)
  return resultado === 'ok'
}

// Tu resumen de la semana que viene (o de esta, si aún no es domingo),
// solo a tus móviles. No cuenta como el del domingo: ese te llegará igual.
async function probarResumen(supabase: Servidor, userId: string): Promise<Response> {
  const lunes = lunesDe(sumarDias(ahoraEnEspana().dia, 1))
  const { data, error } = await supabase.rpc('resumen_de_la_semana', { lunes, solo_usuario: userId })
  if (error) {
    console.error('Resumen de prueba: no se pudo preparar', error.code)
    return Response.json({ error: 'No se ha podido preparar el resumen. ¿Falta ejecutar el SQL del resumen de la semana?' }, { status: 500 })
  }
  type Fila = CuentasSemana & { aviso_id: string; endpoint: string; p256dh: string; auth: string }
  let enviados = 0
  for (const fila of (data ?? []) as Fila[]) {
    const movil = { id: fila.aviso_id, endpoint: fila.endpoint, p256dh: fila.p256dh, auth: fila.auth }
    if (await enviarYLimpiar(supabase, movil, avisoDeLaSemana(fila, lunes))) enviados++
  }
  return Response.json({ enviados })
}
