# Tareas — app de carga mental en pareja (empezando por la mascota)

> Este archivo le explica a Claude Code qué estamos construyendo y cómo trabajar conmigo.
> Repositorio: https://github.com/Kitesurfera/tareas (público)

## Qué es

Una app web (que se instala en el móvil como PWA) para que una pareja o un hogar compartido se reparta **lo que hay que recordar**, no solo lo que hay que hacer.

- **Puerta de entrada:** la salud de la mascota (vacunas, desparasitaciones, medicación, peso).
- **Expansión:** cualquier cosa del hogar que alguien tiene que tener en la cabeza (seguros, ITV, regalos, renovaciones).
- **Diferenciador:** cada cosa tiene una responsable clara y, más adelante, la app enseña de forma amable cómo está repartida la carga mental.

## Sobre mí (cómo trabajar conmigo)

- No sé programar todavía. Estoy aprendiendo con vibe coding.
- **Ve paso a paso.** Antes de cada bloque grande, dime en 2-3 frases qué vas a hacer y por qué.
- **Explícame los comandos** que me pidas ejecutar en lenguaje sencillo.
- Pídeme confirmación antes de instalar dependencias nuevas o de cambiar algo de la base de datos.
- Haz commits pequeños y frecuentes, con mensajes en español que yo entienda.
- Si algo que pido es mala idea, dímelo directamente y propón una alternativa.
- Al terminar cada tarea, dime cómo probarla yo misma.

## Stack

- **Frontend:** React + Vite + TypeScript, con Tailwind CSS.
- **PWA:** instalable en móvil (vite-plugin-pwa, configurado en `vite.config.ts`). El service worker solo guarda los archivos de la app, nunca los datos del hogar (siempre se piden a Supabase). Las versiones nuevas se instalan solas: `src/lib/actualizaciones.ts` registra el service worker y, cuando llega una versión nueva, recarga la app si acabas de abrirla o enseña el aviso «Actualizar» si llevas un rato usándola. Iconos en `public/` (casa con ✓ sobre el verde `#0f766e`); el aviso «Instala Tareas en tu móvil» del inicio usa `src/lib/instalar.ts`.
- **Backend:** Supabase (login, base de datos Postgres y almacenamiento de fotos).
- **Servidor (Vercel Functions, carpeta `api/`):** `recordatorios.ts` (aviso diario; lo llama Vercel con `crons` de `vercel.json` a las 6:00 y 7:00 UTC y solo envía cuando son las 8:00 en España; protegido con `CRON_SECRET`) y `aviso-de-prueba.ts` (botón «Probar aviso»; comprueba la sesión y solo avisa a los móviles de quien lo pide). El código compartido va en `api/_lib/`. Usa la librería `web-push`.
- **Despliegue:** Vercel. Se publica sola cada vez que algo llega a `main`, y cada pull request tiene su propio enlace de prueba.
- Diseño **mobile-first**. Toda la interfaz en **español**.

## GitHub y flujo de trabajo

- El código vive en GitHub (`Kitesurfera/tareas`). Trabajo con Claude Code conectado a este repositorio.
- `main` siempre tiene que funcionar. Cada paso de una fase se hace en una rama propia (por ejemplo `fase1-login`) y se une a `main` con un pull request.
- En cada pull request, explícame en español qué cambia y cómo probarlo antes de que yo lo apruebe.
- Vercel despliega automáticamente cada cambio que llega a `main`. Yo lo pruebo todo desde el móvil con el enlace de prueba del pull request (no tengo el proyecto en mi ordenador).

## Seguridad (no negociable)

