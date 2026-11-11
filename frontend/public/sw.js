const CACHE = "sams-workspace-v4";
const FILES = [
  "/login",
  "/login.html",
  "/examiner.html",
  "/student.html",
  "/admin.html",
  "/css/styles.css",
  "/icon.svg",
  "/manifest.webmanifest",
  ...[
    "api",
    "common",
    "login",
    "offline",
    "register-offline",
    "examiner",
    "student",
    "admin",
  ].map((name) => "/js/" + name + ".js"),
];
self.addEventListener("install", (event) =>
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(FILES))
      .then(() => self.skipWaiting()),
  ),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("sams-") && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  ),
);
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/")
  )
    return;
  if (event.request.mode === "navigate") {
    const page = url.pathname.startsWith("/examiner/report/")
      ? "/admin.html"
      : url.pathname.startsWith("/examiner")
        ? "/examiner.html"
        : url.pathname.startsWith("/student")
          ? "/student.html"
          : url.pathname.startsWith("/admin")
            ? "/admin.html"
            : "/login.html";
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match(page, { ignoreVary: true }),
      ),
    );
    return;
  }
  event.respondWith(
    caches
      .match(event.request, { ignoreVary: true })
      .then((saved) => saved || fetch(event.request)),
  );
});
