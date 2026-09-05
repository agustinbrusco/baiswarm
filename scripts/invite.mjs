// Código de invitación para registrarse.
// Uso: npm run invite                 muestra el actual
//      npm run invite -- --nuevo      genera uno al azar y lo guarda
//      npm run invite -- <codigo>     guarda ese
import { adminClient } from "./env.mjs";

const db = adminClient();
const arg = process.argv[2];
const random = () => { const abc = "abcdefghjkmnpqrstuvwxyz23456789"; let s = ""; for (let i = 0; i < 10; i++) s += abc[Math.floor(Math.random() * abc.length)]; return `baish-${s}`; };

if (arg) {
  const code = arg === "--nuevo" ? random() : arg.trim();
  if (code.length < 6) { console.error("Muy corto: al menos 6 caracteres."); process.exit(1); }
  const { error } = await db.from("settings").upsert({ key: "invite", value: code });
  if (error) { console.error("No se pudo guardar:", error.message, "\n¿Corriste supabase/schema.sql?"); process.exit(1); }
  console.log("Código de invitación:", code);
} else {
  const { data, error } = await db.from("settings").select("value").eq("key", "invite").maybeSingle();
  if (error) { console.error("No se pudo leer:", error.message, "\n¿Corriste supabase/schema.sql?"); process.exit(1); }
  if (!data || data.value === "CAMBIAME") console.log("Sin configurar. Corré: npm run invite -- --nuevo");
  else console.log("Código de invitación:", data.value);
}
process.exit(0);
