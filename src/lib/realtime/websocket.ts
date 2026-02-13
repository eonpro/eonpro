import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { logger } from '@/lib/logger';
import { verifyToken } from '@/lib/auth/session';
import cache from '@/lib/cache/redis';
import { tenantCacheKey } from '@/lib/cache/tenant-cache-keys';

const PRESENCE_NAMESPACE = 'presence';

export interface SocketUser {
  id: string;
  email: string;
  role: string;
  socketId: string;
  clinicId?: number;
}

export interface RoomConfig {
  name: string;
  maxUsers?: number;
  requiresAuth?: boolean;
  allowedRoles?: string[];
}

export enum EventType {
  // Connection events
  CONNECTION = 'connection',
  DISCONNECT = 'disconnect',
  ERROR = 'error',

  // Authentication
  AUTHENTICATE = 'authenticate',
  AUTHENTICATED = 'authenticated',
  UNAUTHORIZED = 'unauthorized',

  // User presence
  USER_ONLINE = 'user:online',
  USER_OFFLINE = 'user:offline',
  USER_STATUS = 'user:status',

  // Messaging
  MESSAGE_SEND = 'message:send',
  MESSAGE_RECEIVE = 'message:receive',
  MESSAGE_TYPING = 'message:typing',
  MESSAGE_READ = 'message:read',

  // Appointments
  APPOINTMENT_CREATED = 'appointment:created',
  APPOINTMENT_UPDATED = 'appointment:updated',
  APPOINTMENT_CANCELLED = 'appointment:cancelled',
  APPOINTMENT_REMINDER = 'appointment:reminder',

  // Video calls
  VIDEO_CALL_START = 'video:call:start',
  VIDEO_CALL_JOIN = 'video:call:join',
  VIDEO_CALL_END = 'video:call:end',
  VIDEO_CALL_OFFER = 'video:call:offer',
  VIDEO_CALL_ANSWER = 'video:call:answer',
  VIDEO_CALL_ICE = 'video:call:ice',

  // Notifications
  NOTIFICATION_PUSH = 'notification:push',
  NOTIFICATION_READ = 'notification:read',
  NOTIFICATION_CLEAR = 'notification:clear',

  // Real-time updates
  DATA_UPDATE = 'data:update',
  DATA_DELETE = 'data:delete',
  DATA_SYNC = 'data:sync',

  // System events
  SYSTEM_ALERT = 'system:alert',
  SYSTEM_MAINTENANCE = 'system:maintenance',
  SYSTEM_STATUS = 'system:status',

  // Collaboration
  DOCUMENT_UPDATE = 'document:update',
  DOCUMENT_CURSOR = 'document:cursor',
  DOCUMENT_SELECTION = 'document:selection',
}

class WebSocketService {
  private io: SocketIOServer | null = null;
  private users: Map<string, SocketUser> = new Map();
  private rooms: Map<string, Set<string>> = new Map();
  private userSockets: Map<string, string> = new Map(); // userId -> socketId

