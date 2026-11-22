import { diasHasta, hoyComoTexto } from './fechas'
import { prepararFoto } from './fotos'
import { supabase } from './supabase'
import { infoTipo, type TipoTratamiento, type Tratamiento } from './tipos'

// Lo que devuelve el servidor (api/leer-cartilla) por cada fila de la cartilla.
export type Lectura = {
  tipo: TipoTratamiento
  nombre: string
  producto: string | null
  fecha: string
  valida_hasta: string | null
  pagina: number
  segura: boolean
  dudas: string | null
}

export type ResultadoLectura = { tratamientos: Lectura[]; aviso: string | null }

// Una propuesta para guardar: un tratamiento con su última fecha.
export type Propuesta = {
  clave: string
  tipo: TipoTratamiento
  nombre: string
  producto: string | null
  fecha: string
  frecuencia: number
  // Cuántas veces sale en la cartilla (por ejemplo, la rabia de varios años).
  veces: number
  paginas: number[]
  dudas: string[]
  // Si ya tenéis ese tratamiento apuntado.
  existente: Tratamiento | null
}

export const MAX_PAGINAS = 8
// Vercel no acepta envíos de más de ~4,5 MB: dejamos margen.
const MAX_CARACTERES = 3_600_000

const normalizar = (texto: string) =>
  texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

function diasEntre(desde: string, hasta: string): number {
  return diasHasta(hasta) - diasHasta(desde)
}

// «Cada cuánto» a partir de la cartilla: lo que pone en «válida hasta»; si
// no, lo que pasó entre las dos últimas veces (redondeado a lo habitual);
// si tampoco, lo habitual de ese tipo de tratamiento.
function frecuenciaDe(grupo: Lectura[]): number {
  const ultima = grupo[grupo.length - 1]
  if (ultima.valida_hasta && ultima.valida_hasta > ultima.fecha) {
    return Math.min(diasEntre(ultima.fecha, ultima.valida_hasta), 3650)
  }
  if (grupo.length >= 2) {
    const entre = diasEntre(grupo[grupo.length - 2].fecha, ultima.fecha)
    const habitual = [30, 90, 182, 365, 730, 1095].find((d) => Math.abs(entre - d) <= d * 0.2)
    if (habitual) return habitual
    if (entre >= 7 && entre <= 3650) return entre
  }
  return infoTipo(ultima.tipo).diasHabituales
}

// Junta las filas del mismo tratamiento y se queda con la última fecha.
export function agruparLecturas(lecturas: Lectura[], existentes: Tratamiento[]): Propuesta[] {
  const grupos = new Map<string, Lectura[]>()
  for (const l of [...lecturas].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    const clave = `${l.tipo}|${normalizar(l.nombre)}`
    grupos.set(clave, [...(grupos.get(clave) ?? []), l])
  }
  return [...grupos.entries()]
    .map(([clave, grupo]) => {
      const ultima = grupo[grupo.length - 1]
      const existente =
        existentes.find((t) => t.tipo === ultima.tipo && normalizar(t.nombre) === normalizar(ultima.nombre)) ?? null
      return {
        clave,
        tipo: ultima.tipo,
        nombre: ultima.nombre,
        producto: ultima.producto,
        fecha: ultima.fecha,
        frecuencia: frecuenciaDe(grupo),
        veces: grupo.length,
        paginas: [...new Set(grupo.map((l) => l.pagina))],
        dudas: grupo.filter((l) => !l.segura && l.dudas).map((l) => `${l.dudas} (foto ${l.pagina})`),
        existente,
      }
    })
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
}

// ¿Merece la pena guardar esta propuesta tal cual? (Para marcarla al empezar.)
export function marcadaAlEmpezar(p: Propuesta): boolean {
  if (p.fecha > hoyComoTexto()) return false
  if (p.existente && p.existente.fecha_ultima >= p.fecha) return false
  return true
}

function comoTextoBase64(foto: Blob): Promise<string> {
  return new Promise((resolver, fallar) => {
    const lector = new FileReader()
    lector.onload = () => resolver(String(lector.result))
    lector.onerror = () => fallar(new Error('No se pudo preparar la foto'))
    lector.readAsDataURL(foto)
  })
}

// Prepara las fotos (más pequeñas si hace falta, sin datos ocultos como el
// GPS) y se las manda al servidor, que se las pasa a la IA (Gemma, en Cloudflare).
export async function leerCartilla(archivos: File[]): Promise<ResultadoLectura> {
  if (!supabase) throw new Error('Sin conexión.')
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Tienes que entrar con tu cuenta.')

  let paginas: string[] = []
  for (const [lado, calidad] of [
    [1600, 0.8],
    [1300, 0.7],
    [1100, 0.6],
  ] as const) {
    paginas = await Promise.all(archivos.map(async (a) => comoTextoBase64(await prepararFoto(a, lado, calidad))))
    if (paginas.reduce((total, p) => total + p.length, 0) <= MAX_CARACTERES) break
  }
  if (paginas.reduce((total, p) => total + p.length, 0) > MAX_CARACTERES) {
    throw new Error('Las fotos pesan demasiado para mandarlas juntas. Quita alguna y lee el resto después.')
  }

  const respuesta = await fetch('/api/leer-cartilla', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ paginas }),
  })
  const cuerpo = (await respuesta.json().catch(() => ({}))) as Partial<ResultadoLectura> & { error?: string }
  if (!respuesta.ok) throw new Error(cuerpo.error ?? 'No se ha podido leer la cartilla. Prueba otra vez.')
  return { tratamientos: cuerpo.tratamientos ?? [], aviso: cuerpo.aviso ?? null }
}
