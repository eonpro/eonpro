/**
 * Ticket Service
 * ==============
 *
 * Business logic layer for ticket operations.
 * Handles validation, authorization, workflow rules, and orchestrates repository calls.
 *
 * @module domains/ticket/services
 */

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { ticketRepository } from '../repositories/ticket.repository';
import { NotFoundError, ForbiddenError, ValidationError } from '@/domains/shared/errors';
import type { UserContext } from '@/domains/shared/types';
import type {
  Ticket,
  TicketWithRelations,
  TicketListItem,
  TicketListFilters,
  TicketListOptions,
  TicketListResult,
  CreateTicketInput,
  UpdateTicketInput,
  AssignTicketInput,
  ResolveTicketInput,
  CreateCommentInput,
  AddWatcherInput,
  MergeTicketsInput,
  BulkUpdateTicketsInput,
  TicketCommentWithAuthor,
  TicketActivityWithUser,
  TicketStats,
} from '../types';
import type { TicketStatus, TicketDisposition } from '@prisma/client';

// ============================================================================
// Status Transition Rules
// ============================================================================

const VALID_STATUS_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  NEW: ['OPEN', 'IN_PROGRESS', 'PENDING_CUSTOMER', 'PENDING_INTERNAL', 'CANCELLED'],
  OPEN: [
    'IN_PROGRESS',
    'PENDING_CUSTOMER',
    'PENDING_INTERNAL',
    'ON_HOLD',
    'ESCALATED',
    'RESOLVED',
    'CANCELLED',
  ],
  IN_PROGRESS: [
    'PENDING_CUSTOMER',
    'PENDING_INTERNAL',
    'ON_HOLD',
    'ESCALATED',
    'RESOLVED',
    'CANCELLED',
  ],
  PENDING: ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED'], // Legacy
  PENDING_CUSTOMER: ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED'],
  PENDING_INTERNAL: ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED'],
  ON_HOLD: ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED'],
  ESCALATED: ['IN_PROGRESS', 'RESOLVED', 'CANCELLED'],
  RESOLVED: ['CLOSED', 'REOPENED'],
  CLOSED: ['REOPENED'],
  CANCELLED: [],
  REOPENED: [
    'IN_PROGRESS',
    'PENDING_CUSTOMER',
    'PENDING_INTERNAL',
    'ON_HOLD',
    'RESOLVED',
    'CANCELLED',
  ],
};

