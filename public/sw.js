// Service worker mínimo: existe solo para mostrar avisos en navegadores que no permiten `new Notification` desde la
// página (Chrome en Android). No tiene handler de fetch, así que no intercepta pedidos ni cachea nada: un deploy nuevo
// se ve igual con o sin él. Al hacer clic en un aviso enfoca la pestaña del foro y le manda el id del post.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
    const c = cs.find((x) => "focus" in x);
    if (!c) return self.clients.openWindow(self.registration.scope);
    c.postMessage({ open: e.notification.data?.id });
    return c.focus();
  }));
});
