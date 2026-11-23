import { ir } from './ruta'
import { supabase } from './supabase'

// Avisos en el móvil (notificaciones). Funcionan con el service worker de
// la PWA. En iPhone solo funcionan con la app instalada en la pantalla de
// inicio (iOS 16.4 o posterior).

const CLAVE_PUBLICA = import.meta.env.VITE_VAPID_PUBLIC_KEY

export function avisosConfigurados(): boolean {
  return Boolean(CLAVE_PUBLICA)
}

export function avisosSoportados(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

// La clave pública viene en «base64url»; el navegador la quiere en bytes.
function claveEnBytes(base64: string): Uint8Array<ArrayBuffer> {
  const relleno = '='.repeat((4 - (base64.length % 4)) % 4)
  const texto = atob((base64 + relleno).replace(/-/g, '+').replace(/_/g, '/'))
  const bytes = new Uint8Array(new ArrayBuffer(texto.length))
  for (let i = 0; i < texto.length; i++) bytes[i] = texto.charCodeAt(i)
  return bytes
}

async function registro(): Promise<ServiceWorkerRegistration> {
  // Esperamos al service worker, pero no para siempre.
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, fallar) =>
      setTimeout(() => fallar(new Error('El service worker no está listo')), 10000),
    ),
  ])
}

async function guardar(suscripcion: PushSubscription): Promise<void> {
  if (!supabase) throw new Error('Sin conexión con Supabase')
  const datos = suscripcion.toJSON()
  const { error } = await supabase.rpc('guardar_aviso_push', {
    direccion: suscripcion.endpoint,
    clave_p256dh: datos.keys?.p256dh,
    clave_auth: datos.keys?.auth,
  })
  if (error) throw error
}

// ¿Están activados en este móvil? Si lo están, de paso refrescamos la
// dirección en la base de datos (por si el móvil la ha cambiado).
export async function comprobarAvisos(): Promise<boolean> {
  if (!avisosSoportados() || Notification.permission !== 'granted') return false
  const suscripcion = await (await registro()).pushManager.getSubscription()
  if (!suscripcion) return false
  await guardar(suscripcion)
  return true
}

export async function activarAvisos(): Promise<'activados' | 'denegados'> {
  const permiso = await Notification.requestPermission()
  if (permiso !== 'granted') return 'denegados'
  const reg = await registro()
  const suscripcion =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: claveEnBytes(CLAVE_PUBLICA ?? ''),
    }))
  await guardar(suscripcion)
  return 'activados'
}

export async function desactivarAvisos(): Promise<void> {
  const suscripcion = await (await registro()).pushManager.getSubscription()
  if (!suscripcion) return
  // Gracias a RLS, solo puedes borrar tus propios móviles.
  await supabase?.from('avisos_push').delete().eq('endpoint', suscripcion.endpoint)
  await suscripcion.unsubscribe()
}

// Pide al servidor un aviso de prueba para tus móviles. Con «semana», tu
// resumen de la semana de verdad (el que llega los domingos).
export async function probarAviso(tipo?: 'semana'): Promise<number> {
  const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } }
  const token = data.session?.access_token
  if (!token) throw new Error('Tienes que entrar con tu cuenta.')
  const respuesta = await fetch('/api/aviso-de-prueba', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(tipo ? { tipo } : {}),
  })
  const cuerpo = (await respuesta.json().catch(() => ({}))) as { enviados?: number; error?: string }
  if (!respuesta.ok) throw new Error(cuerpo.error ?? 'No se ha podido mandar el aviso de prueba.')
  return cuerpo.enviados ?? 0
}

export type EstadoAvisoDiario = {
  claveDelServidor: boolean
  entorno: string
  moviles: number
  hoy: string
  horaEnEspana: number
  ultimoAviso: string | null
  pendientesHoy: number | null
}

// «🩺 Comprobar el aviso de las 8:00»: pregunta al servidor si está listo,
// cuándo te llegó el último aviso diario y si hoy tienes algo pendiente.
export async function estadoDelAvisoDiario(): Promise<EstadoAvisoDiario> {
  const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } }
  const token = data.session?.access_token
  if (!token) throw new Error('Tienes que entrar con tu cuenta.')
  const respuesta = await fetch('/api/estado-avisos', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  const cuerpo = (await respuesta.json().catch(() => ({}))) as Partial<EstadoAvisoDiario> & { error?: string }
  if (!respuesta.ok) throw new Error(cuerpo.error ?? 'No se ha podido comprobar el aviso diario.')
  return cuerpo as EstadoAvisoDiario
}

// Al tocar un aviso con la app ya abierta, el service worker nos dice a qué
// pantalla ir (por ejemplo, el resumen del domingo abre «📆 La semana»).
export function escucharAvisosTocados(): void {
  if (!('serviceWorker' in navigator)) return
  navigator.serviceWorker.addEventListener('message', (evento) => {
    if (evento.origin && evento.origin !== window.location.origin) return
    const datos = evento.data as { tipo?: unknown; ruta?: unknown } | null
    if (datos?.tipo !== 'abrir' || typeof datos.ruta !== 'string') return
    // Solo pantallas de la propia app.
    if (!/^\/#\/[a-z0-9/-]*$/.test(datos.ruta)) return
    ir(datos.ruta.slice(2))
  })
}
