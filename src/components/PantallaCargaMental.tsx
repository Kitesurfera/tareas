import { useState } from 'react'
import { mesActual, moverMes, nombreDelMes, useEquipo, type Mio, type Origen } from '../lib/cargaMental'
import { volver } from '../lib/ruta'
import { useMiembros } from '../lib/useMiembros'
import { CifrasEquipo, ListaGracias, TusNumeros } from './PiezasEquipo'

// [singular, plural]
const TEXTOS_PENSAR: Record<Origen, [string, string]> = {
  tarea: ['tarea creada', 'tareas creadas'],
  tratamiento: ['tratamiento de mascota', 'tratamientos de mascota'],
  rutina: ['rutina de casa', 'rutinas de casa'],
  vencimiento: ['seguro o suscripción', 'seguros y suscripciones'],
  compra: ['cosa apuntada en la compra', 'cosas apuntadas en la compra'],
  cuidado: ['cuidado de planta', 'cuidados de plantas'],
}
const TEXTOS_HACER: Partial<Record<Origen, [string, string]>> = {
  tarea: ['tarea hecha', 'tareas hechas'],
  compra: ['cosa comprada', 'cosas compradas'],
}

const mayuscula = (texto: string) => texto.charAt(0).toUpperCase() + texto.slice(1)

function TuDesglose({ mio }: { mio: Mio }) {
  const linea = (desglose: Partial<Record<Origen, number>>, textos: Partial<Record<Origen, [string, string]>>) =>
    (Object.entries(desglose) as [Origen, number][])
      .filter(([, n]) => n > 0)
      .map(([origen, n]) => `${n} ${textos[origen]?.[n === 1 ? 0 : 1] ?? origen}`)
      .join(' · ')
  return (
    <div className="mt-3 text-sm text-stone-600">
      <p>💭 Pensado: {linea(mio.pensarPor, TEXTOS_PENSAR) || 'nada todavía'}</p>
      <p>✋ Hecho: {linea(mio.hacerPor, TEXTOS_HACER) || 'nada todavía'}</p>
    </div>
  )
}

// Pantalla «En equipo», mes a mes.
export function PantallaCargaMental() {
  const { miembros } = useMiembros()
  const [mes, setMes] = useState(mesActual())
  const { datos, error } = useEquipo(mes, 50)
  const esEsteMes = mes === mesActual()
  const variasPersonas = (miembros?.length ?? 0) > 1

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col gap-5 px-5 py-8 md:max-w-2xl md:px-6 lg:max-w-3xl lg:px-10 lg:py-10">
      <button type="button" onClick={() => volver('/')} className="self-start text-sm font-medium text-marca">
        ← Inicio
      </button>

      <header>
        <h1 className="text-2xl font-extrabold text-marca">En equipo</h1>
        <p className="text-stone-600">Lo que hay que recordar, entre todas</p>
      </header>

      <div className="flex items-center justify-between rounded-full bg-white px-2 py-1 shadow-sm">
        <button
          type="button"
          onClick={() => setMes((m) => moverMes(m, -1))}
          aria-label="Mes anterior"
          className="rounded-full px-4 py-2 text-xl text-marca"
        >
          ‹
        </button>
        <span className="font-medium">{mayuscula(nombreDelMes(mes))}</span>
        <button
          type="button"
          onClick={() => setMes((m) => moverMes(m, 1))}
          disabled={esEsteMes}
          aria-label="Mes siguiente"
          className="rounded-full px-4 py-2 text-xl text-marca disabled:text-stone-300"
        >
          ›
        </button>
      </div>

      {error && <p className="text-sm text-red-700">No se ha podido cargar.</p>}
      {!datos && !error && <p className="text-center text-sm text-stone-400">Cargando…</p>}

      {datos && (
        <>
          <section className="tarjeta">
            <h2 className="mb-3 font-semibold">🤝 Entre todas</h2>
            <CifrasEquipo pensar={datos.equipo.pensar} hacer={datos.equipo.hacer} />
          </section>

          {variasPersonas && (
            <section className="tarjeta">
              <h2 className="mb-3 font-semibold">💚 Gracias por acordarte</h2>
              {datos.gracias.length > 0 ? (
                <ListaGracias gracias={datos.gracias} />
              ) : (
                <p className="text-sm text-stone-500">
                  {esEsteMes
                    ? 'Este mes aún no hay nada por aquí. Cuando alguien más apunte algo, aparecerá para darle las gracias.'
                    : 'Ese mes no hubo nada por aquí.'}
                </p>
              )}
            </section>
          )}

          <section className="tarjeta">
            <h2 className="mb-3 font-semibold">{esEsteMes ? 'Tú este mes' : 'Tú ese mes'}</h2>
            <TusNumeros mio={datos.mio} esteMes={esEsteMes} />
            {datos.mio.pensar + datos.mio.hacer > 0 && <TuDesglose mio={datos.mio} />}
          </section>
        </>
      )}

      <section className="rounded-2xl bg-marca-suave p-5 text-sm text-stone-700">
        <h2 className="mb-2 font-semibold text-marca">💡 ¿Para qué sirve esto?</h2>
        <p>
          <strong>💭 Pensar</strong> es la parte invisible: darse cuenta de que algo
          hay que hacer y apuntarlo. <strong>✋ Hacer</strong> es completar tareas y
          comprar lo de la lista. Las dos cuentan.
        </p>
        <p className="mt-2">
          No es una competición: aquí nadie ve los números de nadie. Lo importante
          es que nada se quede solo en la cabeza de una persona, y dar las gracias
          por lo que no se ve.
        </p>
      </section>
    </main>
  )
}
