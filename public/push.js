self.addEventListener("push", (event) => {
  let p = { title: "دوامي", body: "عندك إشعار جديد", url: "/" };
  try {
    p = { ...p, ...event.data.json() };
  } catch {}
  event.waitUntil(
    self.registration.showNotification(p.title, {
      body: p.body,
      icon: "/icon.svg",
      data: { url: p.url },
    }),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(
    event.notification.data?.url || "/",
    self.location.origin,
  );
  if (url.origin !== self.location.origin) return;
  event.waitUntil(self.clients.openWindow(url.href));
});
