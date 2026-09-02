// Service Worker — cacheia somente a "casca" (shell) do app para abrir rápido
// e funcionar offline. NUNCA cacheia respostas da API/Supabase: agenda e
// reservas sempre dependem da rede, para nunca gerar conflito de dados
// (ver seção 31 do briefing).

const CACHE_NAME = "jetski-agenda-shell-v1";

const SHELL_FILES = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/config.js",
  "./js/supabaseClient.js",
  "./js/state.js",
  "./js/api.js",
  "./js/ui.js",
  "./js/app.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./offline.html"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Nunca interceptar chamadas para o Supabase (API, auth, realtime, storage).
  // Essas sempre precisam ir direto para a rede.
  if (url.hostname.endsWith("supabase.co") || url.hostname.endsWith("supabase.in")) {
    return;
  }

  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match("./offline.html"));
    })
  );
});
