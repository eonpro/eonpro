/**
 * Ticket Notification Service
 * ===========================
 *
 * Fires in-app notifications + optional email for ticket events.
 * Uses the existing NotificationService for delivery.
 * All calls are non-blocking (fire-and-forget with error logging).
 *
 * @module domains/ticket/services
 */

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import NotificationService from '@/services/notification/notificationService';
import type { NotificationCategory } from '@prisma/client';

type TicketEventType =
  | 'assigned'
  | 'reassigned'
  | 'status_changed'
  | 'comment_added'
  | 'resolved'
  | 'reopened'
  | 'escalated'
  | 'sla_warning';

interface TicketEventPayload {
  ticketId: number;
  ticketNumber: string;
  ticketTitle: string;
  clinicId: number | null;
  actorId: number;
  actorName: string;
  assigneeId?: number | null;
  previousAssigneeId?: number | null;
  watcherIds?: number[];
  creatorId?: number;
  newStatus?: string;
  oldStatus?: string;
  isInternal?: boolean;
  escalationTargetId?: number;
}

const CATEGORY: NotificationCategory = 'SYSTEM';

class TicketNotificationService {
  private notificationService = NotificationService;

  async notify(
    event: TicketEventType,
    payload: TicketEventPayload
  ): Promise<void> {
    try {
      switch (event) {
        case 'assigned':
          await this.onAssigned(payload);
          break;
        case 'reassigned':
          await this.onReassigned(payload);
          break;
        case 'status_changed':
          await this.onStatusChanged(payload);
          break;
        case 'comment_added':
          await this.onCommentAdded(payload);
          break;
        case 'resolved':
          await this.onResolved(payload);
          break;
        case 'reopened':
          await this.onReopened(payload);
          break;
        case 'escalated':
          await this.onEscalated(payload);
          break;
        case 'sla_warning':
          await this.onSlaWarning(payload);
          break;
      }
    } catch (error) {
      logger.error('[TicketNotification] Failed to send notification', {
        event,
        ticketId: payload.ticketId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async onAssigned(p: TicketEventPayload) {
    if (!p.assigneeId || p.assigneeId === p.actorId) return;

    await this.notificationService.createNotification({
      userId: p.assigneeId,
      clinicId: p.clinicId ?? undefined,
      category: CATEGORY,
      priority: 'HIGH',
      title: 'Ticket Assigned to You',
      message: `${p.actorName} assigned ticket ${p.ticketNumber}: "${p.ticketTitle}" to you.`,
      actionUrl: `/tickets/${p.ticketId}`,
      sourceType: 'ticket_assigned',
      sourceId: `ticket-${p.ticketId}-assign-${Date.now()}`,
      sendEmail: true,
      emailSubject: `Ticket Assigned: ${p.ticketNumber} - ${p.ticketTitle}`,
    });
  }

  private async onReassigned(p: TicketEventPayload) {
    if (p.previousAssigneeId && p.previousAssigneeId !== p.actorId) {
      await this.notificationService.createNotification({
        userId: p.previousAssigneeId,
        clinicId: p.clinicId ?? undefined,
        category: CATEGORY,
        priority: 'NORMAL',
        title: 'Ticket Reassigned',
        message: `${p.actorName} reassigned ticket ${p.ticketNumber}: "${p.ticketTitle}" to someone else.`,
        actionUrl: `/tickets/${p.ticketId}`,
        sourceType: 'ticket_reassigned',
        sourceId: `ticket-${p.ticketId}-reassign-${Date.now()}`,
      });
    }

    if (p.assigneeId && p.assigneeId !== p.actorId) {
      await this.notificationService.createNotification({
        userId: p.assigneeId,
        clinicId: p.clinicId ?? undefined,
        category: CATEGORY,
        priority: 'HIGH',
        title: 'Ticket Assigned to You',
        message: `${p.actorName} assigned ticket ${p.ticketNumber}: "${p.ticketTitle}" to you.`,
        actionUrl: `/tickets/${p.ticketId}`,
        sourceType: 'ticket_assigned',
        sourceId: `ticket-${p.ticketId}-assign-${Date.now()}`,
        sendEmail: true,
        emailSubject: `Ticket Assigned: ${p.ticketNumber} - ${p.ticketTitle}`,
      });
    }
  }

  private async onStatusChanged(p: TicketEventPayload) {
    const recipients = await this.getTicketStakeholders(p.ticketId, p.actorId);
    const statusLabel = (p.newStatus || '').replace(/_/g, ' ');

    for (const userId of recipients) {
      await this.notificationService.createNotification({
        userId,
        clinicId: p.clinicId ?? undefined,
        category: CATEGORY,
        priority: 'NORMAL',
        title: `Ticket ${statusLabel}`,
        message: `${p.actorName} changed ${p.ticketNumber} status to ${statusLabel}.`,
        actionUrl: `/tickets/${p.ticketId}`,
        sourceType: 'ticket_status_changed',
        sourceId: `ticket-${p.ticketId}-status-${Date.now()}`,
      });
    }
  }

  private async onCommentAdded(p: TicketEventPayload) {
    if (p.isInternal) return;

    const recipients = await this.getTicketStakeholders(p.ticketId, p.actorId);

    for (const userId of recipients) {
      await this.notificationService.createNotification({
        userId,
        clinicId: p.clinicId ?? undefined,
        category: CATEGORY,
        priority: 'NORMAL',
        title: 'New Comment on Ticket',
        message: `${p.actorName} commented on ${p.ticketNumber}: "${p.ticketTitle}".`,
        actionUrl: `/tickets/${p.ticketId}`,
        sourceType: 'ticket_comment',
        sourceId: `ticket-${p.ticketId}-comment-${Date.now()}`,
      });
    }
  }

  private async onResolved(p: TicketEventPayload) {
    const recipients = await this.getTicketStakeholders(p.ticketId, p.actorId);

    for (const userId of recipients) {
      await this.notificationService.createNotification({
        userId,
        clinicId: p.clinicId ?? undefined,
        category: CATEGORY,
        priority: 'HIGH',
        title: 'Ticket Resolved',
        message: `${p.actorName} resolved ${p.ticketNumber}: "${p.ticketTitle}".`,
        actionUrl: `/tickets/${p.ticketId}`,
        sourceType: 'ticket_resolved',
        sourceId: `ticket-${p.ticketId}-resolved-${Date.now()}`,
        sendEmail: true,
        emailSubject: `Ticket Resolved: ${p.ticketNumber} - ${p.ticketTitle}`,
      });
    }
  }

  private async onReopened(p: TicketEventPayload) {
    const recipients = await this.getTicketStakeholders(p.ticketId, p.actorId);

    for (const userId of recipients) {
      await this.notificationService.createNotification({
        userId,
        clinicId: p.clinicId ?? undefined,
        category: CATEGORY,
        priority: 'HIGH',
        title: 'Ticket Reopened',
        message: `${p.actorName} reopened ${p.ticketNumber}: "${p.ticketTitle}".`,
        actionUrl: `/tickets/${p.ticketId}`,
        sourceType: 'ticket_reopened',
        sourceId: `ticket-${p.ticketId}-reopened-${Date.now()}`,
      });
    }
  }

  private async onEscalated(p: TicketEventPayload) {
    if (p.escalationTargetId && p.escalationTargetId !== p.actorId) {
      await this.notificationService.createNotification({
        userId: p.escalationTargetId,
        clinicId: p.clinicId ?? undefined,
        category: CATEGORY,
        priority: 'URGENT',
        title: 'Ticket Escalated to You',
        message: `${p.actorName} escalated ${p.ticketNumber}: "${p.ticketTitle}" to you.`,
        actionUrl: `/tickets/${p.ticketId}`,
        sourceType: 'ticket_escalated',
        sourceId: `ticket-${p.ticketId}-escalated-${Date.now()}`,
        sendEmail: true,
        emailSubject: `ESCALATION: ${p.ticketNumber} - ${p.ticketTitle}`,
      });
    }

    if (p.assigneeId && p.assigneeId !== p.actorId) {
      await this.notificationService.createNotification({
        userId: p.assigneeId,
        clinicId: p.clinicId ?? undefined,
        category: CATEGORY,
        priority: 'HIGH',
        title: 'Your Ticket Was Escalated',
        message: `${p.actorName} escalated ${p.ticketNumber}: "${p.ticketTitle}".`,
        actionUrl: `/tickets/${p.ticketId}`,
        sourceType: 'ticket_escalated_info',
        sourceId: `ticket-${p.ticketId}-escalated-info-${Date.now()}`,
      });
    }
  }

  private async onSlaWarning(p: TicketEventPayload) {
    if (p.assigneeId) {
      await this.notificationService.createNotification({
        userId: p.assigneeId,
        clinicId: p.clinicId ?? undefined,
        category: CATEGORY,
        priority: 'URGENT',
        title: 'SLA Breach Warning',
        message: `Ticket ${p.ticketNumber}: "${p.ticketTitle}" is approaching its SLA deadline.`,
        actionUrl: `/tickets/${p.ticketId}`,
        sourceType: 'ticket_sla_warning',
        sourceId: `ticket-${p.ticketId}-sla-${Date.now()}`,
        sendEmail: true,
        emailSubject: `SLA Warning: ${p.ticketNumber} - ${p.ticketTitle}`,
      });
    }
  }

  private async getTicketStakeholders(ticketId: number, excludeUserId: number): Promise<number[]> {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: {
        createdById: true,
        assignedToId: true,
        watchers: { select: { userId: true, notifyOnComment: true, notifyOnStatus: true } },
      },
    });

    if (!ticket) return [];

    const userIds = new Set<number>();
    if (ticket.createdById) userIds.add(ticket.createdById);
    if (ticket.assignedToId) userIds.add(ticket.assignedToId);
    for (const w of ticket.watchers) {
      userIds.add(w.userId);
    }

    userIds.delete(excludeUserId);
    return Array.from(userIds);
  }
}

export const ticketNotificationService = new TicketNotificationService();
