// Lo que le decimos a la IA para leer la cartilla, el formato en el que
// tiene que contestar y la comprobación de su respuesta (la IA puede
// equivocarse con el formato: aquí se arregla lo que se pueda y se descarta
// lo demás).
// OJO: se ejecuta en el SERVIDOR (funciones de Vercel), nunca en el móvil.

export const TIPOS = [
  'vacuna',
  'desparasitacion_interna',
  'desparasitacion_externa',
  'medicacion',
  'revision',
] as const

export type Tipo = (typeof TIPOS)[number]

export type Lectura = {
  tipo: Tipo
  nombre: string
  producto: string | null
  fecha: string
  valida_hasta: string | null
  pagina: number
  segura: boolean
  dudas: string | null
}

export type Resultado = {
  tratamientos: Lectura[]
  aviso: string | null
}

export const INSTRUCCIONES = `Lees fotos de la cartilla sanitaria de una mascota. Casi siempre es el pasaporte europeo para animales de compañía (perros, gatos y hurones), aunque también puede ser una cartilla nacional. Tu trabajo es encontrar cada vacuna y cada tratamiento apuntado, con su fecha, y devolverlos en el formato pedido. La persona que lo usa revisará todo antes de guardarlo: es mejor marcar una duda que inventar.

Dónde mirar en el pasaporte europeo (los títulos salen en el idioma del país y en inglés; las vacunas suelen llevar una pegatina del producto y la fecha escrita a mano):
- IV. Vacunación antirrábica (Vaccination against rabies): tipo «vacuna», nombre «Rabia». Columnas: fabricante y nombre de la vacuna, número de lote, fecha de vacunación, válida desde, válida hasta y veterinario.
- VI. Tratamiento contra Echinococcus multilocularis: tipo «desparasitacion_interna». Columnas: fabricante y nombre del producto, fecha y hora, veterinario.
- VII. Otros tratamientos antiparasitarios (Other anti-parasite treatments): «desparasitacion_interna» si es contra lombrices (comprimidos como Milbemax, Drontal, Milpro, Panacur…) o «desparasitacion_externa» si es contra pulgas y garrapatas (pipetas, collares o comprimidos como Frontline, Advantix, Seresto, Bravecto, NexGard, Simparica…). Si el producto cubre las dos cosas o no está claro, elige la más probable y explícalo en «dudas».
- VIII. Otras vacunaciones (Other vaccinations): tipo «vacuna». En «nombre», las enfermedades que cubre si se leen (por ejemplo «Polivalente canina», «Trivalente felina», «Leishmaniosis», «Tos de las perreras»).
- IX. Examen clínico (Clinical examination): tipo «revision», nombre «Revisión», si tiene fecha.
En una cartilla nacional, usa las tablas equivalentes de vacunas, desparasitaciones y revisiones.

Reglas:
- Una entrada por cada fila con fecha. Si el mismo producto aparece en varias fechas, devuélvelas todas.
- Fechas: en Europa se escriben día/mes/año (12/03/2024 es el 12 de marzo). Devuélvelas como AAAA-MM-DD. Un año con dos cifras es 20xx.
- Si alguna cifra o palabra no se lee bien, pon tu mejor lectura, «segura»: false, y explica en «dudas» qué no se lee, en pocas palabras y en español.
- «valida_hasta»: solo si está escrita (en la rabia suele estarlo). Si no, null.
- «producto»: fabricante y nombre comercial tal como se leen (por ejemplo «Nobivac Rabies»), o null.
- «nombre»: corto y en español, lo que verá la persona en la app («Rabia», «Polivalente canina», «Pipeta antipulgas», «Desparasitación interna»).
- «pagina»: el número de la foto donde está la entrada (la primera foto es la 1).
- No inventes nada. Si una foto no tiene vacunas ni tratamientos, no devuelvas nada de ella.
- Nunca copies datos de personas: ni de la propietaria (sección I: nombre, dirección, teléfono) ni del veterinario, ni el número de microchip.
- Si las fotos no son de una cartilla, devuelve la lista vacía y dilo en «aviso». Usa «aviso» también para algo general que deba saber (por ejemplo, que una foto está borrosa). Si no hay nada que avisar, null.

Formato de la respuesta: contesta SOLO con un objeto JSON, sin ningún texto antes ni después y sin \`\`\`. Tiene esta forma (lo que va entre < > es lo que tienes que rellenar):
{"tratamientos": [{"tipo": "<tipo>", "nombre": "<nombre corto>", "producto": "<producto o null>", "fecha": "<AAAA-MM-DD>", "valida_hasta": "<AAAA-MM-DD o null>", "pagina": <número de la foto>, "segura": <true o false>, "dudas": "<qué no se lee, o null>"}], "aviso": "<texto o null>"}
- «tipo» es exactamente uno de: vacuna, desparasitacion_interna, desparasitacion_externa, medicacion, revision.
- Los textos («nombre», «dudas», «aviso») en español.`

