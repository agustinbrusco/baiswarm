// Recorrido end to end contra el modo demo (sin Supabase), en escritorio y en iPhone 14.
// Uso: npm run e2e   (la primera vez: npx playwright install chromium)
//      E2E_REAL=1 npm run e2e   corre contra el Supabase de .env en vez del modo demo. Escribe y borra posts
//      de prueba, así que solo con la tabla vacía; verifica además que un navegador vea los cambios del otro.
// Levanta el servidor de Vite en modo demo, recorre publicar, votar, comentar, editar, vincular,
// equipos, sincronización entre pestañas y reporte; chequea overflow horizontal y contenedores
// recortados; deja capturas en e2e/shots. Sale con código 1 si encontró problemas.
import { chromium, devices } from "playwright";
import { mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { loadEnv, emailFor } from "../scripts/env.mjs";

const PORT = 5199, BASE = `http://127.0.0.1:${PORT}/`;
const REAL = process.env.E2E_REAL === "1";
// usuarios de prueba: en modo real llevan sufijo para no chocar con cuentas reales, y se borran al final
const SUF = Date.now().toString(36).slice(-5);
const A = REAL ? `e2e-agus-${SUF}` : "agus", B = REAL ? `e2e-eitan-${SUF}` : "eitan", PASS = "clave-e2e-123";
let admin = null, INVITE = "demo";
if (REAL) {
  const { url, secret } = loadEnv();
  if (!secret) { console.error("E2E_REAL necesita SUPABASE_SECRET_KEY en .env para leer la invitación y limpiar usuarios."); process.exit(2); }
  admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data } = await admin.from("settings").select("value").eq("key", "invite").maybeSingle();
  if (!data || data.value === "CAMBIAME") { console.error("Código de invitación sin configurar: npm run invite -- --nuevo"); process.exit(2); }
  INVITE = data.value;
}
const OUT = process.env.OUT || "e2e/shots"; mkdirSync(OUT, { recursive: true });

// servidor de desarrollo en modo demo
// Vite directo con node (no vía npx) para que server.kill() mate al proceso correcto.
const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", ...(REAL ? [] : ["--mode", "demo"]), "--port", String(PORT), "--strictPort", "--host", "127.0.0.1"], { stdio: "ignore" });
const up = async () => { for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE)).ok) return true; } catch {} await new Promise((r) => setTimeout(r, 500)); } return false; };
if (!(await up())) { console.error("El servidor no levantó en 30 s."); server.kill(); process.exit(2); }

const browser = await chromium.launch();
const problems = [];
const note = (s) => { problems.push(s); console.log("PROBLEMA:", s); };
const ok = (s) => console.log("ok:", s);

function wire(page, tag) {
  page.on("console", (m) => { if (m.type() === "error") note(`${tag} console.error: ${m.text().slice(0, 200)}`); });
  page.on("pageerror", (e) => note(`${tag} pageerror: ${e.message.slice(0, 200)}`));
}
async function noOverflow(page, tag) {
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  if (sw > iw) note(`${tag}: overflow horizontal (${sw} > ${iw})`); else ok(`${tag}: sin overflow`);
  // contenedores que scrollean por su cuenta (el nav): también cuentan como recorte
  const clipped = await page.evaluate(() => [...document.querySelectorAll("nav, ul, div")].filter((el) => el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0).map((el) => `${el.tagName.toLowerCase()} ${el.scrollWidth}>${el.clientWidth}`));
  if (clipped.length) note(`${tag}: contenido recortado en ${clipped.join(", ")}`);
}
async function smallTargets(page, tag) {
  const small = await page.evaluate(() => [...document.querySelectorAll("button, a, select, input")]
    .filter((el) => el.offsetParent !== null)
    .map((el) => { const r = el.getBoundingClientRect(); return { t: (el.getAttribute("aria-label") || el.textContent || el.placeholder || "").trim().slice(0, 25), w: Math.round(r.width), h: Math.round(r.height) }; })
    .filter((x) => x.h > 0 && x.h < 24));
  if (small.length) console.log(`info ${tag}: controles de menos de 24px de alto:`, JSON.stringify(small.slice(0, 10)));
}
async function must(loc, what, t = 5000) {
  try { await loc.first().waitFor({ state: "visible", timeout: t }); ok(what); return true; }
  catch { note(`no apareció: ${what}`); return false; }
}
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
async function register(page, name, role) {
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await page.getByPlaceholder("nombre de usuario").fill(name);
  await page.getByPlaceholder(/^contraseña/).fill(PASS);
  await page.getByPlaceholder(/perfil:/).fill(role);
  await page.getByPlaceholder("código de invitación").fill(INVITE);
  await page.getByRole("button", { name: "Registrarme" }).click();
  await must(page.getByText("Participás como"), `se registró ${name}`, 15000);
}
async function login(page, name, pass) {
  await page.getByPlaceholder("nombre de usuario").fill(name);
  await page.getByPlaceholder(/^contraseña/).fill(pass);
  await page.getByRole("button", { name: "Entrar" }).click();
}
const heading = (page, re) => page.getByRole("heading", { name: re });

