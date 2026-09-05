// Chequeo de la instalación: esquema v2, RLS, registro con invitación, escritura como usuario y realtime.
// Uso: npm run check. Con SUPABASE_SECRET_KEY en .env hace la prueba completa creando y borrando un usuario temporal.
import { createClient } from "@supabase/supabase-js";
import { loadEnv, emailFor } from "./env.mjs";

const { url, key, secret } = loadEnv();
const anon = createClient(url, key, { auth: { persistSession: false } });
let fails = 0;
const ok = (s) => console.log("ok:", s);
const bad = (s) => { fails++; console.log("FALLA:", s); };

// 1. esquema v2 instalado
{
  const { error } = await anon.rpc("check_invite", { code: "x" });
  if (error) bad(`check_invite: ${error.message}. ¿Corriste supabase/schema.sql (v2, con login)?`);
  else ok("esquema v2: la función check_invite existe");
}
// 2. la anon key sin sesión no lee posts
{
  const { data, error } = await anon.from("posts").select("id");
  if (error) bad(`leer posts sin sesión: ${error.message}`);
  else if (data.length) bad(`sin sesión se leen ${data.length} posts: RLS abierta`);
  else ok("RLS: sin sesión no se lee ningún post");
}
if (!secret) {
  console.log("info: sin SUPABASE_SECRET_KEY no puedo probar registro, escritura ni realtime como usuario.");
} else {
  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: inv } = await admin.from("settings").select("value").eq("key", "invite").maybeSingle();
  const invite = inv?.value;
  if (!invite || invite === "CAMBIAME") bad("código de invitación sin configurar: npm run invite -- --nuevo");
  else ok("código de invitación configurado");
  const { count } = await admin.from("posts").select("id", { count: "exact", head: true });
  const { count: users } = await admin.from("profiles").select("id", { count: "exact", head: true });
  ok(`hay ${count ?? 0} posts y ${users ?? 0} perfiles`);

  if (invite && invite !== "CAMBIAME") {
    // 3. registro con invitación y escritura como ese usuario
    const username = `check-${Date.now().toString(36)}`, password = "clave-de-prueba-123";
    const user = createClient(url, key, { auth: { persistSession: false } });
    const { data: su, error: e1 } = await user.auth.signUp({ email: emailFor(username), password, options: { data: { username, role: "check", invite } } });
    if (e1 || !su.session) bad(`registro: ${e1?.message || "sin sesión (¿'Confirm email' desactivado?)"}`);
    else {
      ok("registro: usuario temporal creado con sesión inmediata");
      const { data: prof } = await user.from("profiles").select("username").eq("id", su.user.id).maybeSingle();
      prof?.username === username ? ok("registro: el trigger creó el perfil") : bad("registro: no se creó el perfil");
      const id = `check-${Date.now().toString(36)}`;
      const { data: post, error: e2 } = await user.from("posts").insert({ id, kind: "insight", title: "prueba", body: "", author: "x", t: Date.now() }).select().single();
      if (e2) bad(`publicar: ${e2.message}`);
      else {
        post.author === username && post.author_id === su.user.id ? ok("publicar: autor fijado por la base") : bad(`publicar: autor ${post.author} / ${post.author_id}`);
        const { data: v, error: e3 } = await user.rpc("post_vote", { p_id: id, p_dir: 1 });
        e3 ? bad(`votar: ${e3.message}`) : (v.votes[su.user.id] === 1 ? ok("votar: RPC con identidad del usuario") : bad("votar: el voto no quedó"));
        const { data: c, error: e4 } = await user.rpc("post_add_comment", { p_id: id, p_text: "hola", p_parent: null });
        e4 ? bad(`comentar: ${e4.message}`) : (c.comments.length === 1 ? ok("comentar: RPC") : bad("comentar: no quedó"));
        // realtime con sesión
        const status = await new Promise((res) => {
          const ch = user.channel("check").on("postgres_changes", { event: "*", schema: "public", table: "posts" }, () => {}).subscribe((s, err) => { if (s !== "SUBSCRIBING" && s !== "CONNECTING") res(err ? `${s}: ${err.message}` : s); });
          setTimeout(() => res("TIMEOUT"), 10000);
        });
        status === "SUBSCRIBED" ? ok("realtime: canal suscripto con sesión") : bad(`realtime: ${status}`);
        const { data: del, error: e5 } = await user.from("posts").delete().eq("id", id).select("id");
        e5 || !del?.length ? bad(`borrar propio: ${e5?.message || "sin filas"}`) : ok("borrar: el autor puede");
      }
      await user.auth.signOut();
    }
    // 4. registro con código incorrecto tiene que fallar
    const { data: bad1, error: e6 } = await anon.auth.signUp({ email: emailFor(`${username}-2`), password, options: { data: { username: `${username}-2`, invite: "incorrecto" } } });
    if (e6) ok("registro con código incorrecto: rechazado");
    else { bad("registro con código incorrecto: aceptado"); if (bad1?.user) await admin.auth.admin.deleteUser(bad1.user.id); }
    // limpieza
    if (su?.user) { const { error: e7 } = await admin.auth.admin.deleteUser(su.user.id); e7 ? bad(`limpieza: ${e7.message}`) : ok("limpieza: usuario temporal borrado"); }
  }
}
console.log(fails ? `\n${fails} ${fails === 1 ? "falla" : "fallas"}` : "\nTodo en orden.");
process.exit(fails ? 1 : 0);
