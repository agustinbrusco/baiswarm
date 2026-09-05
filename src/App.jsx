import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { configured, demo, auth, loadAll, createPost, updatePost, deletePost, vote, toggleInterest, addComment, removeComment, addLink, removeLink, subscribe, norm } from "./storage.js";
import { C, SERIF, SANS, FIELD, BORDER } from "./theme.js";
import { PROFILE_HINTS, ProfileInput, AuthGate, Footer } from "./Auth.jsx";
import Md, { MD_HINT } from "./Md.jsx";

// ── Identidad ───────────────────────────────────────────────────────────────
const NAME = "BAISWARM";
const TAGLINE = "Buenos Aires Safety War Room";
const SPRINT = "2026-09-11T00:00:00-03:00"; // hora de Buenos Aires
const SPRINT_URL = "https://apartresearch.com/sprints/ai-incident-response-sprint-2026-09-11-to-2026-09-13";
const REPO = "https://github.com/agustinbrusco/baiswarm";
const COMMIT = (import.meta.env.VITE_COMMIT || "dev").slice(0, 7);

const TRACKS = ["Contención", "Detección", "Forecasting", "Regulación", "Tabletop", "General"];
const KINDS = { proyecto: "Proyecto", insight: "Insight" };
// vínculos permitidos según tipo de origen → tipo de destino. `inv` es cómo se lee el mismo vínculo desde el destino.
const REL = {
  informa:     { label: "informa a",       inv: "se apoya en",     from: "insight",  to: "proyecto" },
  relacionada: { label: "relacionada con", inv: "relacionada con", from: "insight",  to: "insight" },
  apoya:       { label: "se apoya en",     inv: "informa a",       from: "proyecto", to: "insight" },
  deriva:      { label: "deriva de",       inv: "origen de",       from: "proyecto", to: "proyecto" },
  compite:     { label: "compite con",     inv: "compite con",     from: "proyecto", to: "proyecto" },
};

const daysTo = (d) => Math.max(0, Math.ceil((new Date(d) - new Date()) / 86400000));
const score = (p) => Object.values(p.votes).reduce((a, b) => a + b, 0);
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const when = (t) => new Date(t).toLocaleString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const same = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();
const alive = (p) => p.comments.filter((c) => !c.deleted).length;
const fold = (s) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); // sin acentos ni mayúsculas, para buscar
const PLURAL = { proyecto: ["proyecto", "proyectos"], insight: ["insight", "insights"] };
const count = (n, kind) => `${n} ${PLURAL[kind][n === 1 ? 0 : 1]}`;