- **El repositorio es público**: cualquiera puede leer el código. Antes de cada commit, comprueba que no se cuela ninguna clave, contraseña, email personal ni dato real de la mascota o del hogar.
- Activa **Row Level Security (RLS)** en todas las tablas de Supabase desde el principio: cada hogar solo puede ver y modificar sus propios datos.
- Los cambios de la base de datos van en `supabase/migrations/` (un archivo `.sql` por paso). Yo los ejecuto a mano en Supabase → SQL Editor: ejecutarlo es mi forma de aprobarlo. Antes de dármelos, pruébalos en un PostgreSQL local que imite Supabase, incluidos intentos de acceder a datos de otro hogar.
- Las claves van en las variables de entorno de Vercel (o en un `.env` local, que está en `.gitignore`). Nunca subas claves al repositorio.
- En el frontend solo se usa la clave pública de Supabase (`publishable`, `sb_publishable_…`; sustituye a la antigua `anon`), nunca la `secret` (`sb_secret_…`, antigua `service_role`).
- La clave `secret` de Supabase solo existe en el **servidor** (funciones de Vercel en `api/`, variable `SUPABASE_SECRET_KEY`). Nunca lleva el prefijo `VITE_`, porque todo lo que empieza por `VITE_` acaba dentro de la app del móvil. Lo mismo con `VAPID_PRIVATE_KEY` y `CRON_SECRET`.
- Cuando terminemos cada fase, repasa conmigo cómo podría alguien acceder a datos de otro hogar y cómo lo hemos impedido (me interesa aprender hacking ético).
- Cabeceras de seguridad de la web en `vercel.json` (CSP, no dejar meter la app en un marco, etc.). Si se añade algo que cargue cosas de otro dominio, hay que permitirlo ahí o el navegador lo bloqueará.
- En Supabase solo está activado el login con Google (el de email y contraseña está desactivado a propósito).

## Modelo de datos (versión inicial)

