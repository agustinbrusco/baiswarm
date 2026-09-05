// Cambia la contraseña de un usuario (no hay recuperación por mail sin SMTP).
// Uso: npm run set-password -- <usuario> <contraseña nueva>
import { adminClient, emailFor } from "./env.mjs";

const [username, password] = process.argv.slice(2);
if (!username || !password) { console.error("Uso: npm run set-password -- <usuario> <contraseña nueva>"); process.exit(1); }
if (password.length < 8) { console.error("La contraseña tiene que tener al menos 8 caracteres."); process.exit(1); }
const db = adminClient();
const { data, error } = await db.auth.admin.listUsers({ perPage: 1000 });
if (error) { console.error("No pude listar usuarios:", error.message); process.exit(1); }
const user = data.users.find((u) => u.email === emailFor(username));
if (!user) { console.error(`No existe el usuario ${username.trim().toLowerCase()}.`); process.exit(1); }
const { error: e2 } = await db.auth.admin.updateUserById(user.id, { password });
if (e2) { console.error("No se pudo cambiar:", e2.message); process.exit(1); }
console.log(`Contraseña de ${username.trim().toLowerCase()} actualizada.`);
process.exit(0);
