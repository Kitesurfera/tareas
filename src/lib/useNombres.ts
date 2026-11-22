import { useMascotasDelHogar } from './useMascotasDelHogar'
import { useMiembros } from './useMiembros'
import { cobertura, diaQueCuenta, useViajes } from './viajes'

// Traduce ids a nombres para enseñarlos en las listas, y tiene en cuenta
// quién está de viaje para decir quién cubre cada cosa.
export function useNombres(miUserId: string) {
  const { miembros } = useMiembros()
  const { viajes } = useViajes()
  const mascotas = useMascotasDelHogar()
  const miMiembroId = miembros?.find((m) => m.user_id === miUserId)?.id

  // «Tú» si eres tú; si no, su nombre.
  function responsable(miembroId: string | null): string | null {
    if (miembroId && miembroId === miMiembroId) return 'Tú'
    return miembros?.find((m) => m.id === miembroId)?.nombre_visible ?? null
  }

  function quienCubre(responsableId: string | null, fecha: string | null) {
    if (!miembros || !viajes) return null
    return cobertura(responsableId, diaQueCuenta(fecha), miembros, viajes)
  }

  // Frase sobre el viaje si afecta a esta tarea (si no, null):
  // «✈️ Ana está de viaje: la cubres tú», «🏠 No hay nadie en casa».
  function notaViaje(responsableId: string | null, fecha: string | null): string | null {
    const c = quienCubre(responsableId, fecha)
    if (!c) return null
    if (c.nadieEnCasa) return '🏠 No hay nadie en casa'
    if (!c.fuera) return null
    const quien = responsableId === miMiembroId ? 'Estás de viaje' : `${responsable(responsableId)} está de viaje`
    if (c.enCasa.length > 1) return `✈️ ${quien}: la cubre quien se queda`
    const cubre = c.enCasa[0]
    return `✈️ ${quien}: ${cubre.id === miMiembroId ? 'la cubres tú' : `la cubre ${cubre.nombre_visible}`}`
  }

  return {
    miMiembroId,
    responsable,
    notaViaje,
    // Lo que se enseña en una tarea: quién se encarga, o quién la cubre si
    // está de viaje. Sin nadie en casa: «Bea · 🏠 nadie en casa».
    encargada: (responsableId: string | null, fecha: string | null) => {
      if (quienCubre(responsableId, fecha)?.nadieEnCasa) {
        return `${responsable(responsableId) ?? 'Sin responsable'} · 🏠 nadie en casa`
      }
      return notaViaje(responsableId, fecha) ?? responsable(responsableId)
    },
    // ¿Te toca a ti? Lo tuyo si estás en casa, y lo de quien está de viaje
    // si tú te quedas. Si no hay nadie en casa, lo tuyo sigue siendo tuyo.
    esMia: (responsableId: string | null, fecha: string | null) => {
      if (!miMiembroId) return false
      const c = quienCubre(responsableId, fecha)
      if (!c || c.nadieEnCasa || !c.fuera) return responsableId === miMiembroId
      return c.enCasa.some((m) => m.id === miMiembroId)
    },
    porUsuario: (userId: string | null) =>
      userId === miUserId
        ? 'ti'
        : (miembros?.find((m) => m.user_id === userId)?.nombre_visible ?? null),
    mascota: (mascotaId: string | null) =>
      mascotas?.find((m) => m.id === mascotaId)?.nombre ?? null,
  }
}

export type Nombres = ReturnType<typeof useNombres>