- **hogares**: id, nombre, creado_en
- **miembros**: id, hogar_id, user_id, nombre_visible, rol (admin / miembro)
- **invitaciones**: id, hogar_id, email o código, estado, caduca_en
- **mascotas**: id, hogar_id, nombre, especie, raza, fecha_nacimiento, foto_ruta (ruta en el almacén privado `mascotas`, carpeta = id del hogar), notas, creada_por
- **tratamientos**: id, hogar_id, mascota_id, tipo (vacuna / desparasitacion_interna / desparasitacion_externa / medicacion / revision), nombre, fecha_ultima, frecuencia_dias, responsable_id (sus tareas lo heredan), notas, creada_por
- **pesos**: id, hogar_id, mascota_id, fecha, kg (hasta 3 decimales, entre 0 y 500), creada_por. Como mucho un peso por mascota y día (`un_peso_por_dia`; si se vuelve a pesar ese día, la app cambia el que había). Se ve en la sección «⚖️ Peso» de la ficha, con gráfica (`GraficaPeso`, dibujada a mano en SVG, sin librerías).
- **plantas**: id, hogar_id, nombre, tipo («Ficus»), ubicacion («Salón»), notas, creada_por. Sin foto (de momento).
- **cuidados**: id, hogar_id, planta_id, tipo (riego / abono / trasplante / poda / otro), nombre (solo para «otro»), fecha_ultima, frecuencia_dias, responsable_id, notas, creada_por. Funcionan como los tratamientos: `sincronizar_tarea_del_cuidado` mantiene una tarea pendiente «Regar: Ficus» (categoría plantas) y, si cambia el nombre de la planta, `renombrar_tareas_de_la_planta` cambia el título de sus tareas.
- **tareas**: id, hogar_id, titulo, descripcion, fecha_limite, responsable_id, creada_por, completada, completada_por, completada_en, categoria (mascota / casa / plantas / coche / papeleo / otros), mascota_id, planta_id, tratamiento_id, vencimiento_id, rutina_id, cuidado_id (estos cuatro últimos marcan las tareas automáticas)
- **vencimientos**: id, hogar_id, tipo (seguro / suscripcion), nombre, fecha_renovacion, frecuencia_meses (vacío = no se repite), importe, aviso_dias (vacío = sin aviso), responsable_id, notas, revisado_para, creada_por
- **rutinas**: id, hogar_id, nombre, frecuencia_dias, fecha_ultima, responsable_id, turnos (si rota entre la gente del hogar), participantes (miembros.id que se turnan; vacío = todo el hogar), notas, creada_por
- **lista_compra**: id, hogar_id, nombre, cantidad, comprado, anadido_por, comprado_por, comprado_en (quién añade y quién compra lo pone la base de datos)
- **actividad**: id, hogar_id, user_id, tipo (pensar / hacer), origen (tarea / tratamiento / rutina / vencimiento / compra / cuidado), origen_id, titulo, creado_en. Diario de «En equipo» que rellenan solo los disparadores (`apuntar_actividad_*`): pensar = crear una tarea a mano, un tratamiento, una rutina, un vencimiento o un cuidado de una planta, o apuntar algo en la compra; hacer = completar una tarea o comprar algo. Reabrir o desmarcar quita ese «hacer». Nadie puede escribir en él a mano y **cada persona solo lee sus propias filas**. `resumen_carga_mental` da tus números (solo tuyos), `totales_del_hogar` lo de todas sin decir quién y `agradecimientos` lo que pensaron las demás personas (para dar las gracias).
- **avisos_push**: id, user_id, endpoint, p256dh, auth, ultimo_envio (móviles con avisos activados; cada persona solo ve los suyos; `guardar_aviso_push` los guarda y `recordatorios_del_dia` —solo para el servidor— prepara el resumen: lo pendiente hasta hoy que es tuyo o no es de nadie, teniendo en cuenta los viajes)
- **accesos**: id, hogar_id, nombre, codigo (16 letras al azar, del enlace `/?encargo=CODIGO`), user_id (quien lo aceptó; solo una persona), desde, hasta (como mucho 3 meses), categorias, tareas, rutinas, tratamientos, cuidados (lo que puede ver: tipos enteros o cosas sueltas), creada_por. Solo lo ve y cambia la gente del hogar (`user_id` y `codigo` no se pueden cambiar).
- **notas_encargo**: id, hogar_id, acceso_id, autora, tarea_titulo, texto, creado_en. Las notas de quien ayuda (solo se escriben con `completar_encargo` / `nota_para_el_hogar`).
- **viajes**: id, hogar_id, grupo, miembro_id, desde, hasta, destino, creada_por. Una fila por persona; si se van varias a la vez comparten `grupo`. `guardar_viaje` crea o cambia un viaje entero de una vez (borra y vuelve a crear las filas del grupo). Se ven en `#/viajes` (desde Ajustes) y en la tarjeta «✈️ Modo viaje» del inicio.

**Mismo hogar garantizado:** `responsable_id` apunta a `miembros.id`. Las relaciones entre tablas usan claves compuestas `(id, hogar_id)`, así la base de datos impide enlazar una mascota, un tratamiento o una persona de otro hogar.

**Regla clave que une las dos ideas:** cada tratamiento genera automáticamente una tarea para su próxima fecha (`fecha_ultima + frecuencia_dias`). Al marcar esa tarea como hecha, se actualiza `fecha_ultima` del tratamiento y se crea la siguiente tarea. Lo hace la propia base de datos: el disparador `sincronizar_tarea_del_tratamiento` (al crear o cambiar un tratamiento) y la función `completar_tarea` (al marcar como hecha).

