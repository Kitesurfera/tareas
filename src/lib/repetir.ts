import { sumarDias } from './fechas'
import type { Tarea } from './tipos'

// Tareas a mano que se repiten (columnas repetir_* de «tareas»). La
// siguiente vez la crea la base de datos al marcarla como hecha
// (cerrar_tarea); aquí solo se elige y se enseña, y se prevén las
// siguientes veces para el calendario y «La semana».

export type UnidadRepetir = 'dias' | 'semanas' | 'meses' | 'anios'
export type RepetirDesde = 'fecha' | 'hecha'
export type Repeticion = { cada: number; unidad: UnidadRepetir; desde: RepetirDesde }

export const UNIDADES: { valor: UnidadRepetir; una: string; varias: string }[] = [
  { valor: 'dias', una: 'día', varias: 'días' },
  { valor: 'semanas', una: 'semana', varias: 'semanas' },
  { valor: 'meses', una: 'mes', varias: 'meses' },
  { valor: 'anios', una: 'año', varias: 'años' },
]

// Las de siempre, para elegir de un toque.
export const RAPIDAS: { cada: number; unidad: UnidadRepetir }[] = [
  { cada: 1, unidad: 'dias' },
  { cada: 1, unidad: 'semanas' },
  { cada: 2, unidad: 'semanas' },
  { cada: 1, unidad: 'meses' },
  { cada: 3, unidad: 'meses' },
  { cada: 6, unidad: 'meses' },
  { cada: 1, unidad: 'anios' },
]

// «cada mes», «cada 3 meses», «cada día»…
export function cadaCuanto(cada: number, unidad: UnidadRepetir): string {
  const u = UNIDADES.find((x) => x.valor === unidad) ?? UNIDADES[0]
  return cada === 1 ? `cada ${u.una}` : `cada ${cada} ${u.varias}`
}

export function repeticionDe(tarea: Pick<Tarea, 'repetir_cada' | 'repetir_unidad' | 'repetir_desde'>): Repeticion | null {
  if (!tarea.repetir_cada || !tarea.repetir_unidad || !tarea.repetir_desde) return null
  return { cada: tarea.repetir_cada, unidad: tarea.repetir_unidad, desde: tarea.repetir_desde }
}

// «🔁 Cada mes» (y «desde que se hace» si es así).
export function textoRepeticion(r: Repeticion): string {
  const texto = cadaCuanto(r.cada, r.unidad)
  return `${texto.charAt(0).toUpperCase()}${texto.slice(1)}${r.desde === 'hecha' ? ', desde que se hace' : ''}`
}

const dosCifras = (n: number) => String(n).padStart(2, '0')

// Meses o años desde una fecha, como Postgres: si el día no existe en ese
// mes, el último (31 de enero + 1 mes = 28 de febrero).
export function sumarMesesComoLaBase(fecha: string, meses: number): string {
  const [a, m, d] = fecha.split('-').map(Number)
  const total = a * 12 + (m - 1) + meses
  const anio = Math.floor(total / 12)
  const mes = (total % 12) + 1
  const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate()
  return `${anio}-${dosCifras(mes)}-${dosCifras(Math.min(d, ultimo))}`
}

// La vez número «n» después de «base» (n = 1 es la siguiente).
export function vezNumero(base: string, r: Pick<Repeticion, 'cada' | 'unidad'>, n: number): string {
  switch (r.unidad) {
    case 'dias':
      return sumarDias(base, r.cada * n)
    case 'semanas':
      return sumarDias(base, 7 * r.cada * n)
    case 'meses':
      return sumarMesesComoLaBase(base, r.cada * n)
    case 'anios':
      return sumarMesesComoLaBase(base, 12 * r.cada * n)
  }
}

// Las siguientes veces previstas entre dos fechas. «En su fecha»: desde la
// fecha de la tarea (como la base de datos, desde la primera fecha de la
// serie, para que un 31 siga siendo 31). «Desde que se hace»: suponiendo
// que se hace el día que toca (u hoy, si va atrasada).
export function siguientesVeces(tarea: Tarea, desde: string, hasta: string, hoy: string): string[] {
  const r = repeticionDe(tarea)
  if (!r || !tarea.fecha_limite) return []
  const veces: string[] = []
  if (r.desde === 'hecha') {
    const base = tarea.fecha_limite > hoy ? tarea.fecha_limite : hoy
    for (let n = 1; n < 400; n++) {
      const fecha = vezNumero(base, r, n)
      if (fecha > hasta) break
      if (fecha >= desde) veces.push(fecha)
    }
    return veces
  }
  const ancla = tarea.repetir_ancla ?? tarea.fecha_limite
  // Cuántas veces van desde la primera fecha hasta esta.
  let actual = 0
  while (actual < 1200 && vezNumero(ancla, r, actual) < tarea.fecha_limite) actual++
  for (let n = actual + 1; n < actual + 400; n++) {
    const fecha = vezNumero(ancla, r, n)
    if (fecha > hasta) break
    if (fecha >= desde) veces.push(fecha)
  }
  return veces
}
