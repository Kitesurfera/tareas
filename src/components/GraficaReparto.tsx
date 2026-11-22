import type { Persona } from '../lib/cargaMental'

type Props = {
  personas: Persona[]
}

// Barra fina partida por personas (sin texto encima: las cifras van en la
// tabla de debajo, con la muestra de color de cada persona).
function BarraPartida({ titulo, personas, clave }: { titulo: string; personas: Persona[]; clave: 'pensar' | 'hacer' }) {
  const total = personas.reduce((s, p) => s + p[clave], 0)
  const conValor = personas.filter((p) => p[clave] > 0)
  return (
    <div className="flex items-center gap-3">
      <span className="w-16 shrink-0 text-sm font-medium text-stone-700">{titulo}</span>
      <div
        role="img"
        aria-label={
          total === 0
            ? `${titulo}: nada este mes`
            : `${titulo}: ` + conValor.map((p) => `${p.nombre} ${Math.round((p[clave] / total) * 100)}%`).join(', ')
        }
        className="flex h-2.5 flex-1 gap-[2px] overflow-hidden rounded-[4px] bg-stone-100"
      >
        {conValor.map((p) => (
          <div
            key={p.clave}
            title={`${p.nombre}: ${p[clave]} de ${total} (${Math.round((p[clave] / total) * 100)}%)`}
            style={{ width: `${(p[clave] / total) * 100}%`, backgroundColor: p.color }}
            className="h-full"
          />
        ))}
      </div>
    </div>
  )
}

// Reparto de pensar y hacer entre las personas del hogar.
export function GraficaReparto({ personas }: Props) {
  const total = (clave: 'pensar' | 'hacer') => personas.reduce((s, p) => s + p[clave], 0)
  return (
    <div className="flex flex-col gap-3">
      <BarraPartida titulo="Pensar" personas={personas} clave="pensar" />
      <BarraPartida titulo="Hacer" personas={personas} clave="hacer" />

      <table className="mt-1 w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-stone-500">
            <th className="pb-1 font-normal">
              <span className="sr-only">Persona</span>
            </th>
            <th className="pb-1 text-right font-normal">Pensado</th>
            <th className="pb-1 text-right font-normal">Hecho</th>
          </tr>
        </thead>
        <tbody>
          {personas.map((p) => (
            <tr key={p.clave} className="border-t border-stone-100">
              <td className="py-1.5">
                <span className="flex items-center gap-2 text-stone-800">
                  <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: p.color }} />
                  {p.nombre}
                </span>
              </td>
              <td className="py-1.5 text-right font-medium tabular-nums text-stone-800">{p.pensar}</td>
              <td className="py-1.5 text-right font-medium tabular-nums text-stone-800">{p.hacer}</td>
            </tr>
          ))}
          {personas.length > 1 && (
            <tr className="border-t border-stone-200 text-stone-500">
              <td className="py-1.5">Total</td>
              <td className="py-1.5 text-right tabular-nums">{total('pensar')}</td>
              <td className="py-1.5 text-right tabular-nums">{total('hacer')}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
