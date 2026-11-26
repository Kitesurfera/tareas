// ⏰ Avisos a tu medida: a quién le toca cada aviso a cada hora.
// Lo que elige cada persona está en la tabla ajustes_avisos (si no ha
// elegido nada, lo de siempre: el aviso diario a las 8:00, sin aviso por la
// tarde, todos los días y con el resumen del domingo).
import type { SupabaseClient } from '@supabase/supabase-js'

export type AjustesAvisos = {
  // Hora del aviso diario (6 a 23, hora de España).
  hora: number
  // Segundo aviso por la tarde, solo si queda algo de hoy.
  tarde: boolean
  hora_tarde: number
  // Días sin aviso diario: 1 = lunes … 7 = domingo.
  dias_libres: number[]
  // Sin ningún aviso hasta este día, incluido («2026-12-08»).
  pausa_hasta: string | null
  resumen_semanal: boolean
}

export const AJUSTES_POR_DEFECTO: AjustesAvisos = {
  hora: 8,
  tarde: false,
  hora_tarde: 20,
  dias_libres: [],
  pausa_hasta: null,
  resumen_semanal: true,
}

// 1 = lunes … 7 = domingo («2026-11-29» → 7).
export function diaDeLaSemanaIso(dia: string): number {
  const d = new Date(`${dia}T12:00:00Z`).getUTCDay()
  return d === 0 ? 7 : d
}

export const enPausa = (a: AjustesAvisos, dia: string) => a.pausa_hasta !== null && dia <= a.pausa_hasta
export const esDiaLibre = (a: AjustesAvisos, dia: string) => a.dias_libres.includes(diaDeLaSemanaIso(dia))

// Vercel (plan gratuito) llama en cualquier minuto de la hora y no
// reintenta: primer intento a la hora elegida y segunda oportunidad a la
// siguiente (nunca pasada la medianoche, que ya sería otro día).
export function esLaHora(elegida: number, ahora: number): boolean {
  return ahora === elegida || (ahora === elegida + 1 && elegida < 23)
}

export type Turno = 'manana' | 'tarde'

// ¿Le toca ahora el aviso diario (o el de la tarde)?
export function tocaAviso(a: AjustesAvisos, dia: string, hora: number, turno: Turno): boolean {
  if (enPausa(a, dia) || esDiaLibre(a, dia)) return false
  if (turno === 'manana') return esLaHora(a.hora, hora)
  return a.tarde && esLaHora(a.hora_tarde, hora)
}

// El resumen del domingo: si no lo ha quitado y no está en pausa. (Los días
// sin aviso son solo para el aviso diario.)
export const tocaResumen = (a: AjustesAvisos, dia: string) => a.resumen_semanal && !enPausa(a, dia)

// Lo que viene de la base de datos, comprobado (por si acaso).
export function leerAjustes(fila: Partial<AjustesAvisos> | null | undefined): AjustesAvisos {
  if (!fila) return AJUSTES_POR_DEFECTO
  const hora = Number.isInteger(fila.hora) && fila.hora! >= 6 && fila.hora! <= 23 ? fila.hora! : AJUSTES_POR_DEFECTO.hora
  const horaTarde =
    Number.isInteger(fila.hora_tarde) && fila.hora_tarde! >= 12 && fila.hora_tarde! <= 23 ? fila.hora_tarde! : AJUSTES_POR_DEFECTO.hora_tarde
  return {
    hora,
    tarde: fila.tarde === true,
    hora_tarde: horaTarde,
    dias_libres: Array.isArray(fila.dias_libres) ? fila.dias_libres.filter((d) => Number.isInteger(d) && d >= 1 && d <= 7) : [],
    pausa_hasta: typeof fila.pausa_hasta === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fila.pausa_hasta) ? fila.pausa_hasta : null,
    resumen_semanal: fila.resumen_semanal !== false,
  }
}

const COLUMNAS = 'user_id, hora, tarde, hora_tarde, dias_libres, pausa_hasta, resumen_semanal'

// Los ajustes de cada móvil (id del móvil → ajustes de su dueña). Si aún no
// se ha ejecutado el SQL de los ajustes, todo el mundo con lo de siempre.
export async function ajustesPorMovil(supabase: SupabaseClient, soloUsuario?: string): Promise<Map<string, AjustesAvisos>> {
  let moviles = supabase.from('avisos_push').select('id, user_id')
  let ajustes = supabase.from('ajustes_avisos').select(COLUMNAS)
  if (soloUsuario) {
    moviles = moviles.eq('user_id', soloUsuario)
    ajustes = ajustes.eq('user_id', soloUsuario)
  }
  const [m, a] = await Promise.all([moviles, ajustes])
  if (m.error) throw new Error('No se pudieron leer los móviles')
  if (a.error) console.error('Ajustes de avisos: no se pudieron leer, se usa lo de siempre', a.error.code)
  const porPersona = new Map<string, AjustesAvisos>()
  for (const fila of (a.data ?? []) as (Partial<AjustesAvisos> & { user_id: string })[]) porPersona.set(fila.user_id, leerAjustes(fila))
  const porMovil = new Map<string, AjustesAvisos>()
  for (const movil of (m.data ?? []) as { id: string; user_id: string }[]) {
    porMovil.set(movil.id, porPersona.get(movil.user_id) ?? AJUSTES_POR_DEFECTO)
  }
  return porMovil
}

// Los ajustes de una persona (para «🩺 Comprobar el aviso diario»).
export async function ajustesDe(supabase: SupabaseClient, userId: string): Promise<AjustesAvisos> {
  const { data, error } = await supabase.from('ajustes_avisos').select(COLUMNAS).eq('user_id', userId).maybeSingle()
  if (error) return AJUSTES_POR_DEFECTO
  return leerAjustes(data as Partial<AjustesAvisos> | null)
}
