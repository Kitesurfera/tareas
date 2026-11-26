// «🩺 Comprobar el aviso diario» (en Ajustes): le dice a quien lo pide si
// el servidor está listo para mandar el aviso diario, cuándo le llegó el
// último, a qué hora le toca (⏰ Avisos a tu medida) y si hoy tiene algo
// pendiente (si no hay nada, no se manda aviso).
// Solo con sesión, y solo con SUS datos: nunca los de otra persona.
import { ahoraEnEspana, supabaseServidor } from './_lib/avisos.js'
import { ajustesDe } from './_lib/horarios.js'

export async function POST(request: Request): Promise<Response> {
  const token = request.headers.get('authorization')?.replace(/^Bearer /, '')
  if (!token) return Response.json({ error: 'Tienes que entrar con tu cuenta.' }, { status: 401 })
  const supabase = supabaseServidor()
  const { data: usuario, error: errorUsuario } = await supabase.auth.getUser(token)
  if (errorUsuario || !usuario.user) {
    return Response.json({ error: 'Tu sesión no es válida. Vuelve a entrar.' }, { status: 401 })
  }

  const { dia, hora } = ahoraEnEspana()
  const { data: moviles, error } = await supabase
    .from('avisos_push')
    .select('id, ultimo_envio')
    .eq('user_id', usuario.user.id)
  if (error) return Response.json({ error: 'No se pudieron leer tus móviles.' }, { status: 500 })
  const lista = (moviles ?? []) as { id: string; ultimo_envio: string | null }[]
  const ultimoAviso = lista.reduce<string | null>((max, m) => (m.ultimo_envio && (!max || m.ultimo_envio > max) ? m.ultimo_envio : max), null)

  // Lo que el aviso de hoy le mandaría (con las mismas reglas: viajes, lo
  // suyo y lo que no es de nadie…). Si ya se lo mandó hoy, no sale aquí.
  const { data: filas, error: errorHoy } = await supabase.rpc('recordatorios_del_dia', { dia })
  const ajustes = await ajustesDe(supabase, usuario.user.id)
  const mias = ((filas ?? []) as { aviso_id: string; total: number }[]).filter((f) => lista.some((m) => m.id === f.aviso_id))

  return Response.json({
    // ¿Puede Vercel lanzar el aviso diario? (Sin CRON_SECRET, se rechaza siempre.)
    claveDelServidor: Boolean(process.env.CRON_SECRET),
    // «production» en la app de verdad; «preview» en los enlaces de prueba.
    entorno: process.env.VERCEL_ENV ?? 'desconocido',
    moviles: lista.length,
    hoy: dia,
    horaEnEspana: hora,
    ultimoAviso,
    // Lo que ha elegido (o lo de siempre).
    ajustes,
    // null = no se ha podido calcular.
    pendientesHoy: errorHoy ? null : mias.reduce((max, f) => Math.max(max, f.total), 0),
  })
}