**Otras reglas automáticas:** las rutinas y los cuidados de las plantas funcionan igual que los tratamientos (`sincronizar_tarea_de_la_rutina`, `sincronizar_tarea_del_cuidado`). Toda tarea hecha pasa por `cerrar_tarea`, que apunta la fecha en su tratamiento, cuidado, rutina o vencimiento. Si tienen `turnos`, al completarlas `completar_tarea` pasa el turno a la persona que va después de quien la ha hecho (por orden de llegada al hogar, dando la vuelta); hacer la de otra persona cuenta como tu turno. Si la rutina tiene `participantes`, solo rotan esas personas; si la hace alguien que no participa, el turno sigue como si la hubiera hecho la persona a la que le tocaba. El disparador `comprobar_participantes` impide meter a gente de otro hogar. Los vencimientos con aviso crean una tarea `aviso_dias` antes de `fecha_renovacion` (`sincronizar_tarea_del_vencimiento`); al completarla, `fecha_renovacion` salta a la siguiente renovación futura. Las suscripciones sin aviso no crean tareas: la app calcula sola la próxima renovación.

**Modo viaje:** mientras alguien está de viaje, sus tareas, turnos y avisos pasan a quien se queda en casa, **sin cambiar `responsable_id`** (se calcula, así al volver todo sigue siendo suyo). En la app lo calcula `useNombres` (`encargada`, `notaViaje`, `esMia`) con `src/lib/viajes.ts`; para una tarea cuenta su fecha, o hoy si ya pasó. En el aviso de las 8:00 lo hace `recordatorios_del_dia`: quien está fuera no recibe nada y quien se queda recibe también lo de quien está fuera. Si no queda nadie en casa, todo sigue como siempre (lo tuyo y lo que no es de nadie) y la app avisa «🏠 nadie en casa». Se mira día a día, así que cuenta aunque cada persona se vaya en un viaje distinto: `periodosSinNadie` calcula esos días y la app avisa con antelación (tarjeta del inicio, lista de viajes y formulario).

**Acceso temporal:** quien ayuda **no es miembro del hogar** y no puede leer ninguna tabla. Solo usa cuatro funciones `security definer` que lo comprueban todo con `encargo_vigente` (acceso suyo, dentro de sus fechas y tarea encargada): `aceptar_acceso`, `mis_encargos` (sus tareas pendientes, la ficha de esas mascotas y plantas y lo que ya ha hecho), `completar_encargo` (con nota opcional) y `nota_para_el_hogar`. Completar una tarea pasa por `cerrar_tarea` (interna, sin permisos para nadie), la misma que usa `completar_tarea`: así se reprograman los tratamientos y pasan los turnos igual (si la hace quien ayuda, el turno sigue como si la hubiera hecho a quien le tocaba). El aviso de las 8:00 le llega también con sus encargos. En la app: `#/accesos` (desde Ajustes), `#/encargos` (quien ayuda; si no tiene hogar propio, es lo único que ve), tarjeta «🔑 Quién os ayuda» en el inicio y «🏠 lo cubre Marta» si no queda nadie en casa.

**Salir y quitar:** `salir_del_hogar` (cualquiera; si es la última persona se borra el hogar entero, y la app borra antes sus fotos), `quitar_del_hogar` (solo admin) y `anular_invitaciones` (cualquiera del hogar). Lo que tenía asignado quien se va queda sin responsable (las rutinas con turnos pasan a la siguiente persona) y siempre queda alguien de admin.

**Tareas a mano vs. automáticas:** las tareas creadas a mano se crean, editan, borran y reabren (`reabrir_tarea`) desde la app. Las automáticas (de un tratamiento, una rutina, un cuidado o un vencimiento) solo se cambian editando su origen y no se pueden reabrir, para que la regla automática nunca se rompa. Nadie puede marcar una tarea como hecha sin pasar por `completar_tarea`, ni falsear `creada_por` o `completada_por`.

## Fases

### Fase 1 — MVP (empezamos aquí)
1. Proyecto creado, con login con Google usando Supabase (Google OAuth). El ID y el secreto de Google se configuran en el panel de Supabase, nunca en el código.
2. Crear un hogar e invitar a la pareja con un código o enlace.
3. Ficha de la mascota (nombre, foto, datos básicos).
4. Tratamientos de la mascota que generan tareas automáticamente.
5. Lista de tareas del hogar: crear, asignar responsable, marcar como hecha.
6. Pantalla de inicio **"Próximo"**: lo que vence en los próximos 30 días, ordenado por fecha y con quién se encarga.

