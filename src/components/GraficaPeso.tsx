import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { fechaCorta, leerFecha } from '../lib/fechas'
import { diasEntre, formatoKg, marcasKg, type Peso } from '../lib/peso'

type Props = {
  // De más antiguo a más nuevo. Al menos dos.
  pesos: Peso[]
  nombreMascota: string
}

// Medidas de la gráfica (en píxeles).
const ALTO = 176
const ARRIBA = 14
const ABAJO = 26
const DERECHA = 12
const COLOR = '#0f766e' // el verde de la app
const SUPERFICIE = '#ffffff'
const REJILLA = '#e7e5e4'
const TEXTO_SUAVE = '#78716c'

// Fecha corta para el eje: «12 oct» o, si abarca más de un año, «oct 25».
function fechaEje(texto: string, largo: boolean): string {
  return leerFecha(texto).toLocaleDateString(
    'es-ES',
    largo ? { month: 'short', year: '2-digit' } : { day: 'numeric', month: 'short' },
  )
}

// Gráfica de línea del peso. Toca (o pasa el ratón) para ver cada peso.
export function GraficaPeso({ pesos, nombreMascota }: Props) {
  const caja = useRef<HTMLDivElement>(null)
  const [ancho, setAncho] = useState(0)
  const [elegido, setElegido] = useState<number | null>(null)

  // La gráfica ocupa todo el ancho de la tarjeta, sea cual sea el móvil.
  useEffect(() => {
    const div = caja.current
    if (!div) return
    const observador = new ResizeObserver(([entrada]) => setAncho(entrada.contentRect.width))
    observador.observe(div)
    return () => observador.disconnect()
  }, [])

  const primero = pesos[0]
  const ultimo = pesos[pesos.length - 1]
  const kilos = pesos.map((p) => p.kg)
  const marcas = marcasKg(Math.min(...kilos), Math.max(...kilos))
  const kgAbajo = marcas[0]
  const kgArriba = marcas[marcas.length - 1]
  const textosEje = marcas.map((kg) => formatoKg(kg))
  const izquierda = Math.max(...textosEje.map((t) => t.length)) * 6.2 + 10
  const diasTotales = Math.max(diasEntre(primero.fecha, ultimo.fecha), 1)
  const ejeLargo = diasTotales > 300

  const anchoPlot = Math.max(ancho - izquierda - DERECHA, 1)
  const altoPlot = ALTO - ARRIBA - ABAJO
  const base = ARRIBA + altoPlot
  const puntos = pesos.map((peso) => ({
    peso,
    x: izquierda + (diasEntre(primero.fecha, peso.fecha) / diasTotales) * anchoPlot,
    y: ARRIBA + (1 - (peso.kg - kgAbajo) / (kgArriba - kgAbajo)) * altoPlot,
  }))
  const linea = puntos
    .map((q, i) => `${i === 0 ? 'M' : 'L'}${q.x.toFixed(1)},${q.y.toFixed(1)}`)
    .join('')
  const area = `${linea}L${puntos[puntos.length - 1].x.toFixed(1)},${base}L${puntos[0].x.toFixed(1)},${base}Z`
  const conPuntos = pesos.length <= 12
  const actual = elegido !== null && elegido < puntos.length ? puntos[elegido] : null

  // El punto más cercano al dedo (o al ratón), mirando solo de izquierda a derecha.
  function elegirCerca(evento: PointerEvent<SVGSVGElement>) {
    const x = evento.clientX - evento.currentTarget.getBoundingClientRect().left
    let mejor = 0
    puntos.forEach((q, i) => {
      if (Math.abs(q.x - x) < Math.abs(puntos[mejor].x - x)) mejor = i
    })
    setElegido(mejor)
  }

  // Con el teclado: flechas para ir de un peso a otro.
  function conTeclado(evento: KeyboardEvent<SVGSVGElement>) {
    if (evento.key !== 'ArrowLeft' && evento.key !== 'ArrowRight') return
    evento.preventDefault()
    const paso = evento.key === 'ArrowLeft' ? -1 : 1
    const desde = actual ? (elegido as number) : puntos.length
    setElegido(Math.min(Math.max(desde + paso, 0), puntos.length - 1))
  }

  const resumen = `Gráfica del peso de ${nombreMascota}: de ${formatoKg(primero.kg)} el ${fechaCorta(primero.fecha)} a ${formatoKg(ultimo.kg)} el ${fechaCorta(ultimo.fecha)}. Usa las flechas para ver cada peso.`

  return (
    <div ref={caja} className="relative">
      {ancho > 0 && (
        <svg
          width={ancho}
          height={ALTO}
          role="img"
          aria-label={resumen}
          tabIndex={0}
          onPointerDown={elegirCerca}
          onPointerMove={elegirCerca}
          onPointerLeave={(e) => e.pointerType === 'mouse' && setElegido(null)}
          onKeyDown={conTeclado}
          onBlur={() => setElegido(null)}
          className="block touch-pan-y rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-marca/40"
        >
          {/* Rejilla y kilos */}
          {marcas.map((kg, i) => {
            const y = ARRIBA + (1 - (kg - kgAbajo) / (kgArriba - kgAbajo)) * altoPlot
            return (
              <g key={kg}>
                <line x1={izquierda} x2={ancho - DERECHA} y1={y} y2={y} stroke={REJILLA} strokeWidth={1} />
                <text x={izquierda - 8} y={y} textAnchor="end" dominantBaseline="middle" fontSize={11} fill={TEXTO_SUAVE}>
                  {textosEje[i]}
                </text>
              </g>
            )
          })}

          {/* Fechas: la primera y la última */}
          <text x={puntos[0].x} y={ALTO - 6} textAnchor="start" fontSize={11} fill={TEXTO_SUAVE}>
            {fechaEje(primero.fecha, ejeLargo)}
          </text>
          <text x={puntos[puntos.length - 1].x} y={ALTO - 6} textAnchor="end" fontSize={11} fill={TEXTO_SUAVE}>
            {fechaEje(ultimo.fecha, ejeLargo)}
          </text>

          {/* Línea del peso */}
          <path d={area} fill={COLOR} fillOpacity={0.1} />
          <path d={linea} fill="none" stroke={COLOR} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

          {actual && (
            <line x1={actual.x} x2={actual.x} y1={ARRIBA} y2={base} stroke="#a8a29e" strokeWidth={1} />
          )}

          {puntos.map((q, i) =>
            conPuntos || i === puntos.length - 1 || q === actual ? (
              <circle
                key={q.peso.id}
                cx={q.x}
                cy={q.y}
                r={q === actual ? 5 : 4}
                fill={COLOR}
                stroke={SUPERFICIE}
                strokeWidth={2}
              />
            ) : null,
          )}
        </svg>
      )}

      {/* Lo que dice el punto elegido */}
      <div role="status" aria-live="polite" className="sr-only">
        {actual ? `${formatoKg(actual.peso.kg)}, ${fechaCorta(actual.peso.fecha)}` : ''}
      </div>
      {actual && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute rounded-lg bg-white px-3 py-1.5 text-center shadow-md ring-1 ring-stone-200"
          style={{
            left: Math.min(Math.max(actual.x, 52), ancho - 52),
            top: actual.y < 56 ? actual.y + 12 : actual.y - 10,
            transform: actual.y < 56 ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
          }}
        >
          <p className="text-sm font-semibold whitespace-nowrap text-stone-900">
            {formatoKg(actual.peso.kg)}
          </p>
          <p className="text-xs whitespace-nowrap text-stone-500">{fechaCorta(actual.peso.fecha)}</p>
        </div>
      )}
    </div>
  )
}
