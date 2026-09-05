// Capa de datos. Todo lo que habla con Supabase vive acá; App.jsx no sabe nada de la base.
// Sin Supabase configurado y con VITE_MOCK=1 (`npm run demo`) usa un backend local en localStorage
// que sincroniza entre pestañas del mismo navegador. Sirve para probar la UI sin base.
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
const remoteOk = Boolean(url && key);
export const demo = !remoteOk && import.meta.env.VITE_MOCK === "1";
export const configured = remoteOk || demo;
export const supabase = remoteOk ? createClient(url, key) : null;

export const norm = (p) => ({ kind: "proyecto", pitch: "", body: "", url: "", links: [], votes: {}, interest: [], comments: [], ...p });
const fail = (e, what) => { throw new Error(`${what}: ${e.message || e}`); };

// ── Supabase ────────────────────────────────────────────────────────────────
const remote = {
  async loadAll() {
    const { data, error } = await supabase.from("posts").select("*");
    if (error) fail(error, "No pude leer el foro");
    return data.map(norm);
  },
  async getPost(id) {
    const { data, error } = await supabase.from("posts").select("*").eq("id", id).maybeSingle();
    if (error) fail(error, "No pude leer el post");
    return data && norm(data);
  },
  async savePost(p) {
    const { error } = await supabase.from("posts").upsert(p);
    if (error) fail(error, "No se pudo guardar");
    return p;
  },
  async deletePost(id) {
    const { error } = await supabase.from("posts").delete().eq("id", id);
    if (error) fail(error, "No se pudo eliminar");
  },
  // Avisa ante cualquier cambio en la tabla. Devuelve la función para desuscribirse.
  subscribe(onChange) {
    const ch = supabase.channel("posts-changes").on("postgres_changes", { event: "*", schema: "public", table: "posts" }, onChange).subscribe();
    return () => supabase.removeChannel(ch);
  },
};

// ── Demo: localStorage ──────────────────────────────────────────────────────
const MOCK = "baiswarm:demo";
const read = () => { try { return JSON.parse(localStorage.getItem(MOCK)) || []; } catch { return []; } };
const write = (xs) => localStorage.setItem(MOCK, JSON.stringify(xs));
const local = {
  async loadAll() { return read().map(norm); },
  async getPost(id) { const p = read().find((x) => x.id === id); return p && norm(p); },
  async savePost(p) { write([...read().filter((x) => x.id !== p.id), p]); return p; },
  async deletePost(id) { write(read().filter((x) => x.id !== id)); },
  // el evento "storage" solo llega a las otras pestañas, igual que realtime a los otros clientes
  subscribe(onChange) { const h = (e) => e.key === MOCK && onChange(); window.addEventListener("storage", h); return () => window.removeEventListener("storage", h); },
};

const db = demo ? local : remote;
export const loadAll = () => db.loadAll();
export const savePost = (p) => db.savePost(p);
export const deletePost = (id) => db.deletePost(id);
export const subscribe = (onChange) => db.subscribe(onChange);

// Lee la versión más reciente, aplica el cambio y guarda: evita pisar cambios ajenos entre lectura y escritura.
export async function mutate(id, fn) {
  const p = await db.getPost(id);
  if (!p) throw new Error("El post ya no existe");
  return db.savePost(fn(p));
}

// Perfil local (nombre y perfil). Sin login: queda en el navegador.
const PROFILE = "baiswarm:profile";
export const loadProfile = () => { try { return JSON.parse(localStorage.getItem(PROFILE)); } catch { return null; } };
export const saveProfile = (p) => localStorage.setItem(PROFILE, JSON.stringify(p));
export const clearProfile = () => localStorage.removeItem(PROFILE);
