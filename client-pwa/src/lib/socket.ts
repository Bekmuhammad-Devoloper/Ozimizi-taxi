'use client';
import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;
let lastToken: string | null = null;

export function getSocket(token: string): Socket {
  const url = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001';
  if (socket && socket.connected && lastToken === token) return socket;
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
  lastToken = token;
  socket = io(url + '/clients', {
    auth: { token },
    transports: ['websocket', 'polling'],
    tryAllTransports: true,
    upgrade: true,
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1500,
    reconnectionDelayMax: 10_000,
    timeout: 8000,
  });
  socket.on('disconnect', (reason) => {
    if (reason === 'io server disconnect') {
      socket?.removeAllListeners();
      socket = null;
      lastToken = null;
    }
  });
  socket.on('connect_error', () => {
    /* reconnection handles it */
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