function fechaReal(anio: number, mes: number, dia: number): string | null {
  const fecha = new Date(Date.UTC(anio, mes - 1, dia))
  if (fecha.getUTCMonth() !== mes - 1 || fecha.getUTCDate() !== dia || anio <= 1980 || anio >= 2100) return null
  return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

// «2024-03-12», o como se escribe en Europa: «12/03/2024», «12.3.24», «12-03-2024».
function leerFecha(valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  const texto = valor.trim()
  let partes = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(texto)
  if (partes) return fechaReal(Number(partes[1]), Number(partes[2]), Number(partes[3]))
  partes = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})$/.exec(texto)
  if (!partes) return null
  const anio = partes[3].length === 2 ? 2000 + Number(partes[3]) : Number(partes[3])
  return fechaReal(anio, Number(partes[2]), Number(partes[1]))
}

// «Desparasitación interna» o «desparasitacion-interna» → «desparasitacion_interna».
function leerTipo(valor: unknown): Tipo | null {
  if (typeof valor !== 'string') return null
  const limpio = valor
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/[\s-]+/g, '_')
  return TIPOS.find((t) => t === limpio) ?? null
}

function texto(valor: unknown, maximo: number): string | null {
  if (typeof valor !== 'string') return null
  const limpio = valor.trim().slice(0, maximo)
  // A veces la IA escribe «null» como texto en vez de dejarlo vacío.
  if (/^(null|none|ninguna?|-)$/i.test(limpio)) return null
  return limpio || null
}

// Comprobamos lo que devuelve la IA antes de mandarlo al móvil: solo pasan
// entradas con un tipo conocido y una fecha de verdad, y con textos cortos.
export function validarResultado(datos: unknown, paginas: number): Resultado {
  const bruto = (datos ?? {}) as { tratamientos?: unknown; aviso?: unknown }
  const lista = Array.isArray(bruto.tratamientos) ? bruto.tratamientos : []
  const tratamientos: Lectura[] = []
  for (const item of lista.slice(0, 100)) {
    const t = (item ?? {}) as Record<string, unknown>
    const tipo = leerTipo(t.tipo)
    const nombre = texto(t.nombre, 60)
    const fecha = leerFecha(t.fecha)
    if (!tipo || !nombre || !fecha) continue
    const numero = Number(t.pagina)
    const pagina = Number.isInteger(numero) ? numero : 1
    const dudas = texto(t.dudas, 200)
    tratamientos.push({
      tipo,
      nombre,
      producto: texto(t.producto, 80),
      fecha,
      valida_hasta: leerFecha(t.valida_hasta),
      pagina: Math.min(Math.max(pagina, 1), paginas),
      // Si dice que no está segura, o explica alguna duda, se marca para revisar.
      segura: (t.segura === true || t.segura === 'true') && !dudas,
      dudas,
    })
  }
  return { tratamientos, aviso: texto(bruto.aviso, 300) }
}
