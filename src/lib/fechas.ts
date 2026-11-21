// Convierte «2021-03-10» en una fecha sin líos de zona horaria.
export function leerFecha(texto: string): Date {
  const [anio, mes, dia] = texto.split('-').map(Number)
  return new Date(anio, mes - 1, dia)
}

export function hoyComoTexto(): string {
  const hoy = new Date()
  const mes = String(hoy.getMonth() + 1).padStart(2, '0')
  const dia = String(hoy.getDate()).padStart(2, '0')
  return `${hoy.getFullYear()}-${mes}-${dia}`
}

export function fechaLarga(texto: string): string {
  return leerFecha(texto).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

// «3 años», «1 año y 2 meses», «5 meses», «menos de un mes».
export function edad(fechaNacimiento: string): string {
  const nacimiento = leerFecha(fechaNacimiento)
  const hoy = new Date()
  let meses =
    (hoy.getFullYear() - nacimiento.getFullYear()) * 12 +
    (hoy.getMonth() - nacimiento.getMonth())
  if (hoy.getDate() < nacimiento.getDate()) meses -= 1
  if (meses < 1) return 'menos de un mes'

  const anios = Math.floor(meses / 12)
  const resto = meses % 12
  const textoAnios = anios === 1 ? '1 año' : `${anios} años`
  const textoMeses = resto === 1 ? '1 mes' : `${resto} meses`
  if (anios === 0) return textoMeses
  if (resto === 0) return textoAnios
  return `${textoAnios} y ${textoMeses}`
}

export function fechaCorta(texto: string): string {
  return leerFecha(texto).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

// Suma días a una fecha «2026-03-10» y devuelve otra en el mismo formato.
export function sumarDias(texto: string, dias: number): string {
  const fecha = leerFecha(texto)
  fecha.setDate(fecha.getDate() + dias)
  const mes = String(fecha.getMonth() + 1).padStart(2, '0')
  const dia = String(fecha.getDate()).padStart(2, '0')
  return `${fecha.getFullYear()}-${mes}-${dia}`
}

// Días que faltan hasta una fecha (negativo si ya pasó).
export function diasHasta(texto: string): number {
  const hoy = leerFecha(hoyComoTexto())
  return Math.round((leerFecha(texto).getTime() - hoy.getTime()) / 86_400_000)
}

// «Hoy», «Mañana», «En 12 días», «Hace 3 días»…
export function cuandoToca(texto: string): string {
  const dias = diasHasta(texto)
  if (dias === 0) return 'Hoy'
  if (dias === 1) return 'Mañana'
  if (dias === -1) return 'Ayer'
  // A partir de dos meses, en meses: «En 12 meses» se lee mejor que «En 365 días».
  const meses = Math.round(Math.abs(dias) / 30.4)
  if (dias > 60) return `En ${meses} meses`
  if (dias < -60) return `Hace ${meses} meses`
  if (dias > 1) return `En ${dias} días`
  return `Hace ${-dias} días`
}

// «cada día», «cada mes», «cada 3 meses», «cada año», «cada 45 días»…
export function textoFrecuencia(dias: number): string {
  const conocidas: Record<number, string> = {
    1: 'cada día',
    7: 'cada semana',
    14: 'cada 2 semanas',
    30: 'cada mes',
    60: 'cada 2 meses',
    90: 'cada 3 meses',
    182: 'cada 6 meses',
    365: 'cada año',
    730: 'cada 2 años',
    1095: 'cada 3 años',
  }
  return conocidas[dias] ?? `cada ${dias} días`
}

export const FRECUENCIAS_HABITUALES = [30, 90, 182, 365]
