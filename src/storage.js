// Capa de datos. Todo lo que habla con Supabase vive acá; App.jsx no sabe nada de la base.
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const configured = Boolean(url && key);
export const supabase = configured ? createClient(url, key) : null;

export const norm = (p) => ({ kind: "proyecto", pitch: "", body: "", url: "", links: [], votes: {}, interest: [], comments: [], ...p });

const fail = (e, what) => { throw new Error(`${what}: ${e.message || e}`); };

export async function loadAll() {
  const { data, error } = await supabase.from("posts").select("*");
  if (error) fail(error, "No pude leer el foro");
  return data.map(norm);
}

export async function savePost(p) {
  const { error } = await supabase.from("posts").upsert(p);
  if (error) fail(error, "No se pudo guardar");
  return p;
}

// Lee la versión más reciente, aplica el cambio y guarda: evita pisar cambios ajenos entre lectura y escritura.
export async function mutate(id, fn) {
  const { data, error } = await supabase.from("posts").select("*").eq("id", id).maybeSingle();
  if (error) fail(error, "No pude leer el post");
  if (!data) throw new Error("El post ya no existe");
  return savePost(fn(norm(data)));
}

export async function deletePost(id) {
  const { error } = await supabase.from("posts").delete().eq("id", id);
  if (error) fail(error, "No se pudo eliminar");
}

// Avisa ante cualquier cambio en la tabla. Devuelve la función para desuscribirse.
export function subscribe(onChange) {
  const ch = supabase
    .channel("posts-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "posts" }, onChange)
    .subscribe();
  return () => supabase.removeChannel(ch);
}

// Perfil local (nombre y rol). Sin login: queda en el navegador.
const PROFILE = "baiswarm:profile";
export const loadProfile = () => { try { return JSON.parse(localStorage.getItem(PROFILE)); } catch { return null; } };
export const saveProfile = (p) => localStorage.setItem(PROFILE, JSON.stringify(p));
