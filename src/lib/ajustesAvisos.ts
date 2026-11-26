import { useEffect, useState } from 'react'
import { mensajeDeError } from './errores'
import { supabase } from './supabase'

// ⏰ Avisos a tu medida (tabla ajustes_avisos): cómo te llegan los avisos.
// Solo los ves y cambias tú. Qué aviso toca a cada hora lo decide el
// servidor (api/_lib/horarios.ts); aquí solo se eligen.

export type AjustesAvisos = {
  // Hora del aviso diario (6 a 23).
  hora: number
  // Segundo aviso por la tarde, solo si te queda algo de hoy.
  tarde: boolean
  hora_tarde: number
  // Días SIN aviso diario: 1 = lunes … 7 = domingo.
  dias_libres: number[]
  // Sin ningún aviso hasta este día (incluido).
  pausa_hasta: string | null
  resumen_semanal: boolean
}

// Si no has elegido nada: lo de siempre.
export const AJUSTES_POR_DEFECTO: AjustesAvisos = {
  hora: 8,
  tarde: false,
  hora_tarde: 20,
  dias_libres: [],
  pausa_hasta: null,
  resumen_semanal: true,
}

const desde = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i)
export const HORAS_DEL_AVISO = desde(6, 23)
// La de la tarde: desde las 12 y siempre después de la de la mañana.
export const horasDeLaTarde = (hora: number) => desde(Math.max(12, hora + 1), 23)

export const DIAS_SEMANA = [
  { n: 1, corto: 'L', largo: 'lunes' },
  { n: 2, corto: 'M', largo: 'martes' },
  { n: 3, corto: 'X', largo: 'miércoles' },
  { n: 4, corto: 'J', largo: 'jueves' },
  { n: 5, corto: 'V', largo: 'viernes' },
  { n: 6, corto: 'S', largo: 'sábado' },
  { n: 7, corto: 'D', largo: 'domingo' },
]

export const textoHora = (hora: number) => `${hora}:00`

// Que lo elegido tenga sentido: la tarde, después de la mañana (si la
// mañana es a las 23, ya no hay tarde).
export function coherentes(a: AjustesAvisos): AjustesAvisos {
  const posibles = horasDeLaTarde(a.hora)
  if (posibles.length === 0) return { ...a, tarde: false }
  if (!posibles.includes(a.hora_tarde)) return { ...a, hora_tarde: posibles.includes(20) ? 20 : posibles[0] }
  return a
}

// ¿En pausa hoy? (Una pausa que ya pasó no cuenta.)
export const enPausa = (a: AjustesAvisos, hoy: string) => a.pausa_hasta !== null && hoy <= a.pausa_hasta

const COLUMNAS = 'hora, tarde, hora_tarde, dias_libres, pausa_hasta, resumen_semanal'

function faltaElSql(codigo: string | undefined) {
  return codigo === '42P01' || codigo === 'PGRST205'
}

export function useAjustesAvisos() {
  // null = cargando.
  const [ajustes, setAjustes] = useState<AjustesAvisos | null>(null)
  const [faltaSql, setFaltaSql] = useState(false)

  useEffect(() => {
    if (!supabase) return
    let vigente = true
    supabase
      .from('ajustes_avisos')
      .select(COLUMNAS)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!vigente) return
        if (error) setFaltaSql(faltaElSql(error.code))
        setAjustes({ ...AJUSTES_POR_DEFECTO, ...((data as Partial<AjustesAvisos> | null) ?? {}) })
      })
    return () => {
      vigente = false
    }
  }, [])

  // Guarda todo de una vez (la primera vez, crea tu fila). Devuelve el error, si lo hay.
  async function guardar(nuevos: AjustesAvisos): Promise<string | null> {
    if (!supabase) return 'Sin conexión.'
    const antes = ajustes
    setAjustes(nuevos)
    const { error } = await supabase.from('ajustes_avisos').upsert(nuevos, { onConflict: 'user_id' })
    if (!error) return null
    setAjustes(antes)
    if (faltaElSql(error.code)) {
      setFaltaSql(true)
      return 'Falta ejecutar en Supabase el SQL de «Avisos a tu medida».'
    }
    return mensajeDeError(error)
  }

  return { ajustes, faltaSql, guardar }
}
