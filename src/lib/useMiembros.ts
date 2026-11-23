import { useEffect, useState } from 'react'
import { recordarOrdenDePersonas } from './colores'
import { supabase } from './supabase'
import type { Miembro } from './tipos'

// La gente de tu hogar (gracias a RLS, nunca llega la de otro hogar).
// null = cargando.
export function useMiembros() {
  const [miembros, setMiembros] = useState<Miembro[] | null>(null)
  const [error, setError] = useState(false)
  const [recarga, setRecarga] = useState(0)

  useEffect(() => {
    if (!supabase) return
    let vigente = true
    supabase
      .from('miembros')
      .select('id, user_id, nombre_visible, rol')
      .order('creado_en')
      .then(({ data, error }) => {
        if (!vigente) return
        if (error) setError(true)
        else {
          // Cada persona, su color (por orden de llegada al hogar).
          recordarOrdenDePersonas((data as Miembro[]).map((m) => m.id))
          setMiembros(data as Miembro[])
        }
      })
    return () => {
      vigente = false
    }
  }, [recarga])

  return { miembros, error, recargar: () => setRecarga((n) => n + 1) }
}
