import { useEffect, useState } from 'react'
import { mensajeDeError } from './errores'
import { diasHasta } from './fechas'
import { prepararFoto } from './fotos'
import { supabase } from './supabase'

// Documentos del hogar (tablas documentos y documento_archivos). Los
// archivos van al almacén PRIVADO «documentos», en la carpeta del hogar:
// nadie tiene enlace público y la app pide enlaces que caducan en minutos.

const ALMACEN = 'documentos'
export const MAX_ARCHIVOS = 5
const MAX_BYTES = 10 * 1024 * 1024
// Las fotos se reducen (y pierden el GPS) pero con letra legible.
const LADO_FOTO = 2000

export type TipoDocumento = 'identidad' | 'seguro' | 'coche' | 'casa' | 'salud' | 'mascota' | 'garantia' | 'otros'

export type Documento = {
  id: string
  hogar_id: string
  titulo: string
  tipo: TipoDocumento
  persona_id: string | null
  vencimiento_id: string | null
  caduca_el: string | null
  aviso_dias: number | null
  responsable_id: string | null
  notas: string | null
  creado_en: string
}

export type ArchivoDocumento = {
  id: string
  hogar_id: string
  documento_id: string
  ruta: string
  nombre: string | null
  tipo_mime: 'image/jpeg' | 'application/pdf'
  tamano: number
  orden: number
}

export const TIPOS_DOCUMENTO: { valor: TipoDocumento; texto: string; dibujo: string; ejemplo: string }[] = [
  { valor: 'identidad', texto: 'Identidad', dibujo: '🪪', ejemplo: 'DNI, pasaporte, carné de conducir' },
  { valor: 'seguro', texto: 'Seguros', dibujo: '🛡️', ejemplo: 'Pólizas' },
  { valor: 'coche', texto: 'Coche', dibujo: '🚗', ejemplo: 'ITV, permiso de circulación' },
  { valor: 'casa', texto: 'Casa', dibujo: '🏠', ejemplo: 'Contrato del piso, escrituras, recibos' },
  { valor: 'salud', texto: 'Salud', dibujo: '🩺', ejemplo: 'Tarjeta sanitaria, informes' },
  { valor: 'mascota', texto: 'Mascota', dibujo: '🐾', ejemplo: 'Cartilla, registro del chip' },
  { valor: 'garantia', texto: 'Garantías', dibujo: '🧾', ejemplo: 'Tickets y garantías de aparatos' },
  { valor: 'otros', texto: 'Otros', dibujo: '📁', ejemplo: 'Lo demás' },
]

export function infoTipoDocumento(tipo: TipoDocumento) {
  return TIPOS_DOCUMENTO.find((t) => t.valor === tipo) ?? TIPOS_DOCUMENTO[TIPOS_DOCUMENTO.length - 1]
}

export const AVISOS_DOCUMENTO = [
  { dias: 7, texto: '1 semana antes' },
  { dias: 30, texto: '1 mes antes' },
  { dias: 60, texto: '2 meses antes' },
  { dias: 90, texto: '3 meses antes' },
]

// Cuánto falta para que caduque, con su color (rojo si ya caducó, ámbar si
// queda poco).
export function estadoCaducidad(caducaEl: string | null): { texto: string; clase: string } | null {
  if (!caducaEl) return null
  const dias = diasHasta(caducaEl)
  if (dias < 0) return { texto: dias === -1 ? 'Caducó ayer' : `Caducó hace ${-dias} días`, clase: 'bg-red-50 text-red-700' }
  if (dias === 0) return { texto: 'Caduca hoy', clase: 'bg-red-50 text-red-700' }
  if (dias <= 60) return { texto: dias === 1 ? 'Caduca mañana' : `Caduca en ${dias} días`, clase: 'bg-amber-50 text-amber-800' }
  if (dias < 730) return { texto: `Caduca en ${Math.round(dias / 30)} meses`, clase: 'bg-stone-100 text-stone-600' }
  return { texto: `Caduca en ${Math.floor(dias / 365)} años`, clase: 'bg-stone-100 text-stone-600' }
}

export const esPdf = (archivo: File) => archivo.type === 'application/pdf' || /\.pdf$/i.test(archivo.name)

// ¿Se puede subir este archivo? Devuelve el motivo si no.
export function problemaConArchivo(archivo: File): string | null {
  if (esPdf(archivo)) return archivo.size > MAX_BYTES ? `«${archivo.name}» pesa más de 10 MB.` : null
  if (archivo.type.startsWith('image/')) return null
  return `«${archivo.name}» no es una foto ni un PDF.`
}

