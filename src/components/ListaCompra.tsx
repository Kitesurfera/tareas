import { useEffect, useRef, useState, type FormEvent } from 'react'
import { mensajeDeError } from '../lib/errores'
import { supabase } from '../lib/supabase'
import type { ArticuloCompra } from '../lib/tipos'
import type { Nombres } from '../lib/useNombres'
import { avisoError, campoBase } from './estilos'
import { TituloSeccion } from './Piezas'

type Props = {
  hogarId: string
  nombres: Nombres
}

// Lista de la compra compartida del hogar.
export function ListaCompra({ hogarId, nombres }: Props) {
  const [articulos, setArticulos] = useState<ArticuloCompra[] | null>(null)
  const [recarga, setRecarga] = useState(0)
  const [nombre, setNombre] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const campoNombre = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!supabase) return
    let vigente = true
    supabase
      .from('lista_compra')
      .select('id, nombre, cantidad, comprado, anadido_por, comprado_por')
      .order('creado_en')
      .then(({ data, error }) => {
        if (!vigente) return
        if (error) setError(mensajeDeError(error))
        else setArticulos(data as ArticuloCompra[])
      })
    return () => {
      vigente = false
    }
  }, [recarga])

  // En tiempo real: escuchamos el canal privado de la lista de NUESTRO
  // hogar. Cuando alguien cambia algo, la base de datos avisa y recargamos.
  // (Una regla en Supabase impide escuchar el canal de otro hogar.)
  const [enDirecto, setEnDirecto] = useState(false)
  useEffect(() => {
    const cliente = supabase
    if (!cliente) return
    const canal = cliente.channel(`hogar:${hogarId}:compra`, { config: { private: true } })
    const recargar = () => setRecarga((n) => n + 1)
    canal
      .on('broadcast', { event: 'INSERT' }, recargar)
      .on('broadcast', { event: 'UPDATE' }, recargar)
      .on('broadcast', { event: 'DELETE' }, recargar)
    // Primero le pasamos tu sesión al canal (para que Supabase compruebe
    // que eres de este hogar) y después nos conectamos.
    cliente.realtime.setAuth().then(() =>
      canal.subscribe((estado) => setEnDirecto(estado === 'SUBSCRIBED')),
    )
    return () => {
      cliente.removeChannel(canal)
    }
  }, [hogarId])

  // Al volver a la app (por ejemplo, después de que tu pareja haya
  // apuntado algo), recargamos la lista.
  useEffect(() => {
    const alVolver = () => {
      if (document.visibilityState === 'visible') setRecarga((n) => n + 1)
    }
    document.addEventListener('visibilitychange', alVolver)
    return () => document.removeEventListener('visibilitychange', alVolver)
  }, [])

  async function anadir(evento: FormEvent) {
    evento.preventDefault()
    if (!supabase || !nombre.trim()) return
    setEnviando(true)
    setError(null)
    const { error } = await supabase.from('lista_compra').insert({
      hogar_id: hogarId,
      nombre: nombre.trim(),
      cantidad: cantidad.trim() || null,
    })
    setEnviando(false)
    if (error) {
      setError(mensajeDeError(error))
      return
    }
    setNombre('')
    setCantidad('')
    campoNombre.current?.focus()
    setRecarga((n) => n + 1)
  }

  async function marcar(articulo: ArticuloCompra) {
    if (!supabase) return
    // Lo cambiamos en pantalla al momento; si falla, recargamos.
    setArticulos((lista) =>
      lista?.map((a) => (a.id === articulo.id ? { ...a, comprado: !a.comprado } : a)) ?? null,
    )
    const { error } = await supabase
      .from('lista_compra')
      .update({ comprado: !articulo.comprado })
      .eq('id', articulo.id)
    if (error) setError(mensajeDeError(error))
    setRecarga((n) => n + 1)
  }

  async function borrar(ids: string[]) {
    if (!supabase || ids.length === 0) return
    setError(null)
    const { error } = await supabase.from('lista_compra').delete().in('id', ids)
    if (error) setError(mensajeDeError(error))
    setRecarga((n) => n + 1)
  }

  const porComprar = articulos?.filter((a) => !a.comprado) ?? []
  const comprados = articulos?.filter((a) => a.comprado) ?? []

  const fila = (articulo: ArticuloCompra) => {
    const quien = articulo.comprado ? nombres.porUsuario(articulo.comprado_por) : null
    return (
      <li key={articulo.id} className="flex items-center gap-3 py-2.5">
        <button
          type="button"
          onClick={() => marcar(articulo)}
          aria-label={articulo.comprado ? `Desmarcar ${articulo.nombre}` : `Marcar ${articulo.nombre} como comprado`}
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-sm ${
            articulo.comprado ? 'bg-marca text-white' : 'ring-2 ring-stone-300'
          }`}
        >
          {articulo.comprado && '✓'}
        </button>
        <span className="flex-1">
          <span className={articulo.comprado ? 'text-stone-400 line-through' : 'font-medium'}>
            {articulo.nombre}
          </span>
          {articulo.cantidad && <span className="text-stone-500"> · {articulo.cantidad}</span>}
          {quien && <span className="block text-xs text-stone-400">Comprado por {quien}</span>}
        </span>
        <button
          type="button"
          onClick={() => borrar([articulo.id])}
          aria-label={`Quitar ${articulo.nombre} de la lista`}
          className="shrink-0 px-2 text-lg text-stone-300"
        >
          ×
        </button>
      </li>
    )
  }

  return (
    <section className="tarjeta">
      <TituloSeccion
        dibujo="🛒"
        titulo="Lista de la compra"
        subtitulo="Lo que apuntes lo ve todo el hogar al momento"
        color="vencimientos"
        derecha={
          enDirecto && (
            <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-marca" title="Los cambios del resto del hogar aparecen al momento">
              <span aria-hidden="true" className="h-2 w-2 animate-pulse rounded-full bg-marca" />
              En directo
            </span>
          )
        }
      />

      <form onSubmit={anadir} className="mt-3 flex gap-2">
        <input
          ref={campoNombre}
          className={`${campoBase} min-w-0 flex-1`}
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Añadir (ej.: leche)"
          maxLength={80}
          aria-label="Qué hay que comprar"
          enterKeyHint="done"
        />
        <input
          className={`${campoBase} w-20 shrink-0 px-2 text-center`}
          value={cantidad}
          onChange={(e) => setCantidad(e.target.value)}
          placeholder="Cant."
          maxLength={30}
          aria-label="Cantidad"
        />
        <button
          type="submit"
          disabled={enviando || !nombre.trim()}
          className="shrink-0 rounded-xl bg-marca px-4 font-semibold text-white disabled:opacity-50"
          aria-label="Añadir a la lista"
        >
          +
        </button>
      </form>

      {error && <p role="alert" className={`mt-3 ${avisoError}`}>{error}</p>}
      {articulos === null && !error && <p className="mt-3 text-sm text-stone-400">Cargando…</p>}
      {articulos?.length === 0 && <p className="mt-3 text-stone-500">La lista está vacía. 🛒</p>}

      {porComprar.length > 0 && <ul className="mt-2 divide-y divide-stone-100">{porComprar.map(fila)}</ul>}

      {comprados.length > 0 && (
        <>
          <ul className="mt-2 divide-y divide-stone-100 border-t border-stone-100">{comprados.map(fila)}</ul>
          <button
            type="button"
            onClick={() => borrar(comprados.map((a) => a.id))}
            className="mt-2 w-full rounded-full px-4 py-2 text-sm font-medium text-stone-600 ring-1 ring-stone-300"
          >
            Quitar lo comprado ({comprados.length})
          </button>
        </>
      )}
    </section>
  )
}
