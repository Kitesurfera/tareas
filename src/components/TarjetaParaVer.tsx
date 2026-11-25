import { ordenar, useParaVer } from '../lib/paraVer'
import { ir } from '../lib/ruta'
import { botonSecundario } from './estilos'
import { TituloSeccion } from './Piezas'
import { Caratula } from './PiezasParaVer'

// En la pestaña Planes: «🍿 Para ver», con lo que más ganas os da.
export function TarjetaParaVer() {
  const { datos, error } = useParaVer()
  const pendientes = datos ? ordenar(datos.lista.filter((p) => !p.visto), datos.ganas) : []
  const peliculas = pendientes.filter((p) => p.tipo === 'pelicula').length
  const series = pendientes.length - peliculas
  const cuenta = [
    peliculas === 1 ? '1 película' : `${peliculas} películas`,
    series === 1 ? '1 serie' : `${series} series`,
  ].join(' y ')

  return (
    <section className="tarjeta flex flex-col gap-3">
      <TituloSeccion
        dibujo="🍿"
        titulo="Para ver"
        subtitulo={datos ? (pendientes.length > 0 ? `${cuenta} pendientes` : 'Vuestras pelis y series pendientes') : 'Vuestras pelis y series pendientes'}
        color="planes"
      />
      {error && <p className="text-sm text-stone-500">{error}</p>}
      {pendientes.length > 0 && (
        <ul className="flex gap-2 overflow-x-auto pb-1" aria-label="Lo que más ganas os da">
          {pendientes.slice(0, 5).map((p) => (
            <li key={p.id} className="flex w-14 shrink-0 flex-col items-center gap-1">
              <Caratula poster={p.poster} titulo={p.titulo} tipo={p.tipo} />
              <span className="line-clamp-2 text-center text-[11px] leading-tight text-stone-600">{p.titulo}</span>
            </li>
          ))}
        </ul>
      )}
      <button type="button" onClick={() => ir('/ver')} className={botonSecundario}>
        {pendientes.length > 0 ? '🎲 ¿Qué vemos hoy?' : '🍿 Empezar la lista'}
      </button>
    </section>
  )
}
