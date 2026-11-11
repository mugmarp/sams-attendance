import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react";
function offlineShell(): Plugin {
  return {
    name: "sams-offline-shell",
    apply: "build",
    generateBundle(_options, bundle) {
      const files = [
        "/",
        "/index.html",
        "/icon.svg",
        "/manifest.webmanifest",
        ...Object.keys(bundle)
          .filter((f) => !f.endsWith(".map"))
          .map((f) => "/" + f),
      ];
      const version = "sams-v2-" + Object.keys(bundle).join("-");
      this.emitFile({
        type: "asset",
        fileName: "sw.js",
        source: `
const CACHE = ${JSON.stringify(version)};
const FILES = ${JSON.stringify(files)};
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES))); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('sams-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (event.request.mode === 'navigate') { event.respondWith(fetch(event.request).catch(() => caches.match('/index.html'))); return; }
  event.respondWith(caches.match(event.request, { ignoreVary: true }).then(hit => hit || fetch(event.request)));
});`,
      });
    },
  };
}
export default defineConfig({
  plugins: [react(), offlineShell()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.API_PROXY_TARGET || "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.API_PROXY_TARGET || "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
