// Baja las tablas posts y profiles a backups/<fecha>.json. Con `--restore <archivo>` vuelve a subir los posts (upsert por id).
// Usa la secret key: con RLS la anon key no lee nada sin sesión.
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { adminClient } from "./env.mjs";

const db = adminClient();
const [flag, file] = process.argv.slice(2);
if (flag === "--restore") {
  if (!file) { console.error("Uso: npm run backup -- --restore backups/XXXX.json"); process.exit(1); }
  const dump = JSON.parse(readFileSync(file, "utf8"));
  const posts = Array.isArray(dump) ? dump : dump.posts;
  const { error } = await db.from("posts").upsert(posts);
  if (error) { console.error("No se pudo restaurar:", error.message); process.exit(1); }
  console.log(`Restaurados ${posts.length} posts desde ${file}.`);
} else {
  const { data: posts, error } = await db.from("posts").select("*");
  if (error) { console.error("No se pudo leer:", error.message); process.exit(1); }
  const { data: profiles } = await db.from("profiles").select("*");
  mkdirSync("backups", { recursive: true });
  const out = `backups/baiswarm-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.json`;
  writeFileSync(out, JSON.stringify({ posts, profiles: profiles || [] }, null, 2));
  console.log(`${posts.length} posts y ${(profiles || []).length} perfiles guardados en ${out}.`);
}
process.exit(0);
