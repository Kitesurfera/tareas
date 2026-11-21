import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { Mascota } from './tipos'

// Nombre e id de las mascotas del hogar (para listas y selectores).
export function useMascotasDelHogar() {
  const [mascotas, setMascotas] = useState<Pick<Mascota, 'id' | 'nombre'>[] | null>(null)

  useEffect(() => {
    if (!supabase) return
    let vigente = true
    supabase
      .from('mascotas')
      .select('id, nombre')
      .order('creado_en')
      .then(({ data }) => {
        if (vigente) setMascotas((data ?? []) as Pick<Mascota, 'id' | 'nombre'>[])
      })
    return () => {
      vigente = false
    }
  }, [])

  return mascotas
}
