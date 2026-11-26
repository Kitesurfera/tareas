// Resumen de la semana: cada domingo por la tarde, un aviso a cada móvil
// con lo que viene de lunes a domingo (tareas, planes, renovaciones y
// viajes). Al tocarlo se abre la pantalla «📆 La semana».
//
// Como el aviso diario: Vercel (plan gratuito) programa en hora universal,
// puede llamar en cualquier momento de esa hora y no reintenta. Por eso hay
// tres horarios (18, 19 y 20 UTC, ver «crons» en vercel.json) y se envía
// cuando en España son las 20 o las 21 del domingo: en verano y en
// invierno hay un primer intento sobre las 20 y otro sobre las 21. Nadie lo
// recibe dos veces (avisos_push.ultimo_resumen) y solo avisa si hay algo.
// Quien lo ha quitado o tiene los avisos en pausa (⏰ Avisos a tu medida)
// no lo recibe.
import { ahoraEnEspana, enviar, supabaseServidor } from './_lib/avisos.js'
import { ajustesPorMovil, tocaResumen } from './_lib/horarios.js'
import { avisoDeLaSemana, diaDeLaSemana, hayAlgo, sumarDias, type CuentasSemana } from './_lib/semana.js'

const HORAS_DEL_RESUMEN = [20, 21]

type Fila = CuentasSemana & { aviso_id: string; endpoint: string; p256dh: string; auth: string }

export async function GET(request: Request): Promise<Response> {
  // Solo Vercel conoce CRON_SECRET: así nadie de fuera puede disparar avisos.
  const secreto = process.env.CRON_SECRET
  if (!secreto || request.headers.get('authorization') !== `Bearer ${secreto}`) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { dia, hora } = ahoraEnEspana()
  if (diaDeLaSemana(dia) !== 0 || !HORAS_DEL_RESUMEN.includes(hora)) {
    console.log('Resumen de la semana: fuera de hora', { horaEnEspana: hora })
    return Response.json({ enviados: 0, motivo: 'El resumen sale los domingos entre las 20 y las 21 (hora de España)' })
  }

  // La semana que empieza mañana.
  const lunes = sumarDias(dia, 1)
  const supabase = supabaseServidor()
  const { data, error } = await supabase.rpc('resumen_de_la_semana', { lunes })
  if (error) {
    console.error('Error al preparar el resumen de la semana', error.code)
    return Response.json({ error: 'No se pudo preparar el resumen' }, { status: 500 })
  }

  let porMovil
  try {
    porMovil = await ajustesPorMovil(supabase)
  } catch {
    console.error('Resumen de la semana: no se pudieron leer los móviles')
    return Response.json({ error: 'No se pudo preparar el resumen' }, { status: 500 })
  }

  let enviados = 0
  let sinResumen = 0
  let tranquilos = 0
  let borrados = 0
  let fallidos = 0
  for (const fila of (data ?? []) as Fila[]) {
    // Quien no lo quiere (o está en pausa), no.
    const ajustes = porMovil.get(fila.aviso_id)
    if (ajustes && !tocaResumen(ajustes, dia)) {
      sinResumen++
      continue
    }
    // Si no hay nada esa semana, no se molesta a nadie.
    if (!hayAlgo(fila)) {
      tranquilos++
      continue
    }
    const movil = { id: fila.aviso_id, endpoint: fila.endpoint, p256dh: fila.p256dh, auth: fila.auth }
    const resultado = await enviar(movil, avisoDeLaSemana(fila, lunes))
    if (resultado === 'ok') {
      enviados++
      await supabase.from('avisos_push').update({ ultimo_resumen: lunes }).eq('id', fila.aviso_id)
    } else if (resultado === 'borrar') {
      borrados++
      await supabase.from('avisos_push').delete().eq('id', fila.aviso_id)
    } else {
      // No se apunta: en la segunda oportunidad se vuelve a intentar.
      fallidos++
    }
  }

  // En el registro solo números, nunca datos de nadie.
  console.log('Resumen de la semana', { horaEnEspana: hora, enviados, sinResumen, tranquilos, borrados, fallidos })
  return Response.json({ lunes, enviados, sinResumen, tranquilos, borrados, fallidos })
}
