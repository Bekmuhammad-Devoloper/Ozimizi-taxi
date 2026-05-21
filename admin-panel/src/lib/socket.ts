'use client';
import { io, Socket } from 'socket.io-client';
import Cookies from 'js-cookie';

let socket: Socket | null = null;

export function getAdminSocket(): Socket | null {
  if (typeof window === 'undefined') return null;
  if (socket && socket.connected) return socket;
  const token = Cookies.get('admin_token');
  if (!token) return null;
  const url = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001';
  socket = io(url + '/admin', {
    auth: { token },
    transports: ['websocket'],
  });
  return socket;
}
