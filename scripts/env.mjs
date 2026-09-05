// Lee las variables de .env (si existe) y del entorno. Compartido por los scripts de Node.
// VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY son obligatorias; SUPABASE_SECRET_KEY solo para tareas de administración.
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

export function loadEnv() {
  const fromFile = existsSync(".env")
    ? Object.fromEntries(readFileSync(".env", "utf8").split("\n")
        .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
        .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }))
    : {};
  const env = { ...fromFile, ...process.env };
  const url = env.VITE_SUPABASE_URL, key = env.VITE_SUPABASE_ANON_KEY, secret = env.SUPABASE_SECRET_KEY, dbUrl = env.SUPABASE_DB_URL;
  if (!url || !key) { console.error("Faltan VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY (en .env o en el entorno)."); process.exit(1); }
  return { url, key, secret, dbUrl };
}

// Cliente con la secret key: saltea RLS y puede administrar usuarios. Solo para scripts locales, nunca en el navegador.
export function adminClient() {
  const { url, secret } = loadEnv();
  if (!secret) { console.error("Falta SUPABASE_SECRET_KEY en .env (Settings → API keys → Secret keys en Supabase)."); process.exit(1); }
  return createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
}

export const EMAIL_DOMAIN = "baiswarm.local";
export const emailFor = (username) => `${username.trim().toLowerCase()}@${EMAIL_DOMAIN}`;
