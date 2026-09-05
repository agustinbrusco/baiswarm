// Aplica supabase/schema.sql (o el archivo que pases) contra la base, con psql.
// Uso: npm run migrate            → supabase/schema.sql
//      npm run migrate -- otro.sql
// Necesita SUPABASE_DB_URL en .env: la connection string del botón "Connect" del panel de Supabase.
// Conviene la de "Session pooler" (puerto 5432, anda por IPv4); la conexión directa (db.<ref>.supabase.co) es solo IPv6 en el plan Free.
// La contraseña puede tener cualquier carácter: se separa a mano y va por variable de entorno, no en la línea de comandos.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { loadEnv } from "./env.mjs";

const { dbUrl } = loadEnv();
if (!dbUrl) { console.error("Falta SUPABASE_DB_URL en .env (Connect → Session pooler, con la contraseña)."); process.exit(1); }
// postgresql://usuario:contraseña@host:puerto/base  — la contraseña puede contener '@' o ':', así que se corta por el último '@'
const m = dbUrl.match(/^postgres(?:ql)?:\/\/(.*)@([^@/]+?)(?::(\d+))?\/([^?]+)/);
if (!m) { console.error("No entiendo SUPABASE_DB_URL. Formato: postgresql://usuario:contraseña@host:5432/postgres"); process.exit(1); }
const [, cred, host, port = "5432", database] = m;
const sep = cred.indexOf(":");
const user = sep < 0 ? cred : cred.slice(0, sep);
const password = sep < 0 ? "" : decodeURIComponent(cred.slice(sep + 1)).replace(/^\[YOUR-PASSWORD\]$/, "");
if (!password) { console.error("La connection string no tiene la contraseña: reemplazá [YOUR-PASSWORD] por la contraseña de la base."); process.exit(1); }

const file = process.argv[2] || "supabase/schema.sql";
if (!existsSync(file)) { console.error(`No existe ${file}.`); process.exit(1); }
if (spawnSync("psql", ["--version"], { stdio: "ignore" }).status !== 0) { console.error("Falta psql (paquete postgresql-client)."); process.exit(1); }

console.log(`Aplicando ${file} en ${host}:${port}/${database} como ${user}…`);
const env = { ...process.env, PGHOST: host, PGPORT: port, PGUSER: user, PGPASSWORD: password, PGDATABASE: database, PGSSLMODE: "require", PGCONNECT_TIMEOUT: "15" };
const r = spawnSync("psql", ["-v", "ON_ERROR_STOP=1", "-q", "-f", file], { stdio: "inherit", env });
if (r.status !== 0) {
  console.error(`\npsql terminó con código ${r.status}. Lo que falló no quedó aplicado desde el error en adelante.`);
  if (host.startsWith("db.")) console.error("Pista: el host db.<ref>.supabase.co es solo IPv6 en el plan Free. Probá la connection string de 'Session pooler'.");
  process.exit(r.status || 1);
}
console.log(`Aplicado ${file}.`);
