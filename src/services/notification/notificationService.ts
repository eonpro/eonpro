/**
 * Notification Service
 * 
 * Handles in-app notifications for providers and admins with:
 * - CRUD operations for notifications
 * - Real-time WebSocket push
 * - Batch notification creation for role-based broadcasts
 * - Multi-tenant clinic isolation
 */

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import webSocketService, { EventType } from '@/lib/realtime/websocket';
import type { 
  NotificationCategory, 
  NotificationPriority, 
  Notification,
  Prisma 
} from '@prisma/client';

// ============================================================================
// Types
// ============================================================================

export interface CreateNotificationInput {
  userId: number;
  clinicId?: number;
  category: NotificationCategory;
  priority?: NotificationPriority;
  title: string;
  message: string;
  actionUrl?: string;
  metadata?: Record<string, unknown>;
  sourceType?: string;
  sourceId?: string;
}

export interface BroadcastNotificationInput {
  clinicId: number;
  category: NotificationCategory;
  priority?: NotificationPriority;
  title: string;
  message: string;
  actionUrl?: string;
  metadata?: Record<string, unknown>;
  sourceType?: string;
  sourceId?: string;
}

export interface NotificationFilters {
  userId: number;
  category?: NotificationCategory;
  isRead?: boolean;
  isArchived?: boolean;
  startDate?: Date;
  endDate?: Date;
}

export interface PaginatedNotifications {
  notifications: Notification[];
  total: number;
  unreadCount: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// ============================================================================
// Notification Service
// ============================================================================

class NotificationService {
  /**
   * Create a single notification and push via WebSocket if user is online
   */
  async createNotification(input: CreateNotificationInput): Promise<Notification> {
    try {
      // Check for duplicate using sourceType + sourceId
      if (input.sourceType && input.sourceId) {
        const existing = await prisma.notification.findFirst({
          where: {
            userId: input.userId,
            sourceType: input.sourceType,
            sourceId: input.sourceId,
          },
        });

        if (existing) {
          logger.debug('Duplicate notification skipped', {
            userId: input.userId,
            sourceType: input.sourceType,
            sourceId: input.sourceId,
          });
          return existing;
        }
      }

      const notification = await prisma.notification.create({
        data: {
          userId: input.userId,
          clinicId: input.clinicId,
          category: input.category,
          priority: input.priority || 'NORMAL',
          title: input.title,
          message: input.message,
          actionUrl: input.actionUrl,
          metadata: input.metadata as Prisma.InputJsonValue,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
        },
      });

      // Push via WebSocket if user is online
      this.pushNotification(notification);

      logger.info('Notification created', {
        notificationId: notification.id,
        userId: notification.userId,
        category: notification.category,
      });

      return notification;
    } catch (error) {
      logger.error('Failed to create notification', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: input.userId,
        category: input.category,
      });
      throw error;
    }
  }

  /**
   * Push notification via WebSocket to user
   */
  private pushNotification(notification: Notification): void {
    try {
      webSocketService.sendToUser(
        String(notification.userId),
        EventType.NOTIFICATION_PUSH,
        {
          notification: {
            id: notification.id,
            category: notification.category,
            priority: notification.priority,
            title: notification.title,
            message: notification.message,
            actionUrl: notification.actionUrl,
            metadata: notification.metadata,
            createdAt: notification.createdAt,
            isRead: notification.isRead,
          },
        }
      );
    } catch (error) {
      // Non-blocking - log but don't throw
      logger.debug('WebSocket push failed (user may be offline)', {
        userId: notification.userId,
      });
    }
  }

  /**
   * Notify all providers in a clinic
   */
  async notifyProviders(input: BroadcastNotificationInput): Promise<number> {
    try {
      // Get all provider users in the clinic
      const providerUsers = await prisma.user.findMany({
        where: {
          OR: [
            { clinicId: input.clinicId },
            { userClinics: { some: { clinicId: input.clinicId, isActive: true } } },
          ],
          role: 'PROVIDER',
          status: 'ACTIVE',
        },
        select: { id: true },
      }) as { id: number }[];

      if (providerUsers.length === 0) {
        logger.debug('No providers to notify', { clinicId: input.clinicId });
        return 0;
      }

      // Create notifications in bulk
      const notifications = await prisma.notification.createMany({
        data: providerUsers.map((user) => ({
          userId: user.id,
          clinicId: input.clinicId,
          category: input.category,
          priority: input.priority || 'NORMAL',
          title: input.title,
          message: input.message,
          actionUrl: input.actionUrl,
          metadata: input.metadata as Prisma.InputJsonValue,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
        })),
      });

      // Push to all online providers via WebSocket (by role)
      webSocketService.sendToRole('PROVIDER', EventType.NOTIFICATION_PUSH, {
        broadcast: true,
        clinicId: input.clinicId,
        category: input.category,
        title: input.title,
        message: input.message,
        actionUrl: input.actionUrl,
      });

      logger.info('Broadcast notification sent to providers', {
        clinicId: input.clinicId,
        count: notifications.count,
        category: input.category,
      });

      return notifications.count;
    } catch (error) {
      logger.error('Failed to notify providers', {
        error: error instanceof Error ? error.message : 'Unknown error',
        clinicId: input.clinicId,
      });
      throw error;
    }
  }

