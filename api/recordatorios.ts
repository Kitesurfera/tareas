// Aviso diario: Vercel llama a esta función cada mañana (ver «crons» en
// vercel.json) y manda a cada móvil lo que le toca hoy o va atrasado.
import { ahoraEnEspana, enviar, supabaseServidor, textoResumen } from './_lib/avisos.js'

const HORA_DEL_AVISO = 8

export async function GET(request: Request): Promise<Response> {
  // Solo Vercel conoce CRON_SECRET: así nadie de fuera puede disparar avisos.
  const secreto = process.env.CRON_SECRET
  if (!secreto || request.headers.get('authorization') !== `Bearer ${secreto}`) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  // Vercel programa en hora universal; hay dos intentos (verano e invierno)
  // y solo se envía en el que cae a las 8 en España.
  const { dia, hora } = ahoraEnEspana()
  if (hora !== HORA_DEL_AVISO) {
    return Response.json({ enviados: 0, motivo: `En España son las ${hora}, no las ${HORA_DEL_AVISO}` })
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
    }
  }

  // En el registro solo se apuntan números, nunca datos de nadie.
  return Response.json({ dia, enviados, borrados })
}
