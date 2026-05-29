/** @type {import('next').NextConfig} */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

// Derive image hosts from the configured backend URL so we don't have to
// keep a wildcard remotePattern in production. Falls back to localhost in dev.
const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
let apiHost = 'localhost';
let apiProtocol = 'http';
let apiPort = '3001';
try {
  const u = new URL(apiUrl);
  apiHost = u.hostname;
  apiProtocol = u.protocol.replace(':', '');
  apiPort = u.port || '';
} catch (_) {
  /* keep defaults */
}

module.exports = {
  reactStrictMode: true,
  basePath,
  // Ensure links and assets honor basePath
  assetPrefix: basePath || undefined,
  images: {
    remotePatterns: [
      {
        protocol: apiProtocol,
        hostname: apiHost,
        ...(apiPort ? { port: apiPort } : {}),
        pathname: '/uploads/**',
      },
      // Local dev convenience — uploads served by Nest on port 3001.
      { protocol: 'http', hostname: 'localhost', port: '3001', pathname: '/uploads/**' },
    ],
  },
};