export default function App() {
  const [me, setMe] = useState(null);           // { id, name, role } con sesión; null sin sesión
  const [authReady, setAuthReady] = useState(false);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState("proyecto");
  const [sort, setSort] = useState("score");
  const [track, setTrack] = useState("Todos");
  const [q, setQ] = useState("");                 // texto de búsqueda; filtra la pestaña activa
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(null);
  const busy = useRef(false), again = useRef(false), scrollTo = useRef(null);

  const refresh = useCallback(async () => {
    if (busy.current) { again.current = true; return; } // llegó un cambio durante una recarga: repetir al terminar
    busy.current = true;
    try { setPosts(await loadAll()); setErr(""); }
    catch (e) { setErr(e.message || "No pude leer el foro. Probá actualizar."); }
    finally { busy.current = false; setLoading(false); if (again.current) { again.current = false; refresh(); } }
  }, []);

  // sesión: la actual al arrancar, y cambios (login en otra pestaña, expiración)
  useEffect(() => {
    if (!configured) { setLoading(false); return; }
    auth.current().then((m) => { setMe(m); setAuthReady(true); });
    return auth.onChange(setMe);
  }, []);

  // datos: solo con sesión (RLS), y realtime también, porque respeta RLS
  useEffect(() => {
    if (!me) { setPosts([]); return; }
    setLoading(true);
    refresh();
    let t = null;
    const unsub = subscribe(() => { clearTimeout(t); t = setTimeout(refresh, 300); });
    const poll = setInterval(refresh, 60000); // red de seguridad si realtime no llega
    return () => { clearTimeout(t); clearInterval(poll); unsub(); };
  }, [me?.id, refresh]);

  // después de saltar a un post, scrollear hasta él cuando esté renderizado
  useEffect(() => {
    if (!scrollTo.current) return;
    const el = document.getElementById(`post-${scrollTo.current}`);
    if (el) { el.scrollIntoView({ behavior: "smooth", block: "start" }); scrollTo.current = null; }
  }, [open, tab, track]);

  const apply = (u) => setPosts((xs) => xs.map((p) => (p.id === u.id ? u : p)));
  const run = async (pr) => { try { await pr; setErr(""); return true; } catch (e) { setErr(e.message || "Algo falló, actualizá y probá de nuevo."); refresh(); return false; } };

  // Todas las mutaciones van a la base con la identidad de la sesión; la base devuelve el post actualizado.
  const act = {
    vote: (id, dir) => run(vote(id, dir).then(apply)),
    toggleInterest: (id, role) => run(toggleInterest(id, role).then(apply)),
    addComment: (id, text, parent = null) => run(addComment(id, text, parent).then(apply)),
    removeComment: (id, cid) => run(removeComment(id, cid).then(apply)),
    edit: (id, fields) => run(updatePost(id, fields).then(apply)),
    addLink: (id, l) => run(addLink(id, l).then(apply)),
    removeLink: (id, l) => run(removeLink(id, l).then(apply)),
    remove: (id) => run(deletePost(id).then(() => setPosts((xs) => xs.filter((p) => p.id !== id)))),
    jump: (id) => { const p = byId[id]; if (p) { setTab(p.kind); setTrack("Todos"); setOpen(id); scrollTo.current = id; } },
  };
  const addPost = (draft) => {
    const p = norm({ ...draft, id: newId(), author: me.name, t: Date.now(), votes: { [me.id]: 1 },
      interest: draft.kind === "proyecto" ? [{ id: me.id, name: me.name, role: me.role }] : [] });
    return run(createPost(p).then((s) => { setPosts((xs) => [s, ...xs]); setTab(s.kind); setOpen(s.id); }));
  };
  const changeRole = (role) => run(auth.updateRole(role).then(setMe));
  const signOut = () => run(auth.signOut().then(() => { setMe(null); setOpen(null); setTab("proyecto"); }));

  const byId = useMemo(() => Object.fromEntries(posts.map((p) => [p.id, p])), [posts]);
  const num = useMemo(() => { const o = {}; [...posts].sort((a, b) => a.t - b.t).forEach((p, k) => (o[p.id] = k + 1)); return o; }, [posts]);
  // relaciones de cada post en ambos sentidos: las que declara y las que otros declaran hacia él.
  // `from` y `link` identifican dónde está guardado el vínculo, para poder quitarlo desde cualquiera de los dos lados.
  const rels = useMemo(() => {
    const o = {};
    const add = (id, r) => { const xs = (o[id] = o[id] || []); if (!xs.some((x) => x.id === r.id && x.label === r.label)) xs.push(r); };
    posts.forEach((p) => p.links.forEach((l) => {
      const R = REL[l.type]; if (!R || !byId[l.to]) return;
      add(p.id, { id: l.to, label: R.label, from: p.id, link: l });
      add(l.to, { id: p.id, label: R.inv, from: p.id, link: l });
    }));
    return o;
  }, [posts, byId]);
  // insights que respaldan cada proyecto, declarados desde cualquiera de los dos lados
  const supports = useMemo(() => Object.fromEntries(Object.entries(rels)
    .filter(([id]) => byId[id]?.kind === "proyecto")
    .map(([id, rs]) => [id, rs.filter((r) => r.label === "se apoya en").map((r) => r.id)])), [rels, byId]);
  const linkedInsights = useMemo(() => new Set(Object.values(supports).flat()), [supports]);

  // búsqueda: ids que contienen el texto en título, pitch, cuerpo, autor o url; null si no se está buscando
  const hits = useMemo(() => {
    const k = fold(q.trim());
    return k ? new Set(posts.filter((p) => [p.title, p.pitch, p.body, p.author, p.url].some((f) => fold(f).includes(k))).map((p) => p.id)) : null;
  }, [posts, q]);
  const hitsOf = (kind) => (hits ? posts.filter((p) => p.kind === kind && hits.has(p.id)).length : 0);
  const shown = useMemo(() => {
    const f = posts.filter((p) => p.kind === tab && (track === "Todos" || p.track === track) && (!hits || hits.has(p.id)));
    return sort === "score" ? [...f].sort((a, b) => score(b) - score(a) || b.t - a.t) : [...f].sort((a, b) => b.t - a.t);
  }, [posts, tab, sort, track, hits]);
  const nProj = posts.filter((p) => p.kind === "proyecto").length, nIns = posts.length - nProj;
  const days = daysTo(SPRINT);
  const isFeed = tab === "proyecto" || tab === "insight";
  const other = tab === "proyecto" ? "insight" : "proyecto";
  const closeSearch = () => { setQ(""); setSearching(false); };

  return (
    <div style={{ background: C.paper, color: C.ink, minHeight: "100vh", fontFamily: SERIF }}>
      <datalist id="perfiles">{PROFILE_HINTS.map((h) => <option key={h} value={h} />)}</datalist>
      <div className="max-w-2xl mx-auto px-4 pb-16">
        <header className="pt-6 pb-4" style={{ borderBottom: `1px solid ${C.line}` }}>
          <div className="flex items-baseline justify-between gap-3" style={{ fontFamily: SANS }}>
            <span className="text-sm" style={{ color: C.muted }}>{TAGLINE}</span>
            <span className="text-sm flex items-center gap-2 shrink-0" style={{ color: C.muted }}>
              <a href={SPRINT_URL} target="_blank" rel="noreferrer" className="whitespace-nowrap" style={{ textDecoration: "underline" }}>
                {days > 0 ? `Sprint en ${days} ${days === 1 ? "día" : "días"}` : "Sprint en curso"}
              </a>
              <button onClick={refresh} title="Actualizar" aria-label="Actualizar" className="px-2 py-1 -my-1" style={{ color: C.muted }}>↻</button>
            </span>
          </div>
          <h1 className="text-3xl mt-1 leading-tight" style={{ fontWeight: 600, letterSpacing: "-0.01em", color: C.accent }}>{NAME}</h1>
          <p className="mt-2 text-base leading-relaxed" style={{ color: C.muted }}>
            Nuestro message board para el <a href={SPRINT_URL} target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>AI Incident Response Sprint</a> de Apart y CeSIA. Los proyectos son lo que vamos a construir; los insights son lo que sabemos, sospechamos o leímos y que debería informarlos.
          </p>
          <nav className="flex justify-between sm:justify-start sm:gap-1 mt-4 -mb-px items-center overflow-x-auto" style={{ fontFamily: SANS }}>
            {[["proyecto", `Proyectos (${nProj})`], ["insight", `Insights (${nIns})`], ["equipos", "Equipos"], ["nuevo", "Publicar"]].map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} className="px-1.5 sm:px-3 py-2 text-sm whitespace-nowrap"
                style={{ borderBottom: `2px solid ${tab === k ? (k === "insight" ? C.insight : C.accent) : "transparent"}`, color: tab === k ? (k === "insight" ? C.insight : C.accent) : C.muted, fontWeight: tab === k ? 600 : 400 }}>{l}</button>
            ))}
          </nav>
        </header>

        {!configured && (
          <div className="mt-6 p-4 rounded text-sm leading-relaxed" style={{ background: C.card, ...BORDER, fontFamily: SANS }}>
            Falta configurar Supabase. Copiá <code>.env.example</code> a <code>.env</code>, completá la URL y la anon key del proyecto, y reiniciá el servidor. Los pasos completos están en el README.
          </div>
        )}
        {demo && (
          <div className="mt-3 text-xs px-3 py-2 rounded" style={{ fontFamily: SANS, background: C.insightSoft, color: C.insight }}>
            Modo demo: los datos quedan en este navegador y se comparten entre sus pestañas. Nada llega al grupo.
          </div>
        )}
        {configured && !authReady && <p className="py-6 text-sm" style={{ fontFamily: SANS, color: C.muted }}>Cargando…</p>}
        {configured && authReady && !me && <AuthGate onDone={setMe} />}
        {err && <div className="mt-3 text-sm px-3 py-2 rounded" style={{ fontFamily: SANS, background: "#FBEEEC", color: C.down }}>{err}</div>}

        {me && isFeed && (
          <>
            <div className="flex flex-wrap gap-2 items-center py-3 text-sm" style={{ fontFamily: SANS }}>
              <select value={track} onChange={(e) => setTrack(e.target.value)} className="px-2 py-1 rounded bg-transparent" style={{ ...BORDER, color: C.ink }}>
                {["Todos", ...TRACKS].map((t) => <option key={t}>{t}</option>)}
              </select>
              <button onClick={() => (searching ? closeSearch() : setSearching(true))} aria-label="Buscar" title="Buscar" className="px-2 py-1 rounded flex items-center" style={{ color: searching ? C.ink : C.muted }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.6-3.6" /></svg>
              </button>
              <span className="ml-auto flex gap-3" style={{ color: C.muted }}>
                {[["score", "Más votados"], ["new", "Recientes"]].map(([k, l]) => (
                  <button key={k} onClick={() => setSort(k)} className="py-1" style={{ color: sort === k ? C.ink : C.muted, textDecoration: sort === k ? "underline" : "none" }}>{l}</button>
                ))}
              </span>
              {searching && (
                <div className="basis-full flex items-center gap-2">
                  <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Escape" && closeSearch()}
                    placeholder="Buscar…" aria-label="Buscar" className="flex-1 min-w-0 px-3 py-2 rounded" style={FIELD} />
                  <button onClick={closeSearch} aria-label="Cerrar búsqueda" title="Cerrar búsqueda" className="px-2 py-1" style={{ color: C.muted, fontSize: 18 }}>×</button>
                </div>
              )}
              {hits && (
                <p className="basis-full text-xs" style={{ color: C.muted }}>
                  {count(hitsOf(tab), tab)} · <button onClick={() => setTab(other)} className="py-1" style={{ textDecoration: "underline" }}>{count(hitsOf(other), other)}</button>
                </p>
              )}
            </div>
            {loading && <p className="py-6 text-sm" style={{ fontFamily: SANS, color: C.muted }}>Cargando…</p>}
            {!loading && shown.length === 0 && hits && (
              <p className="py-10 text-center" style={{ color: C.muted }}>Nada con «{q.trim()}» en {PLURAL[tab][1]}.</p>
            )}
            {!loading && shown.length === 0 && !hits && (
              <div className="py-10 text-center">
                <p className="text-lg">{tab === "proyecto" ? "Todavía no hay proyectos." : "Todavía no hay insights."}</p>
                <p className="mt-1 text-sm" style={{ color: C.muted }}>{tab === "proyecto" ? "Un proyecto es algo que un equipo puede entregar en tres días." : "Una observación, hipótesis, pregunta o lectura que debería informar algún proyecto."}</p>
                <button onClick={() => setTab("nuevo")} className="mt-3 text-sm px-4 py-2 rounded" style={{ fontFamily: SANS, background: tab === "insight" ? C.insight : C.accent, color: "#fff" }}>Publicar el primero</button>
              </div>
            )}
            <ul>
              {shown.map((p) => (
                <PostCard key={p.id} post={p} me={me} byId={byId} num={num} posts={posts} rels={rels[p.id] || []} supports={supports[p.id] || []}
                  orphan={p.kind === "insight" && !linkedInsights.has(p.id)} open={open === p.id} onOpen={() => setOpen(open === p.id ? null : p.id)} act={act} />
              ))}
            </ul>
          </>
        )}

        {me && tab === "equipos" && <Teams posts={posts.filter((p) => p.kind === "proyecto")} onJump={act.jump} />}
        {me && tab === "nuevo" && <NewPost posts={posts} num={num} onSubmit={addPost} />}

        {me && <Footer me={me} onRole={changeRole} onSignOut={signOut} />}
        <Report me={me} tab={tab} err={err} />
      </div>
    </div>
  );
}

