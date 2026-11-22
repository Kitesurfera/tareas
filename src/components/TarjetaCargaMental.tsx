import { fraseDelReparto, mesActual, nombreDelMes, useCargaMental } from '../lib/cargaMental'
import { ir } from '../lib/ruta'
import { useMiembros } from '../lib/useMiembros'
import { GraficaReparto } from './GraficaReparto'

// Tarjeta del inicio: cómo os repartís pensar y hacer este mes.
export function TarjetaCargaMental({ miUserId }: { miUserId: string }) {
  const { miembros } = useMiembros()
  const mes = mesActual()
  const { personas, error } = useCargaMental(mes, miembros, miUserId)

  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold">Carga mental</h2>
      <p className="text-sm text-stone-500">Quién piensa y quién hace · {nombreDelMes(mes)}</p>

      {error && <p className="mt-3 text-sm text-red-700">No se ha podido cargar el reparto.</p>}
      {!personas && !error && <p className="mt-3 text-sm text-stone-400">Cargando…</p>}

      {personas && (
        <>
          <div className="mt-4">
            <GraficaReparto personas={personas} />
          </div>
          <p className="mt-3 text-sm text-stone-600">{fraseDelReparto(personas)}</p>
        </>
      )}

      <button
        type="button"
        onClick={() => ir('/carga')}
        className="mt-3 w-full rounded-full px-3 py-2.5 text-sm font-semibold text-marca ring-1 ring-marca active:scale-[0.98]"
      >
        Ver detalle y otros meses
      </button>
    </section>
  )
}
