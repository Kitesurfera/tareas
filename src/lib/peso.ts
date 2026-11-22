import { leerFecha } from './fechas'

export type Peso = {
  id: string
  fecha: string
  kg: number
}

// Los kilos con coma, como se escriben en España: «4,25 kg».
// Los animales pequeños llevan hasta 3 decimales («0,035 kg»).
export function formatoKg(kg: number, conUnidad = true): string {
  const texto = kg.toLocaleString('es-ES', {
    maximumFractionDigits: kg < 1 ? 3 : 2,
  })
  return conUnidad ? `${texto} kg` : texto
}

// Lee lo que se escribe en el campo («4,5», «4.5», « 12 »).
// Devuelve null si no es un peso que tenga sentido.
export function leerKg(texto: string): number | null {
  const limpio = texto.trim().replace(',', '.')
  if (!/^\d+(\.\d{1,3})?$/.test(limpio)) return null
  const kg = Number(limpio)
  if (!(kg > 0 && kg < 500)) return null
  return kg
}

// «+0,3 kg», «−1,2 kg» (para decir cuánto ha cambiado).
export function diferenciaKg(antes: number, ahora: number): string {
  // Redondeamos a gramos para evitar «0,30000000004».
  const gramos = Math.round((ahora - antes) * 1000)
  if (gramos === 0) return 'igual'
  const signo = gramos > 0 ? '+' : '−'
  return `${signo}${formatoKg(Math.abs(gramos) / 1000)}`
}

// Días entre dos fechas «2026-03-10» (para colocar los puntos en la gráfica).
export function diasEntre(desde: string, hasta: string): number {
  return Math.round((leerFecha(hasta).getTime() - leerFecha(desde).getTime()) / 86_400_000)
}

// Marcas del eje de los kilos: números redondos (3 · 3,5 · 4…) que cubren
// del peso más bajo al más alto, con 3 o 4 marcas como mucho.
export function marcasKg(minimo: number, maximo: number): number[] {
  const margen = Math.max((maximo - minimo) * 0.15, maximo * 0.03, 0.01)
  const desde = Math.max(0, minimo - margen)
  const hasta = maximo + margen
  const pasos = [0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 5, 10, 20, 25, 50, 100]
  const paso = pasos.find((p) => (hasta - desde) / p <= 3) ?? 100
  const primera = Math.floor(desde / paso) * paso
  const marcas: number[] = []
  for (let valor = primera; valor < hasta + paso; valor += paso) {
    marcas.push(Math.round(valor * 1000) / 1000)
  }
  return marcas
}
