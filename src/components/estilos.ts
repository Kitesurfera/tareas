// Estilos que se repiten en varias pantallas.
// Campo de texto sin anchura fija (para combinar con w-24, flex-1…).
export const campoBase =
  'rounded-xl border border-stone-300 bg-white px-4 py-3 text-base outline-none focus:border-marca focus:ring-2 focus:ring-marca/20'

// Campo de texto que ocupa todo el ancho.
export const campo = `w-full ${campoBase}`

// Botón principal: verde con un degradado suave y sombra de su color.
export const botonPrincipal =
  'w-full rounded-full bg-linear-to-b from-marca to-[#0b5f58] px-5 py-3 font-semibold text-white shadow-[0_8px_18px_-8px_rgb(15_118_110/0.7)] transition hover:brightness-110 active:scale-[0.98] disabled:opacity-60 disabled:hover:brightness-100'

// Botón secundario: relleno suave en vez de solo el borde.
export const botonSecundario =
  'w-full rounded-full bg-marca-suave/70 px-5 py-3 font-semibold text-marca ring-1 ring-marca/15 transition hover:bg-marca-suave active:scale-[0.98] disabled:opacity-60'

export const avisoError = 'rounded-xl bg-red-50 p-3 text-sm text-red-700'

// Botón tipo «píldora» para elegir una opción.
export function estiloChip(activo: boolean): string {
  return `rounded-full px-4 py-2 text-sm font-medium ring-1 transition ${
    activo ? 'bg-marca text-white ring-marca' : 'bg-white text-stone-700 ring-stone-300 hover:bg-stone-50'
  }`
}
