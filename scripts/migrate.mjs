// Aplica supabase/schema.sql (o el archivo que pases) contra la base, con psql.
// Uso: npm run migrate            → supabase/schema.sql
//      npm run migrate -- otro.sql
// Necesita SUPABASE_DB_URL en .env: la connection string del botón "Connect" del panel de Supabase,
// modo "Session pooler" (puerto 5432, anda por IPv4), con la contraseña de la base puesta.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { loadEnv } from "./env.mjs";

const { dbUrl } = loadEnv();
if (!dbUrl) { console.error("Falta SUPABASE_DB_URL en .env (Connect → Session pooler, con la contraseña)."); process.exit(1); }
const file = process.argv[2] || "supabase/schema.sql";
if (!existsSync(file)) { console.error(`No existe ${file}.`); process.exit(1); }
if (spawnSync("psql", ["--version"], { stdio: "ignore" }).status !== 0) { console.error("Falta psql (paquete postgresql-client)."); process.exit(1); }
const r = spawnSync("psql", [dbUrl, "-v", "ON_ERROR_STOP=1", "-q", "-f", file], { stdio: "inherit", env: { ...process.env, PGCONNECT_TIMEOUT: "15" } });
if (r.status !== 0) { console.error(`\npsql terminó con código ${r.status}. Nada de lo que falló quedó aplicado a partir del error.`); process.exit(r.status || 1); }
console.log(`Aplicado ${file}.`);
