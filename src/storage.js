// Capa de datos. Todo lo que habla con Supabase vive acá; App.jsx no sabe nada de la base.
// Dos backends con la misma interfaz: Supabase (Auth + RPC) y demo en localStorage (`npm run demo`, VITE_MOCK=1),
// que imita las reglas del servidor: sesión, código de invitación "demo", identidad por id en votos, interés y comentarios.
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const demo = import.meta.env.VITE_MOCK === "1"; // manda sobre .env: `npm run demo` nunca toca la base real
const remoteOk = !demo && Boolean(url && key);
export const configured = remoteOk || demo;
export const supabase = remoteOk ? createClient(url, key) : null;

export const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{1,23}$/; // misma regla que el trigger de registro
export const MIN_PASSWORD = 8;
const EMAIL_DOMAIN = "baiswarm.local"; // el mail de Auth es <usuario>@baiswarm.local; nunca se manda nada
export const norm = (p) => ({ kind: "proyecto", pitch: "", body: "", url: "", links: [], votes: {}, interest: [], comments: [], ...p });
const fail = (e, what) => { throw new Error(`${what}: ${e.message || e}`); };
const cleanUser = (u) => (u || "").trim().toLowerCase();
const USERNAME_HELP = "El usuario tiene que tener de 2 a 24 caracteres: minúsculas, números, punto, guion o guion bajo.";
const PASSWORD_HELP = `La contraseña tiene que tener al menos ${MIN_PASSWORD} caracteres.`;

// Mensajes de Supabase Auth traducidos a algo que se entienda.
const authMessage = (e) => {
  const m = e?.message || "";
  if (/invalid login credentials/i.test(m)) return "Usuario o contraseña incorrectos.";
  if (/already registered|already exists|already been registered/i.test(m)) return "Ese nombre de usuario ya está en uso.";
  if (/password/i.test(m) && /short|least|characters/i.test(m)) return PASSWORD_HELP;
  if (/database error saving new user/i.test(m)) return "No se pudo crear la cuenta. Revisá el código de invitación y el nombre de usuario.";
  if (/rate limit|too many/i.test(m)) return "Demasiados intentos. Esperá un minuto.";
  if (/signups not allowed/i.test(m)) return "El registro está cerrado.";
  return m || "Algo falló.";
};
const validate = ({ username, password }) => {
  if (!USERNAME_RE.test(cleanUser(username))) throw new Error(USERNAME_HELP);
  if ((password || "").length < MIN_PASSWORD) throw new Error(PASSWORD_HELP);
};

// ── Supabase ────────────────────────────────────────────────────────────────
async function remoteMe(session) {
  if (!session?.user) return null;
  const { data } = await supabase.from("profiles").select("username, role").eq("id", session.user.id).maybeSingle();
  const meta = session.user.user_metadata || {};
  return { id: session.user.id, name: data?.username || meta.username || "", role: data?.role ?? meta.role ?? "" };
}
const rpc = async (fn, args, what) => { const { data, error } = await supabase.rpc(fn, args); if (error) fail(error, what); return norm(data); };

