import { useState } from 'react'
import { cuandoToca, fechaCorta, hoyComoTexto, sumarDias } from '../lib/fechas'
import {
  cambiarFavorito,
  infoCategoria,
  loHicimosHoy,
  programar,
  textoDuracion,
  textoEnergia,
  textoPrecio,
  trozosConEnlaces,
  type CategoriaPlan,
  type EntradaAgenda,
  type Plan,
} from '../lib/planes'
import { ir } from '../lib/ruta'
import { avisoError, campoBase } from './estilos'
import { Etiqueta } from './Piezas'

export function PastillaCategoria({ categorias, id }: { categorias: CategoriaPlan[]; id: string | null }) {
  const info = infoCategoria(categorias, id)
  return (
    <Etiqueta className={info.suave}>
      <span aria-hidden="true">{info.dibujo}</span> {info.nombre}
    </Etiqueta>
  )
}

// Energía, precio y duración (solo lo que esté apuntado).
export function DatosDelPlan({ plan }: { plan: Plan }) {
  return (
    <>
      {plan.energia && (
        <Etiqueta className="bg-stone-100 text-stone-600">
          {textoEnergia(plan.energia).dibujo} {textoEnergia(plan.energia).texto}
        </Etiqueta>
      )}
      {plan.precio && <Etiqueta className="bg-stone-100 text-stone-600">{textoPrecio(plan.precio)}</Etiqueta>}
      {plan.duracion && <Etiqueta className="bg-stone-100 text-stone-600">⏱️ {textoDuracion(plan.duracion)}</Etiqueta>}
    </>
  )
}

// Las notas, con los enlaces («https://…») que se pueden tocar.
export function NotasConEnlaces({ texto }: { texto: string }) {
  return (
    <p className="text-sm whitespace-pre-line break-words text-stone-600">
      {trozosConEnlaces(texto).map((trozo, i) =>
        trozo.enlace ? (
          <a key={i} href={trozo.texto} target="_blank" rel="noopener noreferrer" className="font-medium text-marca underline">
            {trozo.texto}
          </a>
        ) : (
          <span key={i}>{trozo.texto}</span>
        ),
      )}
    </p>
  )
}

// El próximo sábado (o hoy si es sábado): el día típico para un plan.
function proximoSabado(): string {
  const hoy = hoyComoTexto()
  const dia = new Date(`${hoy}T12:00:00`).getDay()
  return sumarDias(hoy, (6 - dia + 7) % 7)
}

type Acciones = {
  plan: Plan
  agenda: EntradaAgenda[]
  // Para volver a cargar todo después de un cambio.
  onCambio: () => void
  conEditar?: boolean
}

// «📅 Programar» (elegir día) y «✅ Lo hicimos hoy».
export function AccionesPlan({ plan, agenda, onCambio, conEditar = true }: Acciones) {
  const [eligiendoDia, setEligiendoDia] = useState(false)
  const [fecha, setFecha] = useState(proximoSabado)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hecho, setHecho] = useState<string | null>(null)
  const hoy = hoyComoTexto()

  async function hacer(accion: () => Promise<string | null>, mensaje: string) {
    setEnviando(true)
    setError(null)
    const fallo = await accion()
    setEnviando(false)
    if (fallo) return setError(fallo)
    setHecho(mensaje)
    setEligiendoDia(false)
    onCambio()
  }

  const boton = 'rounded-full px-4 py-2 text-sm font-semibold transition active:scale-[0.98] disabled:opacity-60'

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setEligiendoDia(!eligiendoDia)}
          aria-expanded={eligiendoDia}
          disabled={enviando}
          className={`${boton} bg-planes text-planes-tinta hover:brightness-95`}
        >
          📅 Programar
        </button>
        <button
          type="button"
          onClick={() => hacer(() => loHicimosHoy(plan, agenda), '✅ Apuntado: lo hicisteis hoy.')}
          disabled={enviando}
          className={`${boton} bg-marca-suave text-marca hover:brightness-95`}
        >
          ✅ Lo hicimos hoy
        </button>
        {conEditar && (
          <button
            type="button"
            onClick={() => ir(`/planes/${plan.id}/editar`)}
            className={`${boton} text-stone-600 ring-1 ring-stone-200 hover:bg-stone-50`}
          >
            ✏️ Editar
          </button>
        )}
      </div>

      {eligiendoDia && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-planes/60 p-3">
          <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-planes-tinta">
            ¿Qué día?
            <input
              type="date"
              className={`${campoBase} w-full`}
              value={fecha}
              min={hoy}
              onChange={(e) => setFecha(e.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={!fecha || enviando}
            onClick={() =>
              hacer(() => programar(plan, fecha), `📅 En el calendario: ${fechaCorta(fecha)} (${cuandoToca(fecha).toLowerCase()}).`)
            }
            className="self-end rounded-full bg-linear-to-b from-marca to-[#0b5f58] px-5 py-3 font-semibold text-white disabled:opacity-60"
          >
            Guardar
          </button>
        </div>
      )}

      {hecho && (
        <p role="status" className="text-sm font-medium text-marca">
          {hecho}
        </p>
      )}
      {error && <p role="alert" className={avisoError}>{error}</p>}
    </div>
  )
}

// ⭐ para marcar o quitar un plan de favoritos.
export function BotonFavorito({ plan, onCambio }: { plan: Plan; onCambio: () => void }) {
  const [enviando, setEnviando] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        setEnviando(true)
        const fallo = await cambiarFavorito(plan, !plan.favorito)
        setEnviando(false)
        if (!fallo) onCambio()
      }}
      disabled={enviando}
      aria-pressed={plan.favorito}
      aria-label={plan.favorito ? `Quitar «${plan.nombre}» de favoritos` : `Marcar «${plan.nombre}» como favorito`}
      title={plan.favorito ? 'Quitar de favoritos' : 'Favorito'}
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xl transition hover:bg-stone-100 ${
        plan.favorito ? '' : 'opacity-40 grayscale'
      }`}
    >
      ⭐
    </button>
  )
}
