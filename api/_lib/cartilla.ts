// Lo que le decimos a Claude para leer la cartilla, el formato en el que
// tiene que contestar y la comprobación de su respuesta.
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
- Si las fotos no son de una cartilla, devuelve la lista vacía y dilo en «aviso». Usa «aviso» también para algo general que deba saber (por ejemplo, que una foto está borrosa). Si no hay nada que avisar, null.`

const TEXTO_O_NULO = { anyOf: [{ type: 'string' }, { type: 'null' }] }
const FECHA_O_NULA = { anyOf: [{ type: 'string', format: 'date' }, { type: 'null' }] }

// El formato exacto de la respuesta (la API garantiza que lo cumple).
export const ESQUEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['tratamientos', 'aviso'],
  properties: {
    tratamientos: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['tipo', 'nombre', 'producto', 'fecha', 'valida_hasta', 'pagina', 'segura', 'dudas'],
        properties: {
          tipo: { type: 'string', enum: [...TIPOS] },
          nombre: { type: 'string' },
          producto: TEXTO_O_NULO,
          fecha: { type: 'string', format: 'date' },
          valida_hasta: FECHA_O_NULA,
          pagina: { type: 'integer' },
          segura: { type: 'boolean' },
          dudas: TEXTO_O_NULO,
        },
      },
    },
    aviso: TEXTO_O_NULO,
  },
} as const

const FECHA = /^\d{4}-\d{2}-\d{2}$/

function fechaValida(texto: unknown): texto is string {
  if (typeof texto !== 'string' || !FECHA.test(texto)) return false
  const [anio, mes, dia] = texto.split('-').map(Number)
  const fecha = new Date(Date.UTC(anio, mes - 1, dia))
  return fecha.getUTCMonth() === mes - 1 && fecha.getUTCDate() === dia && anio > 1980 && anio < 2100
}

function texto(valor: unknown, maximo: number): string | null {
  if (typeof valor !== 'string') return null
  const limpio = valor.trim().slice(0, maximo)
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
    const tipo = TIPOS.find((x) => x === t.tipo)
    const nombre = texto(t.nombre, 60)
    if (!tipo || !nombre || !fechaValida(t.fecha)) continue
    const pagina = typeof t.pagina === 'number' && Number.isInteger(t.pagina) ? t.pagina : 1
    tratamientos.push({
      tipo,
      nombre,
      producto: texto(t.producto, 80),
      fecha: t.fecha,
      valida_hasta: fechaValida(t.valida_hasta) ? t.valida_hasta : null,
      pagina: Math.min(Math.max(pagina, 1), paginas),
      segura: t.segura === true,
      dudas: texto(t.dudas, 200),
    })
  }
  return { tratamientos, aviso: texto(bruto.aviso, 300) }
}