  initialize(httpServer: HTTPServer): void {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: process.env.NEXTAUTH_URL || 'http://localhost:3000',
        credentials: true,
      },
      transports: ['websocket', 'polling'],
      pingTimeout: 60000,
      pingInterval: 25000,
    });

    this.setupMiddleware();
    this.setupEventHandlers();

    logger.info('WebSocket service initialized');
  }

  private setupMiddleware(): void {
    if (!this.io) return;

    // Authentication middleware
    this.io.use(async (socket: Socket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization;

        if (!token) {
          return next(new Error('Authentication required'));
        }

        const user = await verifyToken(token);
        if (!user) {
          return next(new Error('Invalid token'));
        }

        // Attach user to socket
        (socket as any).user = user;

        next();
      } catch (error: any) {
        // @ts-ignore

        logger.error('WebSocket authentication error:', error);
        next(new Error('Authentication failed'));
      }
    });
  }

  private setupEventHandlers(): void {
    if (!this.io) return;

    this.io.on(EventType.CONNECTION, (socket: Socket) => {
      const user = (socket as any).user;

      if (user) {
        this.handleUserConnection(socket, user);
      }

      // Handle authentication for unauthenticated connections
      socket.on(EventType.AUTHENTICATE, async (data: any) => {
        await this.handleAuthentication(socket, data);
      });

      // Handle disconnection
      socket.on(EventType.DISCONNECT, () => {
        this.handleUserDisconnection(socket);
      });

      // Handle messaging
      socket.on(EventType.MESSAGE_SEND, (data: any) => {
        this.handleMessage(socket, data);
      });

      socket.on(EventType.MESSAGE_TYPING, (data: any) => {
        this.handleTyping(socket, data);
      });

      // Handle video calls
      socket.on(EventType.VIDEO_CALL_OFFER, (data: any) => {
        this.handleVideoCallOffer(socket, data);
      });

      socket.on(EventType.VIDEO_CALL_ANSWER, (data: any) => {
        this.handleVideoCallAnswer(socket, data);
      });

      socket.on(EventType.VIDEO_CALL_ICE, (data: any) => {
        this.handleICECandidate(socket, data);
      });

      // Handle room management
      socket.on('room:join', (roomName: string) => {
        this.joinRoom(socket, roomName);
      });

      socket.on('room:leave', (roomName: string) => {
        this.leaveRoom(socket, roomName);
      });

      // Handle real-time data updates
      socket.on(EventType.DATA_UPDATE, (data: any) => {
        this.handleDataUpdate(socket, data);
      });

      // Handle error
      socket.on(EventType.ERROR, (error: any) => {
        logger.error('WebSocket error:', error);
      });
    });
  }

  private async handleUserConnection(socket: Socket, user: any): Promise<void> {
    const clinicId = user.clinicId != null ? Number(user.clinicId) : undefined;
    const socketUser: SocketUser = {
      id: user.id,
      email: user.email,
      role: user.role,
      socketId: socket.id,
      clinicId,
    };

    // Store user information
    this.users.set(socket.id, socketUser);
    this.userSockets.set(user.id, socket.id);

    // Cache user online status (tenant-scoped when clinicId present)
    const presenceKey =
      clinicId != null
        ? tenantCacheKey(clinicId, 'user', 'online', user.id)
        : `user:online:${user.id}`;
    await cache.set(presenceKey, true, { namespace: PRESENCE_NAMESPACE, ttl: 3600 });

    // Join user-specific room
    socket.join(`user:${user.id}`);

    // Join role-specific room
    socket.join(`role:${user.role}`);

    // Notify others that user is online
    socket.broadcast.emit(EventType.USER_ONLINE, {
      userId: user.id,
      timestamp: new Date().toISOString(),
    });

    // Send authenticated event
    socket.emit(EventType.AUTHENTICATED, {
      user: socketUser,
      timestamp: new Date().toISOString(),
    });

    logger.info('User connected via WebSocket', { userId: user.id });
  }

  private async handleUserDisconnection(socket: Socket): Promise<void> {
    const user = this.users.get(socket.id);

    if (user) {
      // Remove user information
      this.users.delete(socket.id);
      this.userSockets.delete(user.id);

      // Update cache (same key as set: tenant-scoped when clinicId present)
      const presenceKey =
        user.clinicId != null
          ? tenantCacheKey(user.clinicId, 'user', 'online', user.id)
          : `user:online:${user.id}`;
      await cache.delete(presenceKey, { namespace: PRESENCE_NAMESPACE });

      // Leave all rooms
      const rooms = Array.from(socket.rooms);
      rooms.forEach((room: any) => {
        if (room !== socket.id) {
          socket.leave(room);
        }
      });

      // Notify others that user is offline
      socket.broadcast.emit(EventType.USER_OFFLINE, {
        userId: user.id,
        timestamp: new Date().toISOString(),
      });

      logger.info('User disconnected from WebSocket', { userId: user.id });
    }
  }

  private async handleAuthentication(socket: Socket, data: any): Promise<void> {
    try {
      const { token } = data;
      const user = await verifyToken(token);

      if (user) {
        (socket as any).user = user;
        await this.handleUserConnection(socket, user);
      } else {
        socket.emit(EventType.UNAUTHORIZED, {
          message: 'Invalid token',
        });
      }
    } catch (error: any) {
      // @ts-ignore

      logger.error('Authentication error:', error);
      socket.emit(EventType.UNAUTHORIZED, {
        message: 'Authentication failed',
      });
    }
  }

  private handleMessage(socket: Socket, data: any): void {
    const user = this.users.get(socket.id);
    if (!user) return;

    const { recipientId, message, type = 'text' } = data;

    // Send message to recipient
    const recipientSocketId = this.userSockets.get(recipientId);
    if (recipientSocketId && this.io) {
      this.io.to(recipientSocketId).emit(EventType.MESSAGE_RECEIVE, {
        senderId: user.id,
        message,
        type,
        timestamp: new Date().toISOString(),
      });
    }

    // TODO: Store message in database for persistence
  }

  private handleTyping(socket: Socket, data: any): void {
    const user = this.users.get(socket.id);
    if (!user) return;

    const { recipientId, isTyping } = data;

    // Notify recipient of typing status
    const recipientSocketId = this.userSockets.get(recipientId);
    if (recipientSocketId && this.io) {
      this.io.to(recipientSocketId).emit(EventType.MESSAGE_TYPING, {
        senderId: user.id,
        isTyping,
        timestamp: new Date().toISOString(),
      });
    }
  }

  private handleVideoCallOffer(socket: Socket, data: any): void {
    const user = this.users.get(socket.id);
    if (!user) return;

    const { targetUserId, offer, roomId } = data;

    // Forward offer to target user
    const targetSocketId = this.userSockets.get(targetUserId);
    if (targetSocketId && this.io) {
      this.io.to(targetSocketId).emit(EventType.VIDEO_CALL_OFFER, {
        callerId: user.id,
        callerName: user.email,
        offer,
        roomId,
        timestamp: new Date().toISOString(),
      });
    }
  }

  private handleVideoCallAnswer(socket: Socket, data: any): void {
    const user = this.users.get(socket.id);
    if (!user) return;

    const { callerId, answer, roomId } = data;

    // Forward answer to caller
    const callerSocketId = this.userSockets.get(callerId);
    if (callerSocketId && this.io) {
      this.io.to(callerSocketId).emit(EventType.VIDEO_CALL_ANSWER, {
        answererId: user.id,
        answer,
        roomId,
        timestamp: new Date().toISOString(),
      });
    }
  }

  private handleICECandidate(socket: Socket, data: any): void {
    const user = this.users.get(socket.id);
    if (!user) return;

    const { targetUserId, candidate, roomId } = data;

    // Forward ICE candidate to target user
    const targetSocketId = this.userSockets.get(targetUserId);
    if (targetSocketId && this.io) {
      this.io.to(targetSocketId).emit(EventType.VIDEO_CALL_ICE, {
        senderId: user.id,
        candidate,
        roomId,
        timestamp: new Date().toISOString(),
      });
    }
  }

  private joinRoom(socket: Socket, roomName: string): void {
    const user = this.users.get(socket.id);
    if (!user) return;

    socket.join(roomName);

    // Track room membership
    if (!this.rooms.has(roomName)) {
      this.rooms.set(roomName, new Set());
    }
    this.rooms.get(roomName)?.add(user.id);

    // Notify others in room
    socket.to(roomName).emit('room:user:joined', {
      userId: user.id,
      roomName,
      timestamp: new Date().toISOString(),
    });

    logger.debug('User joined room', { userId: user.id, roomName });
  }

  private leaveRoom(socket: Socket, roomName: string): void {
    const user = this.users.get(socket.id);
    if (!user) return;

    socket.leave(roomName);

    // Update room membership
    this.rooms.get(roomName)?.delete(user.id);
    if (this.rooms.get(roomName)?.size === 0) {
      this.rooms.delete(roomName);
    }

    // Notify others in room
    socket.to(roomName).emit('room:user:left', {
      userId: user.id,
      roomName,
      timestamp: new Date().toISOString(),
    });

    logger.debug('User left room', { userId: user.id, roomName });
  }

  private handleDataUpdate(socket: Socket, data: any): void {
    const user = this.users.get(socket.id);
    if (!user) return;

    const { collection, documentId, updates, broadcast = true } = data;

    // Validate user has permission to update
    // TODO: Add permission checks based on role and document ownership

    if (broadcast && this.io) {
      // Broadcast update to relevant users
      const eventData = {
        collection,
        documentId,
        updates,
        updatedBy: user.id,
        timestamp: new Date().toISOString(),
      };

      // Broadcast based on data type
      if (collection === 'appointments') {
        this.io.to(`role:PROVIDER`).to(`role:ADMIN`).emit(EventType.DATA_UPDATE, eventData);
      } else if (collection === 'patients') {
        this.io.to(`user:${documentId}`).to(`role:PROVIDER`).emit(EventType.DATA_UPDATE, eventData);
      } else {
        // Broadcast to all authenticated users
        this.io.emit(EventType.DATA_UPDATE, eventData);
      }
    }
  }

  // Public methods for external use
  public sendToUser(userId: string, event: string, data: any): void {
    const socketId = this.userSockets.get(userId);
    if (socketId && this.io) {
      this.io.to(socketId).emit(event, data);
    }
  }

  public sendToRole(role: string, event: string, data: any): void {
    if (this.io) {
      this.io.to(`role:${role}`).emit(event, data);
    }
  }

  public sendToRoom(roomName: string, event: string, data: any): void {
    if (this.io) {
      this.io.to(roomName).emit(event, data);
    }
  }

  public broadcast(event: string, data: any): void {
    if (this.io) {
      this.io.emit(event, data);
    }
  }

  public async getOnlineUsers(): Promise<string[]> {
    return Array.from(this.userSockets.keys());
  }

  /** Check if user is online. Pass clinicId when checking within a tenant to use tenant-scoped presence key. */
  public async getUserStatus(userId: string, clinicId?: number): Promise<boolean> {
    const presenceKey =
      clinicId != null
        ? tenantCacheKey(clinicId, 'user', 'online', userId)
        : `user:online:${userId}`;
    const isOnline = await cache.get<boolean>(presenceKey, { namespace: PRESENCE_NAMESPACE });
    return isOnline || false;
  }

  public getRoomUsers(roomName: string): string[] {
    return Array.from(this.rooms.get(roomName) || []);
  }

  public getMetrics(): {
    connectedUsers: number;
    activeRooms: number;
    totalConnections: number;
  } {
    return {
      connectedUsers: this.users.size,
      activeRooms: this.rooms.size,
      totalConnections: this.io?.sockets.sockets.size || 0,
    };
  }

  public shutdown(): void {
    if (this.io) {
      // Notify all users of shutdown
      this.io.emit(EventType.SYSTEM_MAINTENANCE, {
        message: 'Server is shutting down for maintenance',
        timestamp: new Date().toISOString(),
      });

      // Close all connections
      this.io.close();
      this.io = null;

      // Clear data
      this.users.clear();
      this.rooms.clear();
      this.userSockets.clear();

      logger.info('WebSocket service shutdown complete');
    }
  }
}

// Singleton instance
const webSocketService = new WebSocketService();

export default webSocketService;
