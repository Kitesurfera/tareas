import { useEffect, useState } from 'react'
import { mensajeDeError } from '../lib/errores'
import {
  cuandoToca,
  diasHasta,
  euros,
  fechaCorta,
  periodoCorto,
  proximaRenovacion,
  textoFrecuenciaMeses,
} from '../lib/fechas'
import { ir } from '../lib/ruta'
import { supabase } from '../lib/supabase'
import type { TipoVencimiento, Vencimiento } from '../lib/tipos'
import { useNombres } from '../lib/useNombres'
import { avisoError, botonSecundario } from './estilos'
import { CabeceraPestana } from './CabeceraPestana'
import { TituloSeccion } from './Piezas'

type Props = {
  miUserId: string
}

const SECCIONES: { tipo: TipoVencimiento; titulo: string; dibujo: string; vacio: string; boton: string }[] = [
  {
    tipo: 'seguro',
    titulo: 'Seguros',
    dibujo: '🛡️',
    vacio: 'Coche, casa, salud, mascota… Apunta cuándo vence cada póliza.',
    boton: '+ Añadir seguro',
  },
  {
    tipo: 'suscripcion',
    titulo: 'Suscripciones',
    dibujo: '🔁',
    vacio: 'Plataformas, gimnasio, apps, pruebas gratis que se acaban…',
    boton: '+ Añadir suscripción',
  },
]

function textoAviso(dias: number | null): string {
  if (dias === null) return 'Sin aviso'
  if (dias === 0) return 'Aviso el mismo día'
  if (dias === 30) return 'Aviso 1 mes antes'
  if (dias === 7) return 'Aviso 1 semana antes'
  return `Aviso ${dias} días antes`
}

// Lo que cuesta al mes (para sumar suscripciones con distintas frecuencias).
function alMes(v: Vencimiento): number {
  return v.importe && v.frecuencia_meses ? v.importe / v.frecuencia_meses : 0
}

// Pestaña «Vencimientos»: seguros y suscripciones.
export function PantallaVencimientos({ miUserId }: Props) {
  const nombres = useNombres(miUserId)
  const [lista, setLista] = useState<Vencimiento[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!supabase) return
    let vigente = true
    // Gracias a RLS, solo llegan los de tu hogar.
    supabase
      .from('vencimientos')
      .select('*')
      .then(({ data, error }) => {
        if (!vigente) return
        if (error) setError(mensajeDeError(error))
        else setLista(data as Vencimiento[])
      })
    return () => {
      vigente = false
    }
  }, [])

  const conProxima = (lista ?? [])
    .map((v) => ({ ...v, proxima: proximaRenovacion(v.fecha_renovacion, v.frecuencia_meses) }))
    .sort((a, b) => a.proxima.localeCompare(b.proxima))

  const suscripcionesAlMes = conProxima
    .filter((v) => v.tipo === 'suscripcion')
    .reduce((total, v) => total + alMes(v), 0)
  const segurosAlAnio = conProxima
    .filter((v) => v.tipo === 'seguro')
    .reduce((total, v) => total + alMes(v) * 12, 0)

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col gap-5 px-5 py-8 md:max-w-2xl md:px-6 lg:max-w-6xl lg:px-10 lg:py-10">
      <CabeceraPestana color="vencimientos" titulo="Vencimientos" subtitulo="Seguros y suscripciones, sin sustos." dibujo="📅" />

      {(suscripcionesAlMes > 0 || segurosAlAnio > 0) && (
        <section className="flex gap-3">
          {suscripcionesAlMes > 0 && (
            <div className="tarjeta flex-1 p-4 lg:p-6">
              <p className="text-xs font-medium text-vencimientos-tinta">🔁 Suscripciones</p>
              <p className="font-redonda text-xl font-extrabold text-vencimientos-tinta lg:text-3xl">{euros(suscripcionesAlMes)}</p>
              <p className="text-xs text-stone-600">al mes · {euros(suscripcionesAlMes * 12)} al año</p>
            </div>
          )}
          {segurosAlAnio > 0 && (
            <div className="tarjeta flex-1 p-4 lg:p-6">
              <p className="text-xs font-medium text-vencimientos-tinta">🛡️ Seguros</p>
              <p className="font-redonda text-xl font-extrabold text-vencimientos-tinta lg:text-3xl">{euros(segurosAlAnio)}</p>
              <p className="text-xs text-stone-600">al año</p>
            </div>
          )}
        </section>
      )}

      {error && <p role="alert" className={avisoError}>{error}</p>}
      {lista === null && !error && <p className="text-center text-stone-400">Cargando…</p>}

      {/* En el ordenador, seguros y suscripciones uno al lado del otro. */}
      <div className="contents lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
        {lista &&
          SECCIONES.map((seccion) => {
            const delTipo = conProxima.filter((v) => v.tipo === seccion.tipo)
            return (
              <section key={seccion.tipo} className="tarjeta">
                <TituloSeccion dibujo={seccion.dibujo} titulo={seccion.titulo} color="vencimientos" />
                {delTipo.length === 0 && <p className="mt-1 text-sm text-stone-500">{seccion.vacio}</p>}
                <ul className="mt-2 divide-y divide-stone-100">
                  {delTipo.map((v) => {
                    const dias = diasHasta(v.proxima)
                    const color = dias < 0 ? 'text-red-700' : dias <= 7 ? 'text-amber-700' : 'text-stone-600'
                    const encargada = nombres.responsable(v.responsable_id)
                    return (
                      <li key={v.id}>
                        <button
                          type="button"
                          onClick={() => ir(`/vencimientos/${v.id}/editar`)}
                          className="flex w-full items-start gap-3 py-3 text-left"
                        >
                          <span aria-hidden="true" className="text-2xl leading-none">{seccion.dibujo}</span>
                          <span className="flex-1">
                            <span className="flex items-baseline justify-between gap-2">
                              <span className="font-medium">{v.nombre}</span>
                              {v.importe !== null && (
                                <span className="shrink-0 text-sm font-semibold text-stone-700">
                                  {euros(v.importe)}
                                  {periodoCorto(v.frecuencia_meses)}
                                </span>
                              )}
                            </span>
                            <span className={`block text-sm font-medium ${color}`}>
                              {dias < 0 ? 'Venció' : 'Se renueva'} el {fechaCorta(v.proxima)} · {cuandoToca(v.proxima)}
                            </span>
                            <span className="block text-sm text-stone-500">
                              {v.tipo === 'suscripcion' && v.frecuencia_meses === 1
                                ? 'Pago mensual'
                                : v.tipo === 'suscripcion' && v.frecuencia_meses === 12
                                  ? 'Pago anual'
                                  : textoFrecuenciaMeses(v.frecuencia_meses)}{' '}
                              · {textoAviso(v.aviso_dias)}
                              {encargada && ` · ${encargada}`}
                            </span>
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
                <button
                  type="button"
                  onClick={() => ir(`/vencimientos/nuevo/${seccion.tipo}`)}
                  className={`mt-3 ${botonSecundario}`}
                >
                  {seccion.boton}
                </button>
              </section>
            )
          })}
      </div>

      <p className="px-2 text-center text-xs text-stone-500">
        Los avisos aparecen en Próximo y en Tareas. Al marcarlos como hechos, la
        fecha pasa a la siguiente renovación.
      </p>
    </main>
  )
}
