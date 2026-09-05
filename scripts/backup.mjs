// Baja la tabla posts a backups/posts-<fecha>.json.
// Con `--restore <archivo>` la vuelve a subir (upsert por id; no borra lo que haya de más).
// Lee VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY de .env o del entorno.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./env.mjs";

const { url, key } = loadEnv();
const db = createClient(url, key);

const [flag, file] = process.argv.slice(2);
if (flag === "--restore") {
  if (!file) { console.error("Uso: npm run backup -- --restore backups/posts-XXXX.json"); process.exit(1); }
  const posts = JSON.parse(readFileSync(file, "utf8"));
  const { error } = await db.from("posts").upsert(posts);
  if (error) { console.error("No se pudo restaurar:", error.message); process.exit(1); }
  console.log(`Restaurados ${posts.length} posts desde ${file}.`);
} else {
  const { data, error } = await db.from("posts").select("*");
  if (error) { console.error("No se pudo leer:", error.message); process.exit(1); }
  mkdirSync("backups", { recursive: true });
  const out = `backups/posts-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.json`;
  writeFileSync(out, JSON.stringify(data, null, 2));
  console.log(`${data.length} posts guardados en ${out}.`);
}
