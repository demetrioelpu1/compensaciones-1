/* ============================================================
   Service Worker · Catastro Eléctrico
   ------------------------------------------------------------
   Dos responsabilidades:
   1) Interceptar el envío que hace el sistema operativo cuando el
      usuario comparte un archivo desde WhatsApp (u otra app) hacia
      "Catastro Eléctrico", guardarlo temporalmente en el
      dispositivo (Cache API) y redirigir a la app para que lo
      procese.
   2) Servir las teselas del mapa base (imágenes) desde la caché
      cuando ya se descargaron antes (ver TileCacheService en
      index.html) y no hay internet — así el mapa se sigue viendo
      en campo sin señal.
   No requiere ningún servidor: todo ocurre localmente en el
   celular.
   ============================================================ */

const SHARE_CACHE = 'catastro-share-cache-v1';

// Mismo nombre que usa TileCacheService en index.html — ambos leen
// y escriben en la misma caja de Cache Storage.
const TILE_CACHE = 'cmp-map-tiles-v1';
const TILE_HOSTS = ['tile.openstreetmap.org', 'server.arcgisonline.com'];

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  const isShareTarget =
    event.request.method === 'POST' && url.pathname.endsWith('share-target.html');

  if (isShareTarget) {
    event.respondWith(handleShareTarget(event));
    return;
  }

  const isMapTile = event.request.method === 'GET' && TILE_HOSTS.includes(url.hostname);
  if (isMapTile) {
    event.respondWith(handleTileRequest(event.request));
  }
});

// Estrategia "primero la caché": las teselas del mapa casi no
// cambian, así que si ya la tenemos guardada la servimos directo
// (funciona sin internet). Si no está guardada, se pide por
// internet y, si responde bien, se guarda de una vez — así
// cualquier zona que el técnico visite estando en línea queda
// disponible después aunque no la haya "descargado" a propósito.
async function handleTileRequest(request) {
  const cache = await caches.open(TILE_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response && (response.ok || response.type === 'opaque')) {
    cache.put(request, response.clone());
  }
  return response;
}

async function handleShareTarget(event) {
  try {
    const formData = await event.request.formData();
    const files = formData.getAll('gis_files');
    const cache = await caches.open(SHARE_CACHE);

    // Limpiamos entregas anteriores para no acumular archivos viejos
    const oldKeys = await cache.keys();
    await Promise.all(oldKeys.map((req) => cache.delete(req)));

    const manifest = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!(file instanceof File)) continue;
      const key = `/__shared-file-${i}`;
      await cache.put(key, new Response(file));
      manifest.push({ key, name: file.name, type: file.type });
    }

    await cache.put(
      '/__shared-manifest',
      new Response(JSON.stringify(manifest), { headers: { 'Content-Type': 'application/json' } })
    );

    return Response.redirect('./index.html?shared=1', 303);
  } catch (err) {
    return Response.redirect('./index.html?sharedError=1', 303);
  }
}
