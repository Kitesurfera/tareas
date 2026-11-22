import { useNombres } from '../lib/useNombres'
import { ListaCompra } from './ListaCompra'
import { SeccionPlantas } from './SeccionPlantas'
import { SeccionRutinas } from './SeccionRutinas'

type Props = {
  hogarId: string
  miUserId: string
}

// Pestaña «Casa»: rutinas de la casa, plantas y lista de la compra.
export function PantallaCasa({ hogarId, miUserId }: Props) {
  const nombres = useNombres(miUserId)
  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col gap-5 px-5 py-8">
      <header>
        <h1 className="text-2xl font-bold text-marca">Casa</h1>
        <p className="text-stone-600">Las tareas de casa de siempre</p>
      </header>
      <SeccionRutinas nombres={nombres} />
      <SeccionPlantas nombres={nombres} />
      <ListaCompra hogarId={hogarId} nombres={nombres} />
    </main>
  )
}