// Reportar un problema: abre un issue en GitHub con diagnóstico adjunto, o copia el texto para mandarlo por otro lado.
function Report({ me, tab, err }) {
  const [show, setShow] = useState(false);
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);
  const body = () => [
    text.trim() || "(sin descripción)", "", "---",
    `Usuario: ${me?.name || "sin entrar"}`, `Pestaña: ${tab}`, `Versión: ${COMMIT}`,
    `Pantalla: ${window.innerWidth}×${window.innerHeight}`, `Navegador: ${navigator.userAgent}`,
    err ? `Último error: ${err}` : null,
  ].filter((l) => l !== null).join("\n");
  const title = text.trim().split("\n")[0].slice(0, 60) || "Problema en BAISWARM";
  const issueUrl = `${REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body())}`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(body()); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { window.prompt("Copiá este texto:", body()); }
  };
  return (
    <div className="mt-6 text-xs" style={{ fontFamily: SANS, color: C.muted }}>
      <button onClick={() => setShow(!show)} className="py-1" style={{ textDecoration: "underline" }}>{show ? "Cerrar reporte" : "Reportar un problema"}</button>
      {show && (
        <div className="mt-2 p-3 rounded flex flex-col gap-2" style={{ background: C.card, ...BORDER }}>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="Qué pasó, qué esperabas y qué estabas haciendo" className="px-2 py-1 rounded text-sm" style={{ ...BORDER, fontFamily: SANS, color: C.ink }} />
          <div className="flex flex-wrap gap-2 items-center">
            <a href={issueUrl} target="_blank" rel="noreferrer" className="px-3 py-1 rounded" style={{ background: C.accent, color: "#fff" }}>Abrir issue en GitHub</a>
            <button onClick={copy} className="px-3 py-1 rounded" style={BORDER}>{copied ? "Copiado" : "Copiar para mandar por Discord"}</button>
          </div>
          <span>Se adjuntan navegador, tamaño de pantalla y versión. Si no tenés cuenta de GitHub, copialo y mandalo al grupo.</span>
        </div>
      )}
    </div>
  );
}

