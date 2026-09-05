// Chequeo de la conexión con Supabase: variables, tabla posts, permisos de lectura y escritura con la anon key, y realtime.
// Uso: npm run check
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./env.mjs";

const { url, key } = loadEnv();
const db = createClient(url, key);
let fails = 0;
const ok = (s) => console.log("ok:", s);
const bad = (s) => { fails++; console.log("FALLA:", s); };

const { count, error: e1 } = await db.from("posts").select("id", { count: "exact", head: true });
if (e1) bad(`leer posts: ${e1.message}${e1.code ? ` (${e1.code})` : ""}. ¿Corriste supabase/schema.sql?`);
else ok(`lectura: la tabla posts tiene ${count} ${count === 1 ? "post" : "posts"}`);

const probe = { id: `check-${Date.now().toString(36)}`, kind: "insight", title: "prueba de conexión", body: "", author: "npm run check", t: Date.now() };
const { error: e2 } = await db.from("posts").insert(probe);
if (e2) bad(`insertar: ${e2.message}. Revisá las policies de la tabla.`);
else {
  ok("escritura: insert");
  const { error: e3 } = await db.from("posts").update({ body: "editado" }).eq("id", probe.id);
  e3 ? bad(`actualizar: ${e3.message}`) : ok("escritura: update");
  const { error: e4 } = await db.from("posts").delete().eq("id", probe.id);
  e4 ? bad(`borrar: ${e4.message}. Quedó una fila de prueba con id ${probe.id}`) : ok("escritura: delete");
}

const status = await new Promise((res) => {
  const ch = db.channel("check").on("postgres_changes", { event: "*", schema: "public", table: "posts" }, () => {}).subscribe((s, err) => { if (s !== "SUBSCRIBING" && s !== "CONNECTING") res(err ? `${s}: ${err.message}` : s); });
  setTimeout(() => res("TIMEOUT"), 10000);
});
status === "SUBSCRIBED" ? ok("realtime: canal suscripto") : bad(`realtime: ${status}. ¿La tabla está en la publicación supabase_realtime?`);

console.log(fails ? `\n${fails} ${fails === 1 ? "falla" : "fallas"}` : "\nTodo en orden.");
process.exit(fails ? 1 : 0);
