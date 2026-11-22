import { edad, fechaLarga } from '../lib/fechas'
import { ir, volver } from '../lib/ruta'
import { useMascota } from '../lib/useMascota'
import { avisoError, botonSecundario } from './estilos'
import { FotoMascota } from './FotoMascota'
import { SeccionPeso } from './SeccionPeso'
import { SeccionSalud } from './SeccionSalud'

type Props = {
  id: string
  miUserId: string
}

// Ficha de una mascota: foto, datos básicos y notas.
export function PantallaFichaMascota({ id, miUserId }: Props) {
  const { mascota, foto, error } = useMascota(id)

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col gap-6 px-5 py-8 md:max-w-2xl md:px-6 lg:max-w-6xl lg:px-10 lg:py-10">
      <button
        type="button"
        onClick={() => volver('/')}
        className="self-start text-sm font-medium text-marca"
      >
        ← Inicio
      </button>

      {mascota === undefined && !error && (
        <p className="text-center text-stone-400">Cargando…</p>
      )}

      {error && <p role="alert" className={avisoError}>{error}</p>}

      {mascota === null && !error && (
        <p className="text-center text-stone-500">
          No encontramos esta mascota en tu hogar.
        </p>
      )}

      {mascota && (
        // En el ordenador: la ficha a la izquierda; salud y peso a la derecha.
        <div className="contents lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] lg:items-start lg:gap-6">
          <div className="contents lg:sticky lg:top-6 lg:flex lg:flex-col lg:gap-6">
            <header className="flex flex-col items-center gap-3 text-center lg:rounded-3xl lg:bg-white lg:p-6 lg:shadow-[0_1px_2px_rgb(60_40_20/0.04),0_10px_24px_-14px_rgb(60_40_20/0.22)] lg:ring-1 lg:ring-stone-900/5">
              <FotoMascota mascota={mascota} enlace={foto} tamano="grande" />
              <div>
                <h1 className="text-3xl font-extrabold text-marca">{mascota.nombre}</h1>
                <p className="text-stone-600">
                  {[mascota.especie, mascota.raza].filter(Boolean).join(' · ')}
                </p>
              </div>
            </header>

            <section className="tarjeta">
              <dl className="flex flex-col gap-3">
                <div>
                  <dt className="text-sm text-stone-500">Edad</dt>
                  <dd className="font-medium">
                    {mascota.fecha_nacimiento
                      ? `${edad(mascota.fecha_nacimiento)} (nació el ${fechaLarga(mascota.fecha_nacimiento)})`
                      : 'Sin fecha de nacimiento'}
                  </dd>
                </div>
                {mascota.notas && (
                  <div>
                    <dt className="text-sm text-stone-500">Notas</dt>
                    <dd className="whitespace-pre-line">{mascota.notas}</dd>
                  </div>
                )}
              </dl>
            </section>

            <button
              type="button"
              onClick={() => ir(`/mascotas/${mascota.id}/editar`)}
              // En el móvil va al final de todo; en el ordenador, debajo de la ficha.
              className={`order-last lg:order-none ${botonSecundario}`}
            >
              Editar ficha
            </button>
          </div>

          <div className="contents lg:flex lg:flex-col lg:gap-6">
            <SeccionSalud mascotaId={mascota.id} miUserId={miUserId} nombreMascota={mascota.nombre} />

            <SeccionPeso
              mascotaId={mascota.id}
              hogarId={mascota.hogar_id}
              nombreMascota={mascota.nombre}
              fechaNacimiento={mascota.fecha_nacimiento}
            />
          </div>
        </div>
      )}
    </main>
  )
}
