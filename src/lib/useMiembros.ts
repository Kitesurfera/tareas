import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { Miembro } from './tipos'

// La gente de tu hogar (gracias a RLS, nunca llega la de otro hogar).
// null = cargando.
export function useMiembros() {
  const [miembros, setMiembros] = useState<Miembro[] | null>(null)
  const [error, setError] = useState(false)

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
        else setMiembros(data as Miembro[])
      })
    return () => {
      vigente = false
    }
  }, [])

  return { miembros, error }
}
