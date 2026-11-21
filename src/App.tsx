// Pantalla de inicio provisional.
// Más adelante aquí irá "Próximo": lo que vence en los próximos 30 días.

const secciones = [
  {
    titulo: 'Mascota',
    texto: 'Vacunas, desparasitaciones, medicación y peso.',
  },
  {
    titulo: 'Casa',
    texto: 'Seguros, ITV, regalos, renovaciones… todo lo que hay que recordar.',
  },
  {
    titulo: 'Reparto',
    texto: 'Cada cosa con una responsable clara.',
  },
]

function App() {
  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col gap-6 px-5 py-10">
      <header>
        <h1 className="text-3xl font-bold text-marca">Tareas</h1>
        <p className="mt-1 text-stone-600">
          Lo que hay que recordar en casa, repartido entre las dos.
        </p>
      </header>

      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Próximo</h2>
        <p className="mt-2 text-stone-500">
          Todavía no hay nada pendiente. Aquí verás lo que vence en los
          próximos 30 días y quién se encarga.
        </p>
      </section>

      <ul className="flex flex-col gap-3">
        {secciones.map((seccion) => (
          <li
            key={seccion.titulo}
            className="rounded-2xl bg-marca-suave p-4"
          >
            <h3 className="font-semibold text-marca">{seccion.titulo}</h3>
            <p className="text-sm text-stone-700">{seccion.texto}</p>
          </li>
        ))}
      </ul>

      <footer className="mt-auto text-center text-xs text-stone-400">
        Fase 1 en construcción
      </footer>
    </main>
  )
}

export default App
