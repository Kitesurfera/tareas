import { estadoAcceso, useAccesos, useNotasEncargo } from '../lib/accesos'
import { hoyComoTexto, sumarDias } from '../lib/fechas'
import { ir } from '../lib/ruta'
import { diaMes } from '../lib/viajes'

// En el inicio: quién os ayuda ahora (acceso temporal) y sus últimas notas.
export function TarjetaAyuda() {
  const { accesos } = useAccesos()
  const { notas } = useNotasEncargo(3)
  if (!accesos || !notas) return null
  const activos = accesos.filter((a) => estadoAcceso(a) === 'activo')
  // Notas de los últimos 7 días (comparando días «2026-11-22» como texto).
  const haceUnaSemana = sumarDias(hoyComoTexto(), -7)
  const recientes = notas.filter((n) => new Date(n.creado_en).toLocaleDateString('sv-SE') > haceUnaSemana)
  if (activos.length === 0 && recientes.length === 0) return null

  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm">
      <h2 className="font-semibold">🔑 Quién os ayuda</h2>
      <ul className="mt-2 flex flex-col gap-1 text-stone-700">
        {activos.map((a) => (
          <li key={a.id}>
            {a.nombre} tiene acceso hasta el {diaMes(a.hasta)}.
          </li>
        ))}
      </ul>
      {recientes.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {recientes.map((n) => (
            <li key={n.id} className="rounded-xl bg-stone-50 p-3 text-sm">
              <span className="block text-stone-500">
                📝 {n.autora}
                {n.tarea_titulo && ` · al hacer «${n.tarea_titulo}»`}
              </span>
              <span className="block whitespace-pre-line text-stone-800">{n.texto}</span>
            </li>
          ))}
        </ul>
      )}
      <button type="button" onClick={() => ir('/accesos')} className="mt-3 text-sm font-semibold text-marca">
        Ver accesos y notas ›
      </button>
    </section>
  )
}
