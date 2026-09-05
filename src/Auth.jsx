// Identidad: sugerencias de perfil, campo de perfil, entrada / registro y pie con la sesión.
import { useState } from "react";
import { auth, MIN_PASSWORD } from "./storage.js";
import { C, SANS, BORDER } from "./theme.js";

// Sugerencias de perfil. El campo es libre: sirven para autocompletar, no para encasillar.
export const PROFILE_HINTS = ["Interpretabilidad", "ML / entrenamiento", "Seguridad informática", "Infra / DevOps", "Policy / regulación", "Forecasting", "Derecho", "Economía", "Escritura / comunicación", "Diseño / producto", "Organización / coordinación"];

// Campo de perfil con autocompletado desde el datalist "perfiles" (definido una vez en App).
export function ProfileInput({ value, onChange, className = "", ...rest }) {
  return <input list="perfiles" value={value} onChange={(e) => onChange(e.target.value)} maxLength={40} placeholder="perfil: interp, infra, policy, escritura…"
    className={`text-sm px-3 rounded ${className}`} style={BORDER} {...rest} />;
}

// Entrar o crear cuenta. El código de invitación se valida en la base; sin él no hay registro.
export function AuthGate({ onDone }) {
  const [mode, setMode] = useState("login");
  const [f, setF] = useState({ username: "", password: "", role: "", invite: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const signup = mode === "signup";
  const set = (k) => (e) => setF({ ...f, [k]: k === "username" ? e.target.value.toLowerCase() : e.target.value });
  const ok = f.username.trim().length >= 2 && f.password.length >= MIN_PASSWORD && (!signup || (f.role.trim().length >= 2 && f.invite.trim().length > 0));
  const go = async () => {
    if (!ok || busy) return;
    setBusy(true); setErr("");
    try { onDone(await (signup ? auth.signUp(f) : auth.signIn(f))); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };
  const onKey = (e) => { if (e.key === "Enter") go(); };
  const input = "flex-1 min-w-0 text-sm px-3 py-2 rounded";
  return (
    <div className="mt-6 p-4 rounded" style={{ background: C.card, ...BORDER, fontFamily: SANS }}>
      <div className="flex gap-1 mb-3 text-sm">
        {[["login", "Ya tengo cuenta"], ["signup", "Crear cuenta"]].map(([k, l]) => (
          <button key={k} onClick={() => { setMode(k); setErr(""); }} className="px-3 py-1.5 rounded" style={mode === k ? { background: C.accent, color: "#fff" } : { ...BORDER, color: C.muted }}>{l}</button>
        ))}
      </div>
      <p className="text-sm mb-3" style={{ color: C.muted }}>
        {signup ? "Elegí un nombre de usuario y una contraseña, contá en pocas palabras qué perfil aportás y pegá el código de invitación que te pasaron con el link." : "Entrá con tu usuario y contraseña. La sesión queda en este navegador."}
      </p>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <input value={f.username} onChange={set("username")} placeholder="nombre de usuario" autoComplete="username" autoCapitalize="none" maxLength={24} className={input} style={BORDER} onKeyDown={onKey} />
          <input type="password" value={f.password} onChange={set("password")} placeholder={signup ? `contraseña, ${MIN_PASSWORD} o más` : "contraseña"} autoComplete={signup ? "new-password" : "current-password"} className={input} style={BORDER} onKeyDown={onKey} />
        </div>
        {signup && (
          <div className="flex flex-wrap gap-2">
            <ProfileInput value={f.role} onChange={(v) => setF({ ...f, role: v })} className="flex-1 min-w-0 py-2" onKeyDown={onKey} />
            <input value={f.invite} onChange={set("invite")} placeholder="código de invitación" autoCapitalize="none" autoComplete="off" className={input} style={BORDER} onKeyDown={onKey} />
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <button disabled={!ok || busy} onClick={go} className="text-sm px-4 py-2 rounded font-semibold" style={{ background: ok ? C.accent : C.line, color: ok ? "#fff" : C.muted }}>{busy ? "Un momento…" : signup ? "Registrarme" : "Entrar"}</button>
          {err && <span className="text-sm" role="alert" style={{ color: C.down }}>{err}</span>}
        </div>
        {signup && <p className="text-xs" style={{ color: C.muted }}>No hay recuperación de contraseña por mail: si la olvidás, pedile a quien administra el foro que te la cambie.</p>}
      </div>
    </div>
  );
}

export function Footer({ me, onRole, onSignOut }) {
  const [editing, setEditing] = useState(false);
  const [role, setRole] = useState(me.role);
  return (
    <div className="mt-10 text-xs leading-relaxed" style={{ fontFamily: SANS, color: C.muted }}>
      <p>
        Participás como <b>{me.name}</b>{me.role ? ` · ${me.role}` : ""} · <button onClick={() => { setRole(me.role); setEditing(!editing); }} className="py-1" style={{ textDecoration: "underline" }}>cambiar perfil</button> · <button onClick={onSignOut} className="py-1" style={{ textDecoration: "underline" }}>salir</button>. Todo lo que publicás acá lo ve el resto del grupo. Los cambios de los demás aparecen solos.
      </p>
      {editing && (
        <div className="flex flex-wrap gap-2 mt-2">
          <ProfileInput value={role} onChange={setRole} className="flex-1 min-w-0 py-1" />
          <button onClick={async () => { if (await onRole(role)) setEditing(false); }} className="px-3 py-1 rounded" style={{ background: C.accent, color: "#fff" }}>Guardar</button>
        </div>
      )}
    </div>
  );
}
