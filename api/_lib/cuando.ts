// «mañana», «el viernes», «en marzo», «el 15 de marzo», «dentro de 2
// semanas», «a finales de mes»… → una fecha AAAA-MM-DD, contando desde hoy.
// Se hace con reglas fijas y no con la IA: las IAs se equivocan a menudo
// al contar días en el calendario. Si no entiende la frase, devuelve null.

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
// En el orden de getUTCDay (0 = domingo).
const DIAS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado']
const NUMEROS: Record<string, number> = {
  un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, veinte: 20, treinta: 30,
}
const MES = `(${MESES.join('|')}|setiembre)`
const DIA_SEMANA = `(${DIAS.join('|')})`
const CANTIDAD = `(\\d{1,3}|${Object.keys(NUMEROS).join('|')})`

// Sin tildes, en minúsculas y sin signos (salvo / . - de las fechas).
function normalizar(texto: string): string {
  return ` ${texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9/.\-ñ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()} `
}

const aFecha = (texto: string) => new Date(`${texto}T00:00:00Z`)
const aTexto = (fecha: Date) => fecha.toISOString().slice(0, 10)
const masDias = (fecha: Date, dias: number) => new Date(fecha.getTime() + dias * 86_400_000)
const ultimoDia = (anio: number, mes: number) => new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate() // mes 0-11

function fechaReal(anio: number, mes: number, dia: number): Date | null {
  const fecha = new Date(Date.UTC(anio, mes, dia))
  return fecha.getUTCMonth() === mes && fecha.getUTCDate() === dia ? fecha : null
}

function masMeses(fecha: Date, meses: number): Date {
  const total = fecha.getUTCMonth() + meses
  const anio = fecha.getUTCFullYear() + Math.floor(total / 12)
  const mes = ((total % 12) + 12) % 12
  return new Date(Date.UTC(anio, mes, Math.min(fecha.getUTCDate(), ultimoDia(anio, mes))))
}

// Un día y mes sin año: este año si aún no ha pasado; si no, el que viene.
function proximaVez(hoy: Date, mes: number, dia: number, anio?: number): Date | null {
  if (anio) return fechaReal(anio, mes, dia)
  const esteAnio = fechaReal(hoy.getUTCFullYear(), mes, dia)
  if (esteAnio && esteAnio >= hoy) return esteAnio
  return fechaReal(hoy.getUTCFullYear() + 1, mes, dia)
}

// Un mes sin día: el mes que toca (este año o el que viene). El día lo
// decide «quedarse»: el 1, el 15 o el último. Si es este mes, como pronto hoy.
function mesQueToca(hoy: Date, mes: number, quedarse: 'principio' | 'mitad' | 'final', anio?: number): Date {
  let a = anio ?? hoy.getUTCFullYear()
  if (!anio && mes < hoy.getUTCMonth()) a++
  const dia = quedarse === 'principio' ? 1 : quedarse === 'mitad' ? 15 : ultimoDia(a, mes)
  const fecha = new Date(Date.UTC(a, mes, dia))
  return fecha < hoy ? hoy : fecha
}

const numeroDe = (palabra: string) => NUMEROS[palabra] ?? Number(palabra)
const indiceMes = (palabra: string) => (palabra === 'setiembre' ? 8 : MESES.indexOf(palabra))
const anioDe = (texto?: string) => (texto ? (texto.length === 2 ? 2000 + Number(texto) : Number(texto)) : undefined)

