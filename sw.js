/* ============================================================
   Service Worker · Catastro Eléctrico
   ------------------------------------------------------------
   Responsabilidad única: interceptar el envío que hace el
   sistema operativo cuando el usuario comparte un archivo desde
   WhatsApp (u otra app) hacia "Catastro Eléctrico", guardarlo
   temporalmente en el dispositivo (Cache API) y redirigir a la
   app para que lo procese. No requiere ningún servidor: todo
   ocurre localmente en el celular.
   ============================================================ */

const SHARE_CACHE = 'catastro-share-cache-v1';

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
  }
});

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
