// Código compartido por las funciones del servidor (Vercel).
// OJO: esto se ejecuta en el SERVIDOR, nunca en el móvil. Aquí sí se usan
// claves secretas, que viven en las variables de entorno de Vercel.
import { createClient } from '@supabase/supabase-js'
import { sendNotification, setVapidDetails } from 'web-push'

function variable(nombre: string): string {
  const valor = process.env[nombre]
  if (!valor) throw new Error(`Falta la variable de entorno ${nombre} en Vercel`)
  return valor
}

// Cliente de Supabase con la clave SECRETA: puede leer lo de todos los
// hogares, por eso solo existe aquí, en el servidor.
export function supabaseServidor() {
  return createClient(variable('VITE_SUPABASE_URL'), variable('SUPABASE_SECRET_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

// Claves VAPID: identifican a nuestro servidor ante el servicio de avisos
// del móvil (Google, Apple, Mozilla…), para que nadie más pueda mandar
// avisos en nombre de Tareas.
function prepararWebPush() {
  const web = process.env.VERCEL_PROJECT_PRODUCTION_URL
  setVapidDetails(
    web ? `https://${web}` : 'https://vercel.app',
    variable('VITE_VAPID_PUBLIC_KEY'),
    variable('VAPID_PRIVATE_KEY'),
  )
}

export type Aviso = {
  title: string
  body: string
  url: string
  tag: string
}

export type Movil = {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

// Manda un aviso a un móvil. «borrar» = ese móvil ya no existe (se
// desinstaló la app o se quitaron los permisos) y hay que olvidarlo.
export async function enviar(movil: Movil, aviso: Aviso): Promise<'ok' | 'borrar' | 'error'> {
  prepararWebPush()
  try {
    await sendNotification(
      { endpoint: movil.endpoint, keys: { p256dh: movil.p256dh, auth: movil.auth } },
      JSON.stringify(aviso),
      { TTL: 12 * 60 * 60, urgency: 'normal' },
    )
    return 'ok'
  } catch (e) {
    const codigo = (e as { statusCode?: number }).statusCode
    if (codigo === 404 || codigo === 410) return 'borrar'
    console.error('No se pudo enviar un aviso', codigo)
    return 'error'
  }
}

// Fecha y hora actuales en España (el servidor funciona en hora universal).
export function ahoraEnEspana(): { dia: string; hora: number } {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date())
  const valor = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? ''
  return { dia: `${valor('year')}-${valor('month')}-${valor('day')}`, hora: Number(valor('hour')) }
}

// «Sacar la basura», «Sacar la basura y Comprar regalo», «A, B y 3 más»…
export function textoResumen(titulos: string[], total: number): string {
  if (total <= 1) return titulos[0] ?? ''
  if (total === 2) return `${titulos[0]} y ${titulos[1]}`
  const mostrados = titulos.slice(0, 2)
  return `${mostrados.join(', ')} y ${total - mostrados.length} más`
}
