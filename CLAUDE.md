# Contexto para Claude Code

## Qué es esto
BAISWARM: foro liviano de BAISH (Buenos Aires AI Safety Hub) para proponer proyectos, aportar insights, votar y formar equipos antes de un hackathon. Primer uso: AI Incident Response Sprint de Apart Research y CeSIA, 11–13 sep 2026, sobre el incidente OpenAI / Hugging Face de julio 2026.

## Estado
Prototipo funcional. Repo público en GitHub (agustinbrusco/baiswarm) con deploy a Pages por Actions y variables de Supabase cargadas. Supabase real probado el 2026-09-05: lectura, escritura, realtime y recorrido e2e entre dos navegadores. `npm run check` diagnostica la conexión.

Escala objetivo de esta versión: menos de 20 usuarios en una semana, no más de 5 en simultáneo. No optimizar para más que eso.

## Convenciones
- UI en español rioplatense (vos). Textos cortos, sin mayúsculas decorativas, sin exclamaciones.
- UI en pocos archivos: `src/App.jsx` (feed, posts, comentarios, equipos, publicar, reporte), `src/Auth.jsx` (entrada, registro, perfil, pie de sesión), `src/theme.js` (paleta y tipografía). Separar más solo si `App.jsx` vuelve a pasar de ~600 líneas.
- Tailwind solo para layout y espaciado; colores y tipografías van por inline style desde `src/theme.js` (`C`, `SERIF`, `SANS`, `FIELD`, `BORDER`), para poder cambiar la paleta en un lugar.
- CSS propio en `index.css` siempre dentro de `@layer base`: lo que queda fuera de capas le gana a las utilidades de Tailwind 4 y rompe `px-*`, `py-*`, etc.
- Controles táctiles de al menos 24 px de alto; los textos-botón chicos llevan `py-1` aunque parezca redundante.
- Nada de Supabase fuera de `storage.js` (y `scripts/backup.mjs`, que corre en Node). `storage.js` tiene dos backends con la misma interfaz: Supabase y un modo demo en localStorage (`npm run demo`, variable `VITE_MOCK=1`) que sincroniza entre pestañas con el evento `storage`. Sirve para probar la UI sin base.
- Estilo visual: cuerpo en serif, controles en sans, columna de votos a la izquierda (referencia: LessWrong). Azul para proyectos, ocre para insights.

## Modelo de datos
Tabla `posts`: `kind` ('proyecto' | 'insight'), `title`, `pitch` (solo proyectos), `body`, `url` (solo insights), `track`, `author` (username, lo fija un trigger), `author_id` (uuid de auth.users, lo fija el trigger), `t` (ms epoch).
jsonb: `links` [{to, type}], `votes` {uid: ±1}, `interest` [{id: uid, name, role}], `comments` [{id, uid, who, text, t, parent, deleted?}].

Tabla `profiles` (id = auth.users.id, `username` único, `role` texto libre): la crea el trigger de registro. Tabla `settings` (key, value): privada, guarda el código de invitación; solo la leen funciones security definer.

Comentarios anidados: `parent` es el id del comentario padre o null. Al borrar uno con respuestas se marca `deleted` y se vacía el texto, para no romper el hilo; sin respuestas se elimina. Esa lógica vive en `post_remove_comment` (SQL) y duplicada en el backend demo.

Vínculos permitidos (`REL` en App.jsx): insight→proyecto "informa a", insight→insight "relacionada con", proyecto→insight "se apoya en", proyecto→proyecto "deriva de" / "compite con". Cada tipo tiene una etiqueta inversa (`inv`) para mostrarlo desde el destino; el vínculo se guarda una sola vez, en el post de origen. "Se apoya en N insights" de un proyecto suma ambos sentidos.

Perfil (`role`) es texto libre con sugerencias (`PROFILE_HINTS`, un datalist); no encasillar en opciones fijas. Equipo viable: 3 a 5 personas y al menos dos perfiles distintos, comparando el texto normalizado (trim + minúsculas).

## Auth y permisos (desde 2026-09-05)
- Supabase Auth con usuario y contraseña, sin mails: el mail de Auth es `<usuario>@baiswarm.local` y "Confirm email" está desactivado en el panel. Sin SMTP no hay recuperación de contraseña: `npm run set-password -- usuario clave` la cambia con la secret key.
- Registro solo con código de invitación: lo valida un trigger sobre `auth.users` contra `settings`, y el cliente lo pre-chequea con la RPC `check_invite` para dar un mensaje claro. `npm run invite -- --nuevo` lo genera. El código se comparte por Discord junto con el link.
- RLS: solo usuarios con sesión leen; insertar, editar y borrar un post es del autor (`author_id = auth.uid()`). Votar, sumarse, comentar, borrar comentario propio y vincular pasan por funciones `post_*` security definer que usan `auth.uid()` como identidad: nadie firma por otro. Cada función actualiza en una sola sentencia, así que además es atómico.
- El trigger `posts_stamp` fija `author` y `author_id` al insertar y protege `author`, `author_id`, `t` y `kind` al editar.
- Cliente: `storage.js` expone `auth` (signUp, signIn, signOut, current, onChange, updateRole) y mutaciones que devuelven el post actualizado. Realtime se suscribe después de tener sesión porque respeta RLS.
- El modo demo (`npm run demo`) imita todo esto en localStorage; su código de invitación es `demo`.
- La secret key vive solo en `.env` local para scripts de administración (`invite`, `set-password`, `backup`, `check`). Nunca en una variable `VITE_` ni en el repo. No sirve para DDL: para eso `npm run migrate` usa `SUPABASE_DB_URL` (connection string del Session pooler) con psql; sin ella, el SQL se pega en el SQL Editor.

## Decisiones tomadas
- Realtime de Supabase con debounce de 300 ms que recarga todo, más polling cada 60 s por si realtime no llega.

## Pruebas
`npm run e2e` (primera vez: `npx playwright install chromium`); con `E2E_REAL=1` corre contra el Supabase de `.env` (necesita la secret key para leer la invitación y borrar los usuarios de prueba al final) y verifica realtime entre dos navegadores. El esquema SQL se valida aparte en un Postgres de Supabase local con docker (`supabase/postgres`), simulando registro, RLS y las funciones; el script quedó fuera del repo. Recorrido end to end en `e2e/test.mjs` contra el modo demo, en escritorio 1280px y iPhone 14: entrar, publicar proyecto e insight vinculados, votar, comentar y responder, editar, vincular, borrar, equipos, sincronización entre pestañas, reporte, y chequeo de overflow horizontal y de contenedores recortados. Levanta y apaga su propio servidor; deja capturas en `e2e/shots/` (ignorado por git). Correrlo antes de tocar layout y mirar las capturas: el script no ve padding ni tipografía. Al 2026-09-05 pasaba sin problemas.

Reporte de problemas: botón al pie que abre un issue en GitHub prellenado con usuario, pestaña, versión (`VITE_COMMIT`, el sha del build), pantalla y navegador; o copia el texto para mandarlo por Discord.

## Pendientes sugeridos, en orden
1. Fecha de cierre de equipos, configurable, con estado "cerrado" en proyectos.
2. Paleta de BAISH.
3. Cuando haya SMTP: recuperación de contraseña por mail, y opcionalmente mails reales en vez de `@baiswarm.local`.
