import { useRef } from 'react'
import { botonSecundario } from './estilos'

// Piezas de los formularios que adjuntan documentos (el de documentos y el
// de seguros y suscripciones).

// Una foto o un PDF en pequeño, con su botón para quitarlo.
export function Miniatura({
  vista,
  nombre,
  detalle,
  etiqueta,
  onQuitar,
}: {
  vista: string | null | undefined
  nombre: string
  detalle: string
  etiqueta: string
  onQuitar: () => void
}) {
  return (
    <li className="relative overflow-hidden rounded-xl bg-stone-50 ring-1 ring-stone-900/5">
      {vista ? (
        <img src={vista} alt={nombre} className="aspect-[3/4] w-full object-cover" />
      ) : (
        <span className="flex aspect-[3/4] flex-col items-center justify-center gap-1 p-2 text-center">
          <span aria-hidden="true" className="text-3xl">📄</span>
          <span className="line-clamp-2 text-[11px] break-all text-stone-600">{nombre}</span>
        </span>
      )}
      <span className="absolute bottom-1 left-1 rounded-full bg-white/90 px-2 text-[10px] font-semibold text-stone-600">{detalle}</span>
      <button
        type="button"
        onClick={onQuitar}
        aria-label={etiqueta}
        className="absolute top-1 right-1 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-sm shadow-sm"
      >
        ✕
      </button>
    </li>
  )
}

// Botón que abre la cámara o los archivos del móvil (fotos o PDF, varios).
export function BotonElegirArchivos({ texto, onElegir }: { texto: string; onElegir: (archivos: File[]) => void }) {
  const selector = useRef<HTMLInputElement>(null)
  return (
    <>
      <input
        ref={selector}
        type="file"
        accept="image/*,application/pdf"
        multiple
        className="sr-only"
        aria-label="Elegir fotos o PDF"
        onChange={(e) => {
          onElegir([...(e.target.files ?? [])])
          e.target.value = ''
        }}
      />
      <button type="button" onClick={() => selector.current?.click()} className={botonSecundario}>
        {texto}
      </button>
    </>
  )
}
