// Cuando alguien abre un enlace de invitación (…/?invitacion=CODIGO)
// todavía no ha entrado con Google. Guardamos el código en el navegador
// para no perderlo durante el viaje de ida y vuelta a Google.

const CLAVE = 'tareas.invitacion'

export function guardarInvitacionDeLaUrl(): void {
  const url = new URL(window.location.href)
  const codigo = url.searchParams.get('invitacion')
  if (!codigo) return
  try {
    localStorage.setItem(CLAVE, codigo.trim().toUpperCase())
  } catch {
    // Si el navegador no deja guardar, la persona puede escribir el código.
  }
  // Quitamos el código de la dirección para que no se quede a la vista.
  url.searchParams.delete('invitacion')
  window.history.replaceState(window.history.state, '', url.toString())
}

export function leerInvitacionPendiente(): string {
  try {
    return localStorage.getItem(CLAVE) ?? ''
  } catch {
    return ''
  }
}

export function borrarInvitacionPendiente(): void {
  try {
    localStorage.removeItem(CLAVE)
  } catch {
    // Nada que hacer.
  }
}
