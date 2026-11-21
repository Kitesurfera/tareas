import { useState } from 'react'
import type { Mascota } from '../lib/tipos'

const DIBUJOS: Record<string, string> = {
  perro: '🐶',
  gato: '🐱',
  conejo: '🐰',
  pájaro: '🐦',
}

type Props = {
  mascota: Pick<Mascota, 'nombre' | 'especie'>
  enlace?: string
  tamano?: 'pequena' | 'grande'
}

// Foto redonda de la mascota. Si no tiene foto, un dibujo según la especie.
export function FotoMascota({ mascota, enlace, tamano = 'pequena' }: Props) {
  const medidas = tamano === 'grande' ? 'h-32 w-32 text-6xl' : 'h-12 w-12 text-2xl'
  // Si la foto no carga (por ejemplo, su enlace temporal ha caducado),
  // enseñamos el dibujo en vez de una imagen rota.
  const [enlaceRoto, setEnlaceRoto] = useState<string | null>(null)
  if (enlace && enlace !== enlaceRoto) {
    return (
      <img
        src={enlace}
        alt={`Foto de ${mascota.nombre}`}
        onError={() => setEnlaceRoto(enlace)}
        className={`${medidas} shrink-0 rounded-full object-cover`}
      />
    )
  }
  return (
    <span
      aria-hidden="true"
      className={`${medidas} flex shrink-0 items-center justify-center rounded-full bg-marca-suave`}
    >
      {DIBUJOS[mascota.especie.toLowerCase()] ?? '🐾'}
    </span>
  )
}
