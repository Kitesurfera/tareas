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
- **PWA:** instalable en móvil (vite-plugin-pwa).
- **Backend:** Supabase (login, base de datos Postgres y almacenamiento de fotos).
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
- Cuando terminemos cada fase, repasa conmigo cómo podría alguien acceder a datos de otro hogar y cómo lo hemos impedido (me interesa aprender hacking ético).

## Modelo de datos (versión inicial)

- **hogares**: id, nombre, creado_en
- **miembros**: id, hogar_id, user_id, nombre_visible, rol (admin / miembro)
- **invitaciones**: id, hogar_id, email o código, estado, caduca_en
- **mascotas**: id, hogar_id, nombre, especie, raza, fecha_nacimiento, foto_ruta (ruta en el almacén privado `mascotas`, carpeta = id del hogar), notas, creada_por
- **tratamientos**: id, hogar_id, mascota_id, tipo (vacuna / desparasitacion_interna / desparasitacion_externa / medicacion / revision), nombre, fecha_ultima, frecuencia_dias, responsable_id (sus tareas lo heredan), notas, creada_por
- **pesos**: id, mascota_id, fecha, kg
- **tareas**: id, hogar_id, titulo, descripcion, fecha_limite, responsable_id, creada_por, completada, completada_por, completada_en, categoria (mascota / casa / coche / papeleo / otros), mascota_id, tratamiento_id, vencimiento_id, rutina_id (estos tres últimos marcan las tareas automáticas)
- **vencimientos**: id, hogar_id, tipo (seguro / suscripcion), nombre, fecha_renovacion, frecuencia_meses (vacío = no se repite), importe, aviso_dias (vacío = sin aviso), responsable_id, notas, revisado_para, creada_por
- **rutinas**: id, hogar_id, nombre, frecuencia_dias, fecha_ultima, responsable_id, turnos (si rota entre la gente del hogar), notas, creada_por
- **lista_compra**: id, hogar_id, nombre, cantidad, comprado, anadido_por, comprado_por, comprado_en (quién añade y quién compra lo pone la base de datos)

**Mismo hogar garantizado:** `responsable_id` apunta a `miembros.id`. Las relaciones entre tablas usan claves compuestas `(id, hogar_id)`, así la base de datos impide enlazar una mascota, un tratamiento o una persona de otro hogar.

**Regla clave que une las dos ideas:** cada tratamiento genera automáticamente una tarea para su próxima fecha (`fecha_ultima + frecuencia_dias`). Al marcar esa tarea como hecha, se actualiza `fecha_ultima` del tratamiento y se crea la siguiente tarea. Lo hace la propia base de datos: el disparador `sincronizar_tarea_del_tratamiento` (al crear o cambiar un tratamiento) y la función `completar_tarea` (al marcar como hecha).

**Otras reglas automáticas:** las rutinas funcionan igual que los tratamientos (`sincronizar_tarea_de_la_rutina`). Si tienen `turnos`, al completarlas `completar_tarea` pasa el turno a la persona que va después de quien la ha hecho (por orden de llegada al hogar, dando la vuelta); hacer la de otra persona cuenta como tu turno. Los vencimientos con aviso crean una tarea `aviso_dias` antes de `fecha_renovacion` (`sincronizar_tarea_del_vencimiento`); al completarla, `fecha_renovacion` salta a la siguiente renovación futura. Las suscripciones sin aviso no crean tareas: la app calcula sola la próxima renovación.

**Tareas a mano vs. automáticas:** las tareas creadas a mano se crean, editan, borran y reabren (`reabrir_tarea`) desde la app. Las automáticas (de un tratamiento, una rutina o un vencimiento) solo se cambian editando su origen y no se pueden reabrir, para que la regla automática nunca se rompa. Nadie puede marcar una tarea como hecha sin pasar por `completar_tarea`, ni falsear `creada_por` o `completada_por`.

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
- **Casa**: solo tareas de casa rutinarias (limpieza, basura, compra…) y una **lista de la compra** compartida.
- **Turnos que rotan** en las rutinas.
- Ideas pendientes: lista de la compra en tiempo real (Supabase Realtime); elegir qué personas participan en los turnos de cada rutina.

### Fase 2
- **Contador de carga mental**: por persona y mes, cuántas cosas ha *creado* (pensar) frente a cuántas ha *completado* (hacer). Tono neutro y amable, nunca de reproche.
- Registro de peso con una gráfica sencilla.
- Recordatorios (por email primero; las notificaciones push en iPhone solo funcionan si la app está instalada en la pantalla de inicio).

### Fase 3
- Foto de la cartilla veterinaria → la IA extrae vacunas y fechas.
- Añadir tareas escribiendo o dictando en lenguaje natural ("hay que renovar el seguro de la furgo en marzo").
- Modo viaje: requisitos de vacunas y papeles para la mascota según el país.
- Compartir el acceso temporalmente con quien cuide a la mascota.

## Fuera del alcance por ahora
- Pagos o suscripciones.
- App nativa en tiendas (App Store / Google Play).
- Varios idiomas.
