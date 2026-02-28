/**
 * Ticket Repository
 * =================
 *
 * Data access layer for ticket operations.
 * Handles all database operations with proper clinic isolation and audit trails.
 *
 * @module domains/ticket/repositories
 */

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { decryptPHI } from '@/lib/security/phi-encryption';
import type { Prisma, TicketStatus, TicketPriority } from '@prisma/client';
import type {
  Ticket,
  TicketListItem,
  TicketWithRelations,
  TicketListFilters,
  TicketListOptions,
  TicketListResult,
  CreateTicketInput,
  UpdateTicketInput,
  TicketCommentWithAuthor,
  TicketActivityWithUser,
} from '../types';
import type { UserContext } from '@/domains/shared/types';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Decrypt patient PHI fields in ticket query results.
 * Patient firstName/lastName are encrypted at rest; this decrypts them for display.
 */
function decryptPatientFields<T extends { patient?: { firstName?: string | null; lastName?: string | null } | null }>(
  record: T
): T {
  if (record.patient) {
    return {
      ...record,
      patient: {
        ...record.patient,
        firstName: decryptPHI(record.patient.firstName ?? null) ?? record.patient.firstName,
        lastName: decryptPHI(record.patient.lastName ?? null) ?? record.patient.lastName,
      },
    };
  }
  return record;
}

/**
 * Generate next ticket number for a clinic
 */
async function generateTicketNumber(
  clinicId: number,
  tx?: Prisma.TransactionClient
): Promise<string> {
  const db = tx || prisma;

  // Get clinic prefix or use default
  const clinic = await db.clinic.findUnique({
    where: { id: clinicId },
    select: { subdomain: true },
  });

  const prefix = clinic?.subdomain?.toUpperCase().slice(0, 3) || 'TKT';

  // Count existing tickets for this clinic
  const count = await db.ticket.count({
    where: { clinicId },
  });

  // Format: TKT-000001
  const number = String(count + 1).padStart(6, '0');
  return `${prefix}-${number}`;
}

/**
 * Build where clause from filters
 */
function buildWhereClause(
  filters: TicketListFilters,
  userContext: UserContext
): Prisma.TicketWhereInput {
  const where: Prisma.TicketWhereInput = {};

  // Clinic isolation (always applied unless super admin)
  if (userContext.role !== 'super_admin') {
    where.clinicId = userContext.clinicId;
  } else if (filters.clinicId) {
    where.clinicId = filters.clinicId;
  }

  // Status filter
  if (filters.status) {
    where.status = Array.isArray(filters.status) ? { in: filters.status } : filters.status;
  }

  // Priority filter
  if (filters.priority) {
    where.priority = Array.isArray(filters.priority) ? { in: filters.priority } : filters.priority;
  }

  // Category filter
  if (filters.category) {
    where.category = Array.isArray(filters.category) ? { in: filters.category } : filters.category;
  }

  // Source filter
  if (filters.source) {
    where.source = Array.isArray(filters.source) ? { in: filters.source } : filters.source;
  }

  // Assignment filters
  if (filters.isUnassigned) {
    where.assignedToId = null;
  } else if (filters.assignedToId !== undefined) {
    where.assignedToId = filters.assignedToId;
  }

  if (filters.teamId !== undefined) {
    where.teamId = filters.teamId;
  }

  if (filters.createdById) {
    where.createdById = filters.createdById;
  }

  // My tickets filter
  if (filters.myTickets && userContext.id) {
    where.assignedToId = userContext.id;
  }

  // My watched tickets
  if (filters.myWatched && userContext.id) {
    where.watchers = {
      some: { userId: userContext.id },
    };
  }

  // Related entity filters
  if (filters.patientId) {
    where.patientId = filters.patientId;
  }

  if (filters.orderId) {
    where.orderId = filters.orderId;
  }

  if (filters.parentTicketId) {
    where.parentTicketId = filters.parentTicketId;
  }

  // Search (trim whitespace for intuitive matching)
  const searchTrimmed = filters.search?.trim();
  if (searchTrimmed) {
    where.OR = [
      { title: { contains: searchTrimmed, mode: 'insensitive' } },
      { description: { contains: searchTrimmed, mode: 'insensitive' } },
      { ticketNumber: { contains: searchTrimmed, mode: 'insensitive' } },
    ];
  }

  // Tags filter
  if (filters.tags && filters.tags.length > 0) {
    where.tags = { hasSome: filters.tags };
  }

  // SLA breach filter
  if (filters.hasSlaBreach) {
    where.sla = { breached: true };
  }

  // Date filters
  if (filters.createdAfter) {
    where.createdAt = { ...(where.createdAt as object), gte: filters.createdAfter };
  }
  if (filters.createdBefore) {
    where.createdAt = { ...(where.createdAt as object), lte: filters.createdBefore };
  }
  if (filters.updatedAfter) {
    where.updatedAt = { gte: filters.updatedAfter };
  }
  if (filters.dueAfter) {
    where.dueDate = { ...(where.dueDate as object), gte: filters.dueAfter };
  }
  if (filters.dueBefore) {
    where.dueDate = { ...(where.dueDate as object), lte: filters.dueBefore };
  }

  return where;
}

