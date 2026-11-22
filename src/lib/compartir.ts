// Abre el menú de compartir del móvil (WhatsApp, Telegram…) y, si no se
// puede, copia el texto. Devuelve qué ha pasado.
export async function compartir(
  titulo: string,
  texto: string,
  enlace: string,
): Promise<'compartido' | 'copiado' | 'cancelado' | 'error'> {
  if (navigator.share) {
    try {
      await navigator.share({ title: titulo, text: texto, url: enlace })
      return 'compartido'
    } catch (e) {
      // Si la persona cierra el menú, no hacemos nada más.
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelado'
    }
  }
  try {
    await navigator.clipboard.writeText(`${texto}\n${enlace}`)
    return 'copiado'
  } catch {
    return 'error'
  }
}
