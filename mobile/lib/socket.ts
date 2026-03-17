import { io, Socket } from 'socket.io-client';
import { appConfig } from './config';
import { tokenStorage } from './auth';

export const EventType = {
  NOTIFICATION_PUSH: 'notification:push',
  NOTIFICATION_READ: 'notification:read',
  DATA_UPDATE: 'data:update',
  AUTHENTICATED: 'authenticated',
  UNAUTHORIZED: 'unauthorized',
} as const;

let socket: Socket | null = null;
let connectionAttempt = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

export async function connectSocket(): Promise<Socket | null> {
  if (socket?.connected) return socket;

  const token = await tokenStorage.getAccessToken();
  if (!token) return null;

  try {
    socket = io(appConfig.apiBaseUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
      reconnectionDelay: 1000,
      timeout: 10000,
    });

    socket.on('connect', () => {
      connectionAttempt = 0;
    });

    socket.on('unauthorized', () => {
      disconnectSocket();
    });

    socket.on('disconnect', (reason) => {
      if (reason === 'io server disconnect') {
        // Server kicked us, don't auto-reconnect
        socket = null;
      }
    });

    return socket;
  } catch {
    return null;
  }
}

export function disconnectSocket(): void {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}

export function getSocket(): Socket | null {
  return socket;
}

export function onSocketEvent(event: string, callback: (data: unknown) => void): () => void {
  if (!socket) return () => {};
  socket.on(event, callback);
  return () => {
    socket?.off(event, callback);
  };
}