/**
 * Build order by clause from options
 */
function buildOrderBy(options: TicketListOptions): Prisma.TicketOrderByWithRelationInput {
  const sortBy = options.sortBy || 'createdAt';
  const sortOrder = options.sortOrder || 'desc';

  const orderByMap: Record<string, Prisma.TicketOrderByWithRelationInput> = {
    createdAt: { createdAt: sortOrder },
    updatedAt: { updatedAt: sortOrder },
    lastActivityAt: { lastActivityAt: sortOrder },
    priority: { priority: sortOrder },
    dueDate: { dueDate: sortOrder },
    ticketNumber: { ticketNumber: sortOrder },
  };

  return orderByMap[sortBy] || { createdAt: sortOrder };
}

// ============================================================================
// Repository Implementation
// ============================================================================

export const ticketRepository = {
  // ==========================================================================
  // Ticket CRUD
  // ==========================================================================

  /**
   * Create a new ticket
   */
  async create(
    data: CreateTicketInput,
    userContext: UserContext,
    tx?: Prisma.TransactionClient
  ): Promise<Ticket> {
    const db = tx || prisma;

    const ticketNumber = await generateTicketNumber(data.clinicId, tx);

    const ticket = await db.ticket.create({
      data: {
        clinicId: data.clinicId,
        ticketNumber,
        title: data.title,
        description: data.description,
        category: data.category || 'GENERAL',
        priority: data.priority || 'P3_MEDIUM',
        source: data.source || 'INTERNAL',
        status: 'NEW',
        createdById: userContext.id,
        assignedToId: data.assignedToId,
        teamId: data.teamId,
        patientId: data.patientId,
        orderId: data.orderId,
        dueDate: data.dueDate,
        tags: data.tags || [],
        customFields: data.customFields as any,
        reporterEmail: data.reporterEmail,
        reporterName: data.reporterName,
        reporterPhone: data.reporterPhone,
        parentTicketId: data.parentTicketId,
        assignedAt: data.assignedToId ? new Date() : null,
      },
    });

    logger.info('[TicketRepository] Ticket created', {
      ticketId: ticket.id,
      ticketNumber: ticket.ticketNumber,
      clinicId: ticket.clinicId,
      createdById: userContext.id,
    });

    return ticket;
  },

  /**
   * Find ticket by ID with full relations
   */
  async findById(id: number, userContext: UserContext): Promise<TicketWithRelations | null> {
    const ticket = await prisma.ticket.findUnique({
      where: { id },
      include: {
        clinic: true,
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            patientId: true,
            email: true,
            phone: true,
          },
        },
        order: {
          select: {
            id: true,
            referenceId: true,
            status: true,
            createdAt: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
          },
        },
        assignedTo: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
          },
        },
        team: {
          select: {
            id: true,
            name: true,
            color: true,
            icon: true,
          },
        },
        currentOwner: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        resolvedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        lockedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        sla: {
          include: {
            slaPolicy: true,
          },
        },
        watchers: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
        _count: {
          select: {
            comments: true,
            attachmentFiles: true,
            childTickets: true,
          },
        },
      },
    });

    if (!ticket) return null;

    // Clinic isolation check
    if (userContext.role !== 'super_admin' && ticket.clinicId !== userContext.clinicId) {
      logger.security('[TicketRepository] Cross-clinic access blocked', {
        userId: userContext.id,
        userClinicId: userContext.clinicId,
        ticketClinicId: ticket.clinicId,
        ticketId: id,
      });
      return null;
    }

    return decryptPatientFields(ticket) as unknown as TicketWithRelations;
  },

  /**
   * Find ticket by ticket number
   */
  async findByTicketNumber(
    ticketNumber: string,
    userContext: UserContext
  ): Promise<TicketWithRelations | null> {
    const ticket = await prisma.ticket.findUnique({
      where: { ticketNumber },
      include: {
        clinic: true,
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        assignedTo: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        sla: true,
      },
    });

    if (!ticket) return null;

    // Clinic isolation check
    if (userContext.role !== 'super_admin' && ticket.clinicId !== userContext.clinicId) {
      return null;
    }

    return ticket as TicketWithRelations;
  },

  /**
   * List tickets with filters and pagination
   */
  async findMany(
    filters: TicketListFilters,
    options: TicketListOptions,
    userContext: UserContext
  ): Promise<TicketListResult> {
    const page = options.page || 1;
    const limit = Math.min(options.limit || 20, 100);
    const skip = (page - 1) * limit;

    const where = buildWhereClause(filters, userContext);
    const orderBy = buildOrderBy(options);

    const [tickets, total] = await Promise.all([
      prisma.ticket.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        select: {
          id: true,
          ticketNumber: true,
          title: true,
          status: true,
          priority: true,
          category: true,
          source: true,
          createdAt: true,
          updatedAt: true,
          lastActivityAt: true,
          dueDate: true,
          assignedTo: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          team: {
            select: {
              id: true,
              name: true,
              color: true,
            },
          },
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          patient: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              patientId: true,
            },
          },
          sla: {
            select: {
              firstResponseDue: true,
              resolutionDue: true,
              breached: true,
            },
          },
          _count: {
            select: {
              comments: true,
              attachmentFiles: true,
              watchers: true,
            },
          },
        },
      }),
      prisma.ticket.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    const decryptedTickets = tickets.map((t) => decryptPatientFields(t));

    return {
      tickets: decryptedTickets as TicketListItem[],
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasMore: page < totalPages,
      },
    };
  },

  /**
   * Update a ticket
   */
  async update(
    id: number,
    data: UpdateTicketInput,
    userContext: UserContext,
    tx?: Prisma.TransactionClient
  ): Promise<Ticket> {
    const db = tx || prisma;

    // Use UncheckedUpdateInput to allow direct ID field assignments
    const updateData: Prisma.TicketUncheckedUpdateInput = {
      lastActivityAt: new Date(),
    };

    if (data.title !== undefined) updateData.title = data.title;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.category !== undefined) updateData.category = data.category;
    if (data.priority !== undefined) updateData.priority = data.priority;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.dueDate !== undefined) updateData.dueDate = data.dueDate;
    if (data.tags !== undefined) updateData.tags = data.tags;
    if (data.customFields !== undefined) updateData.customFields = data.customFields as any;
    if (data.internalNote !== undefined) updateData.internalNote = data.internalNote;

    // Assignment updates
    if (data.assignedToId !== undefined) {
      updateData.assignedToId = data.assignedToId;
      updateData.assignedAt = data.assignedToId ? new Date() : null;
    }
    if (data.teamId !== undefined) {
      updateData.teamId = data.teamId;
    }

    // Related entity updates
    if (data.patientId !== undefined) updateData.patientId = data.patientId;
    if (data.orderId !== undefined) updateData.orderId = data.orderId;

    const ticket = await db.ticket.update({
      where: { id },
      data: updateData,
    });

    logger.info('[TicketRepository] Ticket updated', {
      ticketId: id,
      updatedFields: Object.keys(data),
      updatedById: userContext.id,
    });

    return ticket;
  },

  /**
   * Update ticket status
   */
  async updateStatus(
    id: number,
    status: TicketStatus,
    userContext: UserContext,
    tx?: Prisma.TransactionClient
  ): Promise<Ticket> {
    const db = tx || prisma;

    // Use UncheckedUpdateInput to allow direct ID field assignments
    const updateData: Prisma.TicketUncheckedUpdateInput = {
      status,
      lastActivityAt: new Date(),
    };

    // Handle special status transitions
    if (status === 'RESOLVED') {
      updateData.resolvedAt = new Date();
      updateData.resolvedById = userContext.id;
    } else if (status === 'CLOSED') {
      updateData.closedAt = new Date();
      updateData.closedById = userContext.id;
    } else if (status === 'REOPENED') {
      updateData.reopenCount = { increment: 1 };
      updateData.lastReopenedAt = new Date();
      updateData.lastReopenedById = userContext.id;
      // Clear resolution fields
      updateData.resolvedAt = null;
      updateData.resolvedById = null;
      updateData.disposition = null;
    }

    const ticket = await db.ticket.update({
      where: { id },
      data: updateData,
    });

    return ticket;
  },

  // ==========================================================================
  // Comments
  // ==========================================================================

  /**
   * Get comments for a ticket
   */
  async getComments(
    ticketId: number,
    options: { includeInternal?: boolean } = {}
  ): Promise<TicketCommentWithAuthor[]> {
    const comments = await prisma.ticketComment.findMany({
      where: {
        ticketId,
        ...(options.includeInternal ? {} : { isInternal: false }),
      },
      orderBy: { createdAt: 'asc' },
      include: {
        author: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
          },
        },
      },
    });

    return comments as TicketCommentWithAuthor[];
  },

  /**
   * Add a comment to a ticket
   */
  async addComment(
    ticketId: number,
    data: {
      content: string;
      isInternal?: boolean;
      mentions?: number[];
      attachments?: unknown;
    },
    userContext: UserContext,
    tx?: Prisma.TransactionClient
  ) {
    const db = tx || prisma;

    const comment = await db.ticketComment.create({
      data: {
        ticketId,
        authorId: userContext.id,
        comment: data.content,
        isInternal: data.isInternal || false,
        attachments: data.attachments as any,
      },
      include: {
        author: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
          },
        },
      },
    });

    // Update ticket last activity
    await db.ticket.update({
      where: { id: ticketId },
      data: { lastActivityAt: new Date() },
    });

    return comment;
  },

  // ==========================================================================
  // Activity Log
  // ==========================================================================

  /**
   * Get activity log for a ticket
   */
  async getActivities(
    ticketId: number,
    options: { limit?: number; offset?: number } = {}
  ): Promise<TicketActivityWithUser[]> {
    const activities = await prisma.ticketActivity.findMany({
      where: { ticketId },
      orderBy: { createdAt: 'desc' },
      take: options.limit || 50,
      skip: options.offset || 0,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        automation: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return activities as TicketActivityWithUser[];
  },

  /**
   * Log an activity
   */
  async logActivity(
    data: {
      ticketId: number;
      activityType: string;
      fieldChanged?: string;
      oldValue?: string;
      newValue?: string;
      details?: unknown;
      automationId?: number;
      ipAddress?: string;
      userAgent?: string;
    },
    userContext: UserContext,
    tx?: Prisma.TransactionClient
  ) {
    const db = tx || prisma;

    return db.ticketActivity.create({
      data: {
        ticketId: data.ticketId,
        userId: userContext.id,
        activityType: data.activityType as never,
        fieldChanged: data.fieldChanged,
        oldValue: data.oldValue,
        newValue: data.newValue,
        details: data.details as any,
        automationId: data.automationId,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
      },
    });
  },

  // ==========================================================================
  // Watchers
  // ==========================================================================

  /**
   * Add a watcher to a ticket
   */
  async addWatcher(
    ticketId: number,
    userId: number,
    options: {
      notifyOnComment?: boolean;
      notifyOnStatus?: boolean;
      notifyOnAssign?: boolean;
      notifyOnResolve?: boolean;
    },
    addedById: number,
    tx?: Prisma.TransactionClient
  ) {
    const db = tx || prisma;

    return db.ticketWatcher.upsert({
      where: {
        ticketId_userId: { ticketId, userId },
      },
      create: {
        ticketId,
        userId,
        addedById,
        notifyOnComment: options.notifyOnComment ?? true,
        notifyOnStatus: options.notifyOnStatus ?? true,
        notifyOnAssign: options.notifyOnAssign ?? false,
        notifyOnResolve: options.notifyOnResolve ?? true,
      },
      update: {
        notifyOnComment: options.notifyOnComment,
        notifyOnStatus: options.notifyOnStatus,
        notifyOnAssign: options.notifyOnAssign,
        notifyOnResolve: options.notifyOnResolve,
      },
    });
  },

  /**
   * Remove a watcher from a ticket
   */
  async removeWatcher(ticketId: number, userId: number, tx?: Prisma.TransactionClient) {
    const db = tx || prisma;

    return db.ticketWatcher.deleteMany({
      where: { ticketId, userId },
    });
  },

  /**
   * Get watchers for a ticket
   */
  async getWatchers(ticketId: number) {
    return prisma.ticketWatcher.findMany({
      where: { ticketId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });
  },

  // ==========================================================================
  // Timeline (merged view)
  // ==========================================================================

  async getTimeline(
    ticketId: number,
    options: { limit?: number; offset?: number } = {}
  ) {
    const take = options.limit || 100;
    const skip = options.offset || 0;

    const [comments, activities, workLogs] = await Promise.all([
      prisma.ticketComment.findMany({
        where: { ticketId },
        orderBy: { createdAt: 'asc' },
        include: {
          author: {
            select: { id: true, firstName: true, lastName: true, email: true, role: true },
          },
        },
      }),
      prisma.ticketActivity.findMany({
        where: {
          ticketId,
          activityType: {
            notIn: ['COMMENT_ADDED', 'INTERNAL_NOTE_ADDED', 'VIEWED', 'LOCKED', 'UNLOCKED'],
          },
        },
        orderBy: { createdAt: 'asc' },
        include: {
          user: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      prisma.ticketWorkLog.findMany({
        where: { ticketId },
        orderBy: { createdAt: 'asc' },
        include: {
          user: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
    ]);

    type TimelineRaw = {
      id: string;
      type: string;
      timestamp: Date;
      actor: { id: number; firstName: string; lastName: string } | null;
      content: string;
      metadata?: Record<string, unknown>;
    };

    const entries: TimelineRaw[] = [];

    for (const c of comments) {
      entries.push({
        id: `comment-${c.id}`,
        type: c.isInternal ? 'internal_note' : 'comment',
        timestamp: c.createdAt,
        actor: c.author ? { id: c.author.id, firstName: c.author.firstName, lastName: c.author.lastName } : null,
        content: c.comment,
        metadata: { isInternal: c.isInternal, commentId: c.id },
      });
    }

    for (const a of activities) {
      let content = a.activityType.toLowerCase().replace(/_/g, ' ');
      if (a.fieldChanged) {
        content += ` ${a.fieldChanged}`;
        if (a.oldValue && a.newValue) {
          content += ` from ${a.oldValue.replace(/_/g, ' ')} to ${a.newValue.replace(/_/g, ' ')}`;
        }
      }

      let type = 'system';
      if (['STATUS_CHANGED'].includes(a.activityType)) type = 'status_change';
      else if (['ASSIGNED', 'REASSIGNED', 'UNASSIGNED'].includes(a.activityType)) type = 'assignment';
      else if (['ESCALATED'].includes(a.activityType)) type = 'escalation';
      else if (['RESOLVED'].includes(a.activityType)) type = 'resolution';
      else if (['REOPENED'].includes(a.activityType)) type = 'reopen';
      else if (['CREATED'].includes(a.activityType)) type = 'created';

      entries.push({
        id: `activity-${a.id}`,
        type,
        timestamp: a.createdAt,
        actor: a.user,
        content,
        metadata: {
          activityType: a.activityType,
          fieldChanged: a.fieldChanged,
          oldValue: a.oldValue,
          newValue: a.newValue,
          ...(a.details && typeof a.details === 'object' ? a.details as Record<string, unknown> : {}),
        },
      });
    }

    for (const w of workLogs) {
      entries.push({
        id: `worklog-${w.id}`,
        type: 'work_log',
        timestamp: w.createdAt,
        actor: w.user,
        content: w.description,
        metadata: {
          action: w.action,
          duration: w.duration,
          isInternal: w.isInternal,
          workLogId: w.id,
        },
      });
    }

    entries.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    const sliced = entries.slice(skip, skip + take);

    return sliced.map((e) => ({
      ...e,
      timestamp: e.timestamp.toISOString(),
    }));
  },

  // ==========================================================================
  // Work Log
  // ==========================================================================

  async createWorkLog(
    data: {
      ticketId: number;
      userId: number;
      action: string;
      duration?: number;
      description: string;
      isInternal?: boolean;
      metadata?: unknown;
    },
    tx?: Prisma.TransactionClient
  ) {
    const db = tx || prisma;

    const workLog = await db.ticketWorkLog.create({
      data: {
        ticketId: data.ticketId,
        userId: data.userId,
        action: data.action as never,
        duration: data.duration || null,
        description: data.description,
        isInternal: data.isInternal ?? true,
        metadata: data.metadata as any,
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
      },
    });

    await db.ticket.update({
      where: { id: data.ticketId },
      data: {
        lastWorkedById: data.userId,
        lastWorkedAt: new Date(),
        lastActivityAt: new Date(),
        ...(data.duration ? { actualWorkTime: { increment: data.duration } } : {}),
      },
    });

    return workLog;
  },

  async getWorkLogSummary(ticketId: number) {
    const workLogs = await prisma.ticketWorkLog.findMany({
      where: { ticketId },
      select: { duration: true, userId: true },
    });

    const totalMinutes = workLogs.reduce((sum, w) => sum + (w.duration || 0), 0);
    const uniqueWorkers = new Set(workLogs.map((w) => w.userId)).size;

    return { totalMinutes, totalEntries: workLogs.length, uniqueWorkers };
  },

  // ==========================================================================
  // Statistics
  // ==========================================================================

  /**
   * Get ticket statistics for a clinic
   */
  async getStats(clinicId: number) {
    const [total, byStatus, byPriority, byCategory, slaBreach, unassigned, resolvedTickets] = await Promise.all([
      prisma.ticket.count({ where: { clinicId } }),
      prisma.ticket.groupBy({
        by: ['status'],
        where: { clinicId },
        _count: { status: true },
      }),
      prisma.ticket.groupBy({
        by: ['priority'],
        where: { clinicId },
        _count: { priority: true },
      }),
      prisma.ticket.groupBy({
        by: ['category'],
        where: { clinicId },
        _count: { category: true },
      }),
      prisma.ticket.count({
        where: {
          clinicId,
          sla: { breached: true },
          status: { notIn: ['CLOSED', 'CANCELLED', 'RESOLVED'] },
        },
      }),
      prisma.ticket.count({
        where: {
          clinicId,
          assignedToId: null,
          status: { notIn: ['CLOSED', 'CANCELLED', 'RESOLVED'] },
        },
      }),
      prisma.ticket.findMany({
        where: {
          clinicId,
          resolvedAt: { not: null },
          createdAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
        },
        select: { createdAt: true, resolvedAt: true },
        take: 1000,
      }),
    ]);

    let avgResolutionTime = 0;
    if (resolvedTickets.length > 0) {
      const totalMinutes = resolvedTickets.reduce((sum, t) => {
        if (!t.resolvedAt) return sum;
        return sum + (t.resolvedAt.getTime() - t.createdAt.getTime()) / 60000;
      }, 0);
      avgResolutionTime = Math.round(totalMinutes / resolvedTickets.length);
    }

    return {
      total,
      byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count.status])),
      byPriority: Object.fromEntries(byPriority.map((p) => [p.priority, p._count.priority])),
      byCategory: Object.fromEntries(byCategory.map((c) => [c.category, c._count.category])),
      slaBreach,
      unassigned,
      avgResolutionTime,
    };
  },

  async getTrends(clinicId: number, days: number = 30) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [created, resolved] = await Promise.all([
      prisma.ticket.findMany({
        where: { clinicId, createdAt: { gte: since } },
        select: { createdAt: true },
      }),
      prisma.ticket.findMany({
        where: { clinicId, resolvedAt: { gte: since } },
        select: { resolvedAt: true },
      }),
    ]);

    const dateMap = new Map<string, { created: number; resolved: number }>();
    for (let i = 0; i < days; i++) {
      const d = new Date(Date.now() - (days - 1 - i) * 24 * 60 * 60 * 1000);
      const key = d.toISOString().split('T')[0];
      dateMap.set(key, { created: 0, resolved: 0 });
    }

    for (const t of created) {
      const key = t.createdAt.toISOString().split('T')[0];
      const entry = dateMap.get(key);
      if (entry) entry.created++;
    }
    for (const t of resolved) {
      if (!t.resolvedAt) continue;
      const key = t.resolvedAt.toISOString().split('T')[0];
      const entry = dateMap.get(key);
      if (entry) entry.resolved++;
    }

    return Array.from(dateMap.entries()).map(([date, counts]) => ({
      date,
      ...counts,
    }));
  },

  async getAgentPerformance(clinicId: number) {
    const agents = await prisma.user.findMany({
      where: {
        status: 'ACTIVE',
        role: { in: ['ADMIN', 'STAFF', 'PROVIDER', 'SUPPORT'] },
        OR: [
          { clinicId },
          { userClinics: { some: { clinicId, isActive: true } } },
        ],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        role: true,
        _count: {
          select: {
            ticketsAssigned: { where: { clinicId, status: { notIn: ['CLOSED', 'CANCELLED'] } } },
          },
        },
      },
    });

    const results = [];
    for (const agent of agents) {
      const resolved = await prisma.ticket.count({
        where: { clinicId, resolvedById: agent.id },
      });

      const resolvedWithTime = await prisma.ticket.findMany({
        where: {
          clinicId,
          resolvedById: agent.id,
          resolvedAt: { not: null },
          createdAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
        },
        select: { createdAt: true, resolvedAt: true },
        take: 200,
      });

      let avgTime = 0;
      if (resolvedWithTime.length > 0) {
        const total = resolvedWithTime.reduce((s, t) =>
          s + ((t.resolvedAt?.getTime() || 0) - t.createdAt.getTime()) / 60000, 0);
        avgTime = Math.round(total / resolvedWithTime.length);
      }

      if (agent._count.ticketsAssigned > 0 || resolved > 0) {
        results.push({
          userId: agent.id,
          name: `${agent.firstName} ${agent.lastName}`,
          role: agent.role,
          openTickets: agent._count.ticketsAssigned,
          resolvedTickets: resolved,
          avgResolutionMinutes: avgTime,
        });
      }
    }

    return results.sort((a, b) => b.resolvedTickets - a.resolvedTickets);
  },

  // ==========================================================================
  // Bulk Operations
  // ==========================================================================

  /**
   * Bulk update tickets
   */
  async bulkUpdate(
    ticketIds: number[],
    data: Partial<UpdateTicketInput>,
    userContext: UserContext,
    tx?: Prisma.TransactionClient
  ) {
    const db = tx || prisma;

    const updateData: Prisma.TicketUncheckedUpdateInput = {
      lastActivityAt: new Date(),
    };

    if (data.status !== undefined) updateData.status = data.status;
    if (data.priority !== undefined) updateData.priority = data.priority;
    if (data.category !== undefined) updateData.category = data.category;
    if (data.assignedToId !== undefined) {
      updateData.assignedToId = data.assignedToId;
      updateData.assignedAt = data.assignedToId ? new Date() : null;
    }
    if (data.teamId !== undefined) updateData.teamId = data.teamId;

    return db.ticket.updateMany({
      where: {
        id: { in: ticketIds },
        // Clinic isolation
        ...(userContext.role !== 'super_admin' ? { clinicId: userContext.clinicId } : {}),
      },
      data: updateData,
    });
  },
};
