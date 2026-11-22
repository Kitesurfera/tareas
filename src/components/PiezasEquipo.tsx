import { cosas, fraseDeGracias, type Gracia, type Mio } from '../lib/cargaMental'

// Las cifras del equipo: lo pensado y hecho entre todas (sin decir quién).
export function CifrasEquipo({ pensar, hacer }: { pensar: number; hacer: number }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="rounded-xl bg-marca-suave p-3">
        <p className="text-2xl font-bold text-marca">{pensar}</p>
        <p className="text-sm text-stone-700">💭 {pensar === 1 ? 'cosa pensada' : 'cosas pensadas'}</p>
      </div>
      <div className="rounded-xl bg-marca-suave p-3">
        <p className="text-2xl font-bold text-marca">{hacer}</p>
        <p className="text-sm text-stone-700">✋ {hacer === 1 ? 'cosa hecha' : 'cosas hechas'}</p>
      </div>
    </div>
  )
}

// «💚 Gracias por acordarte»: lo que pensaron las demás personas.
export function ListaGracias({ gracias }: { gracias: Gracia[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {gracias.map((g, i) => (
        <li key={`${g.creado_en}-${i}`} className="flex gap-2 text-sm text-stone-700">
          <span aria-hidden="true">💚</span>
          <span>
            <strong className="font-medium text-stone-900">{g.quien}</strong> {fraseDeGracias(g)}
            <span className="text-stone-400">
              {' · '}
              {new Date(g.creado_en).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
            </span>
          </span>
        </li>
      ))}
    </ul>
  )
}

// Tus números del mes. Solo los ves tú (la base de datos no se los da a nadie más).
export function TusNumeros({ mio, esteMes = true }: { mio: Mio; esteMes?: boolean }) {
  return (
    <div className="rounded-xl bg-stone-50 p-3">
      <p className="text-sm text-stone-700">
        {mio.pensar + mio.hacer === 0
          ? esteMes
            ? 'Todavía nada este mes.'
            : 'Ese mes no apuntaste nada.'
          : esteMes
            ? `Has pensado en ${cosas(mio.pensar)} y has hecho ${mio.hacer}.`
            : `Pensaste en ${cosas(mio.pensar)} e hiciste ${mio.hacer}.`}
      </p>
      <p className="mt-1 text-xs text-stone-500">🔒 Solo tú ves tus números.</p>
    </div>
  )
}
