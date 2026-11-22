import { cuandoToca, fechaCorta, hoyComoTexto, sumarDias } from '../lib/fechas'
import { infoCategoria, usePlanes } from '../lib/planes'
import { reemplazar } from '../lib/ruta'
import { TituloSeccion } from './Piezas'


// En el inicio: los planes del calendario de los próximos 30 días.
// Si no hay ninguno, no se enseña (para no llenar el inicio).
export function TarjetaPlanes() {
  const { datos } = usePlanes()
  if (!datos) return null
  const hoy = hoyComoTexto()
  const proximos = datos.agenda
    .filter((e) => !e.hecho && e.fecha >= hoy && e.fecha <= sumarDias(hoy, 30))
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
  if (proximos.length === 0) return null

  return (
    <section className="tarjeta">
      <TituloSeccion dibujo="🎉" titulo="Próximos planes" subtitulo="Lo que tenéis en el calendario" color="planes" />
      <ul className="mt-2 divide-y divide-stone-100">
        {proximos.slice(0, 3).map((e) => {
          const plan = datos.planes.find((p) => p.id === e.plan_id)
          const info = infoCategoria(datos.categorias, plan?.categoria_id ?? null)
          return (
            <li key={e.id} className="flex items-center gap-3 py-2.5">
              <span aria-hidden="true" className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-lg ${info.suave}`}>
                {info.dibujo}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{plan?.nombre ?? 'Plan'}</span>
                <span className={`block text-sm ${e.fecha === hoy ? 'font-semibold text-planes-tinta' : 'text-stone-500'}`}>
                  {fechaCorta(e.fecha)} · {cuandoToca(e.fecha)}
                </span>
              </span>
            </li>
          )
        })}
      </ul>
      <button type="button" onClick={() => reemplazar('/planes')} className="mt-2 text-sm font-semibold text-planes-tinta">
        {proximos.length > 3 ? `Ver los ${proximos.length} ›` : 'Ir a Planes ›'}
      </button>
    </section>
  )
}
