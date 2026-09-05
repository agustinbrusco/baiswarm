# BAISWARM

Buenos Aires Safety War Room. Message board de BAISH para organizar proyectos y equipos de cara a hackathons; el primero es el AI Incident Response Sprint de Apart y CeSIA (11–13 de septiembre de 2026).

Dos tipos de post: **proyectos** (lo que un equipo puede entregar en tres días; tienen "me sumaría" con perfil y aparecen en Equipos) e **insights** (observaciones, hipótesis, lecturas; informan proyectos, no forman equipo). Votos, comentarios y vínculos tipados entre posts.

## Stack

- React 18 + Vite + Tailwind 4 (frontend estático)
- Supabase (Postgres + realtime) como backend, sin servidor propio
- Sin login: nombre y rol se guardan en el navegador. El acceso "cerrado" es el link no público.

## Puesta en marcha (unos 15 minutos)

1. **Supabase.** Creá un proyecto en supabase.com (plan gratuito). En *SQL Editor* pegá el contenido de `supabase/schema.sql` y ejecutalo. En *Settings → API* copiá la *Project URL* y la *anon public key*.
2. **Variables.** `cp .env.example .env` y completá las dos variables.
3. **Correr local.**
   ```bash
   npm install
   npm run dev
   ```
4. **Probar con dos navegadores** (o dos personas): publicá un post en uno y confirmá que aparece en el otro sin recargar.

## Deploy

**GitHub Pages (recomendado, ya configurado).** Subí el repo, en *Settings → Pages* elegí *Source: GitHub Actions*, y en *Settings → Secrets and variables → Actions → Variables* creá `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`. Cada push a `main` publica en `https://<usuario>.github.io/<repo>/`.

**Netlify o Vercel.** Importá el repo, build command `npm run build`, publish directory `dist`, y cargá las dos variables de entorno. No hace falta `VITE_BASE`.

La anon key es pública por diseño; lo que protege los datos son las policies de la tabla. Hoy son abiertas (cualquiera con el link lee y escribe), lo cual es aceptable para un grupo chico con link privado. Ver "Próximos pasos" para cerrarlo en serio.

## Estructura

```
src/App.jsx        UI completa (feed, equipos, formulario)
src/storage.js     capa de datos: todo lo que habla con Supabase y localStorage
supabase/schema.sql tabla, policies y realtime
```

`storage.js` expone `loadAll`, `savePost`, `mutate`, `deletePost`, `subscribe`. `mutate(id, fn)` relee el post antes de escribir para no pisar cambios ajenos; con jsonb en una sola fila alcanza para decenas de personas, no para cientos concurrentes.

## Próximos pasos posibles

- Login por magic link (Supabase Auth) con whitelist de mails. Requiere configurar un SMTP propio: el de Supabase por defecto manda 2 mails por hora.
- Fecha de cierre de equipos y un estado "cerrado" en los proyectos.
- Votos y comentarios en tablas propias en vez de jsonb, si crece la concurrencia.
- Paleta de BAISH: está todo en el objeto `C` al principio de `App.jsx`.
