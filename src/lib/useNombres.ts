import { useMascotasDelHogar } from './useMascotasDelHogar'
import { useMiembros } from './useMiembros'

// Traduce ids a nombres para enseñarlos en las listas.
export function useNombres(miUserId: string) {
  const { miembros } = useMiembros()
  const mascotas = useMascotasDelHogar()
  const miMiembroId = miembros?.find((m) => m.user_id === miUserId)?.id

  return {
    miMiembroId,
    // «Tú» si eres tú; si no, su nombre.
    responsable: (miembroId: string | null) =>
      miembroId && miembroId === miMiembroId
        ? 'Tú'
        : (miembros?.find((m) => m.id === miembroId)?.nombre_visible ?? null),
    porUsuario: (userId: string | null) =>
      userId === miUserId
        ? 'ti'
        : (miembros?.find((m) => m.user_id === userId)?.nombre_visible ?? null),
    mascota: (mascotaId: string | null) =>
      mascotas?.find((m) => m.id === mascotaId)?.nombre ?? null,
  }
}

export type Nombres = ReturnType<typeof useNombres>
