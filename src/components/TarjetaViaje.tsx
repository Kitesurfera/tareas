import { cuandoToca, hoyComoTexto, sumarDias } from '../lib/fechas'
import { ir } from '../lib/ruta'
import { useMiembros } from '../lib/useMiembros'
import { agrupar, cobertura, diaMes, estaEnCurso, textoPersonas, useViajes, type GrupoViaje } from '../lib/viajes'

type Props = {
  miUserId: string
}

// Se enseña si alguien está de viaje o se va en los próximos 14 días.
const DIAS_ANTES = 14

// Aviso en el inicio: quién está de viaje (o se va pronto) y quién cubre.
export function TarjetaViaje({ miUserId }: Props) {
  const { miembros } = useMiembros()
  const { viajes } = useViajes()
  if (!miembros || !viajes) return null

  const miMiembroId = miembros.find((m) => m.user_id === miUserId)?.id
  const limite = sumarDias(hoyComoTexto(), DIAS_ANTES)
  const grupos = agrupar(viajes).filter((g) => g.desde <= limite)
  if (grupos.length === 0) return null

  // «Estás de viaje…», «Ana está…», «Bea y tú estáis…», «Ana y Bea se van…»
  function frase(g: GrupoViaje): string {
    const quien = textoPersonas(g.personas, miembros ?? [], miMiembroId)
    const conmigo = Boolean(miMiembroId && g.personas.includes(miMiembroId))
    const una = g.personas.length === 1
    const destino = g.destino ? ` a ${g.destino}` : ''
    if (estaEnCurso(g)) {
      const verbo = una ? (conmigo ? 'Estás' : `${quien} está`) : `${quien} ${conmigo ? 'estáis' : 'están'}`
      return `${verbo} de viaje${destino} hasta el ${diaMes(g.hasta)}.`
    }
    const verbo = una ? (conmigo ? 'Te vas' : `${quien} se va`) : `${quien} ${conmigo ? 'os vais' : 'se van'}`
    return `${verbo}${destino} ${cuandoToca(g.desde).toLowerCase()}: del ${diaMes(g.desde)} al ${diaMes(g.hasta)}.`
  }

  const hoy = cobertura(null, hoyComoTexto(), miembros, viajes)
  const alguienFuera = hoy.enCasa.length < miembros.length
  const yoFuera = Boolean(miMiembroId && !hoy.enCasa.some((m) => m.id === miMiembroId))
  const quienesSeQuedan = textoPersonas(hoy.enCasa.map((m) => m.id), miembros, miMiembroId)

  let mientras: string | null = null
  if (hoy.nadieEnCasa) {
    mientras =
      '🏠 Hoy no hay nadie en casa. Los avisos siguen llegando como siempre: pedid a alguien que se ocupe de lo que no puede esperar, como la mascota.'
  } else if (alguienFuera && yoFuera) {
    mientras = `Mientras, ${quienesSeQuedan} ${hoy.enCasa.length > 1 ? 'cubren' : 'cubre'} tus tareas. ¡Buen viaje!`
  } else if (alguienFuera) {
    mientras =
      hoy.enCasa.length > 1
        ? 'Mientras, sus tareas y avisos pasan a quienes os quedáis en casa.'
        : 'Mientras, cubres sus tareas y te llegan sus avisos.'
  }

  return (
    <section className="rounded-2xl bg-sky-50 p-5 shadow-sm ring-1 ring-sky-100">
      <h2 className="font-semibold">✈️ Modo viaje</h2>
      <ul className="mt-2 flex flex-col gap-1 text-stone-700">
        {grupos.map((g) => (
          <li key={g.grupo}>{frase(g)}</li>
        ))}
      </ul>
      {mientras && <p className="mt-3 rounded-xl bg-white p-3 text-sm text-stone-700">{mientras}</p>}
      <button type="button" onClick={() => ir('/viajes')} className="mt-3 text-sm font-semibold text-marca">
        Ver viajes ›
      </button>
    </section>
  )
}
