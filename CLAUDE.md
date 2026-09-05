# Contexto para Claude Code

## Qué es esto
BAISWARM: foro liviano de BAISH (Buenos Aires AI Safety Hub) para proponer proyectos, aportar insights, votar y formar equipos antes de un hackathon. Primer uso: AI Incident Response Sprint de Apart Research y CeSIA, 11–13 sep 2026, sobre el incidente OpenAI / Hugging Face de julio 2026.

## Estado
Prototipo funcional migrado desde un artifact de Claude. Repo privado en GitHub (agustinbrusco/baiswarm). Falta correrlo contra un Supabase real por primera vez: si algo rompe, empezar por `src/storage.js` y `supabase/schema.sql`.

Escala objetivo de esta versión: menos de 20 usuarios en una semana, no más de 5 en simultáneo. No optimizar para más que eso.

## Convenciones
- UI en español rioplatense (vos). Textos cortos, sin mayúsculas decorativas, sin exclamaciones.
- Un solo archivo de UI (`src/App.jsx`) mientras sea manejable; separar en componentes cuando pase de ~600 líneas.
- Tailwind solo para layout y espaciado; colores y tipografías van por inline style desde el objeto `C` y las constantes `SERIF` / `SANS`, para poder cambiar la paleta en un lugar.
- Nada de Supabase fuera de `storage.js` (y `scripts/backup.mjs`, que corre en Node).
- Estilo visual: cuerpo en serif, controles en sans, columna de votos a la izquierda (referencia: LessWrong). Azul para proyectos, ocre para insights.

## Modelo de datos (tabla `posts`)
`kind` ('proyecto' | 'insight'), `title`, `pitch` (solo proyectos), `body`, `url` (solo insights), `track`, `author`, `t` (ms epoch).
jsonb: `links` [{to, type}], `votes` {nombre: ±1}, `interest` [{name, role}], `comments` [{who, text, t}].

Vínculos permitidos (`REL` en App.jsx): insight→proyecto "informa a", insight→insight "relacionada con", proyecto→insight "se apoya en", proyecto→proyecto "deriva de" / "compite con". Cada tipo tiene una etiqueta inversa (`inv`) para mostrarlo desde el destino; el vínculo se guarda una sola vez, en el post de origen. "Se apoya en N insights" de un proyecto suma ambos sentidos.

Equipo viable: 3 a 5 personas y al menos dos perfiles distintos (`ROLES`).

## Decisiones tomadas
- Sin login por ahora (SMTP gratuito de Supabase limita a 2 mails/hora). Cerrado = link privado. La anon key va en el bundle y las policies son abiertas: cualquiera con la URL puede escribir. Aceptado para este grupo; `npm run backup` baja la tabla a JSON por si hay que restaurar.
- Identidad = nombre elegido, guardado en localStorage. Los votos son un mapa nombre→voto, así que dos personas con el mismo nombre se pisan; aceptable para el grupo actual.
- Editar y eliminar un post: solo el autor (por nombre). Agregar o quitar vínculos y sumarse a proyectos: cualquiera, desde el post abierto.
- Realtime de Supabase con debounce de 300 ms que recarga todo, más polling cada 60 s por si realtime no llega. Lectura y escritura en dos pasos (`mutate`); a esta escala no hace falta atomicidad.

## Pendientes sugeridos, en orden
1. Correr end to end con Supabase y dos navegadores.
2. Decidir hosting: GitHub Pages exige repo público en el plan Free; alternativa Netlify o Cloudflare Pages si se quiere mantener privado.
3. Fecha de cierre de equipos, configurable, con estado "cerrado" en proyectos.
4. Paleta de BAISH.
5. Auth con magic link + whitelist cuando haya SMTP.