// Etiqueta de vínculo. Sin onClick es solo informativa; con onRemove muestra una × para quitarlo.
function Chip({ color, soft, onClick, onRemove, children }) {
  return (
    <span className="inline-flex items-center rounded-full text-xs" style={{ background: soft, color }}>
      <button onClick={onClick} disabled={!onClick} className="px-2 py-0.5 text-left">{children}</button>
      {onRemove && <button aria-label="Quitar vínculo" title="Quitar vínculo" onClick={onRemove} className="pl-1 pr-2 py-0.5 leading-none" style={{ fontSize: 14 }}>×</button>}
    </span>
  );
}

// Campos comunes a publicar y editar. `d` es el borrador; `setD` lo reemplaza.
function PostFields({ kind, d, setD }) {
  const isProj = kind === "proyecto";
  const set = (k) => (e) => setD({ ...d, [k]: e.target.value });
  return (
    <>
      <input value={d.title} onChange={set("title")} placeholder={isProj ? "Título: qué vamos a construir" : "Título: la idea en una frase"} className="px-3 py-2 rounded" style={FIELD} />
      {isProj && <input value={d.pitch} onChange={set("pitch")} placeholder="Una línea: por qué importa y qué entregable sale" className="px-3 py-2 rounded" style={FIELD} />}
      <textarea value={d.body} onChange={set("body")} rows={5}
        placeholder={isProj ? "Detalle: método, datos, qué se puede hacer en 3 días, qué perfiles hacen falta" : "Desarrollo: qué observaste, por qué importa, qué proyecto podría salir de acá"} className="px-3 py-2 rounded" style={FIELD} />
      <span className="text-xs -mt-1" style={{ fontFamily: SANS, color: C.muted }}>{MD_HINT}</span>
      {!isProj && <input value={d.url} onChange={set("url")} placeholder="Link a la fuente (opcional)" className="px-3 py-2 rounded" style={{ ...FIELD, fontFamily: SANS, fontSize: 14 }} />}
      <div className="flex gap-2 items-center text-sm">
        <span style={{ color: C.muted }}>Track</span>
        <select value={d.track} onChange={set("track")} className="px-2 py-1 rounded bg-transparent" style={BORDER}>
          {TRACKS.map((t) => <option key={t}>{t}</option>)}
        </select>
      </div>
    </>
  );
}

