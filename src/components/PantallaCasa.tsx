import { useNombres } from '../lib/useNombres'
import { ListaCompra } from './ListaCompra'
import { SeccionPlantas } from './SeccionPlantas'
import { SeccionRutinas } from './SeccionRutinas'
import { CabeceraPestana } from './CabeceraPestana'

type Props = {
  hogarId: string
  miUserId: string
}

// Pestaña «Casa»: rutinas de la casa, plantas y lista de la compra.
export function PantallaCasa({ hogarId, miUserId }: Props) {
  const nombres = useNombres(miUserId)
  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col gap-5 px-5 py-8">
      <CabeceraPestana color="casa" titulo="Casa" subtitulo="Rutinas, plantas y la compra, entre todas." dibujo="🧹" />
      <SeccionRutinas nombres={nombres} />
      <SeccionPlantas nombres={nombres} />
      <ListaCompra hogarId={hogarId} nombres={nombres} />
    </main>
  )
}
