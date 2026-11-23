// El archivo de calendario (formato iCalendar, «.ics») que leen el
// calendario del iPhone y Google Calendar. Cada tarea o plan es un evento
// de día completo con una alarma a las 8:00 de ese día: la alarma la hace
// sonar el propio calendario del móvil, sin depender de nuestro servidor.
// OJO: se ejecuta en el SERVIDOR (funciones de Vercel), nunca en el móvil.

export type EventoCalendario = {
  uid: string
  titulo: string
  fecha: string // AAAA-MM-DD
  descripcion?: string
  url?: string
}

const SALTO = '\r\n'

// En los textos, «\», «;», «,» y los saltos de línea van escapados.
function escapar(texto: string): string {
  return texto.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

// Las líneas no pueden pasar de 75 bytes: se parten y la continuación
// empieza con un espacio (sin cortar una letra o un emoji por la mitad).
export function plegar(linea: string): string {
  const codificador = new TextEncoder()
  const trozos: string[] = []
  let actual = ''
  let bytes = 0
  for (const letra of linea) {
    const largo = codificador.encode(letra).length
    const maximo = trozos.length === 0 ? 75 : 74
    if (bytes + largo > maximo) {
      trozos.push(actual)
      actual = ''
      bytes = 0
    }
    actual += letra
    bytes += largo
  }
  trozos.push(actual)
  return trozos.join(`${SALTO} `)
}

const sinGuiones = (fecha: string) => fecha.replace(/-/g, '')

function diaSiguiente(fecha: string): string {
  const d = new Date(`${fecha}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

function marcaDeTiempo(ahora: Date): string {
  return ahora.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

export function crearCalendario(opciones: {
  nombre: string
  descripcion: string
  eventos: EventoCalendario[]
  ahora?: Date
}): string {
  const sello = marcaDeTiempo(opciones.ahora ?? new Date())
  const lineas: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Tareas//Calendario del hogar//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapar(opciones.nombre)}`,
    `X-WR-CALDESC:${escapar(opciones.descripcion)}`,
    'X-WR-TIMEZONE:Europe/Madrid',
    // Pedimos que se actualice cada hora (cada app decide al final).
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ]
  for (const e of opciones.eventos) {
    lineas.push(
      'BEGIN:VEVENT',
      `UID:${e.uid}`,
      `DTSTAMP:${sello}`,
      `DTSTART;VALUE=DATE:${sinGuiones(e.fecha)}`,
      `DTEND;VALUE=DATE:${sinGuiones(diaSiguiente(e.fecha))}`,
      `SUMMARY:${escapar(e.titulo)}`,
      ...(e.descripcion ? [`DESCRIPTION:${escapar(e.descripcion)}`] : []),
      ...(e.url ? [`URL:${e.url}`] : []),
      // No ocupa la agenda (no sale como «ocupado»).
      'TRANSP:TRANSPARENT',
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapar(e.titulo)}`,
      // Ocho horas después del principio del día: a las 8:00.
      'TRIGGER:PT8H',
      'END:VALARM',
      'END:VEVENT',
    )
  }
  lineas.push('END:VCALENDAR')
  return lineas.map(plegar).join(SALTO) + SALTO
}
