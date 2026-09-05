import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { configured, loadAll, savePost, mutate, deletePost, subscribe, norm, loadProfile, saveProfile as persistProfile } from "./storage.js";

// ── Identidad ───────────────────────────────────────────────────────────────
const NAME = "BAISWARM";
const TAGLINE = "Buenos Aires Safety War Room";
const SPRINT = "2026-09-11";

// ── Paleta y tipografía (cambiá acá para matchear la web de BAISH) ──────────
const C = {
  paper: "#F7F7F4", card: "#FFFFFF", ink: "#1B2230", muted: "#66707F", line: "#E1E3E6",
  accent: "#125D8C", accentSoft: "#E4EEF5",       // proyectos
  insight: "#7A5C1E", insightSoft: "#F5EEDC",     // insights
  up: "#3F7D4F", down: "#A8503F", warn: "#B7791F",
};
const SERIF = "'Iowan Old Style','Palatino Linotype','Charter',Georgia,serif";
const SANS = "-apple-system,'Inter','Segoe UI',Roboto,sans-serif";

const ROLES = ["ML/interp", "Seguridad", "Policy", "Forecasting"];
const TRACKS = ["Contención", "Detección", "Forecasting", "Regulación", "Tabletop", "General"];
const KINDS = { proyecto: "Proyecto", insight: "Insight" };
// vínculos permitidos según tipo de origen → tipo de destino
const REL = {
  informa:     { label: "informa a",       from: "insight",  to: "proyecto" },
  relacionada: { label: "relacionada con", from: "insight",  to: "insight" },
  apoya:       { label: "se apoya en",     from: "proyecto", to: "insight" },
  deriva:      { label: "deriva de",       from: "proyecto", to: "proyecto" },
  compite:     { label: "compite con",     from: "proyecto", to: "proyecto" },
};

const daysTo = (d) => Math.max(0, Math.ceil((new Date(d) - new Date()) / 86400000));
const score = (p) => Object.values(p.votes).reduce((a, b) => a + b, 0);