  /**
   * Notify all admins in a clinic
   */
  async notifyAdmins(input: BroadcastNotificationInput): Promise<number> {
    try {
      // Get all admin users in the clinic
      const adminUsers = await prisma.user.findMany({
        where: {
          OR: [
            { clinicId: input.clinicId },
            { userClinics: { some: { clinicId: input.clinicId, isActive: true } } },
          ],
          role: { in: ['ADMIN', 'SUPER_ADMIN'] },
          status: 'ACTIVE',
        },
        select: { id: true },
      }) as { id: number }[];

      if (adminUsers.length === 0) {
        logger.debug('No admins to notify', { clinicId: input.clinicId });
        return 0;
      }

      // Create notifications in bulk
      const notifications = await prisma.notification.createMany({
        data: adminUsers.map((user) => ({
          userId: user.id,
          clinicId: input.clinicId,
          category: input.category,
          priority: input.priority || 'NORMAL',
          title: input.title,
          message: input.message,
          actionUrl: input.actionUrl,
          metadata: input.metadata as Prisma.InputJsonValue,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
        })),
      });

      // Push to all online admins via WebSocket (by role)
      webSocketService.sendToRole('ADMIN', EventType.NOTIFICATION_PUSH, {
        broadcast: true,
        clinicId: input.clinicId,
        category: input.category,
        title: input.title,
        message: input.message,
        actionUrl: input.actionUrl,
      });

      logger.info('Broadcast notification sent to admins', {
        clinicId: input.clinicId,
        count: notifications.count,
        category: input.category,
      });

      return notifications.count;
    } catch (error) {
      logger.error('Failed to notify admins', {
        error: error instanceof Error ? error.message : 'Unknown error',
        clinicId: input.clinicId,
      });
      throw error;
    }
  }

  /**
   * Notify a single user
   */
  async notifyUser(
    userId: number,
    input: Omit<CreateNotificationInput, 'userId'>
  ): Promise<Notification> {
    return this.createNotification({
      ...input,
      userId,
    });
  }

  /**
   * Get paginated notifications for a user
   */
  async getUserNotifications(
    filters: NotificationFilters,
    page = 1,
    pageSize = 20
  ): Promise<PaginatedNotifications> {
    const where: Prisma.NotificationWhereInput = {
      userId: filters.userId,
      ...(filters.category && { category: filters.category }),
      ...(filters.isRead !== undefined && { isRead: filters.isRead }),
      ...(filters.isArchived !== undefined && { isArchived: filters.isArchived }),
      ...(filters.startDate && { createdAt: { gte: filters.startDate } }),
      ...(filters.endDate && { createdAt: { lte: filters.endDate } }),
    };

    const [notifications, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({
        where: { userId: filters.userId, isRead: false, isArchived: false },
      }),
    ]);

    return {
      notifications,
      total,
      unreadCount,
      page,
      pageSize,
      hasMore: page * pageSize < total,
    };
  }

  /**
   * Get unread count for badge display
   */
  async getUnreadCount(userId: number): Promise<number> {
    return prisma.notification.count({
      where: {
        userId,
        isRead: false,
        isArchived: false,
      },
    });
  }

  /**
   * Mark a single notification as read
   */
  async markAsRead(notificationId: number, userId: number): Promise<Notification | null> {
    try {
      const notification = await prisma.notification.updateMany({
        where: {
          id: notificationId,
          userId, // Ensure user owns the notification
        },
        data: {
          isRead: true,
          readAt: new Date(),
        },
      });

      if (notification.count === 0) {
        return null;
      }

      // Fetch and return updated notification
      return prisma.notification.findUnique({
        where: { id: notificationId },
      });
    } catch (error) {
      logger.error('Failed to mark notification as read', {
        error: error instanceof Error ? error.message : 'Unknown error',
        notificationId,
        userId,
      });
      throw error;
    }
  }

  /**
   * Mark multiple notifications as read
   */
  async markManyAsRead(notificationIds: number[], userId: number): Promise<number> {
    const result = await prisma.notification.updateMany({
      where: {
        id: { in: notificationIds },
        userId, // Ensure user owns the notifications
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    return result.count;
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId: number, category?: NotificationCategory): Promise<number> {
    const result = await prisma.notification.updateMany({
      where: {
        userId,
        isRead: false,
        ...(category && { category }),
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    logger.info('Marked all notifications as read', {
      userId,
      count: result.count,
      category,
    });

    return result.count;
  }

  /**
   * Archive a notification (soft delete)
   */
  async archiveNotification(notificationId: number, userId: number): Promise<boolean> {
    const result = await prisma.notification.updateMany({
      where: {
        id: notificationId,
        userId,
      },
      data: {
        isArchived: true,
        archivedAt: new Date(),
      },
    });

    return result.count > 0;
  }

  /**
   * Archive multiple notifications
   */
  async archiveMany(notificationIds: number[], userId: number): Promise<number> {
    const result = await prisma.notification.updateMany({
      where: {
        id: { in: notificationIds },
        userId,
      },
      data: {
        isArchived: true,
        archivedAt: new Date(),
      },
    });

    return result.count;
  }

  /**
   * Delete old archived notifications (cleanup job)
   */
  async cleanupOldNotifications(daysOld = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const result = await prisma.notification.deleteMany({
      where: {
        isArchived: true,
        archivedAt: { lt: cutoffDate },
      },
    });

    if (result.count > 0) {
      logger.info('Cleaned up old notifications', {
        count: result.count,
        daysOld,
      });
    }

    return result.count;
  }
}

// Export singleton instance
export const notificationService = new NotificationService();
export default notificationService;