export function resolverCuando(frase: string | null | undefined, hoyTexto: string): string | null {
  if (!frase) return null
  const hoy = aFecha(hoyTexto)
  let t = normalizar(frase)
  let m: RegExpExecArray | null

  // 1. Fechas escritas: «el 15 de marzo (de 2027)», «15/3», «15-03-27», «2027-03-15».
  if ((m = new RegExp(` (\\d{1,2}) de ${MES}(?: de(?:l)? (\\d{4}))? `).exec(t))) {
    return fechaOTexto(proximaVez(hoy, indiceMes(m[2]), Number(m[1]), anioDe(m[3])))
  }
  if ((m = / (\d{4})-(\d{1,2})-(\d{1,2}) /.exec(t))) {
    return fechaOTexto(fechaReal(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  }
  // (Con punto o guion, solo si lleva año: «1.5 kg» no es una fecha.)
  if ((m = / (\d{1,2})\/(\d{1,2})(?:\/(\d{4}|\d{2}))? /.exec(t) ?? / (\d{1,2})[.-](\d{1,2})[.-](\d{4}|\d{2}) /.exec(t))) {
    return fechaOTexto(proximaVez(hoy, Number(m[2]) - 1, Number(m[1]), anioDe(m[3])))
  }

  // 2. «a principios / mediados / finales de marzo» o «… de mes».
  if ((m = new RegExp(` a (principios|primeros|mediados|finales|final|ultimos) de(?:l mes de)? (mes|${MES.slice(1, -1)})(?: de (\\d{4}))? `).exec(t))) {
    const quedarse = m[1] === 'mediados' ? 'mitad' : m[1] === 'principios' || m[1] === 'primeros' ? 'principio' : 'final'
    const mes = m[2] === 'mes' ? hoy.getUTCMonth() : indiceMes(m[2])
    return aTexto(mesQueToca(hoy, mes, quedarse, anioDe(m[3])))
  }

  // 3. «dentro de 2 semanas», «en tres días», «en un mes».
  if ((m = new RegExp(` (?:dentro de|en) ${CANTIDAD} (dia|dias|semana|semanas|mes|meses|ano|anos) `).exec(t))) {
    const n = numeroDe(m[1])
    if (n > 0 && n <= 1000) {
      if (m[2].startsWith('dia')) return aTexto(masDias(hoy, n))
      if (m[2].startsWith('semana')) return aTexto(masDias(hoy, n * 7))
      if (m[2].startsWith('mes')) return aTexto(masMeses(hoy, n))
      return aTexto(masMeses(hoy, n * 12))
    }
  }

  // 4. Hoy, mañana, pasado mañana («por la mañana» es la hora, no el día).
  if (/ (esta manana|esta tarde|esta noche|hoy) /.test(t)) return aTexto(hoy)
  if (/ pasado manana /.test(t)) return aTexto(masDias(hoy, 2))
  t = t.replace(/ (por|de|a) la manana /g, ' ')
  if (/ manana /.test(t)) return aTexto(masDias(hoy, 1))

  // 5. Días de la semana: «el viernes», «este martes», «el lunes que viene».
  if ((m = new RegExp(` (?:(este|esta) )?(?:(?:el|la) )?(?:proximo |proxima )?${DIA_SEMANA}(?: que viene| proximo)? `).exec(t))) {
    const objetivo = DIAS.indexOf(m[2])
    let dias = (objetivo - hoy.getUTCDay() + 7) % 7
    // «el viernes» dicho en viernes es el de la semana que viene; «este viernes», hoy.
    if (dias === 0 && !m[1]) dias = 7
    return aTexto(masDias(hoy, dias))
  }

  // 6. Semanas, fines de semana y meses enteros.
  const sabado = (6 - hoy.getUTCDay() + 7) % 7 // días hasta el sábado (0 si es sábado)
  if (/ ((fin de semana|finde) que viene|proximo (fin de semana|finde)) /.test(t)) {
    return aTexto(masDias(hoy, hoy.getUTCDay() === 0 ? 6 : sabado + 7))
  }
  if (/ (fin de semana|finde) /.test(t)) {
    if (hoy.getUTCDay() === 0) return aTexto(hoy) // domingo: este fin de semana es hoy
    return aTexto(masDias(hoy, sabado))
  }
  if (/ (semana que viene|proxima semana|semana proxima) /.test(t)) {
    return aTexto(masDias(hoy, ((1 - hoy.getUTCDay() + 7) % 7) || 7)) // el lunes
  }
  if (/ esta semana /.test(t)) return aTexto(masDias(hoy, (7 - hoy.getUTCDay()) % 7)) // el domingo
  if (/ (mes que viene|proximo mes|mes proximo) /.test(t)) {
    return aTexto(new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() + 1, 1)))
  }
  if (/ este mes /.test(t)) return aTexto(mesQueToca(hoy, hoy.getUTCMonth(), 'final'))

  // 7. Un mes solo: «en marzo», «para abril de 2027» → el día 1.
  if ((m = new RegExp(` ${MES}(?: de (\\d{4}))? `).exec(t))) {
    return aTexto(mesQueToca(hoy, indiceMes(m[1]), 'principio', anioDe(m[2])))
  }

  // 8. «el día 20» → el 20 de este mes, o del que viene si ya ha pasado.
  if ((m = / dia (\d{1,2}) /.exec(t))) {
    const dia = Number(m[1])
    const esteMes = fechaReal(hoy.getUTCFullYear(), hoy.getUTCMonth(), dia)
    if (esteMes && esteMes >= hoy) return aTexto(esteMes)
    const siguiente = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() + 1, 1))
    return fechaOTexto(fechaReal(siguiente.getUTCFullYear(), siguiente.getUTCMonth(), dia))
  }

  return null
}

function fechaOTexto(fecha: Date | null): string | null {
  return fecha ? aTexto(fecha) : null
}