let d, m;
try {
  // ── Escritorio ──
  const dctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  d = await dctx.newPage(); wire(d, "desktop");
  await d.goto(BASE);
  if (REAL) { if (await d.getByText("Modo demo").count()) note("apareció el banner de demo en modo real"); else ok("sin banner de demo"); }
  else await must(d.getByText("Modo demo"), "banner demo");
  await noOverflow(d, "desktop entrada");
  await shot(d, "01-desktop-entrada");
  // código de invitación incorrecto: rechazado con mensaje
  await d.getByRole("button", { name: "Crear cuenta" }).click();
  await d.getByPlaceholder("nombre de usuario").fill(A);
  await d.getByPlaceholder(/^contraseña/).fill(PASS);
  await d.getByPlaceholder(/perfil:/).fill("Interpretabilidad");
  await d.getByPlaceholder("código de invitación").fill("incorrecto");
  await d.getByRole("button", { name: "Registrarme" }).click();
  await must(d.getByText("Código de invitación incorrecto"), "registro con código incorrecto rechazado", 15000);
  await d.getByPlaceholder("código de invitación").fill(INVITE);
  await d.getByRole("button", { name: "Registrarme" }).click();
  await must(d.getByText("Participás como"), `se registró ${A}`, 15000);
  await must(d.getByText("Todavía no hay proyectos."), "estado vacío");

  await d.getByRole("button", { name: "Publicar", exact: true }).click();
  await d.getByPlaceholder(/Título: qué vamos/).fill("Harness de detección de escape en evals");
  await d.getByPlaceholder(/Una línea/).fill("Detectar cuándo un agente intenta salir del sandbox durante una eval.");
  await d.getByPlaceholder(/Detalle:/).fill("Método: instrumentar red y filesystem del sandbox.\nPerfiles: infra, seguridad.");
  await d.getByRole("button", { name: "Publicar proyecto" }).click();
  await must(heading(d, /Harness de detección/), "proyecto publicado");
  await must(d.getByText("1 interesado"), "autor anotado como interesado");
  await shot(d, "02-desktop-proyecto");

  await d.getByRole("button", { name: "Publicar", exact: true }).click();
  await d.getByRole("button", { name: "Insight", exact: true }).click();
  await d.getByPlaceholder(/Título: la idea/).fill("Los agentes usaron Artifactory como message board");
  await d.getByPlaceholder(/Desarrollo:/).fill("Cualquier store compartido escribible es un canal de coordinación.");
  await d.getByPlaceholder(/Link a la fuente/).fill("https://example.com/metr");
  await d.locator("select").filter({ hasText: "vincular…" }).selectOption("informa");
  await d.locator("select").filter({ hasText: "proyecto…" }).selectOption({ index: 1 });
  await d.getByRole("button", { name: "Agregar" }).click();
  await must(d.getByText(/informa a #1/), "vínculo en borrador");
  await d.getByRole("button", { name: "Publicar insight" }).click();
  await must(heading(d, /Artifactory/), "insight publicado");
  await must(d.getByText(/informa a #1/), "chip de vínculo en insight");
  await must(d.getByText("fuente"), "link a fuente");
  if (await d.getByText("sin proyecto todavía").count()) note("insight vinculado aparece como huérfano");
  await shot(d, "03-desktop-insight");

  await d.getByRole("button", { name: /Proyectos/ }).click();
  await must(d.getByText("se apoya en 1 insight"), "conteo recíproco en proyecto");
  await must(d.getByText(/se apoya en #2/), "chip recíproco en proyecto");

  await d.getByRole("button", { name: /Insights/ }).click();
  await d.getByRole("button", { name: "Votar en contra" }).first().click();
  await must(d.locator("li").first().locator("span.font-semibold", { hasText: "-1" }), "voto negativo aplicado");
  await d.getByRole("button", { name: "Votar a favor" }).first().click();
  await must(d.locator("li").first().locator("span.font-semibold", { hasText: /^1$/ }), "voto positivo aplicado");

  await d.getByRole("button", { name: /Proyectos/ }).click();
  await heading(d, /Harness/).click();
  await must(d.getByPlaceholder("Comentar…"), "post abierto con caja de comentarios");
  await d.getByPlaceholder("Comentar…").fill("¿Qué señales concretas miraríamos?"); await d.keyboard.press("Enter");
  await must(d.getByText("¿Qué señales concretas miraríamos?"), "comentario raíz");
  await d.getByRole("button", { name: "responder" }).first().click();
  await d.getByPlaceholder(new RegExp(`Responder a ${A}`)).fill("Conexiones salientes inesperadas, para empezar."); await d.keyboard.press("Enter");
  await must(d.getByText("Conexiones salientes inesperadas"), "respuesta anidada");
  await must(d.getByText("2 comentarios"), "conteo de comentarios");
  await shot(d, "04-desktop-comentarios");

  await d.getByRole("button", { name: "Editar" }).click();
  await d.getByPlaceholder(/Título: qué vamos/).fill("Harness de detección de escape (v2)");
  await d.getByRole("button", { name: "Guardar" }).click();
  await must(heading(d, /\(v2\)/), "edición guardada");

  await d.getByRole("button", { name: "Vincular" }).click();
  await d.locator("select").filter({ hasText: "vincular…" }).selectOption("apoya");
  { const txt = await d.locator("select").nth(2).textContent(); if (txt?.includes("no hay insights para vincular")) ok("picker excluye el insight ya vinculado"); else note("picker no excluye el insight ya vinculado: " + txt); }
  await d.getByRole("button", { name: "Cerrar", exact: true }).click();

  await d.getByRole("button", { name: "Borrar comentario" }).first().click();
  await must(d.getByText("comentario eliminado"), "borrado preserva el hilo");
  await must(d.getByText("1 comentario", { exact: true }), "conteo excluye eliminado");

  await d.getByRole("button", { name: "Equipos" }).click();
  await must(d.getByText(/Falta gente \(1\/3\)/), "equipos: falta gente");
  await must(d.getByText("Interpretabilidad"), "perfil libre en equipos");
  await shot(d, "05-desktop-equipos");

  // ── Segunda pestaña: sincronización ──
  const d2 = await dctx.newPage(); wire(d2, "desktop-tab2"); await d2.goto(BASE);
  await must(heading(d2, /\(v2\)/), "pestaña 2 ve los datos");
  await d.getByRole("button", { name: /Proyectos/ }).click();
  await d.getByPlaceholder("Comentar…").fill("prueba de sincronización"); await d.keyboard.press("Enter");
  await must(d2.getByText("2 comentarios"), "pestaña 2 recibió el cambio sin recargar", REAL ? 15000 : 8000);

  // ── Reporte ──
  await d.getByRole("button", { name: "Reportar un problema" }).click();
  await d.getByPlaceholder(/Qué pasó/).fill("Prueba de reporte");
  const href = await d.getByRole("link", { name: "Abrir issue en GitHub" }).getAttribute("href");
  if (href?.includes("/issues/new") && href.includes("Prueba") && href.includes("Versi")) ok("link de issue con diagnóstico"); else note("link de issue mal armado: " + href);
  await shot(d, "06-desktop-reporte");
  await smallTargets(d, "desktop");

  // ── Celular (iPhone 14), con los mismos datos ──
  const seed = await d.evaluate(() => localStorage.getItem("baiswarm:demo"));
  const mctx = await browser.newContext({ ...devices["iPhone 14"] });
  if (!REAL) await mctx.addInitScript((v) => { if (!localStorage.getItem("baiswarm:demo")) localStorage.setItem("baiswarm:demo", v); }, seed);
  m = await mctx.newPage(); wire(m, "mobile");
  await m.goto(BASE);
  await noOverflow(m, "mobile entrada"); await shot(m, "07-mobile-entrada");
  await register(m, B, "Policy / regulación");
  await must(heading(m, /\(v2\)/), "mobile ve los datos");
  await noOverflow(m, "mobile proyectos");
  await heading(m, /\(v2\)/).click();
  await m.getByRole("button", { name: "Me sumaría" }).click();
  await must(m.getByText(new RegExp(`${B} \\(Policy`)), "mobile: sumado con perfil");
  await must(m.getByText("2 interesados"), "conteo de interesados");
  if (REAL) await must(d.getByText("2 interesados"), "el escritorio vio por realtime lo que hizo el celular", 15000);
  await noOverflow(m, "mobile proyecto abierto"); await shot(m, "08-mobile-proyecto");
  await m.getByRole("button", { name: "responder" }).first().click();
  await m.getByPlaceholder(/Responder a/).fill("Desde policy: qué obligaciones de reporte aplican."); await m.keyboard.press("Enter");
  await must(m.getByText(/Desde policy/), "mobile: respuesta anidada");
  await noOverflow(m, "mobile comentarios");
  await smallTargets(m, "mobile proyecto abierto");
  await m.getByRole("button", { name: /Insights/ }).click(); await noOverflow(m, "mobile insights"); await shot(m, "09-mobile-insights");
  await m.getByRole("button", { name: "Equipos" }).click(); await noOverflow(m, "mobile equipos");
  await must(m.getByText(/Falta gente \(2\/3\)/), "equipos actualizado en mobile"); await shot(m, "10-mobile-equipos");
  await m.getByRole("button", { name: "Publicar", exact: true }).click(); await noOverflow(m, "mobile publicar");
  await m.locator("select").filter({ hasText: "vincular…" }).selectOption("deriva");
  await noOverflow(m, "mobile publicar con selector de vínculo"); await shot(m, "11-mobile-publicar");
  await m.getByRole("button", { name: "Reportar un problema" }).click(); await noOverflow(m, "mobile reporte"); await shot(m, "12-mobile-reporte");
  // salir y volver a entrar
  await m.getByRole("button", { name: "salir" }).click();
  await must(m.getByRole("button", { name: "Entrar" }), "mobile: sesión cerrada");
  await login(m, B, "incorrecta-123");
  await must(m.getByText("Usuario o contraseña incorrectos"), "mobile: contraseña incorrecta rechazada", 15000);
  await login(m, B, PASS);
  await must(m.getByText(new RegExp(`Participás como ${B}`)), "mobile: volvió a entrar", 15000);
  await must(heading(m, /\(v2\)/), "mobile: ve los datos tras volver a entrar", 15000);
} catch (e) {
  note(`excepción: ${e.message.split("\n")[0]}`);
  try { if (m) await shot(m, "99-fallo-mobile"); if (d) await shot(d, "99-fallo-desktop"); } catch {}
}
await browser.close();
server.kill();
if (REAL) {
  const { data: us } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const mine = us.users.filter((u) => [emailFor(A), emailFor(B)].includes(u.email));
  await admin.from("posts").delete().in("author_id", mine.map((u) => u.id));
  for (const u of mine) await admin.auth.admin.deleteUser(u.id);
  console.log(`limpieza: ${mine.length} usuarios de prueba y sus posts borrados`);
}
console.log(`\n${problems.length} problemas`);
problems.forEach((p) => console.log(" -", p));
process.exit(problems.length ? 1 : 0);
