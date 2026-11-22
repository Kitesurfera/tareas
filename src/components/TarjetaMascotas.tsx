import { useEffect, useState } from 'react'
import { mensajeDeError } from '../lib/errores'
import { edad } from '../lib/fechas'
import { enlacesDeFotos } from '../lib/fotos'
import { ir } from '../lib/ruta'
import { supabase } from '../lib/supabase'
import type { Mascota } from '../lib/tipos'
import { avisoError, botonSecundario } from './estilos'
import { FotoMascota } from './FotoMascota'

// Tarjeta del inicio con las mascotas del hogar.
export function TarjetaMascotas() {
  const [mascotas, setMascotas] = useState<Mascota[] | null>(null)
  const [fotos, setFotos] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!supabase) return
    let vigente = true
    // Gracias a RLS, solo llegan las mascotas de tu hogar.
    supabase
      .from('mascotas')
      .select('*')
      .order('creado_en')
      .then(async ({ data, error }) => {
        if (!vigente) return
        if (error) {
          setError(mensajeDeError(error))
          return
        }
        const lista = data as Mascota[]
        setMascotas(lista)
        const rutas = lista.flatMap((m) => (m.foto_ruta ? [m.foto_ruta] : []))
        const enlaces = await enlacesDeFotos(rutas)
        if (vigente) setFotos(enlaces)
      })
    return () => {
      vigente = false
    }
  }, [])

  return (
    <section className="tarjeta">
      <h2 className="text-lg font-semibold">🐾 Mascotas</h2>

      {mascotas === null && !error && (
        <p className="mt-2 text-sm text-stone-400">Cargando…</p>
      )}

      {mascotas?.length === 0 && (
        <p className="mt-2 text-stone-500">
          Añade a tu mascota para llevar al día sus vacunas,
          desparasitaciones y medicación.
        </p>
      )}

      {mascotas && mascotas.length > 0 && (
        <ul className="mt-3 flex flex-col">
          {mascotas.map((mascota) => (
            <li key={mascota.id}>
              <button
                type="button"
                onClick={() => ir(`/mascotas/${mascota.id}`)}
                className="flex w-full items-center gap-3 rounded-xl py-2 text-left active:bg-stone-50"
              >
                <FotoMascota
                  mascota={mascota}
                  enlace={mascota.foto_ruta ? fotos[mascota.foto_ruta] : undefined}
                />
                <span className="flex-1">
                  <span className="block font-medium">{mascota.nombre}</span>
                  <span className="block text-sm text-stone-500">
                    {mascota.especie}
                    {mascota.fecha_nacimiento && ` · ${edad(mascota.fecha_nacimiento)}`}
                  </span>
                </span>
                <span aria-hidden="true" className="text-stone-300">›</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && <p role="alert" className={`mt-3 ${avisoError}`}>{error}</p>}

      <button
        type="button"
        onClick={() => ir('/mascotas/nueva')}
        className={`mt-4 ${botonSecundario}`}
      >
        + Añadir mascota
      </button>
    </section>
  )
}