// Elegir tipo de vínculo y destino según el tipo del post de origen. `exclude`: ids que no se ofrecen (el propio, los ya vinculados).
function LinkPicker({ kind, posts, num, exclude = [], onAdd }) {
  const [type, setType] = useState("");
  const [to, setTo] = useState("");
  const opts = Object.entries(REL).filter(([, r]) => r.from === kind);
  const targets = type ? posts.filter((p) => p.kind === REL[type].to && !exclude.includes(p.id)) : [];
  const what = type ? KINDS[REL[type].to].toLowerCase() : "";
  return (
    <div className="flex flex-wrap gap-2 items-center text-sm" style={{ fontFamily: SANS }}>
      <select value={type} onChange={(e) => { setType(e.target.value); setTo(""); }} className="px-2 py-1 rounded bg-transparent" style={BORDER}>
        <option value="">vincular…</option>
        {opts.map(([k, r]) => <option key={k} value={k}>{r.label}</option>)}
      </select>
      {type && (
        <select value={to} onChange={(e) => setTo(e.target.value)} className="px-2 py-1 rounded bg-transparent flex-1 min-w-0" style={BORDER}>
          <option value="">{targets.length ? `${what}…` : `no hay ${what}s para vincular`}</option>
          {targets.map((p) => <option key={p.id} value={p.id}>#{num[p.id]} {p.title.slice(0, 40)}</option>)}
        </select>
      )}
      <button disabled={!to} onClick={() => { onAdd({ to, type }); setTo(""); }} className="px-3 py-1 rounded" style={{ ...BORDER, opacity: to ? 1 : 0.5 }}>Agregar</button>
    </div>
  );
}

function EditPost({ post: p, onSave, onCancel }) {
  const [d, setD] = useState({ title: p.title, pitch: p.pitch, body: p.body, url: p.url, track: p.track });
  const [saving, setSaving] = useState(false);
  const ok = d.title.trim() && (p.kind === "proyecto" ? d.pitch.trim() : d.body.trim()) && !saving;
  const save = async () => {
    setSaving(true);
    try { await onSave({ title: d.title.trim(), pitch: d.pitch.trim(), body: d.body.trim(), url: d.url.trim(), track: d.track }); }
    finally { setSaving(false); }
  };
  return (
    <div className="flex flex-col gap-2" style={{ fontFamily: SANS }}>
      <PostFields kind={p.kind} d={d} setD={setD} />
      <div className="flex gap-2 text-sm">
        <button disabled={!ok} onClick={save} className="px-4 py-1.5 rounded font-semibold" style={{ background: ok ? C.accent : C.line, color: ok ? "#fff" : C.muted }}>{saving ? "Guardando…" : "Guardar"}</button>
        <button onClick={onCancel} className="px-3 py-1.5 rounded" style={{ ...BORDER, color: C.muted }}>Cancelar</button>
      </div>
    </div>
  );
}

// Enter envía, Shift+Enter salta de línea (markdown). El textarea crece con el texto.
function CommentBox({ placeholder, onSend, autoFocus }) {
  const [text, setText] = useState("");
  const ref = useRef(null);
  const send = () => { if (text.trim()) { onSend(text.trim()); setText(""); if (ref.current) ref.current.style.height = ""; } };
  const grow = (el) => { el.style.height = ""; el.style.height = `${el.scrollHeight}px`; };
  return (
    <div className="flex gap-2 mt-2 items-start" style={{ fontFamily: SANS }}>
      <textarea ref={ref} rows={1} autoFocus={autoFocus} value={text} onChange={(e) => { setText(e.target.value); grow(e.target); }} placeholder={placeholder}
        className="flex-1 min-w-0 text-sm px-2 py-1 rounded bg-transparent resize-none" style={{ ...BORDER, lineHeight: 1.4 }}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
      <button onClick={send} className="text-sm px-3 py-1 rounded" style={BORDER}>Enviar</button>
    </div>
  );
}

// Hilo de comentarios: árbol por `parent`, renderizado plano con sangría por profundidad (tope visual de 4 niveles).
function Comments({ post: p, me, act }) {
  const [replyTo, setReplyTo] = useState(null);
  const byParent = useMemo(() => {
    const o = {};
    p.comments.forEach((c) => { const k = c.parent || "root"; (o[k] = o[k] || []).push(c); });
    Object.values(o).forEach((xs) => xs.sort((a, b) => a.t - b.t));
    return o;
  }, [p.comments]);
  const render = (parent, depth) => (byParent[parent] || []).flatMap((c) => [
    <Comment key={c.id} c={c} depth={depth} me={me} replying={replyTo === c.id}
      onReply={() => setReplyTo(replyTo === c.id ? null : c.id)}
      onSend={(text) => { act.addComment(p.id, text, c.id); setReplyTo(null); }}
      onRemove={() => act.removeComment(p.id, c.id)} />,
    ...render(c.id, depth + 1),
  ]);
  return (
    <div className="mt-4">
      {render("root", 0)}
      <CommentBox placeholder="Comentar…" onSend={(text) => act.addComment(p.id, text, null)} />
    </div>
  );
}

function Comment({ c, depth, me, replying, onReply, onSend, onRemove }) {
  const d = Math.min(depth, 4);
  return (
    <div className="py-2" style={{ borderTop: `1px solid ${C.line}`, marginLeft: d * 14, paddingLeft: d ? 10 : 0, borderLeft: d ? `2px solid ${C.line}` : "none" }}>
      <div className="flex gap-2 text-xs" style={{ fontFamily: SANS, color: C.muted }}>
        {!c.deleted && <span style={{ color: C.ink }}>{c.who}</span>}
        <span>{when(c.t)}</span>
        {!c.deleted && <button onClick={onReply} className="px-1 py-1 -my-1" style={{ textDecoration: "underline" }}>{replying ? "cancelar" : "responder"}</button>}
        {!c.deleted && c.uid === me.id && <button aria-label="Borrar comentario" title="Borrar comentario" onClick={onRemove} className="ml-auto px-2 py-1 -my-1" style={{ fontSize: 14 }}>×</button>}
      </div>
      {c.deleted ? <p className="leading-relaxed" style={{ fontSize: 15, color: C.muted, fontStyle: "italic" }}>comentario eliminado</p> : <Md text={c.text} size={15} />}
      {replying && <CommentBox autoFocus placeholder={`Responder a ${c.who}…`} onSend={onSend} />}
    </div>
  );
}

function PostCard({ post: p, me, byId, num, posts, rels, supports, orphan, open, onOpen, act }) {
  const [role, setRole] = useState(me.role);
  const [editing, setEditing] = useState(false);
  const [linking, setLinking] = useState(false);
  const isProj = p.kind === "proyecto";
  const own = p.author_id === me.id;
  const col = isProj ? C.accent : C.insight;
  const joined = p.interest.some((x) => x.id === me.id);
  const my = p.votes[me.id] || 0;
  const s = score(p), nc = alive(p);
  const short = (id) => { const t = byId[id]?.title || ""; return t.slice(0, 34) + (t.length > 34 ? "…" : ""); };
  const link = { fontFamily: SANS, textDecoration: "underline" };

  return (
    <li id={`post-${p.id}`} className="flex gap-3 py-4" style={{ borderBottom: `1px solid ${C.line}`, scrollMarginTop: 8 }}>
      <div className="flex flex-col items-center pt-1 select-none" style={{ fontFamily: SANS, width: 34 }}>
        <button aria-label="Votar a favor" onClick={() => act.vote(p.id, 1)} className="text-lg leading-none px-2 py-1" style={{ color: my === 1 ? C.up : C.muted }}>▲</button>
        <span className="text-sm font-semibold" style={{ color: s < 0 ? C.down : C.ink }}>{s}</span>
        <button aria-label="Votar en contra" onClick={() => act.vote(p.id, -1)} className="text-lg leading-none px-2 py-1" style={{ color: my === -1 ? C.down : C.muted }}>▼</button>
      </div>

      <div className="flex-1 min-w-0">
        {editing ? (
          <EditPost post={p} onCancel={() => setEditing(false)} onSave={async (f) => { if (await act.edit(p.id, f)) setEditing(false); }} />
        ) : (
          <>
            <button onClick={onOpen} className="text-left w-full">
              <h2 className="text-lg leading-snug" style={{ fontWeight: 500 }}>{p.title}</h2>
              {p.pitch && <p className="mt-1 leading-relaxed" style={{ color: C.muted, fontSize: 15 }}>{p.pitch}</p>}
            </button>
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs" style={{ fontFamily: SANS, color: C.muted }}>
              <span>#{num[p.id]}</span>
              <span style={{ color: col }}>{p.track}</span>
              <span>{p.author}</span>
              {isProj && <span>{p.interest.length} {p.interest.length === 1 ? "interesado" : "interesados"}</span>}
              {isProj && supports.length > 0 && <span style={{ color: C.insight }}>se apoya en {supports.length} {supports.length === 1 ? "insight" : "insights"}</span>}
              {orphan && <span style={{ color: C.warn }}>sin proyecto todavía</span>}
              {nc > 0 && <span>{nc} {nc === 1 ? "comentario" : "comentarios"}</span>}
              {p.url && <a href={p.url} target="_blank" rel="noreferrer" style={{ color: col, textDecoration: "underline" }}>fuente</a>}
            </div>
            {rels.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2" style={{ fontFamily: SANS }}>
                {rels.map((r) => {
                  const tk = byId[r.id].kind === "proyecto";
                  return <Chip key={r.label + r.id} color={tk ? C.accent : C.insight} soft={tk ? C.accentSoft : C.insightSoft} onClick={() => act.jump(r.id)}
                    onRemove={open ? () => act.removeLink(r.from, r.link) : null}>{r.label} #{num[r.id]}: {short(r.id)}</Chip>;
                })}
              </div>
            )}

            {open && (
              <div className="mt-3">
                <Md text={p.body} size={16} />

                {isProj && (
                  <div className="mt-4 p-3 rounded" style={{ background: C.card, ...BORDER, fontFamily: SANS }}>
                    <div className="text-sm mb-2">{p.interest.length === 0 ? "Nadie se sumó todavía." : p.interest.map((x) => `${x.name} (${x.role})`).join(", ")}</div>
                    <div className="flex flex-wrap gap-2 items-center">
                      {!joined && <ProfileInput value={role} onChange={setRole} className="flex-1 min-w-0 py-1" />}
                      <button onClick={() => role.trim() && act.toggleInterest(p.id, role.trim())} className="text-sm px-3 py-1 rounded" style={joined ? { ...BORDER, color: C.muted } : { background: C.accent, color: "#fff" }}>
                        {joined ? "Bajarme" : "Me sumaría"}
                      </button>
                    </div>
                  </div>
                )}

                <Comments post={p} me={me} act={act} />

                <div className="flex gap-2 mt-3 text-xs" style={{ color: C.muted }}>
                  <button onClick={() => setLinking(!linking)} className="px-1 py-1" style={link}>{linking ? "Cerrar" : "Vincular"}</button>
                  {own && <button onClick={() => setEditing(true)} className="px-1 py-1" style={link}>Editar</button>}
                  {own && <button onClick={() => { if (window.confirm("¿Eliminar este post para todos?")) act.remove(p.id); }} className="px-1 py-1" style={{ ...link, color: C.down }}>Eliminar</button>}
                </div>
                {linking && (
                  <div className="mt-2">
                    <LinkPicker kind={p.kind} posts={posts} num={num} exclude={[p.id, ...rels.map((r) => r.id)]} onAdd={async (l) => { if (await act.addLink(p.id, l)) setLinking(false); }} />
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </li>
  );
}

function Teams({ posts, onJump }) {
  const ranked = [...posts].sort((a, b) => b.interest.length - a.interest.length || score(b) - score(a));
  const people = {};
  posts.forEach((p) => p.interest.forEach((x) => { (people[x.name] = people[x.name] || []).push(p); }));
  const overbooked = Object.entries(people).filter(([, xs]) => xs.length > 1);
  return (
    <div className="pt-4">
      <p className="leading-relaxed mb-4" style={{ color: C.muted, fontSize: 15 }}>Equipos tentativos según quién se sumó a qué proyecto. Un equipo viable tiene 3 a 5 personas y cubre al menos dos perfiles distintos.</p>
      {ranked.length === 0 && <p className="text-sm" style={{ fontFamily: SANS, color: C.muted }}>Sin proyectos todavía.</p>}
      {ranked.map((p) => {
        // perfiles distintos entre los interesados, agrupando por texto normalizado
        const cover = p.interest.reduce((acc, x) => { const hit = acc.find((c) => same(c.r, x.role)); hit ? hit.n++ : acc.push({ r: x.role, n: 1 }); return acc; }, []);
        const n = p.interest.length;
        const viable = n >= 3 && n <= 5 && cover.length >= 2;
        const status = n === 0 ? "Sin gente todavía" : viable ? "Viable" : n > 5 ? `Demasiada gente (${n}/5): dividir o que algunos elijan otro` : n < 3 ? `Falta gente (${n}/3)` : "Falta otro perfil";
        return (
          <div key={p.id} className="py-4" style={{ borderBottom: `1px solid ${C.line}` }}>
            <button onClick={() => onJump(p.id)} className="text-left"><h3 className="leading-snug" style={{ fontSize: 17, fontWeight: 500 }}>{p.title}</h3></button>
            {cover.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2" style={{ fontFamily: SANS }}>
                {cover.map(({ r, n }) => <span key={r} className="text-xs px-2 py-0.5 rounded" style={{ background: C.accentSoft, color: C.accent }}>{r}{n > 1 ? ` ×${n}` : ""}</span>)}
              </div>
            )}
            <div className="mt-2 text-sm" style={{ fontFamily: SANS, color: viable ? C.up : n ? C.warn : C.muted }}>
              {status}{n > 0 && ` · ${p.interest.map((x) => x.name).join(", ")}`}
            </div>
          </div>
        );
      })}
      {overbooked.length > 0 && (
        <div className="mt-6 p-3 rounded text-sm" style={{ background: C.card, ...BORDER, fontFamily: SANS }}>
          <div className="font-semibold mb-1">Personas anotadas en más de un proyecto</div>
          {overbooked.map(([n, xs]) => <div key={n} style={{ color: C.muted }}>{n}: {xs.map((p) => p.title.slice(0, 30)).join(" / ")}</div>)}
          <div className="mt-2" style={{ color: C.muted }}>Cuando cierren los equipos, cada uno elige uno.</div>
        </div>
      )}
    </div>
  );
}

function NewPost({ posts, num, onSubmit }) {
  const [kind, setKind] = useState("proyecto");
  const [d, setD] = useState({ title: "", pitch: "", body: "", url: "", track: TRACKS[0], links: [] });
  const [sending, setSending] = useState(false);
  const isProj = kind === "proyecto";
  const col = isProj ? C.accent : C.insight;
  const ok = d.title.trim() && (isProj ? d.pitch.trim() : d.body.trim()) && !sending;
  const switchKind = (k) => { setKind(k); setD({ ...d, links: [] }); };
  const submit = async () => {
    setSending(true);
    try { await onSubmit({ ...d, kind, title: d.title.trim(), pitch: d.pitch.trim(), body: d.body.trim(), url: d.url.trim() }); }
    finally { setSending(false); }
  };

  return (
    <div className="pt-4 flex flex-col gap-3" style={{ fontFamily: SANS }}>
      <div className="flex rounded overflow-hidden self-start text-sm" style={BORDER}>
        {Object.entries(KINDS).map(([k, l]) => (
          <button key={k} onClick={() => switchKind(k)} className="px-4 py-2" style={{ background: kind === k ? (k === "proyecto" ? C.accent : C.insight) : "transparent", color: kind === k ? "#fff" : C.muted }}>{l}</button>
        ))}
      </div>
      <p className="text-sm -mt-1" style={{ color: C.muted }}>
        {isProj ? "Algo que un equipo puede entregar en tres días: harness, documento, ejercicio, set de preguntas." : "Una observación, hipótesis, pregunta o lectura. No forma equipo, pero puede informar proyectos."}
      </p>
      <PostFields kind={kind} d={d} setD={setD} />
      {posts.length > 0 && (
        <LinkPicker key={kind} kind={kind} posts={posts} num={num} exclude={d.links.map((l) => l.to)} onAdd={(l) => setD({ ...d, links: [...d.links, l] })} />
      )}
      {d.links.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {d.links.map((l, k) => (
            <Chip key={k} color={col} soft={isProj ? C.accentSoft : C.insightSoft} onRemove={() => setD({ ...d, links: d.links.filter((_, i) => i !== k) })}>{REL[l.type].label} #{num[l.to]}</Chip>
          ))}
        </div>
      )}
      <p className="text-xs -mt-1" style={{ color: C.muted }}>Después de publicar vas a poder editar el texto y agregar o quitar vínculos desde el post.</p>
      <button disabled={!ok} onClick={submit} className="self-start px-4 py-2 rounded text-sm font-semibold" style={{ background: ok ? col : C.line, color: ok ? "#fff" : C.muted }}>
        {sending ? "Publicando…" : `Publicar ${KINDS[kind].toLowerCase()}`}
      </button>
    </div>
  );
}
