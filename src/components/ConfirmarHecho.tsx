import { useState } from 'react'
import { hoyComoTexto } from '../lib/fechas'
import { campo } from './estilos'

type Props = {
  enviando: boolean
  onConfirmar: (fecha: string) => void
  onCancelar: () => void
}

// Recuadro «¿Cuándo se hizo?» con fecha (hoy por defecto) y botones.
export function ConfirmarHecho({ enviando, onConfirmar, onCancelar }: Props) {
  const [fecha, setFecha] = useState(hoyComoTexto())
  return (
    <div className="mt-3 flex flex-col gap-3 rounded-xl bg-stone-50 p-3">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-stone-700">¿Cuándo se hizo?</span>
        <input
          type="date"
          className={campo}
          value={fecha}
          max={hoyComoTexto()}
          onChange={(e) => setFecha(e.target.value)}
          required
        />
      </label>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancelar}
          className="flex-1 rounded-full px-4 py-2 text-sm font-medium text-stone-600 ring-1 ring-stone-300"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => onConfirmar(fecha)}
          disabled={enviando || !fecha}
          className="flex-1 rounded-full bg-linear-to-b from-marca to-[#0b5f58] shadow-[0_6px_14px_-6px_rgb(15_118_110/0.6)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {enviando ? 'Guardando…' : 'Confirmar'}
        </button>
      </div>
    </div>
  )
}