export default function App() {
  const [me, setMe] = useState(() => loadProfile());
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState("proyecto");
  const [sort, setSort] = useState("score");
  const [track, setTrack] = useState("Todos");
  const [open, setOpen] = useState(null);
  const busy = useRef(false);

  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try { setPosts(await loadAll()); setErr(""); }
    catch { setErr("No pude leer el foro. Probá actualizar."); }
    finally { busy.current = false; setLoading(false); }
  }, []);

  useEffect(() => {
    if (!configured) { setLoading(false); return; }
    refresh();
    let t = null;
    const unsub = subscribe(() => { clearTimeout(t); t = setTimeout(refresh, 300); });
    return () => { clearTimeout(t); unsub(); };
  }, [refresh]);

  const apply = (u) => setPosts((xs) => xs.map((p) => (p.id === u.id ? u : p)));
  const run = async (pr) => { try { await pr; setErr(""); return true; } catch (e) { setErr(e.message || "Algo falló, actualizá y probá de nuevo."); refresh(); return false; } };

  const vote = (id, dir) => run(mutate(id, (p) => {
    const v = { ...p.votes }; v[me.name] === dir ? delete v[me.name] : (v[me.name] = dir); return { ...p, votes: v };
  }).then(apply));
  const toggleInterest = (id, role) => run(mutate(id, (p) => {
    const has = p.interest.some((x) => x.name === me.name);
    return { ...p, interest: has ? p.interest.filter((x) => x.name !== me.name) : [...p.interest, { name: me.name, role }] };
  }).then(apply));
  const addComment = (id, text) => run(mutate(id, (p) => ({ ...p, comments: [...p.comments, { who: me.name, text, t: Date.now() }] })).then(apply));
  const addPost = (draft) => {
    const p = norm({ ...draft, id: Date.now().toString(36), author: me.name, t: Date.now(), votes: { [me.name]: 1 },
      interest: draft.kind === "proyecto" ? [{ name: me.name, role: me.role }] : [] });
    return run(savePost(p).then((s) => { setPosts((xs) => [s, ...xs]); setTab(s.kind); setOpen(s.id); }));
  };
  const removePost = (id) => run(deletePost(id).then(() => setPosts((xs) => xs.filter((p) => p.id !== id))));
  const saveProfile = (p) => { persistProfile(p); setMe(p); };

  const byId = useMemo(() => Object.fromEntries(posts.map((p) => [p.id, p])), [posts]);
  const num = useMemo(() => { const o = {}; [...posts].sort((a, b) => a.t - b.t).forEach((p, k) => (o[p.id] = k + 1)); return o; }, [posts]);
  // insights que respaldan cada proyecto: los que declaran "informa a" + los que el proyecto declara "se apoya en"
  const supports = useMemo(() => {
    const o = {};
    posts.forEach((p) => {
      if (p.kind === "insight") p.links.forEach((l) => l.type === "informa" && byId[l.to] && (o[l.to] = o[l.to] || new Set()).add(p.id));
      if (p.kind === "proyecto") p.links.forEach((l) => l.type === "apoya" && byId[l.to] && (o[p.id] = o[p.id] || new Set()).add(l.to));
    });
    return Object.fromEntries(Object.entries(o).map(([k, s]) => [k, [...s]]));
  }, [posts, byId]);
  const linkedInsights = useMemo(() => new Set(Object.values(supports).flat()), [supports]);

  const jump = (id) => { const p = byId[id]; if (p) { setTab(p.kind); setOpen(id); } };

  const shown = useMemo(() => {
    const f = posts.filter((p) => p.kind === tab && (track === "Todos" || p.track === track));
    return sort === "score" ? [...f].sort((a, b) => score(b) - score(a) || b.t - a.t) : [...f].sort((a, b) => b.t - a.t);
  }, [posts, tab, sort, track]);
  const nProj = posts.filter((p) => p.kind === "proyecto").length, nIns = posts.length - nProj;
  const days = daysTo(SPRINT);
  const isFeed = tab === "proyecto" || tab === "insight";

  return (
    <div style={{ background: C.paper, color: C.ink, minHeight: "100vh", fontFamily: SERIF }}>
      <div className="max-w-2xl mx-auto px-4 pb-16">
        <header className="pt-6 pb-4" style={{ borderBottom: `1px solid ${C.line}` }}>
          <div className="flex items-baseline justify-between gap-3" style={{ fontFamily: SANS }}>
            <span className="text-sm" style={{ color: C.muted }}>{TAGLINE}</span>
            <span className="text-sm flex items-center gap-2" style={{ color: C.muted }}>
              {days > 0 ? `El sprint arranca en ${days} ${days === 1 ? "día" : "días"}` : "Sprint en curso"}
              <button onClick={refresh} title="Actualizar" aria-label="Actualizar" className="px-1" style={{ color: C.muted }}>↻</button>
            </span>
          </div>
          <h1 className="text-3xl mt-1 leading-tight" style={{ fontWeight: 600, letterSpacing: "-0.01em", color: C.accent }}>{NAME}</h1>
          <p className="mt-2 text-base leading-relaxed" style={{ color: C.muted }}>
            Nuestro message board para el AI Incident Response Sprint de Apart y CeSIA. Los proyectos son lo que vamos a construir; los insights son lo que sabemos, sospechamos o leímos y que debería informarlos.
          </p>
          <nav className="flex gap-1 mt-4 -mb-px items-center overflow-x-auto" style={{ fontFamily: SANS }}>
            {[["proyecto", `Proyectos (${nProj})`], ["insight", `Insights (${nIns})`], ["equipos", "Equipos"], ["nuevo", "Publicar"]].map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} className="px-3 py-2 text-sm whitespace-nowrap"
                style={{ borderBottom: `2px solid ${tab === k ? (k === "insight" ? C.insight : C.accent) : "transparent"}`, color: tab === k ? (k === "insight" ? C.insight : C.accent) : C.muted, fontWeight: tab === k ? 600 : 400 }}>{l}</button>
            ))}
          </nav>
        </header>

        {!configured && (
          <div className="mt-6 p-4 rounded text-sm leading-relaxed" style={{ background: C.card, border: `1px solid ${C.line}`, fontFamily: SANS }}>
            Falta configurar Supabase. Copiá <code>.env.example</code> a <code>.env</code>, completá la URL y la anon key del proyecto, y reiniciá el servidor. Los pasos completos están en el README.
          </div>
        )}
        {configured && !me && <NameGate onSave={saveProfile} />}
        {err && <div className="mt-3 text-sm px-3 py-2 rounded" style={{ fontFamily: SANS, background: "#FBEEEC", color: C.down }}>{err}</div>}

        {me && isFeed && (
          <>
            <div className="flex flex-wrap gap-2 items-center py-3 text-sm" style={{ fontFamily: SANS }}>
              <select value={track} onChange={(e) => setTrack(e.target.value)} className="px-2 py-1 rounded bg-transparent" style={{ border: `1px solid ${C.line}`, color: C.ink }}>
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
                <PostCard key={p.id} post={p} me={me} byId={byId} num={num} supports={supports[p.id] || []} orphan={p.kind === "insight" && !linkedInsights.has(p.id)}
                  open={open === p.id} onOpen={() => setOpen(open === p.id ? null : p.id)}
                  onVote={(d) => vote(p.id, d)} onInterest={(r) => toggleInterest(p.id, r)} onComment={(t) => addComment(p.id, t)}
                  onJump={jump} onRemove={() => removePost(p.id)} />
              ))}
            </ul>
          </>
        )}

        {me && tab === "equipos" && <Teams posts={posts.filter((p) => p.kind === "proyecto")} onJump={jump} />}
        {me && tab === "nuevo" && <NewPost posts={posts} num={num} onSubmit={addPost} />}

        {me && (
          <p className="mt-10 text-xs leading-relaxed" style={{ fontFamily: SANS, color: C.muted }}>
            Participás como {me.name} ({me.role}) · <button onClick={() => setMe(null)} style={{ textDecoration: "underline" }}>cambiar</button>. Todo lo que publicás acá lo ve el resto del grupo. Los cambios de los demás aparecen solos.
          </p>
        )}
      </div>
    </div>
  );
}

