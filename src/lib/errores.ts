// Las funciones de la base de datos devuelven mensajes ya escritos en
// español (por ejemplo "Ese código no existe…"). Si el error es otro
// (sin conexión, etc.), enseñamos un mensaje genérico.
const MENSAJES_PROPIOS = [
  'Tienes que entrar',
  'Ya perteneces',
  'Primero tienes que crear',
  'Ese código',
  'Escribe tu nombre',
  'Ponle un nombre',
]

export function mensajeDeError(error: { message?: string } | null): string {
  const texto = error?.message ?? ''
  if (MENSAJES_PROPIOS.some((inicio) => texto.startsWith(inicio))) return texto
  return 'Algo ha fallado. Comprueba tu conexión e inténtalo de nuevo.'
}
