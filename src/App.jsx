import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { configured, loadAll, savePost, mutate, deletePost, subscribe, norm, loadProfile, saveProfile as persistProfile, clearProfile } from "./storage.js";

// ── Identidad ───────────────────────────────────────────────────────────────
const NAME = "BAISWARM";
const TAGLINE = "Buenos Aires Safety War Room";
const SPRINT = "2026-09-11T00:00:00-03:00"; // hora de Buenos Aires
const SPRINT_URL = "https://apartresearch.com/sprints/ai-incident-response-sprint-2026-09-11-to-2026-09-13";

// ── Paleta y tipografía (cambiá acá para matchear la web de BAISH) ──────────
const C = {
  paper: "#F7F7F4", card: "#FFFFFF", ink: "#1B2230", muted: "#66707F", line: "#E1E3E6",
  accent: "#125D8C", accentSoft: "#E4EEF5",       // proyectos
  insight: "#7A5C1E", insightSoft: "#F5EEDC",     // insights
  up: "#3F7D4F", down: "#A8503F", warn: "#B7791F",
};
const SERIF = "'Iowan Old Style','Palatino Linotype','Charter',Georgia,serif";
const SANS = "-apple-system,'Inter','Segoe UI',Roboto,sans-serif";
const FIELD = { border: `1px solid ${C.line}`, background: C.card, width: "100%", fontFamily: SERIF, fontSize: 16 };
const BORDER = { border: `1px solid ${C.line}` };

// Sugerencias de perfil. El campo es libre: sirven para autocompletar, no para encasillar.
const PROFILE_HINTS = ["Interpretabilidad", "ML / entrenamiento", "Seguridad informática", "Infra / DevOps", "Policy / regulación", "Forecasting", "Derecho", "Economía", "Escritura / comunicación", "Diseño / producto", "Organización / coordinación"];
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