function NameGate({ onSave }) {
  const [name, setName] = useState("");
  const [role, setRole] = useState(ROLES[0]);
  const ok = name.trim().length >= 2;
  return (
    <div className="mt-6 p-4 rounded" style={{ background: C.card, border: `1px solid ${C.line}`, fontFamily: SANS }}>
      <p className="text-sm mb-3" style={{ color: C.muted }}>Para votar, publicar y sumarte a proyectos, decinos quién sos. Queda guardado en este navegador.</p>
      <div className="flex flex-wrap gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre" className="flex-1 min-w-0 text-sm px-3 py-2 rounded" style={{ border: `1px solid ${C.line}` }}
          onKeyDown={(e) => { if (e.key === "Enter" && ok) onSave({ name: name.trim(), role }); }} />
        <select value={role} onChange={(e) => setRole(e.target.value)} className="text-sm px-2 py-2 rounded bg-transparent" style={{ border: `1px solid ${C.line}` }}>
          {ROLES.map((r) => <option key={r}>{r}</option>)}
        </select>
        <button disabled={!ok} onClick={() => onSave({ name: name.trim(), role })} className="text-sm px-4 py-2 rounded font-semibold" style={{ background: ok ? C.accent : C.line, color: ok ? "#fff" : C.muted }}>Entrar</button>
      </div>
    </div>
  );
}

function Chip({ color, soft, onClick, children }) {
  return <button onClick={onClick} className="text-xs px-2 py-0.5 rounded-full text-left" style={{ background: soft, color }}>{children}</button>;
}

