import { useEffect, useRef, useState } from 'react'
import { agruparLecturas, leerCartilla, marcadaAlEmpezar, MAX_PAGINAS, type Propuesta } from '../lib/cartilla'
import { mensajeDeError } from '../lib/errores'
import { cuandoToca, fechaCorta, hoyComoTexto, sumarDias, textoFrecuencia } from '../lib/fechas'
import { reemplazar, volver } from '../lib/ruta'
import { supabase } from '../lib/supabase'
import { infoTipo, TIPOS_TRATAMIENTO, type TipoTratamiento, type Tratamiento } from '../lib/tipos'
import { useMascota } from '../lib/useMascota'
import { useMiembros } from '../lib/useMiembros'
import { avisoError, botonPrincipal, botonSecundario, campo } from './estilos'
import { Etiqueta, TituloSeccion } from './Piezas'

type Props = {
  mascotaId: string
  hogarId: string
  miUserId: string
}

type Foto = { id: string; archivo: File; url: string }
type Edicion = { elegida: boolean; tipo: TipoTratamiento; nombre: string; fecha: string; frecuencia: number }

const FRECUENCIAS = [30, 90, 182, 365, 730, 1095]

// #/mascotas/<id>/cartilla: fotos de la cartilla → la IA lee las vacunas y
// tratamientos → los revisas → se guardan como tratamientos.
export function PantallaLeerCartilla({ mascotaId, hogarId, miUserId }: Props) {
  const { mascota } = useMascota(mascotaId)
  const { miembros } = useMiembros()
  const [fotos, setFotos] = useState<Foto[]>([])
  const [paso, setPaso] = useState<'fotos' | 'leyendo' | 'revisar' | 'guardando' | 'hecho'>('fotos')
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [propuestas, setPropuestas] = useState<Propuesta[]>([])
  const [ediciones, setEdiciones] = useState<Record<string, Edicion>>({})
  const [existentes, setExistentes] = useState<Tratamiento[]>([])
  const [guardados, setGuardados] = useState(0)
  const selector = useRef<HTMLInputElement>(null)
  const fotosAlSalir = useRef<Foto[]>([])
  useEffect(() => {
    fotosAlSalir.current = fotos
  }, [fotos])

  // Los tratamientos que ya tiene (para no repetirlos).
  useEffect(() => {
    if (!supabase) return
    let vigente = true
    supabase
      .from('tratamientos')
      .select('*')
      .eq('mascota_id', mascotaId)
      .then(({ data }) => {
        if (vigente) setExistentes((data ?? []) as Tratamiento[])
      })
    return () => {
      vigente = false
    }
  }, [mascotaId])

  // Al salir, se liberan las vistas previas de las fotos.
  useEffect(() => () => fotosAlSalir.current.forEach((f) => URL.revokeObjectURL(f.url)), [])

  const miMiembroId = miembros?.find((m) => m.user_id === miUserId)?.id ?? null
  const volverA = `/mascotas/${mascotaId}`

  function anadirFotos(lista: FileList | null) {
    if (!lista) return
    setError(null)
    const nuevas = [...lista]
      .filter((a) => a.type.startsWith('image/'))
      .slice(0, MAX_PAGINAS - fotos.length)
      .map((archivo) => ({ id: crypto.randomUUID(), archivo, url: URL.createObjectURL(archivo) }))
    if (fotos.length + lista.length > MAX_PAGINAS) setError(`Como mucho ${MAX_PAGINAS} fotos cada vez.`)
    setFotos([...fotos, ...nuevas])
  }

  function quitarFoto(id: string) {
    const foto = fotos.find((f) => f.id === id)
    if (foto) URL.revokeObjectURL(foto.url)
    setFotos(fotos.filter((f) => f.id !== id))
  }

  async function leer() {
    setPaso('leyendo')
    setError(null)
    try {
      const resultado = await leerCartilla(fotos.map((f) => f.archivo))
      const lista = agruparLecturas(resultado.tratamientos, existentes)
      setPropuestas(lista)
      setEdiciones(
        Object.fromEntries(
          lista.map((p) => [
            p.clave,
            { elegida: marcadaAlEmpezar(p), tipo: p.tipo, nombre: p.nombre.slice(0, 60), fecha: p.fecha, frecuencia: p.frecuencia },
          ]),
        ),
      )
      setAviso(resultado.aviso)
      setPaso('revisar')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se ha podido leer la cartilla.')
      setPaso('fotos')
    }
  }

  function cambiar(clave: string, cambios: Partial<Edicion>) {
    setEdiciones({ ...ediciones, [clave]: { ...ediciones[clave], ...cambios } })
  }

  const elegidas = propuestas.filter((p) => ediciones[p.clave]?.elegida)
  const hoy = hoyComoTexto()

  async function guardar() {
    if (!supabase) return
    const conFechaMal = elegidas.find((p) => !ediciones[p.clave].fecha || ediciones[p.clave].fecha > hoy)
    if (conFechaMal) return setError(`Revisa la fecha de «${ediciones[conFechaMal.clave].nombre}»: no puede ser futura.`)
    const sinNombre = elegidas.find((p) => !ediciones[p.clave].nombre.trim())
    if (sinNombre) return setError('Hay un tratamiento sin nombre.')
    setPaso('guardando')
    setError(null)
    let hechos = 0
    for (const p of elegidas) {
      const e = ediciones[p.clave]
      const frecuencia = Math.min(Math.max(Math.round(e.frecuencia), 1), 3650)
      const { error } = p.existente
        ? await supabase
            .from('tratamientos')
            .update({ fecha_ultima: e.fecha, frecuencia_dias: frecuencia })
            .eq('id', p.existente.id)
        : await supabase.from('tratamientos').insert({
            hogar_id: hogarId,
            mascota_id: mascotaId,
            tipo: e.tipo,
            nombre: e.nombre.trim(),
            fecha_ultima: e.fecha,
            frecuencia_dias: frecuencia,
            responsable_id: miMiembroId,
            notas: p.producto ? `${p.producto} · leído de la cartilla` : 'Leído de la cartilla',
          })
      if (error) {
        setGuardados(hechos)
        setError(`No se ha podido guardar «${e.nombre}»: ${mensajeDeError(error)}`)
        setPaso('revisar')
        return
      }
      hechos++
    }
    setGuardados(hechos)
    setPaso('hecho')
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col gap-5 px-5 py-8 md:max-w-2xl md:px-6 lg:max-w-2xl lg:px-10 lg:py-10">
      <button type="button" onClick={() => volver(volverA)} className="self-start text-sm font-medium text-marca">
        ← {mascota?.nombre ?? 'Ficha'}
      </button>
      <h1 className="text-2xl font-extrabold text-marca">📷 Leer la cartilla</h1>

      {paso === 'fotos' && (
        <>
          <section className="tarjeta flex flex-col gap-3 text-sm text-stone-700">
            <TituloSeccion dibujo="🛂" titulo="Pasaporte europeo" color="vencimientos" />
            <p>
              Haz una foto a cada página con <strong>vacunas o desparasitaciones</strong> (en el pasaporte europeo,
              las secciones IV a VIII). Con buena luz, de frente y que se lea la letra.
            </p>
            <p>
              🔒 No hace falta la página de tus datos (sección I): mejor no la fotografíes. Las fotos se mandan a
              Gemma, una IA abierta que funciona en Cloudflare, solo para leerlas; <strong>la app no las guarda</strong>{' '}
              y Cloudflare no las usa para entrenar.
            </p>
            <p>
              Es gratis, pero la IA puede confundirse con la letra a mano: revisa las fechas antes de guardar.
            </p>
          </section>

          <section className="tarjeta">
            {fotos.length > 0 && (
              <ul className="mb-4 grid grid-cols-3 gap-2">
                {fotos.map((foto, i) => (
                  <li key={foto.id} className="relative">
                    <img src={foto.url} alt={`Foto ${i + 1}`} className="aspect-[3/4] w-full rounded-xl object-cover" />
                    <span className="absolute top-1 left-1 rounded-full bg-white/90 px-2 text-xs font-bold">{i + 1}</span>
                    <button
                      type="button"
                      onClick={() => quitarFoto(foto.id)}
                      aria-label={`Quitar la foto ${i + 1}`}
                      className="absolute top-1 right-1 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-sm"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <input
              ref={selector}
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              onChange={(e) => {
                anadirFotos(e.target.files)
                e.target.value = ''
              }}
            />
            {fotos.length < MAX_PAGINAS && (
              <button type="button" onClick={() => selector.current?.click()} className={botonSecundario}>
                {fotos.length === 0 ? '📷 Hacer o elegir fotos' : '+ Añadir más fotos'}
              </button>
            )}
            <p className="mt-2 text-center text-xs text-stone-500">
              {fotos.length} de {MAX_PAGINAS} fotos como mucho
            </p>
          </section>

          {error && <p role="alert" className={avisoError}>{error}</p>}

          <button type="button" onClick={leer} disabled={fotos.length === 0} className={botonPrincipal}>
            Leer {fotos.length === 1 ? 'la foto' : fotos.length > 1 ? `las ${fotos.length} fotos` : 'la cartilla'}
          </button>
        </>
      )}

      {paso === 'leyendo' && (
        <section className="tarjeta flex flex-col items-center gap-3 py-10 text-center" role="status">
          <span aria-hidden="true" className="animate-flotar text-5xl">🔎</span>
          <p className="font-semibold">Leyendo la cartilla…</p>
          <p className="text-sm text-stone-500">Puede tardar hasta un minuto. No cierres la app.</p>
        </section>
      )}

      {(paso === 'revisar' || paso === 'guardando') && (
        <>
          <section className="tarjeta text-sm text-stone-700">
            <TituloSeccion
              dibujo="✍️"
              titulo="Revisa antes de guardar"
              subtitulo="La IA puede equivocarse con la letra a mano"
              color="casa"
            />
            {aviso && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-amber-900">ℹ️ {aviso}</p>}
            {propuestas.length === 0 && (
              <p className="mt-3">
                No se ha encontrado ninguna vacuna ni tratamiento. Prueba con fotos más nítidas o de otras páginas.
              </p>
            )}
          </section>

          {propuestas.map((p) => {
            const e = ediciones[p.clave]
            const info = infoTipo(e.tipo)
            const futura = e.fecha > hoy
            const proxima = e.fecha && e.frecuencia > 0 ? sumarDias(e.fecha, Math.round(e.frecuencia)) : null
            const alDia = p.existente && p.existente.fecha_ultima >= e.fecha
            return (
              <section key={p.clave} className={`tarjeta flex flex-col gap-3 ${e.elegida ? 'ring-2 ring-marca/40' : 'opacity-80'}`}>
                <label className="flex items-center gap-3 font-semibold">
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-marca"
                    checked={e.elegida}
                    onChange={(ev) => cambiar(p.clave, { elegida: ev.target.checked })}
                  />
                  <span aria-hidden="true" className="text-2xl">{info.dibujo}</span>
                  <span className="flex-1">{p.existente ? `Actualizar «${p.existente.nombre}»` : 'Añadir'}</span>
                </label>

                <div className="flex flex-wrap gap-1.5">
                  {p.veces > 1 && <Etiqueta className="bg-stone-100 text-stone-600">Sale {p.veces} veces</Etiqueta>}
                  <Etiqueta className="bg-vencimientos text-vencimientos-tinta">
                    Foto{p.paginas.length > 1 ? 's' : ''} {p.paginas.join(', ')}
                  </Etiqueta>
                  {p.producto && <Etiqueta className="bg-stone-100 text-stone-600">{p.producto}</Etiqueta>}
                </div>

                {p.dudas.length > 0 && (
                  <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">⚠️ Revisa: {p.dudas.join(' · ')}</p>
                )}
                {alDia && (
                  <p className="rounded-xl bg-stone-50 p-3 text-sm text-stone-600">
                    Ya lo tenéis al día (última vez: {fechaCorta(p.existente!.fecha_ultima)}).
                  </p>
                )}

                {!p.existente && (
                  <>
                    <label className="flex flex-col gap-1 text-xs font-medium text-stone-600">
                      Nombre
                      <input
                        className={campo}
                        value={e.nombre}
                        maxLength={60}
                        onChange={(ev) => cambiar(p.clave, { nombre: ev.target.value })}
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs font-medium text-stone-600">
                      Tipo
                      <select
                        className={campo}
                        value={e.tipo}
                        onChange={(ev) => cambiar(p.clave, { tipo: ev.target.value as TipoTratamiento })}
                      >
                        {TIPOS_TRATAMIENTO.map((t) => (
                          <option key={t.valor} value={t.valor}>
                            {t.dibujo} {t.texto}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-stone-600">
                    Última vez
                    <input
                      type="date"
                      className={`${campo} ${futura ? 'border-red-400' : ''}`}
                      value={e.fecha}
                      max={hoy}
                      onChange={(ev) => cambiar(p.clave, { fecha: ev.target.value })}
                    />
                  </label>
                  <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-stone-600">
                    Cada cuánto
                    <select
                      className={`${campo} px-2`}
                      value={e.frecuencia}
                      onChange={(ev) => cambiar(p.clave, { frecuencia: Number(ev.target.value) })}
                    >
                      {[...new Set([...FRECUENCIAS, Math.round(e.frecuencia)])]
                        .sort((a, b) => a - b)
                        .map((d) => (
                          <option key={d} value={d}>
                            {textoFrecuencia(d)}
                          </option>
                        ))}
                    </select>
                  </label>
                </div>

                {futura ? (
                  <p className="text-sm font-medium text-red-700">Esta fecha es futura: corrígela.</p>
                ) : (
                  proxima && (
                    <p className="text-sm text-stone-600">
                      Próxima: <strong>{fechaCorta(proxima)}</strong> · {cuandoToca(proxima)}
                    </p>
                  )
                )}
              </section>
            )
          })}

          {error && <p role="alert" className={avisoError}>{error}</p>}

          {propuestas.length > 0 && (
            <button type="button" onClick={guardar} disabled={elegidas.length === 0 || paso === 'guardando'} className={botonPrincipal}>
              {paso === 'guardando'
                ? 'Guardando…'
                : elegidas.length === 0
                  ? 'Elige qué guardar'
                  : `Guardar ${elegidas.length} ${elegidas.length === 1 ? 'tratamiento' : 'tratamientos'}`}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setPaso('fotos')
              setError(null)
            }}
            className="text-sm font-medium text-stone-600"
          >
            Volver a las fotos
          </button>
        </>
      )}

      {paso === 'hecho' && (
        <section className="tarjeta flex flex-col items-center gap-3 py-8 text-center">
          <span aria-hidden="true" className="text-5xl">🎉</span>
          <p className="text-lg font-semibold">
            {guardados === 1 ? '1 tratamiento guardado' : `${guardados} tratamientos guardados`}
          </p>
          <p className="text-sm text-stone-600">
            Ya están en la ficha de {mascota?.nombre ?? 'tu mascota'}, con su próxima fecha y su aviso.
          </p>
          <button type="button" onClick={() => reemplazar(volverA)} className={botonPrincipal}>
            Ver la ficha
          </button>
        </section>
      )}
    </main>
  )
}
