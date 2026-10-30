/** @type {import('next').NextConfig} */
const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';

// Same runtime caching policy as the driver app: live data never cached.
const runtimeCaching = [
  {
    urlPattern: ({ url }) =>
      url.pathname.startsWith('/api/') ||
      url.pathname.startsWith('/socket.io/') ||
      url.pathname.startsWith('/uploads/') ||
      url.hostname.endsWith('openstreetmap.org'),
    handler: 'NetworkOnly',
  },
  {
    urlPattern: /\/_next\/static\/.+/i,
    handler: 'CacheFirst',
    options: { cacheName: 'next-static', expiration: { maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60 } },
  },
  {
    urlPattern: /\.(?:png|jpe?g|webp|svg|gif|ico|woff2?)$/i,
    handler: 'StaleWhileRevalidate',
    options: { cacheName: 'static-assets', expiration: { maxEntries: 100, maxAgeSeconds: 7 * 24 * 60 * 60 } },
  },
  {
    urlPattern: ({ request, url }) => request.mode === 'navigate' && url.origin === self.origin,
    handler: 'NetworkFirst',
    options: { cacheName: 'pages', networkTimeoutSeconds: 3, expiration: { maxEntries: 32, maxAgeSeconds: 24 * 60 * 60 } },
  },
];

const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  runtimeCaching,
  reloadOnOnline: false,
  cacheOnFrontEndNav: false,
});

module.exports = withPWA({
  reactStrictMode: true,
  basePath: BASE,
  assetPrefix: BASE || undefined,
  images: {
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost', port: '3001', pathname: '/uploads/**' },
      { protocol: 'http', hostname: '**' },
      { protocol: 'https', hostname: '**' },
    ],
  },
});
