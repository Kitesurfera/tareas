import { supabase } from './supabase'

const ALMACEN = 'mascotas'
const LADO_MAXIMO = 1024

// Reduce la foto antes de subirla: las del móvil pesan varios MB.
// Además, al redibujarla se pierden los datos ocultos de la foto (EXIF),
// como el lugar GPS donde se hizo, que podría revelar dónde vivís.
export async function prepararFoto(archivo: File): Promise<Blob> {
  const imagen = await createImageBitmap(archivo)
  const escala = Math.min(1, LADO_MAXIMO / Math.max(imagen.width, imagen.height))
  const lienzo = document.createElement('canvas')
  lienzo.width = Math.round(imagen.width * escala)
  lienzo.height = Math.round(imagen.height * escala)
  lienzo.getContext('2d')?.drawImage(imagen, 0, 0, lienzo.width, lienzo.height)
  imagen.close()
  return new Promise((resolver, fallar) =>
    lienzo.toBlob(
      (blob) => (blob ? resolver(blob) : fallar(new Error('No se pudo preparar la foto'))),
      'image/jpeg',
      0.85,
    ),
  )
}

// Sube la foto a la carpeta del hogar y devuelve su ruta.
export async function subirFoto(hogarId: string, foto: Blob): Promise<string> {
  if (!supabase) throw new Error('Sin conexión con Supabase')
  const ruta = `${hogarId}/${crypto.randomUUID()}.jpg`
  const { error } = await supabase.storage
    .from(ALMACEN)
    .upload(ruta, foto, { contentType: 'image/jpeg', upsert: false })
  if (error) throw error
  return ruta
}

export async function borrarFoto(ruta: string): Promise<void> {
  await supabase?.storage.from(ALMACEN).remove([ruta])
}

// El almacén es privado: pedimos enlaces que caducan en 1 hora.
export async function enlacesDeFotos(rutas: string[]): Promise<Record<string, string>> {
  if (!supabase || rutas.length === 0) return {}
  const { data } = await supabase.storage.from(ALMACEN).createSignedUrls(rutas, 3600)
  const enlaces: Record<string, string> = {}
  for (const fila of data ?? []) {
    if (fila.path && fila.signedUrl) enlaces[fila.path] = fila.signedUrl
  }
  return enlaces
}
