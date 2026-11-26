// Avisos diarios: Vercel llama a esta función cada hora, de 6:00 a 23:00
// en España (ver «crons» en vercel.json), y a cada móvil le manda:
// - el aviso diario, a la hora que eligió su dueña (8:00 si no eligió
//   nada): lo que le toca hoy o va atrasado, los planes y las fechas
//   especiales del día;
// - el de la tarde, si lo pidió: lo que le queda de hoy.
// Nada si es uno de sus días sin aviso o los tiene en pausa (⏰ Avisos a
// tu medida, api/_lib/horarios.ts), ni si no hay nada pendiente.
//
// Vercel (plan gratuito) programa en hora universal, puede llamar en
// cualquier momento de esa hora y no reintenta si algo falla. Por eso hay
// una llamada por cada hora (en verano y en invierno) y cada aviso tiene
// una segunda oportunidad a la hora siguiente. Nadie recibe el mismo aviso
// dos veces: avisos_push apunta el día del último de la mañana
// (ultimo_envio) y del último de la tarde (ultimo_aviso_tarde).
import type { SupabaseClient } from '@supabase/supabase-js'
import { ahoraEnEspana, enviar, supabaseServidor, textoResumen, type Aviso } from './_lib/avisos.js'
import { ajustesPorMovil, tocaAviso, type Turno } from './_lib/horarios.js'

type Fila = { aviso_id: string; endpoint: string; p256dh: string; auth: string; titulos: string[]; total: number }
type Cuentas = { moviles: number; enviados: number; borrados: number; fallidos: number; error?: boolean }

const TURNOS: Record<Turno, { funcion: string; columna: string; aviso: (fila: Fila, dia: string) => Aviso }> = {
  manana: {
    funcion: 'recordatorios_del_dia',
    columna: 'ultimo_envio',
    aviso: (fila, dia) => ({
      title: fila.total === 1 ? 'Hoy toca' : `Hoy tocan ${fila.total} cosas`,
      body: textoResumen(fila.titulos, fila.total),
      url: '/',
      tag: `resumen-${dia}`,
    }),
  },
  tarde: {
    funcion: 'pendientes_de_la_tarde',
    columna: 'ultimo_aviso_tarde',
    aviso: (fila, dia) => ({
      title: fila.total === 1 ? '🌙 Aún te queda algo de hoy' : `🌙 Aún te quedan ${fila.total} cosas de hoy`,
      body: textoResumen(fila.titulos, fila.total),
      url: '/',
      tag: `tarde-${dia}`,
    }),
  },
}

async function mandar(supabase: SupabaseClient, turno: Turno, dia: string, moviles: Set<string>): Promise<Cuentas> {
  const cuentas: Cuentas = { moviles: moviles.size, enviados: 0, borrados: 0, fallidos: 0 }
  if (moviles.size === 0) return cuentas
  const { funcion, columna, aviso } = TURNOS[turno]
  const { data, error } = await supabase.rpc(funcion, { dia })
  if (error) {
    console.error(`Error al preparar los avisos (${turno})`, error.code)
    return { ...cuentas, error: true }
  }
  for (const fila of (data ?? []) as Fila[]) {
    // Solo los móviles a los que les toca a esta hora.
    if (!moviles.has(fila.aviso_id)) continue
    const resultado = await enviar({ id: fila.aviso_id, endpoint: fila.endpoint, p256dh: fila.p256dh, auth: fila.auth }, aviso(fila, dia))
    if (resultado === 'ok') {
      cuentas.enviados++
      await supabase.from('avisos_push').update({ [columna]: dia }).eq('id', fila.aviso_id)
    } else if (resultado === 'borrar') {
      cuentas.borrados++
      await supabase.from('avisos_push').delete().eq('id', fila.aviso_id)
    } else {
      // No se apunta: en la segunda oportunidad se vuelve a intentar.
      cuentas.fallidos++
    }
  }
  return cuentas
}

export async function GET(request: Request): Promise<Response> {
  // Solo Vercel conoce CRON_SECRET: así nadie de fuera puede disparar avisos.
  const secreto = process.env.CRON_SECRET
  if (!secreto || request.headers.get('authorization') !== `Bearer ${secreto}`) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { dia, hora } = ahoraEnEspana()
  const supabase = supabaseServidor()
  let porMovil
  try {
    porMovil = await ajustesPorMovil(supabase)
  } catch {
    console.error('Avisos: no se pudieron leer los móviles')
    return Response.json({ error: 'No se pudieron preparar los avisos' }, { status: 500 })
  }

  // A quién le toca cada aviso a esta hora.
  const quienes = (turno: Turno) => new Set([...porMovil].filter(([, a]) => tocaAviso(a, dia, hora, turno)).map(([id]) => id))
  const manana = await mandar(supabase, 'manana', dia, quienes('manana'))
  const tarde = await mandar(supabase, 'tarde', dia, quienes('tarde'))

  // En el registro solo se apuntan números, nunca datos de nadie (se ve en
  // Vercel → Schedules → Cron Jobs → View Logs).
  console.log('Avisos', { horaEnEspana: hora, manana, tarde })
  const status = manana.error || tarde.error ? 500 : 200
  return Response.json({ dia, horaEnEspana: hora, manana, tarde }, { status })
}
