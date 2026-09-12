// Avisos con la pestaña abierta. Cuando la pestaña no está a la vista, el título cuenta las novedades y, si el usuario
// activó los avisos, el navegador muestra una notificación por cada una. Con la pestaña al frente no hace nada: los
// cambios ya aparecen en la página. Nada de Supabase: recibe los eventos que calcula `changes` (export.js).
import { useState, useEffect, useRef } from "react";

const KEY = "baiswarm:avisos"; // "1" activados, "0" rechazados o silenciados; ausente: todavía no eligió
const supported = typeof Notification !== "undefined"; // iOS Safari no la tiene salvo como app instalada
const away = () => document.hidden || !document.hasFocus();

// título de cada aviso; el cuerpo es el título del post
export const describe = (e) => ({
  post: `Nuevo ${e.post.kind} de ${e.who}`,
  comment: `${e.who} comentó tu ${e.post.kind}`,
  reply: `${e.who} te respondió`,
  interest: `${e.who} se sumó a tu proyecto`,
})[e.kind];

// Chrome en Android no permite `new Notification` desde la página: hace falta un service worker (public/sw.js), que solo
// muestra la notificación y avisa el clic; no intercepta pedidos ni cachea nada.
const worker = async () => {
  if (!("serviceWorker" in navigator)) return null;
  try { await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`); return await navigator.serviceWorker.ready; }
  catch { return null; }
};

// `name`: título base de la pestaña. `onOpen(postId)`: qué hacer al hacer clic en un aviso (ir al post).
// Devuelve `state`: "no" (sin API), "blocked" (prohibido en el navegador), "ask" (sin decidir), "off", "on".
export function useNotify(name, onOpen) {
  const [pref, setPref] = useState(() => { try { return localStorage.getItem(KEY); } catch { return null; } });
  const [unseen, setUnseen] = useState(0);
  const openRef = useRef(onOpen); openRef.current = onOpen;
  const state = !supported ? "no" : Notification.permission === "denied" ? "blocked" : pref === "1" && Notification.permission === "granted" ? "on" : pref === "0" ? "off" : "ask";
  const save = (v) => { try { localStorage.setItem(KEY, v); } catch {} setPref(v); };

  const show = async (title, body, id, tag) => {
    const opts = { body, tag, data: { id } };
    try { const n = new Notification(title, opts); n.onclick = () => { window.focus(); if (id) openRef.current(id); n.close(); }; }
    catch { const w = await worker(); if (w) w.showNotification(title, opts).catch(() => {}); }
  };
  const enable = async () => {
    if (!supported) return;
    if ((await Notification.requestPermission()) !== "granted") { save("0"); return; }
    save("1");
    show(name, "Avisos activados. Te avisamos cuando comenten tus posts, te respondan o alguien se sume a tu proyecto.", null, "hola");
  };
  const disable = () => save("0");

  useEffect(() => { document.title = unseen ? `(${unseen}) ${name}` : name; }, [unseen, name]);
  // volver a la pestaña limpia el contador
  useEffect(() => {
    const clear = () => { if (!away()) setUnseen(0); };
    document.addEventListener("visibilitychange", clear); window.addEventListener("focus", clear);
    return () => { document.removeEventListener("visibilitychange", clear); window.removeEventListener("focus", clear); };
  }, []);
  // clic en un aviso mostrado por el service worker
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const h = (e) => e.data?.open && openRef.current(e.data.open);
    navigator.serviceWorker.addEventListener("message", h);
    return () => navigator.serviceWorker.removeEventListener("message", h);
  }, []);

  const push = (events) => {
    if (!events.length || !away()) return;
    setUnseen((n) => n + events.length);
    if (state === "on") events.forEach((e) => show(describe(e), e.post.title, e.post.id, e.tag));
  };
  return { state, enable, disable, push };
}
