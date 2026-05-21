'use client';
import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;
let lastToken: string | null = null;

export function getSocket(token: string): Socket {
  const url = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001';
  // Reuse if connected with same token
  if (socket && socket.connected && lastToken === token) return socket;
  // Clean up previous socket to avoid leaking connections
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
  lastToken = token;
  socket = io(url + '/drivers', {
    auth: { token },
    // Default Socket.IO behavior: start with HTTP long-polling, then upgrade
    // to WebSocket. Avoids noisy "WebSocket failed" errors when WS upgrade
    // is unavailable; client still gets real-time once upgraded.
    transports: ['polling', 'websocket'],
    upgrade: true,
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1500,
    reconnectionDelayMax: 10_000,
    timeout: 8000,
  });
  socket.on('disconnect', (reason) => {
    if (reason === 'io server disconnect') {
      // Server rejected (most likely auth) — don't keep retrying
      socket?.removeAllListeners();
      socket = null;
      lastToken = null;
    }
  });
  // Silently log connect_error to debug, but don't spam
  socket.on('connect_error', () => {
    /* handled by reconnection settings */
  });
  return socket;
}

export function disconnectSocket() {
  if (!socket) return;
  socket.removeAllListeners();
  socket.disconnect();
  socket = null;
  lastToken = null;
}