const remote = {
  auth: {
    async signUp({ username, password, role, invite }) {
      validate({ username, password });
      const u = cleanUser(username), code = (invite || "").trim();
      const { data: ok, error: e0 } = await supabase.rpc("check_invite", { code });
      if (e0) fail(e0, "No pude verificar la invitación");
      if (!ok) throw new Error("Código de invitación incorrecto.");
      const { data, error } = await supabase.auth.signUp({ email: `${u}@${EMAIL_DOMAIN}`, password, options: { data: { username: u, role: (role || "").trim(), invite: code } } });
      if (error) throw new Error(authMessage(error));
      if (!data.session) throw new Error("La cuenta se creó pero no hay sesión. ¿Está desactivado 'Confirm email' en Supabase?");
      return remoteMe(data.session);
    },
    async signIn({ username, password }) {
      const { data, error } = await supabase.auth.signInWithPassword({ email: `${cleanUser(username)}@${EMAIL_DOMAIN}`, password });
      if (error) throw new Error(authMessage(error));
      return remoteMe(data.session);
    },
    async signOut() { await supabase.auth.signOut(); },
    async current() { const { data } = await supabase.auth.getSession(); return remoteMe(data.session); },
    // Avisa cuando la sesión cambia (otra pestaña, expiración). No se llama a Supabase dentro del callback: puede trabarse.
    onChange(cb) {
      const { data } = supabase.auth.onAuthStateChange((event, session) => {
        if (event === "SIGNED_OUT") cb(null);
        else if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") setTimeout(() => remoteMe(session).then(cb), 0);
      });
      return () => data.subscription.unsubscribe();
    },
    async updateRole(role) {
      const { data: s } = await supabase.auth.getSession();
      if (!s.session) throw new Error("Hay que iniciar sesión");
      const { error } = await supabase.from("profiles").update({ role: (role || "").trim() }).eq("id", s.session.user.id);
      if (error) fail(error, "No se pudo guardar el perfil");
      return remoteMe(s.session);
    },
  },
  async loadAll() {
    const { data, error } = await supabase.from("posts").select("*");
    if (error) fail(error, "No pude leer el foro");
    return data.map(norm);
  },
  async createPost(p) {
    const { data, error } = await supabase.from("posts").insert(p).select().single();
    if (error) fail(error, "No se pudo publicar");
    return norm(data);
  },
  // La policy solo deja actualizar al autor: si no devuelve fila, no era suyo.
  async updatePost(id, fields) {
    const { data, error } = await supabase.from("posts").update(fields).eq("id", id).select().maybeSingle();
    if (error) fail(error, "No se pudo guardar");
    if (!data) throw new Error("Solo el autor puede editar este post");
    return norm(data);
  },
  async deletePost(id) {
    const { data, error } = await supabase.from("posts").delete().eq("id", id).select("id");
    if (error) fail(error, "No se pudo eliminar");
    if (!data?.length) throw new Error("Solo el autor puede eliminar este post");
  },
  vote: (id, dir) => rpc("post_vote", { p_id: id, p_dir: dir }, "No se pudo votar"),
  toggleInterest: (id, role) => rpc("post_toggle_interest", { p_id: id, p_role: role }, "No se pudo actualizar el interés"),
  addComment: (id, text, parent = null) => rpc("post_add_comment", { p_id: id, p_text: text, p_parent: parent }, "No se pudo comentar"),
  removeComment: (id, cid) => rpc("post_remove_comment", { p_id: id, p_cid: cid }, "No se pudo borrar el comentario"),
  voteComment: (id, cid) => rpc("post_vote_comment", { p_id: id, p_cid: cid }, "No se pudo votar el comentario"),
  addLink: (id, l) => rpc("post_add_link", { p_id: id, p_to: l.to, p_type: l.type }, "No se pudo vincular"),
  removeLink: (id, l) => rpc("post_remove_link", { p_id: id, p_to: l.to, p_type: l.type }, "No se pudo quitar el vínculo"),
  // Avisa ante cualquier cambio en la tabla. Requiere sesión: realtime respeta RLS. Devuelve la función para desuscribirse.
  subscribe(onChange) {
    const ch = supabase.channel("posts-changes").on("postgres_changes", { event: "*", schema: "public", table: "posts" }, onChange).subscribe();
    return () => supabase.removeChannel(ch);
  },
};

// ── Demo: localStorage ──────────────────────────────────────────────────────
const K = { posts: "baiswarm:demo", users: "baiswarm:demo-users", session: "baiswarm:demo-session" };
const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const write = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const posts = () => read(K.posts, []);
const savePosts = (xs) => write(K.posts, xs);
const users = () => read(K.users, {});
const meFrom = (id) => { const u = Object.values(users()).find((x) => x.id === id); return u ? { id: u.id, name: u.username, role: u.role } : null; };
const need = () => { const me = meFrom(read(K.session, null)); if (!me) throw new Error("Hay que iniciar sesión"); return me; };
const edit = (id, fn) => { const xs = posts(); const i = xs.findIndex((p) => p.id === id); if (i < 0) throw new Error("El post ya no existe"); xs[i] = fn(norm(xs[i])); savePosts(xs); return xs[i]; };
const localId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
let listeners = [];
const emit = (me) => listeners.forEach((cb) => cb(me));

