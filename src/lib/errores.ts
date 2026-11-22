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
  'No encontramos esa tarea',
  'Esa tarea ya estaba hecha',
  'Elige una fecha',
  'Las tareas automáticas',
  'Solo puede participar',
  'Solo quien administra',
  'Esa persona no está',
  'Para irte tú',
  'No perteneces',
  'Elige quién se va',
  'Elige el día de ida',
  'El día de vuelta',
  'Un viaje puede durar',
  'Solo puede irse',
  'Ese enlace de acceso',
  'Ese acceso ya ha terminado',
  'Ya eres de este hogar',
  'Este enlace ya lo está usando',
  'No encontramos esa tarea entre tus encargos',
  'La nota es demasiado larga',
  'No encontramos ese encargo',
  'Escribe una nota',
]

// Errores técnicos que sí sabemos explicar.
const TRADUCCIONES: [string, string][] = [
  ['Payload too large', 'La foto es demasiado grande.'],
  ['mime type', 'Ese tipo de archivo no vale: elige una foto.'],
  ['un_peso_por_dia', 'Ya hay un peso apuntado ese día. Recarga la ficha para verlo.'],
]

export function mensajeDeError(error: { message?: string } | null): string {
  const texto = error?.message ?? ''
  if (MENSAJES_PROPIOS.some((inicio) => texto.startsWith(inicio))) return texto
  const traduccion = TRADUCCIONES.find(([trozo]) => texto.includes(trozo))
  if (traduccion) return traduccion[1]
  return 'Algo ha fallado. Comprueba tu conexión e inténtalo de nuevo.'
}
