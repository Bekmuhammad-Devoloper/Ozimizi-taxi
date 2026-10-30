/** @type {import('next').NextConfig} */

// Service-worker runtime caching. This REPLACES next-pwa's defaults, which
// cached /api/* and every other same-origin GET (incl. Socket.IO polling)
// with NetworkFirst + 10s timeout — on a slow link the app waited 10s and
// then showed stale data, which felt like a freeze.
const runtimeCaching = [
  {
    // Live data: always straight to the network, never cached.
    urlPattern: ({ url }) =>
      url.pathname.startsWith('/api/') ||
      url.pathname.startsWith('/socket.io/') ||
      url.pathname.startsWith('/uploads/'),
    handler: 'NetworkOnly',
  },
  {
    // Hashed build assets are immutable.
    urlPattern: /\/_next\/static\/.+/i,
    handler: 'CacheFirst',
    options: {
      cacheName: 'next-static',
      expiration: { maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60 },
    },
  },
  {
    urlPattern: /\.(?:png|jpe?g|webp|svg|gif|ico|woff2?|wav|mp3)$/i,
    handler: 'StaleWhileRevalidate',
    options: {
      cacheName: 'static-assets',
      expiration: { maxEntries: 100, maxAgeSeconds: 7 * 24 * 60 * 60 },
    },
  },
  {
    // Pages: network, with a short fallback to cache so the shell still
    // opens on a flaky connection.
    urlPattern: ({ request, url }) =>
      request.mode === 'navigate' && url.origin === self.origin,
    handler: 'NetworkFirst',
    options: {
      cacheName: 'pages',
      networkTimeoutSeconds: 3,
      expiration: { maxEntries: 32, maxAgeSeconds: 24 * 60 * 60 },
    },
  },
];

const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  runtimeCaching,
  // Default true reloads the page whenever the network flaps — on mobile
  // data that looks like random freezes.
  reloadOnOnline: false,
  cacheOnFrontEndNav: false,
});

module.exports = withPWA({
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost', port: '3001', pathname: '/uploads/**' },
      { protocol: 'http', hostname: '**' },
      { protocol: 'https', hostname: '**' },
    ],
  },
});