export type DatosDocumentos = { documentos: Documento[]; archivos: ArchivoDocumento[] }

// Todos los documentos del hogar y sus archivos. null = cargando.
export function useDocumentos() {
  const [datos, setDatos] = useState<DatosDocumentos | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [recarga, setRecarga] = useState(0)

  useEffect(() => {
    if (!supabase) return
    let vigente = true
    Promise.all([
      supabase.from('documentos').select('*').order('titulo'),
      supabase.from('documento_archivos').select('*').order('orden'),
    ]).then(([documentos, archivos]) => {
      if (!vigente) return
      const fallo = documentos.error ?? archivos.error
      if (fallo) return setError(mensajeDeError(fallo))
      setError(null)
      setDatos({ documentos: documentos.data as Documento[], archivos: archivos.data as ArchivoDocumento[] })
    })
    return () => {
      vigente = false
    }
  }, [recarga])

  return { datos, error, recargar: () => setRecarga((n) => n + 1) }
}

// Sube un archivo (la foto, ya reducida; el PDF, tal cual) y lo apunta en
// el documento. Si no se puede apuntar, lo quita del almacén.
export async function subirArchivo(hogarId: string, documentoId: string, archivo: File, orden: number): Promise<void> {
  if (!supabase) throw new Error('Sin conexión.')
  const problema = problemaConArchivo(archivo)
  if (problema) throw new Error(problema)
  const pdf = esPdf(archivo)
  const contenido: Blob = pdf ? archivo : await prepararFoto(archivo, LADO_FOTO, 0.85)
  if (contenido.size > MAX_BYTES) throw new Error(`«${archivo.name}» pesa más de 10 MB.`)
  const ruta = `${hogarId}/${crypto.randomUUID()}.${pdf ? 'pdf' : 'jpg'}`
  const tipo = pdf ? 'application/pdf' : 'image/jpeg'
  const { error: errorSubida } = await supabase.storage.from(ALMACEN).upload(ruta, contenido, { contentType: tipo, upsert: false })
  if (errorSubida) throw new Error(`No se ha podido subir «${archivo.name}».`)
  const { error } = await supabase.from('documento_archivos').insert({
    hogar_id: hogarId,
    documento_id: documentoId,
    ruta,
    nombre: archivo.name.slice(0, 120),
    tipo_mime: tipo,
    tamano: contenido.size,
    orden,
  })
  if (error) {
    await supabase.storage.from(ALMACEN).remove([ruta])
    throw new Error(mensajeDeError(error))
  }
}

// Quita archivos: primero del almacén y luego de la lista.
export async function borrarArchivos(archivos: ArchivoDocumento[]): Promise<string | null> {
  if (!supabase || archivos.length === 0) return null
  await supabase.storage.from(ALMACEN).remove(archivos.map((a) => a.ruta))
  const { error } = await supabase
    .from('documento_archivos')
    .delete()
    .in(
      'id',
      archivos.map((a) => a.id),
    )
  return error ? mensajeDeError(error) : null
}

// Borra un documento entero: sus archivos del almacén y luego el documento
// (la base de datos se lleva la lista de archivos y su tarea pendiente).
export async function borrarDocumento(documento: Documento, archivos: ArchivoDocumento[]): Promise<string | null> {
  if (!supabase) return 'Sin conexión.'
  if (archivos.length > 0) await supabase.storage.from(ALMACEN).remove(archivos.map((a) => a.ruta))
  const { error } = await supabase.from('documentos').delete().eq('id', documento.id)
  return error ? mensajeDeError(error) : null
}

// Enlaces temporales (5 minutos) para ver los archivos.
export async function enlacesTemporales(rutas: string[]): Promise<Record<string, string>> {
  if (!supabase || rutas.length === 0) return {}
  const { data } = await supabase.storage.from(ALMACEN).createSignedUrls(rutas, 300)
  const enlaces: Record<string, string> = {}
  for (const fila of data ?? []) {
    if (fila.path && fila.signedUrl) enlaces[fila.path] = fila.signedUrl
  }
  return enlaces
}

// Si se va la última persona del hogar: quitar todos sus documentos del almacén.
export async function vaciarAlmacenDelHogar(hogarId: string): Promise<void> {
  if (!supabase) return
  const { data } = await supabase.storage.from(ALMACEN).list(hogarId, { limit: 1000 })
  const rutas = (data ?? []).map((archivo) => `${hogarId}/${archivo.name}`)
  if (rutas.length > 0) await supabase.storage.from(ALMACEN).remove(rutas)
}

export function tamanoLegible(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`
}
