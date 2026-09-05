# BAISWARM

Buenos Aires Safety War Room. Message board de BAISH para organizar proyectos y equipos de cara a hackathons; el primero es el AI Incident Response Sprint de Apart y CeSIA (11–13 de septiembre de 2026).

Dos tipos de post: **proyectos** (lo que un equipo puede entregar en tres días; tienen "me sumaría" con perfil y aparecen en Equipos) e **insights** (observaciones, hipótesis, lecturas; informan proyectos, no forman equipo). Votos, comentarios anidados y vínculos tipados entre posts. Los vínculos se ven desde los dos lados y cualquiera puede agregarlos o quitarlos desde un post abierto; el texto lo edita solo su autor.

## Stack

- React 19 + Vite 8 + Tailwind 4 (frontend estático)
- Supabase (Postgres + realtime) como backend, sin servidor propio
- Sin login: nombre de usuario y perfil (texto libre) se guardan en el navegador. El acceso "cerrado" es el link no público.

## Puesta en marcha (unos 15 minutos)

1. **Supabase.** Creá un proyecto en supabase.com (plan gratuito). En *SQL Editor* pegá el contenido de `supabase/schema.sql` y ejecutalo. En *Settings → API* copiá la *Project URL* y la *anon public key*.
2. **Variables.** `cp .env.example .env` y completá las dos variables.
3. **Correr local.**
   ```bash
   npm install
   npm run dev
   ```
4. **Chequear la conexión:** `npm run check` verifica variables, tabla, permisos de lectura y escritura, y realtime.
5. **Probar con dos navegadores** (o dos personas): publicá un post en uno y confirmá que aparece en el otro sin recargar. Automatizado: `E2E_REAL=1 npm run e2e`, solo con la tabla vacía porque escribe y borra posts de prueba.

## Probar sin Supabase

```bash
npm run demo
```

Modo demo: mismos flujos, pero los datos quedan en localStorage y se sincronizan entre pestañas del mismo navegador. Útil para ver la UI o probar cambios sin tocar la base.

## Pruebas

```bash
npx playwright install chromium   # una sola vez
npm run e2e                       # recorrido completo en escritorio y celular, con capturas en e2e/shots
E2E_REAL=1 npm run e2e            # lo mismo contra el Supabase de .env, con chequeo de realtime entre navegadores
npm run check                     # conexión, permisos y realtime del Supabase configurado
```

## Reportar problemas

Al pie de la página hay "Reportar un problema": abre un issue en GitHub con la descripción y un diagnóstico (usuario, pestaña, versión, pantalla, navegador), o copia el texto para mandarlo por Discord.

## Deploy

**GitHub Pages (recomendado, ya configurado).** Subí el repo, en *Settings → Pages* elegí *Source: GitHub Actions*, y en *Settings → Secrets and variables → Actions → Variables* creá `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`. Cada push a `main` publica en `https://<usuario>.github.io/<repo>/`. Ojo: en el plan Free de GitHub, Pages solo funciona con repos públicos. El código no tiene secretos (la anon key es pública por diseño), así que hacerlo público no expone nada que el sitio no exponga ya.

**Netlify o Vercel.** Importá el repo, build command `npm run build`, publish directory `dist`, y cargá las dos variables de entorno. No hace falta `VITE_BASE`.

La anon key es pública por diseño; lo que protege los datos son las policies de la tabla. Hoy son abiertas (cualquiera con el link lee y escribe), lo cual es aceptable para un grupo chico con link privado. Ver "Próximos pasos" para cerrarlo en serio.

## Backup

```bash
npm run backup                                    # guarda la tabla en backups/posts-<fecha>.json
npm run backup -- --restore backups/posts-X.json  # vuelve a subir ese archivo (upsert por id)
```

Usa las variables de `.env`. Conviene correrlo una vez al día mientras el foro esté activo: con las policies abiertas, cualquiera con la URL puede borrar posts.

## Estructura

```
src/App.jsx          UI completa (feed, equipos, formulario, edición)
src/storage.js       capa de datos: todo lo que habla con Supabase y localStorage
supabase/schema.sql  tabla, policies y realtime; se puede correr más de una vez
scripts/backup.mjs   backup y restore de la tabla desde la terminal
scripts/check.mjs    chequeo de conexión, permisos y realtime
e2e/test.mjs         recorrido automatizado con Playwright
```

`storage.js` expone `loadAll`, `savePost`, `mutate`, `deletePost`, `subscribe`. `mutate(id, fn)` relee el post antes de escribir para no pisar cambios ajenos; con jsonb en una sola fila alcanza para decenas de personas, no para cientos concurrentes. Además de realtime hay un polling cada 60 segundos como red de seguridad.

## Próximos pasos posibles

- Login por magic link (Supabase Auth) con whitelist de mails. Requiere configurar un SMTP propio: el de Supabase por defecto manda 2 mails por hora.
- Fecha de cierre de equipos y un estado "cerrado" en los proyectos.
- Votos y comentarios en tablas propias en vez de jsonb, si crece la concurrencia.
- Paleta de BAISH: está todo en el objeto `C` al principio de `App.jsx`.
