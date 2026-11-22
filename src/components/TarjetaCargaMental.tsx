import { mesActual, nombreDelMes, useEquipo } from '../lib/cargaMental'
import { ir } from '../lib/ruta'
import { useMiembros } from '../lib/useMiembros'
import { CifrasEquipo, ListaGracias, TusNumeros } from './PiezasEquipo'
import { TituloSeccion } from './Piezas'

// Tarjeta del inicio «En equipo»: lo de todas, las gracias y tus números.
export function TarjetaCargaMental() {
  const { miembros } = useMiembros()
  const mes = mesActual()
  const { datos, error } = useEquipo(mes, 3)
  const variasPersonas = (miembros?.length ?? 0) > 1

  return (
    <section className="tarjeta">
      <TituloSeccion dibujo="💚" titulo="En equipo" subtitulo={`Lo pensado y hecho en casa · ${nombreDelMes(mes)}`} color="coral" />

      {error && <p className="mt-3 text-sm text-red-700">No se ha podido cargar.</p>}
      {!datos && !error && <p className="mt-3 text-sm text-stone-400">Cargando…</p>}

      {datos && (
        <div className="mt-4 flex flex-col gap-4">
          <CifrasEquipo pensar={datos.equipo.pensar} hacer={datos.equipo.hacer} />

          {variasPersonas && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-stone-800">Gracias por acordarte</h3>
              {datos.gracias.length > 0 ? (
                <ListaGracias gracias={datos.gracias} />
              ) : (
                <p className="text-sm text-stone-500">
                  Aquí aparecerá lo que se le ocurra al resto del hogar, para darle las gracias.
                </p>
              )}
            </div>
          )}

          <div>
            <h3 className="mb-2 text-sm font-semibold text-stone-800">Tú este mes</h3>
            <TusNumeros mio={datos.mio} />
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => ir('/carga')}
        className="mt-4 w-full rounded-full px-3 py-2.5 text-sm font-semibold bg-marca-suave/70 text-marca ring-1 ring-marca/15 active:scale-[0.98]"
      >
        Ver más y otros meses
      </button>
    </section>
  )
}
