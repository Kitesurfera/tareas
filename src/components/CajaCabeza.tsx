import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cuantasEnLaBandeja, soltar } from '../lib/bandeja'
import { ir } from '../lib/ruta'
import { useDictado } from '../lib/useDictado'
import { avisoError, botonPrincipal, botonSecundario, campo } from './estilos'

const MAX_LETRAS = 2000

// La caja para soltar lo que te ronda (escrito o dictado). Cada línea es una
// cosa de tu bandeja. Se usa en el botón 🧠 y en la pantalla de la bandeja.
export function CajaCabeza({ hogarId, onGuardado, autoFocus }: { hogarId: string; onGuardado?: (cuantas: number) => void; autoFocus?: boolean }) {
  const [texto, setTexto] = useState('')
  const [antesDeDictar, setAntesDeDictar] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [hecho, setHecho] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const dictado = useDictado((t) => setTexto(`${antesDeDictar} ${t}`.trim().slice(0, MAX_LETRAS)))

  async function guardar() {
    if (dictado.escuchando) dictado.parar()
    setGuardando(true)
    setError(null)
    setHecho(null)
    const resultado = await soltar(hogarId, texto)
    setGuardando(false)
    if ('error' in resultado) return setError(resultado.error)
    setTexto('')
    setHecho(resultado.guardadas === 1 ? '✓ Guardado en tu bandeja. ¿Algo más?' : `✓ ${resultado.guardadas} cosas guardadas en tu bandeja. ¿Algo más?`)
    onGuardado?.(resultado.guardadas)
  }

  return (
    <div className="flex flex-col gap-3">
      <textarea
        className={`${campo} min-h-28`}
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value.slice(0, MAX_LETRAS))
          setHecho(null)
        }}
        maxLength={MAX_LETRAS}
        autoFocus={autoFocus}
        aria-label="Lo que te ronda por la cabeza"
        placeholder={'Llamar al fontanero el lunes\nPilas y leche\nVer Dune\nEl cumple de Lucía es el 3 de marzo'}
      />
      <p className="-mt-1 text-xs text-stone-500">Una cosa por línea (o todo seguido: luego se reparte igual). Solo lo ves tú.</p>
      <div className="flex gap-2">
        {dictado.soportado && (
          <button
            type="button"
            onClick={() => {
              if (dictado.escuchando) return dictado.parar()
              setAntesDeDictar(texto)
              dictado.empezar()
            }}
            aria-pressed={dictado.escuchando}
            className={`${botonSecundario.replace('w-full ', '')} shrink-0 px-4 ${dictado.escuchando ? 'animate-pulse bg-coral-suave text-coral-tinta ring-coral/30' : ''}`}
          >
            {dictado.escuchando ? '⏹️ Parar' : '🎤 Dictar'}
          </button>
        )}
        <button type="button" onClick={guardar} disabled={guardando || !texto.trim()} className={botonPrincipal}>
          {guardando ? 'Guardando…' : '🧠 Guardar en la bandeja'}
        </button>
      </div>
      {hecho && (
        <p role="status" className="text-sm font-semibold text-marca">
          {hecho}
        </p>
      )}
      {dictado.error && <p role="alert" className={avisoError}>{dictado.error}</p>}
      {error && <p role="alert" className={avisoError}>{error}</p>}
    </div>
  )
}

// El botón 🧠 que flota en todas las pestañas: abre la caja. Lleva el
// número de cosas que tienes en la bandeja.
export function BotonCabeza({ hogarId }: { hogarId: string }) {
  const [abierta, setAbierta] = useState(false)
  const [cuantas, setCuantas] = useState<number | null>(null)
  const boton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    let vigente = true
    const contar = () => void cuantasEnLaBandeja().then((n) => vigente && setCuantas(n))
    contar()
    window.addEventListener('bandeja-cambiada', contar)
    return () => {
      vigente = false
      window.removeEventListener('bandeja-cambiada', contar)
    }
  }, [])

  useEffect(() => {
    if (!abierta) return
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setAbierta(false)
      boton.current?.focus()
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [abierta])

  return (
    <>
      <button
        ref={boton}
        type="button"
        onClick={() => setAbierta(true)}
        aria-label={cuantas ? `Vaciar la cabeza (${cuantas} en tu bandeja)` : 'Vaciar la cabeza'}
        title="Vaciar la cabeza"
        className="fixed right-4 bottom-[calc(6.25rem+env(safe-area-inset-bottom))] z-20 flex h-14 w-14 items-center justify-center rounded-full bg-linear-to-b from-marca to-[#0b5f58] text-2xl text-white shadow-[0_10px_24px_-8px_rgb(15_118_110/0.7)] transition hover:brightness-110 active:scale-95 md:right-6 md:bottom-6"
      >
        <span aria-hidden="true">🧠</span>
        {cuantas !== null && cuantas > 0 && (
          <span aria-hidden="true" className="absolute -top-1 -right-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-coral px-1.5 text-xs font-bold text-white ring-2 ring-white">
            {cuantas > 99 ? '99+' : cuantas}
          </span>
        )}
      </button>
      {abierta &&
        createPortal(
          <div className="fixed inset-0 z-40 flex items-end justify-center bg-stone-900/40 p-0 backdrop-blur-[2px] md:items-center md:p-6" onClick={() => setAbierta(false)}>
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="titulo-cabeza"
              className="flex w-full max-w-lg animate-aparecer flex-col gap-4 rounded-t-[2rem] bg-crema p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl md:rounded-[2rem]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 id="titulo-cabeza" className="text-xl font-extrabold text-marca">
                    🧠 ¿Qué te ronda?
                  </h2>
                  <p className="text-sm text-stone-600">Suéltalo aquí y sigue con lo tuyo. Luego lo repartes.</p>
                </div>
                <button type="button" onClick={() => setAbierta(false)} aria-label="Cerrar" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-stone-500 shadow-sm">
                  ✕
                </button>
              </div>
              <CajaCabeza hogarId={hogarId} autoFocus />
              <button
                type="button"
                onClick={() => {
                  setAbierta(false)
                  ir('/bandeja')
                }}
                className="self-start text-sm font-semibold text-marca"
              >
                {cuantas ? `Ver mi bandeja (${cuantas}) y repartir ›` : 'Ver mi bandeja ›'}
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