function canTransitionStatus(from: TicketStatus, to: TicketStatus): boolean {
  return VALID_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

// ============================================================================
// Service Implementation
// ============================================================================

export const ticketService = {
  // ==========================================================================
  // Ticket CRUD
  // ==========================================================================

  /**
   * Create a new ticket
   */
  async create(data: CreateTicketInput, userContext: UserContext): Promise<TicketWithRelations> {
    // Validate clinic access
    if (userContext.role !== 'super_admin') {
      if (data.clinicId !== userContext.clinicId) {
        throw new ForbiddenError('Cannot create ticket for another clinic');
      }
    }

    // Validate title and description
    if (!data.title?.trim()) {
      throw new ValidationError('Title is required');
    }
    if (!data.description?.trim()) {
      throw new ValidationError('Description is required');
    }

    // Validate assignee if provided
    if (data.assignedToId) {
      const assignee = await prisma.user.findFirst({
        where: {
          id: data.assignedToId,
          status: 'ACTIVE',
          OR: [
            { clinicId: data.clinicId },
            { userClinics: { some: { clinicId: data.clinicId, isActive: true } } },
          ],
        },
      });

      if (!assignee) {
        throw new ValidationError('Invalid assignee - user not found or not in clinic');
      }
    }

    // Validate team if provided
    if (data.teamId) {
      const team = await prisma.ticketTeam.findFirst({
        where: {
          id: data.teamId,
          clinicId: data.clinicId,
          isActive: true,
        },
      });

      if (!team) {
        throw new ValidationError('Invalid team - not found or not active');
      }
    }

    // Create ticket in transaction
    const ticket = await prisma.$transaction(async (tx) => {
      // Create the ticket
      const newTicket = await ticketRepository.create(data, userContext, tx);

      // Log activity
      await ticketRepository.logActivity(
        {
          ticketId: newTicket.id,
          activityType: 'CREATED',
          details: {
            title: data.title,
            category: data.category,
            priority: data.priority,
            assignedToId: data.assignedToId,
            teamId: data.teamId,
          },
        },
        userContext,
        tx
      );

      // Auto-add creator as watcher
      await ticketRepository.addWatcher(
        newTicket.id,
        userContext.id,
        {
          notifyOnComment: true,
          notifyOnStatus: true,
          notifyOnResolve: true,
        },
        userContext.id,
        tx
      );

      return newTicket;
    });

    logger.info('[TicketService] Ticket created', {
      ticketId: ticket.id,
      ticketNumber: ticket.ticketNumber,
      createdById: userContext.id,
    });

    // Return with relations
    return this.getById(ticket.id, userContext);
  },

  /**
   * Get ticket by ID
   */
  async getById(id: number, userContext: UserContext): Promise<TicketWithRelations> {
    const ticket = await ticketRepository.findById(id, userContext);

    if (!ticket) {
      throw new NotFoundError('Ticket', id);
    }

    return ticket;
  },

  /**
   * Get ticket by ticket number
   */
  async getByTicketNumber(
    ticketNumber: string,
    userContext: UserContext
  ): Promise<TicketWithRelations> {
    const ticket = await ticketRepository.findByTicketNumber(ticketNumber, userContext);

    if (!ticket) {
      throw new NotFoundError('Ticket', ticketNumber);
    }

    return ticket;
  },

  /**
   * List tickets with filters
   */
  async list(
    filters: TicketListFilters,
    options: TicketListOptions,
    userContext: UserContext
  ): Promise<TicketListResult> {
    return ticketRepository.findMany(filters, options, userContext);
  },

  /**
   * Update a ticket
   */
  async update(
    id: number,
    data: UpdateTicketInput,
    userContext: UserContext
  ): Promise<TicketWithRelations> {
    const existing = await this.getById(id, userContext);

    // Check authorization
    this.checkTicketAccess(existing, userContext, 'update');

    // Validate status transition if changing status
    if (data.status && data.status !== existing.status) {
      if (!canTransitionStatus(existing.status, data.status)) {
        throw new ValidationError(
          `Invalid status transition from ${existing.status} to ${data.status}`
        );
      }
    }

    // Track changes for activity log
    const changes: Array<{ field: string; old: unknown; new: unknown }> = [];

    if (data.title !== undefined && data.title !== existing.title) {
      changes.push({ field: 'title', old: existing.title, new: data.title });
    }
    if (data.priority !== undefined && data.priority !== existing.priority) {
      changes.push({ field: 'priority', old: existing.priority, new: data.priority });
    }
    if (data.category !== undefined && data.category !== existing.category) {
      changes.push({ field: 'category', old: existing.category, new: data.category });
    }
    if (data.status !== undefined && data.status !== existing.status) {
      changes.push({ field: 'status', old: existing.status, new: data.status });
    }
    if (data.assignedToId !== undefined && data.assignedToId !== existing.assignedToId) {
      changes.push({ field: 'assignedToId', old: existing.assignedToId, new: data.assignedToId });
    }

    await prisma.$transaction(async (tx) => {
      // Update ticket
      await ticketRepository.update(id, data, userContext, tx);

      // Log activities for each change
      for (const change of changes) {
        const activityType =
          change.field === 'status'
            ? 'STATUS_CHANGED'
            : change.field === 'priority'
              ? 'PRIORITY_CHANGED'
              : change.field === 'category'
                ? 'CATEGORY_CHANGED'
                : change.field === 'assignedToId'
                  ? change.old
                    ? 'REASSIGNED'
                    : 'ASSIGNED'
                  : 'UPDATED';

        await ticketRepository.logActivity(
          {
            ticketId: id,
            activityType,
            fieldChanged: change.field,
            oldValue: String(change.old ?? ''),
            newValue: String(change.new ?? ''),
          },
          userContext,
          tx
        );
      }
    });

    logger.info('[TicketService] Ticket updated', {
      ticketId: id,
      changes: changes.map((c) => c.field),
      updatedById: userContext.id,
    });

    return this.getById(id, userContext);
  },

  /**
   * Change ticket status
   */
  async changeStatus(
    id: number,
    newStatus: TicketStatus,
    reason: string | undefined,
    userContext: UserContext
  ): Promise<TicketWithRelations> {
    const existing = await this.getById(id, userContext);

    // Check authorization
    this.checkTicketAccess(existing, userContext, 'update');

    // Validate transition
    if (!canTransitionStatus(existing.status, newStatus)) {
      throw new ValidationError(
        `Invalid status transition from ${existing.status} to ${newStatus}`
      );
    }

    await prisma.$transaction(async (tx) => {
      // Update status
      await ticketRepository.updateStatus(id, newStatus, userContext, tx);

      // Log activity
      await ticketRepository.logActivity(
        {
          ticketId: id,
          activityType: 'STATUS_CHANGED',
          fieldChanged: 'status',
          oldValue: existing.status,
          newValue: newStatus,
          details: reason ? { reason } : undefined,
        },
        userContext,
        tx
      );

      // Log status history
      await tx.ticketStatusHistory.create({
        data: {
          ticketId: id,
          fromStatus: existing.status,
          toStatus: newStatus,
          changedById: userContext.id,
          reason,
        },
      });
    });

    logger.info('[TicketService] Ticket status changed', {
      ticketId: id,
      fromStatus: existing.status,
      toStatus: newStatus,
      changedById: userContext.id,
    });

    return this.getById(id, userContext);
  },

  // ==========================================================================
  // Assignment
  // ==========================================================================

  /**
   * Assign a ticket
   */
  async assign(
    id: number,
    data: AssignTicketInput,
    userContext: UserContext
  ): Promise<TicketWithRelations> {
    const existing = await this.getById(id, userContext);

    // Check authorization
    this.checkTicketAccess(existing, userContext, 'assign');

    const previousAssigneeId = existing.assignedToId;

    await prisma.$transaction(async (tx) => {
      // Update assignment
      await ticketRepository.update(
        id,
        {
          assignedToId: data.assignedToId,
          teamId: data.teamId,
        },
        userContext,
        tx
      );

      // Log assignment only when assigning to a user (TicketAssignment.assignedToId is required FK to User)
      if (data.assignedToId != null) {
        await tx.ticketAssignment.create({
          data: {
            ticketId: id,
            assignedById: userContext.id,
            assignedToId: data.assignedToId,
            notes: data.reason,
          },
        });
      }

      // Log activity
      const activityType = data.isEscalation
        ? 'ESCALATED'
        : previousAssigneeId
          ? 'REASSIGNED'
          : 'ASSIGNED';

      await ticketRepository.logActivity(
        {
          ticketId: id,
          activityType,
          fieldChanged: 'assignedToId',
          oldValue: String(previousAssigneeId ?? ''),
          newValue: String(data.assignedToId ?? ''),
          details: { reason: data.reason, isEscalation: data.isEscalation },
        },
        userContext,
        tx
      );

      // Auto-add assignee as watcher
      if (data.assignedToId) {
        await ticketRepository.addWatcher(
          id,
          data.assignedToId,
          {
            notifyOnComment: true,
            notifyOnStatus: true,
            notifyOnResolve: true,
          },
          userContext.id,
          tx
        );
      }
    });

    logger.info('[TicketService] Ticket assigned', {
      ticketId: id,
      previousAssigneeId,
      newAssigneeId: data.assignedToId,
      assignedById: userContext.id,
    });

    return this.getById(id, userContext);
  },

  // ==========================================================================
  // Resolution
  // ==========================================================================

  /**
   * Resolve a ticket
   */
  async resolve(
    id: number,
    data: ResolveTicketInput,
    userContext: UserContext
  ): Promise<TicketWithRelations> {
    const existing = await this.getById(id, userContext);

    // Check authorization
    this.checkTicketAccess(existing, userContext, 'resolve');

    // Validate can resolve
    if (!canTransitionStatus(existing.status, 'RESOLVED')) {
      throw new ValidationError(`Cannot resolve ticket in ${existing.status} status`);
    }

    if (!data.resolutionNotes?.trim()) {
      throw new ValidationError('Resolution notes are required');
    }

    await prisma.$transaction(async (tx) => {
      // Update ticket
      await tx.ticket.update({
        where: { id },
        data: {
          status: 'RESOLVED',
          disposition: data.disposition,
          resolutionNotes: data.resolutionNotes,
          rootCause: data.rootCause,
          resolvedAt: new Date(),
          resolvedById: userContext.id,
          lastActivityAt: new Date(),
        },
      });

      // Log activity
      await ticketRepository.logActivity(
        {
          ticketId: id,
          activityType: 'RESOLVED',
          details: {
            disposition: data.disposition,
            resolutionNotes: data.resolutionNotes,
            rootCause: data.rootCause,
          },
        },
        userContext,
        tx
      );

      // Log status history
      await tx.ticketStatusHistory.create({
        data: {
          ticketId: id,
          fromStatus: existing.status,
          toStatus: 'RESOLVED',
          changedById: userContext.id,
          reason: `Resolved: ${data.disposition}`,
        },
      });
    });

    logger.info('[TicketService] Ticket resolved', {
      ticketId: id,
      disposition: data.disposition,
      resolvedById: userContext.id,
    });

    return this.getById(id, userContext);
  },

  /**
   * Reopen a ticket
   */
  async reopen(id: number, reason: string, userContext: UserContext): Promise<TicketWithRelations> {
    const existing = await this.getById(id, userContext);

    // Check authorization
    this.checkTicketAccess(existing, userContext, 'update');

    // Validate can reopen
    if (!['RESOLVED', 'CLOSED'].includes(existing.status)) {
      throw new ValidationError(`Cannot reopen ticket in ${existing.status} status`);
    }

    if (!reason?.trim()) {
      throw new ValidationError('Reason for reopening is required');
    }

    await prisma.$transaction(async (tx) => {
      // Update ticket
      await ticketRepository.updateStatus(id, 'REOPENED', userContext, tx);

      // Log activity
      await ticketRepository.logActivity(
        {
          ticketId: id,
          activityType: 'REOPENED',
          fieldChanged: 'status',
          oldValue: existing.status,
          newValue: 'REOPENED',
          details: { reason },
        },
        userContext,
        tx
      );

      // Log status history
      await tx.ticketStatusHistory.create({
        data: {
          ticketId: id,
          fromStatus: existing.status,
          toStatus: 'REOPENED',
          changedById: userContext.id,
          reason,
        },
      });
    });

    logger.info('[TicketService] Ticket reopened', {
      ticketId: id,
      previousStatus: existing.status,
      reason,
      reopenedById: userContext.id,
    });

    return this.getById(id, userContext);
  },

  // ==========================================================================
  // Comments
  // ==========================================================================

  /**
   * Get comments for a ticket
   */
  async getComments(
    ticketId: number,
    userContext: UserContext
  ): Promise<TicketCommentWithAuthor[]> {
    // Verify access
    await this.getById(ticketId, userContext);

    // Staff can see internal comments, patients cannot
    const includeInternal = userContext.role !== 'patient';

    return ticketRepository.getComments(ticketId, { includeInternal });
  },

  /**
   * Add a comment to a ticket
   */
  async addComment(
    data: CreateCommentInput,
    userContext: UserContext
  ): Promise<TicketCommentWithAuthor> {
    // Verify access
    const ticket = await this.getById(data.ticketId, userContext);

    // Patients can only add non-internal comments
    if (userContext.role === 'patient' && data.isInternal) {
      throw new ForbiddenError('Patients cannot add internal notes');
    }

    if (!data.content?.trim()) {
      throw new ValidationError('Comment content is required');
    }

    const comment = await prisma.$transaction(async (tx) => {
      // Add comment
      const newComment = await ticketRepository.addComment(
        data.ticketId,
        {
          content: data.content,
          isInternal: data.isInternal,
          mentions: data.mentions,
        },
        userContext,
        tx
      );

      // Log activity
      await ticketRepository.logActivity(
        {
          ticketId: data.ticketId,
          activityType: data.isInternal ? 'INTERNAL_NOTE_ADDED' : 'COMMENT_ADDED',
          details: {
            commentId: newComment.id,
            isInternal: data.isInternal,
            mentions: data.mentions,
          },
        },
        userContext,
        tx
      );

      return newComment;
    });

    logger.info('[TicketService] Comment added', {
      ticketId: data.ticketId,
      commentId: comment.id,
      isInternal: data.isInternal,
      authorId: userContext.id,
    });

    return comment as TicketCommentWithAuthor;
  },

  // ==========================================================================
  // Activity Log
  // ==========================================================================

  /**
   * Get activity log for a ticket
   */
  async getActivities(
    ticketId: number,
    userContext: UserContext,
    options: { limit?: number; offset?: number } = {}
  ): Promise<TicketActivityWithUser[]> {
    // Verify access
    await this.getById(ticketId, userContext);

    return ticketRepository.getActivities(ticketId, options);
  },

  // ==========================================================================
  // Watchers
  // ==========================================================================

  /**
   * Add a watcher to a ticket
   */
  async addWatcher(ticketId: number, data: AddWatcherInput, userContext: UserContext) {
    // Verify access
    await this.getById(ticketId, userContext);

    await prisma.$transaction(async (tx) => {
      await ticketRepository.addWatcher(
        ticketId,
        data.userId,
        {
          notifyOnComment: data.notifyOnComment,
          notifyOnStatus: data.notifyOnStatus,
          notifyOnAssign: data.notifyOnAssign,
          notifyOnResolve: data.notifyOnResolve,
        },
        userContext.id,
        tx
      );

      await ticketRepository.logActivity(
        {
          ticketId,
          activityType: 'WATCHER_ADDED',
          details: { watcherId: data.userId },
        },
        userContext,
        tx
      );
    });

    logger.info('[TicketService] Watcher added', {
      ticketId,
      watcherId: data.userId,
      addedById: userContext.id,
    });
  },

  /**
   * Remove a watcher from a ticket
   */
  async removeWatcher(ticketId: number, userId: number, userContext: UserContext) {
    // Verify access
    await this.getById(ticketId, userContext);

    await prisma.$transaction(async (tx) => {
      await ticketRepository.removeWatcher(ticketId, userId, tx);

      await ticketRepository.logActivity(
        {
          ticketId,
          activityType: 'WATCHER_REMOVED',
          details: { watcherId: userId },
        },
        userContext,
        tx
      );
    });

    logger.info('[TicketService] Watcher removed', {
      ticketId,
      watcherId: userId,
      removedById: userContext.id,
    });
  },

  // ==========================================================================
  // Merge
  // ==========================================================================

  /**
   * Merge tickets
   */
  async merge(data: MergeTicketsInput, userContext: UserContext): Promise<TicketWithRelations> {
    const sourceTicket = await this.getById(data.sourceTicketId, userContext);
    const targetTicket = await this.getById(data.targetTicketId, userContext);

    // Validate both tickets are in same clinic
    if (sourceTicket.clinicId !== targetTicket.clinicId) {
      throw new ValidationError('Cannot merge tickets from different clinics');
    }

    // Cannot merge closed/cancelled tickets
    if (['CLOSED', 'CANCELLED'].includes(sourceTicket.status)) {
      throw new ValidationError('Cannot merge a closed or cancelled ticket');
    }

    await prisma.$transaction(async (tx) => {
      let commentsTransferred = 0;
      let attachmentsTransferred = 0;

      // Transfer comments if requested
      if (data.transferComments) {
        const result = await tx.ticketComment.updateMany({
          where: { ticketId: data.sourceTicketId },
          data: { ticketId: data.targetTicketId },
        });
        commentsTransferred = result.count;
      }

      // Transfer attachments if requested
      if (data.transferAttachments) {
        const result = await tx.ticketAttachment.updateMany({
          where: { ticketId: data.sourceTicketId },
          data: { ticketId: data.targetTicketId },
        });
        attachmentsTransferred = result.count;
      }

      // Create merge record
      await tx.ticketMerge.create({
        data: {
          sourceTicketId: data.sourceTicketId,
          targetTicketId: data.targetTicketId,
          mergedById: userContext.id,
          reason: data.reason,
          commentsTransferred,
          attachmentsTransferred,
        },
      });

      // Close source ticket
      await tx.ticket.update({
        where: { id: data.sourceTicketId },
        data: {
          status: 'CLOSED',
          disposition: 'DUPLICATE',
          closedAt: new Date(),
          closedById: userContext.id,
          resolutionNotes: `Merged into ticket ${targetTicket.ticketNumber}`,
        },
      });

      // Log activity on both tickets
      await ticketRepository.logActivity(
        {
          ticketId: data.sourceTicketId,
          activityType: 'MERGED',
          details: {
            mergedInto: data.targetTicketId,
            targetTicketNumber: targetTicket.ticketNumber,
            reason: data.reason,
          },
        },
        userContext,
        tx
      );

      await ticketRepository.logActivity(
        {
          ticketId: data.targetTicketId,
          activityType: 'MERGED',
          details: {
            mergedFrom: data.sourceTicketId,
            sourceTicketNumber: sourceTicket.ticketNumber,
            reason: data.reason,
            commentsTransferred,
            attachmentsTransferred,
          },
        },
        userContext,
        tx
      );
    });

    logger.info('[TicketService] Tickets merged', {
      sourceTicketId: data.sourceTicketId,
      targetTicketId: data.targetTicketId,
      mergedById: userContext.id,
    });

    return this.getById(data.targetTicketId, userContext);
  },

  // ==========================================================================
  // Bulk Operations
  // ==========================================================================

  /**
   * Bulk update tickets
   */
  async bulkUpdate(
    data: BulkUpdateTicketsInput,
    userContext: UserContext
  ): Promise<{ updated: number }> {
    // Verify all tickets exist and user has access
    const tickets = await prisma.ticket.findMany({
      where: {
        id: { in: data.ticketIds },
        ...(userContext.role !== 'super_admin' ? { clinicId: userContext.clinicId } : {}),
      },
      select: { id: true },
    });

    const accessibleIds = tickets.map((t) => t.id);

    if (accessibleIds.length !== data.ticketIds.length) {
      logger.warn('[TicketService] Bulk update - some tickets not accessible', {
        requested: data.ticketIds,
        accessible: accessibleIds,
        userId: userContext.id,
      });
    }

    const result = await ticketRepository.bulkUpdate(accessibleIds, data.updates, userContext);

    logger.info('[TicketService] Bulk update completed', {
      updatedCount: result.count,
      updates: Object.keys(data.updates),
      updatedById: userContext.id,
    });

    return { updated: result.count };
  },

  // ==========================================================================
  // Statistics
  // ==========================================================================

  /**
   * Get ticket statistics
   */
  async getStats(clinicId: number, userContext: UserContext): Promise<TicketStats> {
    // Validate clinic access
    if (userContext.role !== 'super_admin') {
      if (clinicId !== userContext.clinicId) {
        throw new ForbiddenError('Cannot access statistics for another clinic');
      }
    }

    const stats = await ticketRepository.getStats(clinicId);

    return {
      total: stats.total,
      byStatus: stats.byStatus as Record<TicketStatus, number>,
      byPriority: stats.byPriority as Record<string, number>,
      byCategory: {} as Record<string, number>, // TODO: Implement
      unassigned: stats.unassigned,
      overdue: 0, // TODO: Calculate based on due dates
      slaBreach: stats.slaBreach,
      avgResolutionTime: 0, // TODO: Calculate
      avgFirstResponseTime: 0, // TODO: Calculate
    };
  },

  // ==========================================================================
  // Authorization Helpers
  // ==========================================================================

  /**
   * Check if user has access to perform an action on a ticket
   */
  checkTicketAccess(
    ticket: TicketWithRelations,
    userContext: UserContext,
    action: 'view' | 'update' | 'assign' | 'resolve' | 'delete'
  ): void {
    // Super admins have full access
    if (userContext.role === 'super_admin') return;

    // Clinic isolation
    if (ticket.clinicId !== userContext.clinicId) {
      throw new ForbiddenError('You do not have access to this ticket');
    }

    // Patient can only view tickets they created or are about them
    if (userContext.role === 'patient') {
      if (action !== 'view') {
        throw new ForbiddenError('Patients can only view tickets');
      }
      if (ticket.createdById !== userContext.id && ticket.patientId !== userContext.patientId) {
        throw new ForbiddenError('You do not have access to this ticket');
      }
    }

    // Other roles have full access within their clinic
  },
};