function PostCard({ post: p, me, byId, num, supports, orphan, open, onOpen, onVote, onInterest, onComment, onJump, onRemove }) {
  const [text, setText] = useState("");
  const [role, setRole] = useState(me.role);
  const isProj = p.kind === "proyecto";
  const col = isProj ? C.accent : C.insight, soft = isProj ? C.accentSoft : C.insightSoft;
  const mine = p.interest.some((x) => x.name === me.name);
  const my = p.votes[me.name] || 0;
  const s = score(p);
  const short = (id) => { const t = byId[id]?.title || ""; return t.slice(0, 34) + (t.length > 34 ? "…" : ""); };

  return (
    <li className="flex gap-3 py-4" style={{ borderBottom: `1px solid ${C.line}` }}>
      <div className="flex flex-col items-center pt-1 select-none" style={{ fontFamily: SANS, width: 34 }}>
        <button aria-label="Votar a favor" onClick={() => onVote(1)} className="text-lg leading-none" style={{ color: my === 1 ? C.up : C.muted }}>▲</button>
        <span className="text-sm font-semibold my-1" style={{ color: s < 0 ? C.down : C.ink }}>{s}</span>
        <button aria-label="Votar en contra" onClick={() => onVote(-1)} className="text-lg leading-none" style={{ color: my === -1 ? C.down : C.muted }}>▼</button>
      </div>

      <div className="flex-1 min-w-0">
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
          {p.comments.length > 0 && <span>{p.comments.length} comentarios</span>}
          {p.url && <a href={p.url} target="_blank" rel="noreferrer" style={{ color: col, textDecoration: "underline" }}>fuente</a>}
        </div>
        {p.links.some((l) => byId[l.to]) && (
          <div className="flex flex-wrap gap-1 mt-2" style={{ fontFamily: SANS }}>
            {p.links.filter((l) => byId[l.to]).map((l, k) => {
              const tk = byId[l.to].kind === "proyecto";
              return <Chip key={k} color={tk ? C.accent : C.insight} soft={tk ? C.accentSoft : C.insightSoft} onClick={() => onJump(l.to)}>{REL[l.type]?.label} #{num[l.to]}: {short(l.to)}</Chip>;
            })}
          </div>
        )}

        {open && (
          <div className="mt-3">
            <p className="leading-relaxed whitespace-pre-wrap" style={{ fontSize: 16 }}>{p.body}</p>

            {isProj && supports.length > 0 && (
              <div className="mt-4" style={{ fontFamily: SANS }}>
                <div className="text-xs mb-1" style={{ color: C.muted }}>Insights que lo respaldan</div>
                <div className="flex flex-wrap gap-1">
                  {supports.map((id) => <Chip key={id} color={C.insight} soft={C.insightSoft} onClick={() => onJump(id)}>#{num[id]}: {short(id)}</Chip>)}
                </div>
              </div>
            )}

            {isProj && (
              <div className="mt-4 p-3 rounded" style={{ background: C.card, border: `1px solid ${C.line}`, fontFamily: SANS }}>
                <div className="text-sm mb-2">{p.interest.length === 0 ? "Nadie se sumó todavía." : p.interest.map((x) => `${x.name} (${x.role})`).join(", ")}</div>
                <div className="flex gap-2 items-center">
                  {!mine && (
                    <select value={role} onChange={(e) => setRole(e.target.value)} className="text-sm px-2 py-1 rounded bg-transparent" style={{ border: `1px solid ${C.line}` }}>
                      {ROLES.map((r) => <option key={r}>{r}</option>)}
                    </select>
                  )}
                  <button onClick={() => onInterest(role)} className="text-sm px-3 py-1 rounded" style={mine ? { border: `1px solid ${C.line}`, color: C.muted } : { background: C.accent, color: "#fff" }}>
                    {mine ? "Bajarme" : "Me sumaría"}
                  </button>
                </div>
              </div>
            )}

            <div className="mt-4">
              {p.comments.map((c, k) => (
                <div key={k} className="py-2" style={{ borderTop: `1px solid ${C.line}` }}>
                  <span className="text-xs" style={{ fontFamily: SANS, color: C.muted }}>{c.who}</span>
                  <p className="leading-relaxed" style={{ fontSize: 15 }}>{c.text}</p>
                </div>
              ))}
              <div className="flex gap-2 mt-2" style={{ fontFamily: SANS }}>
                <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Comentar…" className="flex-1 text-sm px-2 py-1 rounded bg-transparent" style={{ border: `1px solid ${C.line}` }}
                  onKeyDown={(e) => { if (e.key === "Enter" && text.trim()) { onComment(text.trim()); setText(""); } }} />
                <button onClick={() => { if (text.trim()) { onComment(text.trim()); setText(""); } }} className="text-sm px-3 py-1 rounded" style={{ border: `1px solid ${C.line}` }}>Enviar</button>
              </div>
            </div>
            {p.author === me.name && (
              <button onClick={() => { if (window.confirm("¿Eliminar este post para todos?")) onRemove(); }} className="mt-4 text-xs" style={{ fontFamily: SANS, color: C.down }}>Eliminar</button>
            )}
          </div>
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
      <p className="leading-relaxed mb-4" style={{ color: C.muted, fontSize: 15 }}>Equipos tentativos según quién se sumó a qué proyecto. Un equipo viable tiene 3 a 5 personas y cubre al menos dos perfiles.</p>
      {ranked.length === 0 && <p className="text-sm" style={{ fontFamily: SANS, color: C.muted }}>Sin proyectos todavía.</p>}
      {ranked.map((p) => {
        const cover = ROLES.map((r) => ({ r, n: p.interest.filter((x) => x.role === r).length }));
        const viable = p.interest.length >= 3 && cover.filter((c) => c.n > 0).length >= 2;
        return (
          <div key={p.id} className="py-4" style={{ borderBottom: `1px solid ${C.line}` }}>
            <button onClick={() => onJump(p.id)} className="text-left"><h3 className="leading-snug" style={{ fontSize: 17, fontWeight: 500 }}>{p.title}</h3></button>
            <div className="flex flex-wrap gap-2 mt-2" style={{ fontFamily: SANS }}>
              {cover.map(({ r, n }) => (
                <span key={r} className="text-xs px-2 py-0.5 rounded" style={{ background: n ? C.accentSoft : "transparent", color: n ? C.accent : C.muted, border: `1px solid ${n ? C.accentSoft : C.line}` }}>{r}{n ? ` ×${n}` : ""}</span>
              ))}
            </div>
            <div className="mt-2 text-sm" style={{ fontFamily: SANS, color: viable ? C.up : p.interest.length ? C.warn : C.muted }}>
              {p.interest.length === 0 ? "Sin gente todavía" : viable ? `Viable · ${p.interest.map((x) => x.name).join(", ")}` : `Falta gente (${p.interest.length}/3) · ${p.interest.map((x) => x.name).join(", ")}`}
            </div>
          </div>
        );
      })}
      {overbooked.length > 0 && (
        <div className="mt-6 p-3 rounded text-sm" style={{ background: C.card, border: `1px solid ${C.line}`, fontFamily: SANS }}>
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
  const [linkType, setLinkType] = useState("");
  const [linkTo, setLinkTo] = useState("");
  const [sending, setSending] = useState(false);
  const isProj = kind === "proyecto";
  const col = isProj ? C.accent : C.insight;
  const relOpts = Object.entries(REL).filter(([, r]) => r.from === kind);
  const targets = linkType ? posts.filter((p) => p.kind === REL[linkType].to) : [];
  const ok = d.title.trim() && (isProj ? d.pitch.trim() : d.body.trim()) && !sending;
  const field = { border: `1px solid ${C.line}`, background: C.card, width: "100%", fontFamily: SERIF, fontSize: 16 };
  const switchKind = (k) => { setKind(k); setLinkType(""); setLinkTo(""); setD({ ...d, links: [] }); };

  return (
    <div className="pt-4 flex flex-col gap-3" style={{ fontFamily: SANS }}>
      <div className="flex rounded overflow-hidden self-start text-sm" style={{ border: `1px solid ${C.line}` }}>
        {Object.entries(KINDS).map(([k, l]) => (
          <button key={k} onClick={() => switchKind(k)} className="px-4 py-2" style={{ background: kind === k ? (k === "proyecto" ? C.accent : C.insight) : "transparent", color: kind === k ? "#fff" : C.muted }}>{l}</button>
        ))}
      </div>
      <p className="text-sm -mt-1" style={{ color: C.muted }}>
        {isProj ? "Algo que un equipo puede entregar en tres días: harness, documento, ejercicio, set de preguntas." : "Una observación, hipótesis, pregunta o lectura. No forma equipo, pero puede informar proyectos."}
      </p>
      <input value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} placeholder={isProj ? "Título: qué vamos a construir" : "Título: la idea en una frase"} className="px-3 py-2 rounded" style={field} />
      {isProj && <input value={d.pitch} onChange={(e) => setD({ ...d, pitch: e.target.value })} placeholder="Una línea: por qué importa y qué entregable sale" className="px-3 py-2 rounded" style={field} />}
      <textarea value={d.body} onChange={(e) => setD({ ...d, body: e.target.value })} rows={5}
        placeholder={isProj ? "Detalle: método, datos, qué se puede hacer en 3 días, qué perfiles hacen falta" : "Desarrollo: qué observaste, por qué importa, qué proyecto podría salir de acá"} className="px-3 py-2 rounded" style={field} />
      {!isProj && <input value={d.url} onChange={(e) => setD({ ...d, url: e.target.value })} placeholder="Link a la fuente (opcional)" className="px-3 py-2 rounded" style={{ ...field, fontFamily: SANS, fontSize: 14 }} />}
      <div className="flex gap-2 items-center text-sm">
        <span style={{ color: C.muted }}>Track</span>
        <select value={d.track} onChange={(e) => setD({ ...d, track: e.target.value })} className="px-2 py-1 rounded bg-transparent" style={{ border: `1px solid ${C.line}` }}>
          {TRACKS.map((t) => <option key={t}>{t}</option>)}
        </select>
      </div>
      {posts.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center text-sm">
          <select value={linkType} onChange={(e) => { setLinkType(e.target.value); setLinkTo(""); }} className="px-2 py-1 rounded bg-transparent" style={{ border: `1px solid ${C.line}` }}>
            <option value="">vincular…</option>
            {relOpts.map(([k, r]) => <option key={k} value={k}>{r.label}</option>)}
          </select>
          {linkType && (
            <select value={linkTo} onChange={(e) => setLinkTo(e.target.value)} className="px-2 py-1 rounded bg-transparent flex-1 min-w-0" style={{ border: `1px solid ${C.line}` }}>
              <option value="">{targets.length ? `${KINDS[REL[linkType].to].toLowerCase()}…` : `no hay ${KINDS[REL[linkType].to].toLowerCase()}s aún`}</option>
              {targets.map((p) => <option key={p.id} value={p.id}>#{num[p.id]} {p.title.slice(0, 40)}</option>)}
            </select>
          )}
          <button disabled={!linkTo} onClick={() => { setD({ ...d, links: [...d.links, { to: linkTo, type: linkType }] }); setLinkTo(""); }} className="px-3 py-1 rounded" style={{ border: `1px solid ${C.line}`, opacity: linkTo ? 1 : 0.5 }}>Agregar</button>
        </div>
      )}
      {d.links.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {d.links.map((l, k) => <span key={k} className="text-xs px-2 py-0.5 rounded-full" style={{ background: isProj ? C.accentSoft : C.insightSoft, color: col }}>{REL[l.type].label} #{num[l.to]}</span>)}
        </div>
      )}
      <button disabled={!ok} onClick={async () => { setSending(true); try { await onSubmit({ ...d, kind }); } finally { setSending(false); } }} className="self-start px-4 py-2 rounded text-sm font-semibold" style={{ background: ok ? col : C.line, color: ok ? "#fff" : C.muted }}>
        {sending ? "Publicando…" : `Publicar ${KINDS[kind].toLowerCase()}`}
      </button>
    </div>
  );
}
