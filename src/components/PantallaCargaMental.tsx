import { useState } from 'react'
import {
  fraseDelReparto,
  mesActual,
  moverMes,
  nombreDelMes,
  useCargaMental,
  type Origen,
  type Persona,
} from '../lib/cargaMental'
import { volver } from '../lib/ruta'
import { useMiembros } from '../lib/useMiembros'
import { GraficaReparto } from './GraficaReparto'

// [singular, plural]
const TEXTOS_PENSAR: Record<Origen, [string, string]> = {
  tarea: ['tarea creada', 'tareas creadas'],
  tratamiento: ['tratamiento de mascota', 'tratamientos de mascota'],
  rutina: ['rutina de casa', 'rutinas de casa'],
  vencimiento: ['seguro o suscripción', 'seguros y suscripciones'],
  compra: ['cosa apuntada en la compra', 'cosas apuntadas en la compra'],
}
const TEXTOS_HACER: Partial<Record<Origen, [string, string]>> = {
  tarea: ['tarea hecha', 'tareas hechas'],
  compra: ['cosa comprada', 'cosas compradas'],
}

const mayuscula = (texto: string) => texto.charAt(0).toUpperCase() + texto.slice(1)

function Desglose({ persona }: { persona: Persona }) {
  const linea = (desglose: Partial<Record<Origen, number>>, textos: Partial<Record<Origen, [string, string]>>) =>
    (Object.entries(desglose) as [Origen, number][])
      .filter(([, n]) => n > 0)
      .map(([origen, n]) => `${n} ${textos[origen]?.[n === 1 ? 0 : 1] ?? origen}`)
      .join(' · ')
  const pensar = linea(persona.pensarPor, TEXTOS_PENSAR)
  const hacer = linea(persona.hacerPor, TEXTOS_HACER)
  return (
    <li className="py-3">
      <p className="flex items-center gap-2 font-medium text-stone-800">
        <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: persona.color }} />
        {persona.nombre}
      </p>
      <p className="mt-1 text-sm text-stone-600">💭 Pensado: {pensar || 'nada'}</p>
      <p className="text-sm text-stone-600">✋ Hecho: {hacer || 'nada'}</p>
    </li>
  )
}

// Pantalla de detalle del contador de carga mental, mes a mes.
export function PantallaCargaMental({ miUserId }: { miUserId: string }) {
  const { miembros } = useMiembros()
  const [mes, setMes] = useState(mesActual())
  const { personas, error } = useCargaMental(mes, miembros, miUserId)
  const esEsteMes = mes === mesActual()

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col gap-5 px-5 py-8">
      <button type="button" onClick={() => volver('/')} className="self-start text-sm font-medium text-marca">
        ← Inicio
      </button>

      <header>
        <h1 className="text-2xl font-bold text-marca">Carga mental</h1>
        <p className="text-stone-600">Quién piensa las cosas y quién las hace</p>
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

      <section className="rounded-2xl bg-white p-5 shadow-sm">
        {error && <p className="text-sm text-red-700">No se ha podido cargar el reparto.</p>}
        {!personas && !error && <p className="text-sm text-stone-400">Cargando…</p>}
        {personas && (
          <>
            <GraficaReparto personas={personas} />
            <p className="mt-3 text-sm text-stone-600">{fraseDelReparto(personas)}</p>
          </>
        )}
      </section>

      {personas && personas.some((p) => p.pensar + p.hacer > 0) && (
        <section className="rounded-2xl bg-white px-5 py-2 shadow-sm">
          <h2 className="pt-3 text-lg font-semibold">De dónde salen los números</h2>
          <ul className="divide-y divide-stone-100">
            {personas.map((p) => (
              <Desglose key={p.clave} persona={p} />
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-2xl bg-marca-suave p-5 text-sm text-stone-700">
        <h2 className="mb-2 font-semibold text-marca">¿Qué cuenta?</h2>
        <p>
          <strong>💭 Pensar</strong> es la parte invisible: darse cuenta de que algo
          hay que hacer y apuntarlo. Cuenta crear una tarea, un tratamiento, una
          rutina o un vencimiento, y apuntar algo en la lista de la compra.
        </p>
        <p className="mt-2">
          <strong>✋ Hacer</strong> es completar tareas y comprar lo de la lista.
        </p>
        <p className="mt-2">
          No es una competición: sirve para ver el reparto y hablarlo si os apetece.
        </p>
      </section>
    </main>
  )
}
