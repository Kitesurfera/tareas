// Estilos que se repiten en varias pantallas.
// Campo de texto sin anchura fija (para combinar con w-24, flex-1…).
export const campoBase =
  'rounded-xl border border-stone-300 bg-white px-4 py-3 text-base outline-none focus:border-marca focus:ring-2 focus:ring-marca/20'

// Campo de texto que ocupa todo el ancho.
export const campo = `w-full ${campoBase}`

export const botonPrincipal =
  'w-full rounded-full bg-marca px-5 py-3 font-semibold text-white shadow-sm transition active:scale-[0.98] disabled:opacity-60'

export const botonSecundario =
  'w-full rounded-full px-5 py-3 font-semibold text-marca ring-1 ring-marca transition active:scale-[0.98] disabled:opacity-60'

export const avisoError = 'rounded-xl bg-red-50 p-3 text-sm text-red-700'

// Botón tipo «píldora» para elegir una opción.
export function estiloChip(activo: boolean): string {
  return `rounded-full px-4 py-2 text-sm font-medium ring-1 transition ${
    activo ? 'bg-marca text-white ring-marca' : 'bg-white text-stone-700 ring-stone-300'
  }`
}
