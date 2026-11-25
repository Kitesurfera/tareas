import { hoyComoTexto } from '../lib/fechas'
import { TIPOS_FECHA, cuandoFalta, proximasFechas, useRegalos } from '../lib/regalos'
import { ir } from '../lib/ruta'

// En la pestaña Tareas: el acceso a «🎁 Regalos», con la próxima fecha.
export function TarjetaRegalos() {
  const { datos } = useRegalos()
  const proxima = datos ? proximasFechas(datos.fechas, hoyComoTexto())[0] : undefined

  return (
    <button
      type="button"
      onClick={() => ir('/regalos')}
      className="tarjeta flex items-center gap-3 text-left transition hover:brightness-[0.99] active:scale-[0.99]"
    >
      <span aria-hidden="true" className="flex h-11 w-11 shrink-0 -rotate-6 items-center justify-center rounded-2xl bg-tareas text-2xl">
        🎁
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-bold">Regalos</span>
        <span className="block truncate text-sm text-stone-600">
          {proxima
            ? `${TIPOS_FECHA[proxima.fecha.tipo].dibujo} ${proxima.fecha.titulo} · ${cuandoFalta(proxima.dias).toLowerCase()}`
            : 'Fechas especiales, listas de deseos e ideas'}
        </span>
      </span>
      <span aria-hidden="true" className="text-xl text-stone-400">
        ›
      </span>
    </button>
  )
}
