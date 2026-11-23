// Aviso diario: Vercel llama a esta función cada mañana (ver «crons» en
// vercel.json) y manda a cada móvil lo que le toca hoy o va atrasado.
//
// Vercel (plan gratuito) programa en hora universal, puede llamar en
// cualquier momento de esa hora y no reintenta si algo falla. Por eso hay
// tres horarios (6, 7 y 8 UTC) y se envía cuando en España son las 8 o las
// 9: así, en verano y en invierno, siempre hay un primer intento sobre las
// 8 y una segunda oportunidad sobre las 9. Nadie recibe el aviso dos veces:
// recordatorios_del_dia salta los móviles que ya lo recibieron ese día.
import { ahoraEnEspana, enviar, supabaseServidor, textoResumen } from './_lib/avisos.js'

const HORAS_DEL_AVISO = [8, 9]

export async function GET(request: Request): Promise<Response> {
  // Solo Vercel conoce CRON_SECRET: así nadie de fuera puede disparar avisos.
  const secreto = process.env.CRON_SECRET
  if (!secreto || request.headers.get('authorization') !== `Bearer ${secreto}`) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  // Vercel programa en hora universal; hay dos intentos (verano e invierno)
  // y solo se envía en el que cae a las 8 en España.
  const { dia, hora } = ahoraEnEspana()
  if (!HORAS_DEL_AVISO.includes(hora)) {
    console.log('Aviso diario: fuera de hora', { horaEnEspana: hora })
    return Response.json({ enviados: 0, motivo: `En España son las ${hora}: el aviso sale entre las 8 y las 9` })
  }

  const supabase = supabaseServidor()
  const { data, error } = await supabase.rpc('recordatorios_del_dia', { dia })
  if (error) {
    console.error('Error al preparar los recordatorios', error.message)
    return Response.json({ error: 'No se pudieron preparar los recordatorios' }, { status: 500 })
  }

  type Fila = { aviso_id: string; endpoint: string; p256dh: string; auth: string; titulos: string[]; total: number }
  let enviados = 0
  let borrados = 0
  let fallidos = 0
  for (const fila of (data ?? []) as Fila[]) {
    const resultado = await enviar(
      { id: fila.aviso_id, endpoint: fila.endpoint, p256dh: fila.p256dh, auth: fila.auth },
      {
        title: fila.total === 1 ? 'Hoy toca' : `Hoy tocan ${fila.total} cosas`,
        body: textoResumen(fila.titulos, fila.total),
        url: '/',
        tag: `resumen-${dia}`,
      },
    )
    if (resultado === 'ok') {
      enviados++
      await supabase.from('avisos_push').update({ ultimo_envio: dia }).eq('id', fila.aviso_id)
    } else if (resultado === 'borrar') {
      borrados++
      await supabase.from('avisos_push').delete().eq('id', fila.aviso_id)
    } else {
      // No se apunta ultimo_envio: en la segunda oportunidad se vuelve a intentar.
      fallidos++
    }
  }

  // En el registro solo se apuntan números, nunca datos de nadie (se ve en
  // Vercel → Schedules → Cron Jobs → View Logs).
  console.log('Aviso diario', { horaEnEspana: hora, enviados, borrados, fallidos })
  return Response.json({ dia, enviados, borrados, fallidos })
}
