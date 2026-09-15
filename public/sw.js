/**
 * Service Worker - TPM Autoelevadores (v2)
 *
 * Estrategia de Caché y Offline:
 * 1. Precache estático (App Shell, manifest, iconos)
 * 2. Next.js Static Assets (/_next/static/...): Cache First con almacenamiento en tiempo de ejecución.
 *    Los assets estáticos con hash de contenido son inmutables por compilación.
 * 3. Navegación HTML (event.request.mode === 'navigate'): Network First con fallback a caché de páginas
 *    y fallback final al App Shell ('/') para arranque en frío (Cold Start) offline.
 * 4. Seguridad: Bypasses explícitos para Supabase, API privada, peticiones no-GET, Webpack HMR y auth.
 * 5. Ciclo de vida y versionado: Limpieza automática de versiones obsoletas en 'activate' y claim inmediato.
 */

const CACHE_VERSION = 'v2';
const STATIC_CACHE_NAME = `tpm-static-${CACHE_VERSION}`;
const NEXT_STATIC_CACHE_NAME = `tpm-next-static-${CACHE_VERSION}`;
const PAGES_CACHE_NAME = `tpm-pages-${CACHE_VERSION}`;

// Lista de cachés válidos para esta versión
const CURRENT_CACHES = [
  STATIC_CACHE_NAME,
  NEXT_STATIC_CACHE_NAME,
  PAGES_CACHE_NAME,
];

// Recursos mínimos indispensables para el App Shell offline
const PRECACHE_ASSETS = [
  '/',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-192.svg',
  '/icon-512.svg',
];

// Instalación: precachea el App Shell y activa inmediatamente
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME).then(async (cache) => {
      for (const asset of PRECACHE_ASSETS) {
        try {
          await cache.add(asset);
        } catch (err) {
          console.warn('[SW] Precache omitido o fallido para:', asset, err);
        }
      }
    })
  );
  self.skipWaiting();
});

// Activación: purga cachés de versiones viejas y toma control inmediato de clientes
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (!CURRENT_CACHES.includes(key)) {
            console.log('[SW] Purgando caché obsoleta:', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Intercepción de solicitudes de red
self.addEventListener('fetch', (event) => {
  // 1. Ignorar cualquier método que no sea GET (ej. RPCs, subidas de fotos, mutaciones)
  if (event.request.method !== 'GET') {
    return;
  }

  const url = new URL(event.request.url);

  // 2. EXCLUSIÓN DE SEGURIDAD ESTRICTA:
  // Nunca interceptar ni cachear llamadas a Supabase (auth, rest, storage, rpc)
  if (
    url.hostname.includes('supabase.co') ||
    url.pathname.includes('/auth/v1/') ||
    url.pathname.includes('/rest/v1/') ||
    url.pathname.includes('/storage/v1/')
  ) {
    return;
  }

  // 3. EXCLUSIÓN DE API PRIVADA:
  // Rutas internas de API de Next.js
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // 4. EXCLUSIÓN DE ENTORNO DE DESARROLLO / WEBPACK:
  if (url.pathname.includes('webpack') || url.pathname.includes('hot-update')) {
    return;
  }

  // 5. RECURSOS ESTÁTICOS DE NEXT.JS (/_next/static/...):
  // Chunks JS, CSS y fuentes versionadas con content-hash inmutable.
  // Estrategia: Cache First con fallback de red y guardado en tiempo de ejecución.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }

        return fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const responseClone = networkResponse.clone();
              caches.open(NEXT_STATIC_CACHE_NAME).then((cache) => {
                cache.put(event.request, responseClone);
              });
            }
            return networkResponse;
          })
          .catch(() => {
            return new Response('', { status: 408, statusText: 'Offline Asset Unavailable' });
          });
      })
    );
    return;
  }

  // 6. NAVEGACIÓN HTML (event.request.mode === 'navigate'):
  // Estrategia: Network First.
  // Si hay red: devuelve respuesta fresca del servidor y actualiza la caché de páginas.
  // Si no hay red: devuelve la página en caché si fue visitada, o el App Shell ('/') como fallback.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(PAGES_CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(async () => {
          // Intentar la página exacta en caché
          const cachedPage = await caches.match(event.request);
          if (cachedPage) {
            return cachedPage;
          }

          // Fallback al App Shell precacheado para que el cliente Next.js tome el control
          const appShell = await caches.match('/');
          if (appShell) {
            return appShell;
          }

          return new Response(
            '<!DOCTYPE html><html><head><meta charset="utf-8"><title>TPM Autoelevadores - Offline</title></head><body style="font-family:sans-serif;background:#090d16;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;"><div style="text-align:center;padding:20px;"><h2>Modo sin conexión</h2><p>Abra la aplicación con internet para cargar el sistema de planta.</p></div></body></html>',
            {
              status: 503,
              headers: { 'Content-Type': 'text/html; charset=utf-8' },
            }
          );
        })
    );
    return;
  }

  // 7. OTROS RECURSOS ESTÁTICOS PROPIOS (Iconos, imágenes públicas, manifest):
  // Estrategia: Cache First con fallback de red y guardado en STATIC_CACHE_NAME.
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(STATIC_CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          return new Response('', { status: 408, statusText: 'Offline' });
        });
    })
  );
});