const local = {
  auth: {
    async signUp({ username, password, role, invite }) {
      validate({ username, password });
      if ((invite || "").trim() !== "demo") throw new Error("Código de invitación incorrecto.");
      const all = users(), u = cleanUser(username);
      if (all[u]) throw new Error("Ese nombre de usuario ya está en uso.");
      all[u] = { id: `demo-${localId()}`, username: u, password, role: (role || "").trim() };
      write(K.users, all); write(K.session, all[u].id);
      const me = meFrom(all[u].id); emit(me); return me;
    },
    async signIn({ username, password }) {
      const u = users()[cleanUser(username)];
      if (!u || u.password !== password) throw new Error("Usuario o contraseña incorrectos.");
      write(K.session, u.id);
      const me = meFrom(u.id); emit(me); return me;
    },
    async signOut() { localStorage.removeItem(K.session); emit(null); },
    async current() { return meFrom(read(K.session, null)); },
    onChange(cb) { listeners.push(cb); return () => { listeners = listeners.filter((x) => x !== cb); }; },
    async updateRole(role) { const me = need(); const all = users(); all[me.name].role = (role || "").trim(); write(K.users, all); return meFrom(me.id); },
  },
  async loadAll() { need(); return posts().map(norm); },
  async createPost(p) { const me = need(); const row = norm({ ...p, author: me.name, author_id: me.id }); savePosts([...posts(), row]); return row; },
  async updatePost(id, fields) { const me = need(); return edit(id, (p) => { if (p.author_id !== me.id) throw new Error("Solo el autor puede editar este post"); return { ...p, ...fields }; }); },
  async deletePost(id) {
    const me = need(); const p = posts().find((x) => x.id === id);
    if (p && p.author_id !== me.id) throw new Error("Solo el autor puede eliminar este post");
    savePosts(posts().filter((x) => x.id !== id));
  },
  async vote(id, dir) { const me = need(); return edit(id, (p) => { const v = { ...p.votes }; v[me.id] === dir ? delete v[me.id] : (v[me.id] = dir); return { ...p, votes: v }; }); },
  async toggleInterest(id, role) {
    const me = need();
    return edit(id, (p) => (p.interest.some((x) => x.id === me.id)
      ? { ...p, interest: p.interest.filter((x) => x.id !== me.id) }
      : { ...p, interest: [...p.interest, { id: me.id, name: me.name, role: (role || "").trim() }] }));
  },
  async addComment(id, text, parent = null) {
    const me = need(); if (!(text || "").trim()) throw new Error("Comentario vacío");
    return edit(id, (p) => ({ ...p, comments: [...p.comments, { id: localId(), uid: me.id, who: me.name, text: text.trim(), t: Date.now(), parent }] }));
  },
  async removeComment(id, cid) {
    const me = need();
    return edit(id, (p) => {
      const own = (c) => c.id === cid && c.uid === me.id;
      if (!p.comments.some(own)) throw new Error("Solo podés borrar tus comentarios");
      return p.comments.some((c) => c.parent === cid)
        ? { ...p, comments: p.comments.map((c) => (own(c) ? { ...c, text: "", deleted: true } : c)) }
        : { ...p, comments: p.comments.filter((c) => !own(c)) };
    });
  },
  // voto positivo en comentario, toggle; misma forma que post_vote_comment en SQL
  async voteComment(id, cid) {
    const me = need();
    return edit(id, (p) => {
      if (!p.comments.some((c) => c.id === cid && !c.deleted)) throw new Error("El comentario ya no existe");
      return { ...p, comments: p.comments.map((c) => { if (c.id !== cid) return c; const v = { ...(c.votes || {}) }; v[me.id] ? delete v[me.id] : (v[me.id] = 1); return { ...c, votes: v }; }) };
    });
  },
  async addLink(id, l) { need(); return edit(id, (p) => (p.links.some((x) => x.to === l.to && x.type === l.type) ? p : { ...p, links: [...p.links, l] })); },
  async removeLink(id, l) { need(); return edit(id, (p) => ({ ...p, links: p.links.filter((x) => !(x.to === l.to && x.type === l.type)) })); },
  // el evento "storage" solo llega a las otras pestañas, igual que realtime a los otros clientes
  subscribe(onChange) { const h = (e) => e.key === K.posts && onChange(); window.addEventListener("storage", h); return () => window.removeEventListener("storage", h); },
};

const db = demo ? local : remote;
export const auth = db.auth;
export const loadAll = () => db.loadAll();
export const createPost = (p) => db.createPost(p);
export const updatePost = (id, fields) => db.updatePost(id, fields);
export const deletePost = (id) => db.deletePost(id);
export const vote = (id, dir) => db.vote(id, dir);
export const toggleInterest = (id, role) => db.toggleInterest(id, role);
export const addComment = (id, text, parent) => db.addComment(id, text, parent);
export const removeComment = (id, cid) => db.removeComment(id, cid);
export const voteComment = (id, cid) => db.voteComment(id, cid);
export const addLink = (id, l) => db.addLink(id, l);
export const removeLink = (id, l) => db.removeLink(id, l);
export const subscribe = (onChange) => db.subscribe(onChange);
