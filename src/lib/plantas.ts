import type { TipoCuidado } from './tipos'

// Frecuencias que se ofrecen como botones según el cuidado.
export const FRECUENCIAS_CUIDADO: Record<TipoCuidado, number[]> = {
  riego: [2, 3, 7, 14],
  abono: [14, 30, 60],
  trasplante: [365, 730],
  poda: [90, 182, 365],
  otro: [7, 30, 90],
}

// Ejemplo para las notas de cada cuidado.
export const EJEMPLO_NOTAS: Record<TipoCuidado, string> = {
  riego: 'Medio litro, sin mojar las hojas',
  abono: 'Abono líquido, 5 ml en el agua del riego',
  trasplante: 'Maceta un poco más grande, tierra universal',
  poda: 'Quitar las hojas secas',
  otro: 'Lo que haya que saber',
}
