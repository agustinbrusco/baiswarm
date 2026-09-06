// Helpers de puntaje y orden compartidos por la UI y la exportación, y el export de un post a markdown.
// Sin nada de React: se puede probar en Node.
export const fold = (s) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); // sin acentos ni mayúsculas
export const score = (p) => Object.values(p.votes).reduce((a, b) => a + b, 0);
export const cscore = (c) => (c.deleted ? 0 : Object.keys(c.votes || {}).length); // votos de comentario: solo positivos
export const alive = (p) => p.comments.filter((c) => !c.deleted).length;
// árbol de comentarios por `parent` ("root" para los de primer nivel); hermanos por votos y después por fecha
export function commentTree(comments) {
  const o = {};
  comments.forEach((c) => { const k = c.parent || "root"; (o[k] = o[k] || []).push(c); });
  Object.values(o).forEach((xs) => xs.sort((a, b) => cscore(b) - cscore(a) || a.t - b.t));
  return o;
}

const fecha = (t) => { const d = new Date(t), z = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}`; };
const plural = (k, s, p) => `${k} ${k === 1 ? s : p}`;
// cada comentario va en una cita anidada según su profundidad, así su propio markdown (listas, código) sigue valiendo
const quote = (text, depth) => text.split("\n").map((l) => (`${"> ".repeat(depth)}${l}`).trimEnd()).join("\n");

// `num`: número visible de cada post; `byId`: posts por id; `rels`: vínculos del post en ambos sentidos ({id, label}); `site`: url del foro.
export function postToMarkdown(p, { num, byId, rels = [], site = "" }) {
  const isProj = p.kind === "proyecto";
  const out = [`# ${p.title}`, ""];
  const meta = [`${isProj ? "Proyecto" : "Insight"} #${num[p.id]}`, p.track, `por ${p.author}`, fecha(p.t), plural(score(p), "voto", "votos")];
  if (isProj) meta.push(plural(p.interest.length, "interesado", "interesados"));
  out.push(meta.join(" · "), "");
  if (isProj && p.pitch) out.push(`> ${p.pitch}`, "");
  if (p.body?.trim()) out.push(p.body.trim(), "");
  if (!isProj && p.url) out.push(`Fuente: ${p.url}`, "");
  if (rels.length) {
    out.push("## Vínculos", "");
    rels.forEach((r) => out.push(`- ${r.label} #${num[r.id]}: ${byId[r.id]?.title ?? "(post borrado)"}`));
    out.push("");
  }
  if (isProj && p.interest.length) {
    out.push("## Interesados", "");
    p.interest.forEach((x) => out.push(`- ${x.name}${x.role ? ` (${x.role})` : ""}`));
    out.push("");
  }
  out.push(`## ${plural(alive(p), "comentario", "comentarios")}`, "");
  const tree = commentTree(p.comments);
  const walk = (parent, depth) => (tree[parent] || []).forEach((c) => {
    const head = c.deleted ? "_comentario eliminado_" : `**${c.who}** · ${fecha(c.t)}${cscore(c) ? ` · ▲ ${cscore(c)}` : ""}`;
    out.push(quote(c.deleted || !c.text.trim() ? head : `${head}\n\n${c.text.trim()}`, depth), "");
    walk(c.id, depth + 1);
  });
  walk("root", 0);
  out.push("---", "", `Exportado de BAISWARM${site ? ` (${site})` : ""} el ${fecha(Date.now())}.`);
  return out.join("\n").replace(/\n{3,}/g, "\n\n") + "\n";
}

export const slug = (s) => fold(s).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

// dispara la descarga de un archivo de texto desde el navegador
export function download(filename, text, type = "text/markdown;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.rel = "noopener";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
