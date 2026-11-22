import { useVersionNueva } from '../lib/actualizaciones'

// Aviso arriba del todo cuando hay una versión nueva de la app.
export function AvisoVersionNueva() {
  const hayVersionNueva = useVersionNueva()
  if (!hayVersionNueva) return null
  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-3 bg-marca px-4 pt-[max(env(safe-area-inset-top),0.5rem)] pb-2 text-sm text-white shadow"
    >
      <span>Hay una versión nueva de Tareas</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="rounded-full bg-white px-3 py-1 font-semibold text-marca"
      >
        Actualizar
      </button>
    </div>
  )
}
