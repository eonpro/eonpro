'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { isBrowser, getLocalStorageItem } from '@/lib/utils/ssr-safe';

// ============================================================================
// Types
// ============================================================================

export type WebSocketStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface WebSocketOptions {
  /** Auto-connect on mount (default: true) */
  autoConnect?: boolean;
  /** Reconnection attempts (default: 5) */
  reconnectionAttempts?: number;
  /** Reconnection delay in ms (default: 1000) */
  reconnectionDelay?: number;
  /** Events to subscribe to */
  events?: string[];
}

export interface WebSocketState {
  status: WebSocketStatus;
  error: string | null;
  isConnected: boolean;
}

// Event types matching the server-side websocket.ts
export const EventType = {
  // Notifications
  NOTIFICATION_PUSH: 'notification:push',
  NOTIFICATION_READ: 'notification:read',
  NOTIFICATION_CLEAR: 'notification:clear',
  
  // User presence
  USER_ONLINE: 'user:online',
  USER_OFFLINE: 'user:offline',
  
  // Data updates
  DATA_UPDATE: 'data:update',
  DATA_DELETE: 'data:delete',
  
  // System
  SYSTEM_ALERT: 'system:alert',
  AUTHENTICATED: 'authenticated',
  UNAUTHORIZED: 'unauthorized',
} as const;

type EventHandler = (data: unknown) => void;

// ============================================================================
// Hook
// ============================================================================

export function useWebSocket(options: WebSocketOptions = {}) {
  const {
    autoConnect = true,
    reconnectionAttempts = 5,
    reconnectionDelay = 1000,
    events = [],
  } = options;

  const [state, setState] = useState<WebSocketState>({
    status: 'disconnected',
    error: null,
    isConnected: false,
  });

  const socketRef = useRef<Socket | null>(null);
  const eventHandlersRef = useRef<Map<string, Set<EventHandler>>>(new Map());

  // Connect to WebSocket server
  const connect = useCallback(() => {
    if (!isBrowser) return;
    if (socketRef.current?.connected) return;

    // Skip WebSocket on Vercel (serverless doesn't support persistent connections)
    const isVercel = typeof window !== 'undefined' && 
      (window.location.hostname.includes('.vercel.app') || 
       window.location.hostname.includes('eonpro.io'));
    
    if (isVercel) {
      // Silently skip WebSocket on Vercel - use polling/refresh instead
      setState(prev => ({ ...prev, status: 'disconnected', error: null }));
      return;
    }

    const token = getLocalStorageItem('auth-token') || 
                  getLocalStorageItem('provider-token') ||
                  getLocalStorageItem('admin-token');

    if (!token) {
      setState(prev => ({ ...prev, status: 'error', error: 'No auth token' }));
      return;
    }

    setState(prev => ({ ...prev, status: 'connecting', error: null }));

    const socket = io({
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionAttempts,
      reconnectionDelay,
      timeout: 10000,
    });

    // Connection events
    socket.on('connect', () => {
      setState({ status: 'connected', error: null, isConnected: true });
    });

    socket.on('disconnect', (reason: string) => {
      setState(prev => ({
        ...prev,
        status: 'disconnected',
        isConnected: false,
        error: reason === 'io server disconnect' ? 'Server disconnected' : null,
      }));
    });

    socket.on('connect_error', (error: Error) => {
      setState(prev => ({
        ...prev,
        status: 'error',
        isConnected: false,
        error: error.message,
      }));
    });

    // Auth events
    socket.on(EventType.AUTHENTICATED, () => {
      console.log('[WebSocket] Authenticated successfully');
    });

    socket.on(EventType.UNAUTHORIZED, (data: { message: string }) => {
      setState(prev => ({
        ...prev,
        status: 'error',
        error: data.message || 'Unauthorized',
      }));
      socket.disconnect();
    });

    // Subscribe to requested events
    events.forEach((event) => {
      socket.on(event, (data: unknown) => {
        const handlers = eventHandlersRef.current.get(event);
        if (handlers) {
          handlers.forEach((handler) => handler(data));
        }
      });
    });

    socketRef.current = socket;
  }, [reconnectionAttempts, reconnectionDelay, events]);

  // Disconnect from WebSocket server
  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    setState({ status: 'disconnected', error: null, isConnected: false });
  }, []);

  // Subscribe to an event
  const subscribe = useCallback((event: string, handler: EventHandler) => {
    if (!eventHandlersRef.current.has(event)) {
      eventHandlersRef.current.set(event, new Set());
    }
    eventHandlersRef.current.get(event)?.add(handler);

    // If socket exists and is connected, add listener
    if (socketRef.current?.connected) {
      socketRef.current.on(event, handler);
    }

    // Return unsubscribe function
    return () => {
      eventHandlersRef.current.get(event)?.delete(handler);
      socketRef.current?.off(event, handler);
    };
  }, []);

  // Unsubscribe from an event
  const unsubscribe = useCallback((event: string, handler?: EventHandler) => {
    if (handler) {
      eventHandlersRef.current.get(event)?.delete(handler);
      socketRef.current?.off(event, handler);
    } else {
      eventHandlersRef.current.delete(event);
      socketRef.current?.off(event);
    }
  }, []);

  // Emit an event
  const emit = useCallback((event: string, data?: unknown) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit(event, data);
    } else {
      console.warn('[WebSocket] Cannot emit - not connected');
    }
  }, []);

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

  return {
    ...state,
    socket: socketRef.current,
    connect,
    disconnect,
    subscribe,
    unsubscribe,
    emit,
  };
}

export default useWebSocket;
