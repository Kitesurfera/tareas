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
