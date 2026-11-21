import { useEffect, useState } from 'react'
import { mensajeDeError } from './errores'
import { enlacesDeFotos } from './fotos'
import { supabase } from './supabase'
import type { Mascota } from './tipos'

type Estado = {
  id: string
  mascota: Mascota | null
  foto?: string
  error?: string
}

// Carga una mascota (y el enlace temporal de su foto) a partir de su id.
// mascota: undefined = cargando; null = no existe o no es de tu hogar.
export function useMascota(id: string) {
  const [estado, setEstado] = useState<Estado | null>(null)

  useEffect(() => {
    if (!supabase) return
    let vigente = true
    supabase
      .from('mascotas')
      .select('*')
      .eq('id', id)
      .maybeSingle()
      .then(async ({ data, error }) => {
        if (!vigente) return
        if (error) {
          setEstado({ id, mascota: null, error: mensajeDeError(error) })
          return
        }
        const mascota = data as Mascota | null
        const enlaces = mascota?.foto_ruta ? await enlacesDeFotos([mascota.foto_ruta]) : {}
        if (vigente) {
          setEstado({ id, mascota, foto: mascota?.foto_ruta ? enlaces[mascota.foto_ruta] : undefined })
        }
      })
    return () => {
      vigente = false
    }
  }, [id])

  // Si cambia el id, no enseñamos la mascota anterior mientras carga.
  const actual = estado?.id === id ? estado : null
  return {
    mascota: actual ? actual.mascota : undefined,
    foto: actual?.foto,
    error: actual?.error,
  }
}
