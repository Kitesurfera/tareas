// El texto del aviso del domingo con el resumen de la semana (lo usan el
// aviso programado y el botón «Probar el resumen del domingo»).
// OJO: se ejecuta en el SERVIDOR (funciones de Vercel), nunca en el móvil.
import type { Aviso } from './avisos.js'

// Lo que devuelve resumen_de_la_semana para cada móvil.
export type CuentasSemana = {
  tareas: number
  atrasadas: number
  tuyas: number
  planes: number
  renovaciones: number
  importe: number | string | null
  documentos: number
  fuera: string[] | null
  yo_fuera: boolean
  dias_sin_nadie: number
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic']

const fecha = (texto: string) => new Date(`${texto}T00:00:00Z`)
const comoTexto = (d: Date) => d.toISOString().slice(0, 10)

export function sumarDias(texto: string, dias: number): string {
  const d = fecha(texto)
  d.setUTCDate(d.getUTCDate() + dias)
  return comoTexto(d)
}

// 0 = domingo, 1 = lunes… 6 = sábado.
export const diaDeLaSemana = (texto: string) => fecha(texto).getUTCDay()

// El lunes de la semana de ese día.
export const lunesDe = (texto: string) => sumarDias(texto, -((diaDeLaSemana(texto) + 6) % 7))

// «30 nov»
export const diaMes = (texto: string) => `${Number(texto.slice(8, 10))} ${MESES[Number(texto.slice(5, 7)) - 1]}`

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

// «Ana», «Ana y tú», «Ana, Bea y tú».
function personas(nombres: string[]): string {
  if (nombres.length <= 1) return nombres[0] ?? ''
  return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`
}

export function hayAlgo(c: CuentasSemana): boolean {
  return c.tareas + c.planes + c.renovaciones + c.documentos + c.dias_sin_nadie > 0 || c.yo_fuera || (c.fuera?.length ?? 0) > 0
}

// «📆 Vuestra semana del 30 nov al 6 dic»
// «6 tareas (1 atrasada), 4 tuyas · 1 plan 🎉 · 2 renovaciones (309,99 €)
//  ✈️ Fuera: Bea · 🏠 1 día sin nadie en casa»
export function avisoDeLaSemana(c: CuentasSemana, lunes: string): Aviso {
  const lineas: string[] = []

  const cosas: string[] = []
  if (c.tareas > 0) {
    let texto = plural(c.tareas, 'tarea', 'tareas')
    if (c.atrasadas > 0) texto += ` (${plural(c.atrasadas, 'atrasada', 'atrasadas')})`
    if (c.tuyas > 0) texto += `, ${plural(c.tuyas, 'tuya', 'tuyas')}`
    cosas.push(texto)
  }
  if (c.planes > 0) cosas.push(`${plural(c.planes, 'plan', 'planes')} 🎉`)
  if (c.renovaciones > 0) {
    const importe = Number(c.importe ?? 0)
    const euros = importe > 0 ? ` (${importe.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })})` : ''
    cosas.push(plural(c.renovaciones, 'renovación', 'renovaciones') + euros)
  }
  if (c.documentos > 0) cosas.push(c.documentos === 1 ? '1 documento caduca' : `${c.documentos} documentos caducan`)
  if (cosas.length > 0) lineas.push(cosas.join(' · '))

  const casa: string[] = []
  const fuera = [...(c.fuera ?? []), ...(c.yo_fuera ? ['tú'] : [])]
  if (fuera.length > 0) casa.push(`✈️ Fuera: ${personas(fuera)}`)
  if (c.dias_sin_nadie > 0) casa.push(`🏠 ${plural(c.dias_sin_nadie, 'día', 'días')} sin nadie en casa`)
  if (casa.length > 0) lineas.push(casa.join(' · '))

  return {
    title: `📆 Vuestra semana del ${diaMes(lunes)} al ${diaMes(sumarDias(lunes, 6))}`,
    body: lineas.length > 0 ? lineas.join('\n') : 'Semana tranquila: no hay nada apuntado 🌴',
    url: '/#/semana',
    tag: `semana-${lunes}`,
  }
}