### Ampliación (pedida al terminar la Fase 1)
- Navegación con pestañas abajo: **Inicio · Tareas · Casa · Vencimientos**.
- **Vencimientos**: seguros y suscripciones con fecha de renovación, importe y aviso previo. Resumen de gasto (suscripciones al mes, seguros al año).
- **Casa**: solo tareas de casa rutinarias (limpieza, basura, compra…), las **🪴 plantas** (ficha `#/casa/plantas/<id>` y sus cuidados) y una **lista de la compra** compartida.
- **Turnos que rotan** en las rutinas.
- **Lista de la compra en tiempo real**: cada cambio manda un aviso (Realtime Broadcast) por el canal privado `hogar:<id>:compra`; una regla RLS en `realtime.messages` solo deja escuchar el canal del propio hogar. En Supabase, «Allow public access» de Realtime está desactivado (no usamos canales públicos).
- **Elegir quién participa** en los turnos de cada rutina.

### Fase 2
- ✅ **Carga mental «En equipo»** (tarjeta en Inicio y pantalla `#/carga` con meses anteriores). **Nunca compara a personas**: enseña lo pensado y hecho entre todas, «💚 Gracias por acordarte» con lo que pensaron las demás, y tus propios números, que solo ves tú. Sin porcentajes, sin barras por persona y sin frases que juzguen (la primera versión con marcador resultaba pasivo-agresiva).
- ✅ **Ajustes** (botón ⚙️ arriba a la derecha del inicio, `#/ajustes`): tu nombre, avisos, nombre del hogar, quién está en el hogar (invitar, quitar, salir), instalar la app y cerrar sesión (solo en ese dispositivo).
- ✅ **Registro de peso** con una gráfica sencilla (sección «⚖️ Peso» de la ficha de la mascota: último peso, cuánto ha cambiado, gráfica que se puede tocar e historial).
- ~~Recordatorios~~ ✅ Hechos con notificaciones push (aviso diario a las 8:00). En iPhone solo funcionan con la app instalada en la pantalla de inicio.
- ⏸️ **Avisos por email** (para quien no instale la app): aplazados por decisión propia. Para mandar emails a otras personas hace falta un **dominio propio** (unos 10-15 € al año) verificado en Resend, que es gratis hasta 100 emails al día y se usa con una petición web, sin librerías. Enviar desde Gmail está descartado: la «contraseña de aplicación» da acceso a todo el correo.

### Fase 3
- Foto de la cartilla veterinaria → la IA extrae vacunas y fechas.
- Añadir tareas escribiendo o dictando en lenguaje natural ("hay que renovar el seguro de la furgo en marzo").
- ✅ **Modo viaje** (cambió de idea: ya no son los requisitos para viajar con la mascota, sino quién está fuera y quién cubre sus tareas). Para una persona o para varias, y para todas las tareas.
- ✅ **Acceso temporal**: desde Ajustes, para las tareas que se elijan (por tipo o una a una). Quien lo recibe entra con Google desde un enlace que caduca, **no es miembro del hogar** (no puede usar `mi_hogar_id`), solo ve esas tareas y la ficha de esas mascotas o plantas, puede marcarlas como hechas y **dejar notas**. Si viaja todo el hogar, la app dice que esa persona cubre sus tareas. No ve las fotos de las mascotas (están en el almacén privado del hogar).
- ✅ **Plantas**: sección «🪴 Plantas» dentro de la pestaña Casa. Cada planta con su ficha y sus cuidados (riego, abono, trasplante…), que crean tareas solas como los tratamientos de la mascota.

## Fuera del alcance por ahora
- Pagos o suscripciones.
- App nativa en tiendas (App Store / Google Play).
- Varios idiomas.