export default function App() {
  const [me, setMe] = useState(() => loadProfile());
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState("proyecto");
  const [sort, setSort] = useState("score");
  const [track, setTrack] = useState("Todos");
  const [open, setOpen] = useState(null);
  const busy = useRef(false), again = useRef(false), scrollTo = useRef(null);

  const refresh = useCallback(async () => {
    if (busy.current) { again.current = true; return; } // llegó un cambio durante una recarga: repetir al terminar
    busy.current = true;
    try { setPosts(await loadAll()); setErr(""); }
    catch (e) { setErr(e.message || "No pude leer el foro. Probá actualizar."); }
    finally { busy.current = false; setLoading(false); if (again.current) { again.current = false; refresh(); } }
  }, []);

  useEffect(() => {
    if (!configured) { setLoading(false); return; }
    refresh();
    let t = null;
    const unsub = subscribe(() => { clearTimeout(t); t = setTimeout(refresh, 300); });
    const poll = setInterval(refresh, 60000); // red de seguridad si realtime no llega
    return () => { clearTimeout(t); clearInterval(poll); unsub(); };
  }, [refresh]);

  // después de saltar a un post, scrollear hasta él cuando esté renderizado
  useEffect(() => {
    if (!scrollTo.current) return;
    const el = document.getElementById(`post-${scrollTo.current}`);
    if (el) { el.scrollIntoView({ behavior: "smooth", block: "start" }); scrollTo.current = null; }
  }, [open, tab, track]);

  const apply = (u) => setPosts((xs) => xs.map((p) => (p.id === u.id ? u : p)));
  const run = async (pr) => { try { await pr; setErr(""); return true; } catch (e) { setErr(e.message || "Algo falló, actualizá y probá de nuevo."); refresh(); return false; } };
  const change = (id, fn) => run(mutate(id, fn).then(apply));

  const act = {
    vote: (id, dir) => change(id, (p) => { const v = { ...p.votes }; v[me.name] === dir ? delete v[me.name] : (v[me.name] = dir); return { ...p, votes: v }; }),
    toggleInterest: (id, role) => change(id, (p) => {
      const has = p.interest.some((x) => x.name === me.name);
      return { ...p, interest: has ? p.interest.filter((x) => x.name !== me.name) : [...p.interest, { name: me.name, role }] };
    }),
    addComment: (id, text, parent = null) => change(id, (p) => ({ ...p, comments: [...p.comments, { id: newId(), who: me.name, text, t: Date.now(), parent }] })),
    // con respuestas se marca eliminado para no romper el hilo; sin respuestas se borra
    removeComment: (id, cid) => change(id, (p) => {
      const own = (c) => c.id === cid && c.who === me.name;
      return p.comments.some((c) => c.parent === cid)
        ? { ...p, comments: p.comments.map((c) => (own(c) ? { ...c, text: "", deleted: true } : c)) }
        : { ...p, comments: p.comments.filter((c) => !own(c)) };
    }),
    edit: (id, fields) => change(id, (p) => ({ ...p, ...fields })),
    addLink: (id, l) => change(id, (p) => (p.links.some((x) => x.to === l.to && x.type === l.type) ? p : { ...p, links: [...p.links, l] })),
    removeLink: (id, l) => change(id, (p) => ({ ...p, links: p.links.filter((x) => !(x.to === l.to && x.type === l.type)) })),
    remove: (id) => run(deletePost(id).then(() => setPosts((xs) => xs.filter((p) => p.id !== id)))),
    jump: (id) => { const p = byId[id]; if (p) { setTab(p.kind); setTrack("Todos"); setOpen(id); scrollTo.current = id; } },
  };
  const addPost = (draft) => {
    const p = norm({ ...draft, id: newId(), author: me.name, t: Date.now(), votes: { [me.name]: 1 },
      interest: draft.kind === "proyecto" ? [{ name: me.name, role: me.role }] : [] });
    return run(savePost(p).then((s) => { setPosts((xs) => [s, ...xs]); setTab(s.kind); setOpen(s.id); }));
  };
  const saveProfile = (p) => { persistProfile(p); setMe(p); };
  const changeProfile = () => { clearProfile(); setMe(null); };

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

  const shown = useMemo(() => {
    const f = posts.filter((p) => p.kind === tab && (track === "Todos" || p.track === track));
    return sort === "score" ? [...f].sort((a, b) => score(b) - score(a) || b.t - a.t) : [...f].sort((a, b) => b.t - a.t);
  }, [posts, tab, sort, track]);
  const nProj = posts.filter((p) => p.kind === "proyecto").length, nIns = posts.length - nProj;
  const days = daysTo(SPRINT);
  const isFeed = tab === "proyecto" || tab === "insight";

  return (
    <div style={{ background: C.paper, color: C.ink, minHeight: "100vh", fontFamily: SERIF }}>
      <datalist id="perfiles">{PROFILE_HINTS.map((h) => <option key={h} value={h} />)}</datalist>
      <div className="max-w-2xl mx-auto px-4 pb-16">
        <header className="pt-6 pb-4" style={{ borderBottom: `1px solid ${C.line}` }}>
          <div className="flex items-baseline justify-between gap-3" style={{ fontFamily: SANS }}>
            <span className="text-sm" style={{ color: C.muted }}>{TAGLINE}</span>
            <span className="text-sm flex items-center gap-2" style={{ color: C.muted }}>
              <a href={SPRINT_URL} target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>
                {days > 0 ? `El sprint arranca en ${days} ${days === 1 ? "día" : "días"}` : "Sprint en curso"}
              </a>
              <button onClick={refresh} title="Actualizar" aria-label="Actualizar" className="px-1" style={{ color: C.muted }}>↻</button>
            </span>
          </div>
          <h1 className="text-3xl mt-1 leading-tight" style={{ fontWeight: 600, letterSpacing: "-0.01em", color: C.accent }}>{NAME}</h1>
          <p className="mt-2 text-base leading-relaxed" style={{ color: C.muted }}>
            Nuestro message board para el <a href={SPRINT_URL} target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>AI Incident Response Sprint</a> de Apart y CeSIA. Los proyectos son lo que vamos a construir; los insights son lo que sabemos, sospechamos o leímos y que debería informarlos.
          </p>
          <nav className="flex gap-1 mt-4 -mb-px items-center overflow-x-auto" style={{ fontFamily: SANS }}>
            {[["proyecto", `Proyectos (${nProj})`], ["insight", `Insights (${nIns})`], ["equipos", "Equipos"], ["nuevo", "Publicar"]].map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} className="px-3 py-2 text-sm whitespace-nowrap"
                style={{ borderBottom: `2px solid ${tab === k ? (k === "insight" ? C.insight : C.accent) : "transparent"}`, color: tab === k ? (k === "insight" ? C.insight : C.accent) : C.muted, fontWeight: tab === k ? 600 : 400 }}>{l}</button>
            ))}
          </nav>
        </header>

        {!configured && (
          <div className="mt-6 p-4 rounded text-sm leading-relaxed" style={{ background: C.card, ...BORDER, fontFamily: SANS }}>
            Falta configurar Supabase. Copiá <code>.env.example</code> a <code>.env</code>, completá la URL y la anon key del proyecto, y reiniciá el servidor. Los pasos completos están en el README.
          </div>
        )}
        {configured && !me && <NameGate onSave={saveProfile} />}
        {err && <div className="mt-3 text-sm px-3 py-2 rounded" style={{ fontFamily: SANS, background: "#FBEEEC", color: C.down }}>{err}</div>}

        {me && isFeed && (
          <>
            <div className="flex flex-wrap gap-2 items-center py-3 text-sm" style={{ fontFamily: SANS }}>
              <select value={track} onChange={(e) => setTrack(e.target.value)} className="px-2 py-1 rounded bg-transparent" style={{ ...BORDER, color: C.ink }}>
                {["Todos", ...TRACKS].map((t) => <option key={t}>{t}</option>)}
              </select>
              <span className="ml-auto flex gap-3" style={{ color: C.muted }}>
                {[["score", "Más votados"], ["new", "Recientes"]].map(([k, l]) => (
                  <button key={k} onClick={() => setSort(k)} style={{ color: sort === k ? C.ink : C.muted, textDecoration: sort === k ? "underline" : "none" }}>{l}</button>
                ))}
              </span>
            </div>
            {loading && <p className="py-6 text-sm" style={{ fontFamily: SANS, color: C.muted }}>Cargando…</p>}
            {!loading && shown.length === 0 && (
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

        {me && (
          <p className="mt-10 text-xs leading-relaxed" style={{ fontFamily: SANS, color: C.muted }}>
            Participás como <b>{me.name}</b> · {me.role} · <button onClick={changeProfile} style={{ textDecoration: "underline" }}>cambiar</button>. Todo lo que publicás acá lo ve el resto del grupo. Los cambios de los demás aparecen solos.
          </p>
        )}
      </div>
    </div>
  );
}

// Campo de perfil con autocompletado desde el datalist "perfiles" (definido una vez en App).
function ProfileInput({ value, onChange, className = "", ...rest }) {
  return <input list="perfiles" value={value} onChange={(e) => onChange(e.target.value)} maxLength={40} placeholder="perfil: interp, infra, policy, escritura…"
    className={`text-sm px-3 rounded ${className}`} style={BORDER} {...rest} />;
}

function NameGate({ onSave }) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const ok = name.trim().length >= 2 && role.trim().length >= 2;
  const save = () => ok && onSave({ name: name.trim().replace(/\s+/g, " "), role: role.trim() });
  return (
    <div className="mt-6 p-4 rounded" style={{ background: C.card, ...BORDER, fontFamily: SANS }}>
      <p className="text-sm mb-3" style={{ color: C.muted }}>Para votar, publicar y sumarte a proyectos, elegí un nombre de usuario y contá en pocas palabras qué perfil aportás. Queda guardado en este navegador.</p>
      <div className="flex flex-wrap gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="nombre de usuario" maxLength={30} className="flex-1 min-w-0 text-sm px-3 py-2 rounded" style={BORDER}
          onKeyDown={(e) => { if (e.key === "Enter") save(); }} />
        <ProfileInput value={role} onChange={setRole} className="flex-1 min-w-0 py-2" onKeyDown={(e) => { if (e.key === "Enter") save(); }} />
        <button disabled={!ok} onClick={save} className="text-sm px-4 py-2 rounded font-semibold" style={{ background: ok ? C.accent : C.line, color: ok ? "#fff" : C.muted }}>Entrar</button>
      </div>
    </div>
  );
}

// Etiqueta de vínculo. Sin onClick es solo informativa; con onRemove muestra una × para quitarlo.
function Chip({ color, soft, onClick, onRemove, children }) {
  return (
    <span className="inline-flex items-center rounded-full text-xs" style={{ background: soft, color }}>
      <button onClick={onClick} disabled={!onClick} className="px-2 py-0.5 text-left">{children}</button>
      {onRemove && <button aria-label="Quitar vínculo" title="Quitar vínculo" onClick={onRemove} className="pr-2 py-0.5 leading-none">×</button>}
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

function CommentBox({ placeholder, onSend, autoFocus }) {
  const [text, setText] = useState("");
  const send = () => { if (text.trim()) { onSend(text.trim()); setText(""); } };
  return (
    <div className="flex gap-2 mt-2" style={{ fontFamily: SANS }}>
      <input autoFocus={autoFocus} value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} className="flex-1 min-w-0 text-sm px-2 py-1 rounded bg-transparent" style={BORDER}
        onKeyDown={(e) => { if (e.key === "Enter") send(); }} />
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
        {!c.deleted && <button onClick={onReply} style={{ textDecoration: "underline" }}>{replying ? "cancelar" : "responder"}</button>}
        {!c.deleted && c.who === me.name && <button aria-label="Borrar comentario" title="Borrar comentario" onClick={onRemove} className="ml-auto px-1">×</button>}
      </div>
      <p className="leading-relaxed whitespace-pre-wrap" style={{ fontSize: 15, color: c.deleted ? C.muted : C.ink, fontStyle: c.deleted ? "italic" : "normal" }}>{c.deleted ? "comentario eliminado" : c.text}</p>
      {replying && <CommentBox autoFocus placeholder={`Responder a ${c.who}…`} onSend={onSend} />}
    </div>
  );
}

function PostCard({ post: p, me, byId, num, posts, rels, supports, orphan, open, onOpen, act }) {
  const [role, setRole] = useState(me.role);
  const [editing, setEditing] = useState(false);
  const [linking, setLinking] = useState(false);
  const isProj = p.kind === "proyecto";
  const own = p.author === me.name;
  const col = isProj ? C.accent : C.insight;
  const joined = p.interest.some((x) => x.name === me.name);
  const my = p.votes[me.name] || 0;
  const s = score(p), nc = alive(p);
  const short = (id) => { const t = byId[id]?.title || ""; return t.slice(0, 34) + (t.length > 34 ? "…" : ""); };
  const link = { fontFamily: SANS, textDecoration: "underline" };

  return (
    <li id={`post-${p.id}`} className="flex gap-3 py-4" style={{ borderBottom: `1px solid ${C.line}`, scrollMarginTop: 8 }}>
      <div className="flex flex-col items-center pt-1 select-none" style={{ fontFamily: SANS, width: 34 }}>
        <button aria-label="Votar a favor" onClick={() => act.vote(p.id, 1)} className="text-lg leading-none" style={{ color: my === 1 ? C.up : C.muted }}>▲</button>
        <span className="text-sm font-semibold my-1" style={{ color: s < 0 ? C.down : C.ink }}>{s}</span>
        <button aria-label="Votar en contra" onClick={() => act.vote(p.id, -1)} className="text-lg leading-none" style={{ color: my === -1 ? C.down : C.muted }}>▼</button>
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
                <p className="leading-relaxed whitespace-pre-wrap" style={{ fontSize: 16 }}>{p.body}</p>

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

                <div className="flex gap-3 mt-4 text-xs" style={{ color: C.muted }}>
                  <button onClick={() => setLinking(!linking)} style={link}>{linking ? "Cerrar" : "Vincular"}</button>
                  {own && <button onClick={() => setEditing(true)} style={link}>Editar</button>}
                  {own && <button onClick={() => { if (window.confirm("¿Eliminar este post para todos?")) act.remove(p.id); }} style={{ ...link, color: C.down }}>Eliminar</button>}
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
