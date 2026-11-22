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
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col gap-5 px-5 py-8 lg:max-w-6xl lg:px-10 lg:py-10">
      <CabeceraPestana color="casa" titulo="Casa" subtitulo="Rutinas, plantas y la compra, entre todas." dibujo="🧹" />
      {/* En el ordenador: rutinas y plantas a la izquierda; la compra a la
          derecha, siempre a la vista al bajar. */}
      <div className="contents lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
        <div className="contents lg:flex lg:flex-col lg:gap-6">
          <SeccionRutinas nombres={nombres} />
          <SeccionPlantas nombres={nombres} />
        </div>
        <div className="contents lg:sticky lg:top-6 lg:block">
          <ListaCompra hogarId={hogarId} nombres={nombres} />
        </div>
      </div>
    </main>
  )
}
