// Service worker do app instalado (PWA). Só guarda os arquivos do próprio
// site: a Edge Function, Google Fonts e cdnjs passam direto pela rede.
// Ao trocar um asset (ícone, imagem), suba a versão de CACHE. O index.html
// não precisa: é buscado sempre na rede primeiro.
var CACHE = "cobom-v1";
var ARQUIVOS = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "assets/favicon-cbmmg.png",
  "assets/logo_cobom-128.png",
  "assets/luiz-eduardo.png",
  "assets/icons/icon-96.png",
  "assets/icons/icon-192.png",
  "assets/icons/icon-512.png",
  "assets/icons/icon-maskable-512.png",
  "assets/icons/apple-touch-icon-180.png"
];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ARQUIVOS); }));
  self.skipWaiting();
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (nomes) {
      return Promise.all(nomes.filter(function (n) { return n !== CACHE; })
        .map(function (n) { return caches.delete(n); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;

  // Página: rede primeiro (atualização entra na hora); cache se cair a rede.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).then(function (res) {
        var copia = res.clone();
        if (res.ok) caches.open(CACHE).then(function (c) { c.put("index.html", copia); });
        return res;
      }).catch(function () {
        return caches.match("index.html");
      })
    );
    return;
  }

  // Demais arquivos do site: cache primeiro.
  e.respondWith(
    caches.match(req).then(function (hit) { return hit || fetch(req); })
  );
});
