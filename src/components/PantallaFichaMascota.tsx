import { edad, fechaLarga } from '../lib/fechas'
import { ir, volver } from '../lib/ruta'
import { useMascota } from '../lib/useMascota'
import { avisoError, botonSecundario } from './estilos'
import { FotoMascota } from './FotoMascota'
import { SeccionPeso } from './SeccionPeso'
import { SeccionSalud } from './SeccionSalud'

type Props = {
  id: string
}

// Ficha de una mascota: foto, datos básicos y notas.
export function PantallaFichaMascota({ id }: Props) {
  const { mascota, foto, error } = useMascota(id)

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col gap-6 px-5 py-8">
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
        <>
          <header className="flex flex-col items-center gap-3 text-center">
            <FotoMascota mascota={mascota} enlace={foto} tamano="grande" />
            <div>
              <h1 className="text-3xl font-bold text-marca">{mascota.nombre}</h1>
              <p className="text-stone-600">
                {[mascota.especie, mascota.raza].filter(Boolean).join(' · ')}
              </p>
            </div>
          </header>

          <section className="rounded-2xl bg-white p-5 shadow-sm">
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

          <SeccionSalud mascotaId={mascota.id} nombreMascota={mascota.nombre} />

          <SeccionPeso
            mascotaId={mascota.id}
            hogarId={mascota.hogar_id}
            nombreMascota={mascota.nombre}
            fechaNacimiento={mascota.fecha_nacimiento}
          />

          <button
            type="button"
            onClick={() => ir(`/mascotas/${mascota.id}/editar`)}
            className={botonSecundario}
          >
            Editar ficha
          </button>
        </>
      )}
    </main>
  )
}
