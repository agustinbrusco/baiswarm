// Lee VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY de .env (si existe) y del entorno. Compartido por los scripts de Node.
import { readFileSync, existsSync } from "node:fs";

export function loadEnv() {
  const fromFile = existsSync(".env")
    ? Object.fromEntries(readFileSync(".env", "utf8").split("\n")
        .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
        .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }))
    : {};
  const env = { ...fromFile, ...process.env };
  const url = env.VITE_SUPABASE_URL, key = env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) { console.error("Faltan VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY (en .env o en el entorno)."); process.exit(1); }
  return { url, key };
}
