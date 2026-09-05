# BAISWARM

Buenos Aires Safety War Room. Message board de BAISH para organizar proyectos y equipos de cara a hackathons; el primero es el AI Incident Response Sprint de Apart y CeSIA (11–13 de septiembre de 2026).

Dos tipos de post: **proyectos** (lo que un equipo puede entregar en tres días; tienen "me sumaría" con perfil y aparecen en Equipos) e **insights** (observaciones, hipótesis, lecturas; informan proyectos, no forman equipo). Votos, comentarios anidados y vínculos tipados entre posts. Los vínculos se ven desde los dos lados y cualquiera puede agregarlos o quitarlos desde un post abierto; el texto lo edita solo su autor.

## Stack

- React 19 + Vite 8 + Tailwind 4 (frontend estático)
- Supabase (Postgres + realtime) como backend, sin servidor propio
- Login con usuario y contraseña (Supabase Auth, sin mails) y código de invitación para registrarse. Solo quien tiene cuenta lee y escribe; cada uno edita y borra lo suyo.

## Puesta en marcha (unos 15 minutos)

1. **Supabase.** Creá un proyecto en supabase.com (plan gratuito). En *Authentication → Sign In / Providers → Email* desactivá *Confirm email*. En *SQL Editor* pegá el contenido de `supabase/schema.sql` y ejecutalo (o, si cargás `SUPABASE_DB_URL` en `.env`, `npm run migrate` lo hace desde la terminal). En *Settings → API keys* copiá la *Project URL*, la *anon key* y una *secret key*.
2. **Variables.** `cp .env.example .env` y completá las tres. La secret key es solo para los scripts de administración de tu máquina.
3. **Código de invitación.** `npm run invite -- --nuevo` lo genera y lo guarda. Compartilo junto con el link.
4. **Correr local.**
   ```bash
   npm install
   npm run dev
   ```
5. **Chequear la instalación:** `npm run check` verifica esquema, RLS, registro con invitación, escritura como usuario y realtime, creando y borrando un usuario temporal.
6. **Probar con dos navegadores** (o dos personas): publicá un post en uno y confirmá que aparece en el otro sin recargar. Automatizado: `E2E_REAL=1 npm run e2e`, solo con la tabla vacía porque escribe y borra posts de prueba.

## Probar sin Supabase

```bash
npm run demo
```

Modo demo: mismos flujos, pero los datos quedan en localStorage y se sincronizan entre pestañas del mismo navegador. El código de invitación es `demo`. Útil para ver la UI o probar cambios sin tocar la base.

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

La anon key es pública por diseño; lo que protege los datos son las policies: sin sesión no se lee nada, y solo el autor edita o borra lo suyo. Votos, interés, comentarios y vínculos pasan por funciones de la base que usan la identidad de la sesión.

## Administración

```bash
npm run invite                              # muestra el código de invitación
npm run invite -- --nuevo                   # genera otro (los ya registrados no se ven afectados)
npm run set-password -- <usuario> <clave>   # cambia una contraseña: no hay recuperación por mail
npm run migrate                             # aplica supabase/schema.sql con psql; necesita SUPABASE_DB_URL
```

`SUPABASE_DB_URL` es la connection string del botón *Connect* del panel, en modo *Session pooler* (puerto 5432), con la contraseña de la base. Si no la recordás, se resetea en *Settings → Database*. La secret key no alcanza para cambiar el esquema: solo da acceso a datos y usuarios.

Los usuarios eligen un nombre de usuario; por dentro Supabase Auth usa `<usuario>@baiswarm.local`, así que no depende de mails ni de SMTP.

## Backup

```bash
npm run backup                                    # guarda la tabla en backups/posts-<fecha>.json
npm run backup -- --restore backups/posts-X.json  # vuelve a subir ese archivo (upsert por id)
```

Usa la secret key de `.env`. Conviene correrlo una vez al día mientras el foro esté activo.

## Estructura

```
src/App.jsx          feed, posts, comentarios, equipos, publicar, reporte
src/Auth.jsx         entrada, registro, perfil y pie de sesión
src/theme.js         paleta y tipografía
src/storage.js       capa de datos: todo lo que habla con Supabase, y el modo demo
supabase/schema.sql  tabla, policies y realtime; se puede correr más de una vez
scripts/backup.mjs   backup y restore de la tabla desde la terminal
scripts/check.mjs    chequeo de esquema, RLS, registro, escritura y realtime
scripts/invite.mjs   código de invitación
scripts/set-password.mjs  cambio de contraseña de un usuario
scripts/migrate.mjs  aplica el esquema con psql
e2e/test.mjs         recorrido automatizado con Playwright
```

`storage.js` expone `auth` y las mutaciones (`vote`, `toggleInterest`, `addComment`, `removeComment`, `addLink`, `removeLink`, `createPost`, `updatePost`, `deletePost`), que llaman a funciones de la base y devuelven el post actualizado. Además de realtime hay un polling cada 60 segundos como red de seguridad.

## Próximos pasos posibles

- Recuperación de contraseña por mail cuando haya SMTP propio (el de Supabase por defecto manda 2 mails por hora).
- Fecha de cierre de equipos y un estado "cerrado" en los proyectos.
- Votos y comentarios en tablas propias en vez de jsonb, si crece la concurrencia.
- Paleta de BAISH: está todo en el objeto `C` al principio de `App.jsx`.
