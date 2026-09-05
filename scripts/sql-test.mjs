// Valida supabase/schema.sql y corre supabase/schema.test.sql en un Postgres de Supabase local con docker.
// Uso: npm run sql-test   (necesita docker y psql; la imagen pesa 1.7 GB la primera vez)
import { spawnSync } from "node:child_process";

const IMAGE = "supabase/postgres:17.6.1.168-ha-1", NAME = "baiswarm-sql-test", PORT = "54329";
const env = { ...process.env, PGHOST: "127.0.0.1", PGPORT: PORT, PGUSER: "postgres", PGPASSWORD: "postgres", PGDATABASE: "postgres" };
const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { stdio: opts.quiet ? "pipe" : "inherit", env, encoding: "utf8" });
const psql = (file) => run("psql", ["-v", "ON_ERROR_STOP=1", "-q", "-f", file]);

run("docker", ["rm", "-f", NAME], { quiet: true });
const started = run("docker", ["run", "-d", "--rm", "--name", NAME, "-e", "POSTGRES_PASSWORD=postgres", "-p", `${PORT}:5432`, IMAGE], { quiet: true });
if (started.status !== 0) { console.error("No pude levantar el contenedor:", started.stderr); process.exit(2); }
try {
  let ready = false;
  for (let i = 0; i < 90 && !ready; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    ready = run("psql", ["-Atc", "select 1 from pg_roles where rolname = 'authenticated'"], { quiet: true }).stdout?.trim() === "1";
  }
  if (!ready) { console.error("Postgres no levantó en 90 s."); process.exit(2); }
  console.log("aplicando schema.sql…");
  if (psql("supabase/schema.sql").status !== 0) { console.error("schema.sql falló"); process.exit(1); }
  console.log("schema.sql aplicado dos veces (idempotente)…");
  if (psql("supabase/schema.sql").status !== 0) { console.error("schema.sql no es idempotente"); process.exit(1); }
  console.log("corriendo schema.test.sql…");
  if (psql("supabase/schema.test.sql").status !== 0) { console.error("schema.test.sql falló"); process.exit(1); }
  console.log("\nEsquema en orden.");
} finally {
  run("docker", ["rm", "-f", NAME], { quiet: true });
}
