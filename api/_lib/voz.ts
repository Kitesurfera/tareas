// Dictar en el iPhone: la app graba lo que dices (en WAV) y el servidor se
// lo pasa a la IA (Whisper, en api/_lib/ia.ts) para tenerlo en texto.
// Aquí se comprueba el audio y se limpia lo que devuelve la IA.
// El audio no se guarda en ningún sitio y en el registro solo van números.
import type { SupabaseClient } from '@supabase/supabase-js'
import { respuestaDeError } from './ia.js'

// Lo que graba la app: WAV, PCM de 16 bits, un canal, 16.000 muestras por
// segundo (32.000 bytes por segundo). Como mucho un minuto.
export const MUESTRAS_POR_SEGUNDO = 16000
export const MAX_SEGUNDOS = 60
export const MIN_SEGUNDOS = 0.3
export const MAX_BYTES = 44 + MAX_SEGUNDOS * MUESTRAS_POR_SEGUNDO * 2

const texto4 = (b: Uint8Array, desde: number) => String.fromCharCode(b[desde], b[desde + 1], b[desde + 2], b[desde + 3])
const num16 = (b: Uint8Array, desde: number) => b[desde] | (b[desde + 1] << 8)
const num32 = (b: Uint8Array, desde: number) => (b[desde] | (b[desde + 1] << 8) | (b[desde + 2] << 16) | (b[desde + 3] << 24)) >>> 0

// ¿Es un WAV como los que graba la app? Devuelve cuántos segundos dura, o
// el motivo por el que no vale.
export function comprobarWav(b: Uint8Array): { segundos: number } | { error: string } {
  if (b.length < 44 || texto4(b, 0) !== 'RIFF' || texto4(b, 8) !== 'WAVE' || texto4(b, 12) !== 'fmt ') return { error: 'no es un WAV' }
  const formato = num16(b, 20)
  const canales = num16(b, 22)
  const muestras = num32(b, 24)
  const bits = num16(b, 34)
  if (formato !== 1 || canales !== 1 || muestras !== MUESTRAS_POR_SEGUNDO || bits !== 16) return { error: 'formato distinto' }
  // El trozo «data» va justo después de «fmt » (16 bytes).
  if (texto4(b, 36) !== 'data') return { error: 'sin datos' }
  const bytes = Math.min(num32(b, 40), b.length - 44)
  return { segundos: bytes / (MUESTRAS_POR_SEGUNDO * 2) }
}

// Lo que Whisper se inventa a veces con ruido o silencio (lo aprendió de
// los subtítulos de vídeos): fuera.
const INVENTOS = [/amara\.org/i, /subt[ií]tul/i, /suscr[ií]b/i, /gracias por (ver|vernos|mirar)/i, /^\s*[([].*[)\]]\s*$/]

export function limpiarTexto(texto: string): string {
  return texto
    .replace(/[([](m[uú]sica|risas|aplausos|silencio|ruido)[)\]]/gi, ' ')
    .split(/(?<=[.!?¡¿])\s+/)
    .filter((frase) => !INVENTOS.some((r) => r.test(frase)))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 2000)
}

// El límite al día por hogar (tipo «voz»). Se apunta ANTES de llamar a la
// IA; sin poder apuntarlo, no se llama. Devuelve la respuesta de error, o
// null si se puede seguir.
export async function apuntarUsoVoz(supabase: SupabaseClient, hogarId: string, userId: string, maximo: number): Promise<Response | null> {
  const haceUnDia = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count, error: errorCuenta } = await supabase
    .from('usos_ia')
    .select('id', { count: 'exact', head: true })
    .eq('hogar_id', hogarId)
    .eq('tipo', 'voz')
    .gte('creado_en', haceUnDia)
  if (errorCuenta) {
    console.error('Voz: no se pudo contar los usos', errorCuenta.code)
    return respuestaDeError('No se ha podido comprobar el límite de usos.', 500)
  }
  if ((count ?? 0) >= maximo) {
    return respuestaDeError(`Hoy ya habéis dictado ${maximo} veces. Escríbelo, usa el micrófono del teclado o prueba mañana.`, 429)
  }
  const { error: errorApunte } = await supabase.from('usos_ia').insert({ hogar_id: hogarId, user_id: userId, tipo: 'voz' })
  if (errorApunte) {
    console.error('Voz: no se pudo apuntar el uso', errorApunte.code)
    return respuestaDeError(
      errorApunte.code === '23514' || errorApunte.code === '42P01' || errorApunte.code === 'PGRST205'
        ? 'Falta ejecutar en Supabase el SQL del dictado (20261202100000_dictado_por_voz.sql).'
        : 'No se ha podido apuntar el uso. Prueba otra vez.',
      500,
    )
  }
  return null
}
