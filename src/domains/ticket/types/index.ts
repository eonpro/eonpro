/**
 * Enterprise Ticket System - Type Definitions
 * ============================================
 *
 * Comprehensive type definitions for the ticket system including
 * all entities, DTOs, and service interfaces.
 *
 * @module domains/ticket/types
 */

import type {
  Ticket,
  TicketComment,
  TicketAssignment,
  TicketStatusHistory,
  TicketWorkLog,
  TicketEscalation,
  TicketSLA,
  TicketTeam,
  TicketTeamMember,
  TicketWatcher,
  TicketRelation,
  TicketAttachment,
  TicketActivity,
  TicketMerge,
  SlaPolicyConfig,
  TicketBusinessHours,
  TicketMacro,
  TicketTemplate,
  TicketAutomationRule,
  TicketSavedView,
  TicketCsat,
  User,
  Patient,
  Order,
  Clinic,
  TicketPriority,
  TicketStatus,
  TicketCategory,
  TicketDisposition,
  TicketSource,
  TicketAction,
  TicketActivityType,
  AutomationTrigger,
  AutomationActionType,
} from '@prisma/client';

// Re-export Prisma enums for convenience
export type {
  TicketPriority,
  TicketStatus,
  TicketCategory,
  TicketDisposition,
  TicketSource,
  TicketAction,
  TicketActivityType,
  AutomationTrigger,
  AutomationActionType,
};

// Re-export base models
export type {
  Ticket,
  TicketComment,
  TicketAssignment,
  TicketStatusHistory,
  TicketWorkLog,
  TicketEscalation,
  TicketSLA,
  TicketTeam,
  TicketTeamMember,
  TicketWatcher,
  TicketRelation,
  TicketAttachment,
  TicketActivity,
  TicketMerge,
  SlaPolicyConfig,
  TicketBusinessHours,
  TicketMacro,
  TicketTemplate,
  TicketAutomationRule,
  TicketSavedView,
  TicketCsat,
};

// ============================================================================
// Extended Types with Relations
// ============================================================================

export interface TicketWithRelations extends Ticket {
  clinic?: Clinic | null;
  patient?: Patient | null;
  order?: Order | null;
  createdBy: User;
  assignedTo?: User | null;
  team?: TicketTeam | null;
  currentOwner?: User | null;
  lastWorkedBy?: User | null;
  resolvedBy?: User | null;
  lockedBy?: User | null;
  closedBy?: User | null;
  parentTicket?: Ticket | null;
  childTickets?: Ticket[];
  comments?: TicketComment[];
  assignments?: TicketAssignment[];
  statusHistory?: TicketStatusHistory[];
  workLogs?: TicketWorkLog[];
  escalations?: TicketEscalation[];
  sla?: TicketSLA | null;
  watchers?: TicketWatcher[];
  relations?: TicketRelation[];
  attachmentFiles?: TicketAttachment[];
  activities?: TicketActivity[];
  csat?: TicketCsat | null;
}

export interface TicketListItem {
  id: number;
  ticketNumber: string;
  title: string;
  status: TicketStatus;
  priority: TicketPriority;
  category: TicketCategory;
  source: TicketSource;
  createdAt: Date;
  updatedAt: Date;
  lastActivityAt: Date;
  dueDate?: Date | null;
  assignedTo?: {
    id: number;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  team?: {
    id: number;
    name: string;
    color?: string | null;
  } | null;
  createdBy: {
    id: number;
    firstName: string;
    lastName: string;
  };
  patient?: {
    id: number;
    firstName: string;
    lastName: string;
    patientId?: string | null;
  } | null;
  sla?: {
    firstResponseDue?: Date | null;
    resolutionDue?: Date | null;
    breached: boolean;
  } | null;
  _count?: {
    comments: number;
    attachmentFiles: number;
    watchers: number;
  };
}

export interface TicketCommentWithAuthor extends TicketComment {
  author: {
    id: number;
    firstName: string;
    lastName: string;
    email: string;
    role: string;
  };
}

export interface TicketActivityWithUser extends TicketActivity {
  user?: {
    id: number;
    firstName: string;
    lastName: string;
  } | null;
  automation?: {
    id: number;
    name: string;
  } | null;
}

export interface TicketTeamWithMembers extends TicketTeam {
  members: (TicketTeamMember & {
    user: {
      id: number;
      firstName: string;
      lastName: string;
      email: string;
      role: string;
    };
  })[];
  _count?: {
    tickets: number;
    members: number;
  };
}

// ============================================================================
// Input DTOs (Data Transfer Objects)
// ============================================================================

export interface CreateTicketInput {
  clinicId: number;
  title: string;
  description: string;
  category?: TicketCategory;
  priority?: TicketPriority;
  source?: TicketSource;
  assignedToId?: number;
  teamId?: number;
  patientId?: number;
  orderId?: number;
  dueDate?: Date;
  tags?: string[];
  customFields?: Record<string, unknown>;
  reporterEmail?: string;
  reporterName?: string;
  reporterPhone?: string;
  parentTicketId?: number;
}

export interface UpdateTicketInput {
  title?: string;
  description?: string;
  category?: TicketCategory;
  priority?: TicketPriority;
  status?: TicketStatus;
  assignedToId?: number | null;
  teamId?: number | null;
  patientId?: number | null;
  orderId?: number | null;
  dueDate?: Date | null;
  tags?: string[];
  customFields?: Record<string, unknown>;
  internalNote?: string;
}

export interface AssignTicketInput {
  assignedToId?: number | null;
  teamId?: number | null;
  reason?: string;
  isEscalation?: boolean;
}

export interface ResolveTicketInput {
  disposition: TicketDisposition;
  resolutionNotes: string;
  rootCause?: string;
}

export interface CreateCommentInput {
  ticketId: number;
  content: string;
  isInternal?: boolean;
  mentions?: number[];
  attachments?: Array<{
    fileName: string;
    fileType: string;
    fileSize: number;
    fileUrl: string;
    thumbnailUrl?: string;
  }>;
}

export interface UpdateCommentInput {
  content: string;
}

export interface AddWatcherInput {
  userId: number;
  notifyOnComment?: boolean;
  notifyOnStatus?: boolean;
  notifyOnAssign?: boolean;
  notifyOnResolve?: boolean;
}

export interface CreateRelationInput {
  ticketId: number;
  relationType: 'Patient' | 'Order' | 'Prescription' | 'Ticket' | 'Provider';
  relatedId: number;
  relatedDisplay?: string;
  relationNote?: string;
}

export interface MergeTicketsInput {
  sourceTicketId: number;
  targetTicketId: number;
  reason?: string;
  transferComments?: boolean;
  transferAttachments?: boolean;
}

export interface BulkUpdateTicketsInput {
  ticketIds: number[];
  updates: {
    status?: TicketStatus;
    priority?: TicketPriority;
    category?: TicketCategory;
    assignedToId?: number | null;
    teamId?: number | null;
    addTags?: string[];
    removeTags?: string[];
  };
}

// ============================================================================
// Filter & Query Types
// ============================================================================

export interface TicketListFilters {
  clinicId?: number;
  status?: TicketStatus | TicketStatus[];
  priority?: TicketPriority | TicketPriority[];
  category?: TicketCategory | TicketCategory[];
  source?: TicketSource | TicketSource[];
  assignedToId?: number | null;
  teamId?: number | null;
  createdById?: number;
  patientId?: number;
  orderId?: number;
  parentTicketId?: number;
  search?: string;
  tags?: string[];
  hasSlaBreach?: boolean;
  isUnassigned?: boolean;
  myTickets?: boolean; // Assigned to current user
  myWatched?: boolean; // Current user is watching
  createdAfter?: Date;
  createdBefore?: Date;
  updatedAfter?: Date;
  dueAfter?: Date;
  dueBefore?: Date;
}

export interface TicketListOptions {
  page?: number;
  limit?: number;
  sortBy?:
    | 'createdAt'
    | 'updatedAt'
    | 'lastActivityAt'
    | 'priority'
    | 'dueDate'
    | 'ticketNumber';
  sortOrder?: 'asc' | 'desc';
  includeDeleted?: boolean;
}

export interface TicketListResult {
  tickets: TicketListItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

// ============================================================================
// Team & SLA Configuration Types
// ============================================================================

export interface CreateTeamInput {
  clinicId: number;
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  defaultPriority?: TicketPriority;
  defaultSlaPolicyId?: number;
  autoAssignEnabled?: boolean;
  roundRobinEnabled?: boolean;
  maxTicketsPerMember?: number;
}

export interface UpdateTeamInput {
  name?: string;
  description?: string;
  color?: string;
  icon?: string;
  defaultPriority?: TicketPriority;
  defaultSlaPolicyId?: number;
  autoAssignEnabled?: boolean;
  roundRobinEnabled?: boolean;
  maxTicketsPerMember?: number;
  isActive?: boolean;
}

export interface AddTeamMemberInput {
  teamId: number;
  userId: number;
  isLead?: boolean;
  skills?: string[];
  capacity?: number;
}

export interface CreateSlaPolicyInput {
  clinicId: number;
  name: string;
  description?: string;
  priority?: TicketPriority;
  category?: TicketCategory;
  isDefault?: boolean;
  firstResponseMinutes: number;
  resolutionMinutes: number;
  nextResponseMinutes?: number;
  businessHoursId?: number;
  respectBusinessHours?: boolean;
  escalateOnBreach?: boolean;
  warningThresholdPct?: number;
  escalateToTeamId?: number;
  escalateToUserId?: number;
}

export interface CreateBusinessHoursInput {
  clinicId: number;
  name: string;
  timezone?: string;
  schedule: Array<{
    dayOfWeek: number; // 0-6, Sunday = 0
    startTime: string; // HH:MM
    endTime: string; // HH:MM
    isOpen: boolean;
  }>;
  holidays?: Array<{
    date: string; // YYYY-MM-DD
    name: string;
  }>;
  isDefault?: boolean;
}

// ============================================================================
// Macro & Template Types
// ============================================================================

export interface CreateMacroInput {
  clinicId: number;
  name: string;
  description?: string;
  category?: TicketCategory;
  teamId?: number;
  responseTitle?: string;
  responseContent: string;
  isHtmlContent?: boolean;
  setStatus?: TicketStatus;
  setPriority?: TicketPriority;
  setCategory?: TicketCategory;
  addTags?: string[];
  removeTags?: string[];
  isPersonal?: boolean;
}

export interface CreateTemplateInput {
  clinicId: number;
  name: string;
  description?: string;
  category: TicketCategory;
  titleTemplate: string;
  descriptionTemplate: string;
  priority?: TicketPriority;
  source?: TicketSource;
  defaultTeamId?: number;
  defaultAssigneeId?: number;
  tags?: string[];
  customFieldsSchema?: Record<string, unknown>;
}

// ============================================================================
// Automation Types
// ============================================================================

export interface AutomationCondition {
  field: string;
  operator:
    | 'equals'
    | 'not_equals'
    | 'contains'
    | 'not_contains'
    | 'in'
    | 'not_in'
    | 'greater_than'
    | 'less_than'
    | 'is_set'
    | 'is_not_set';
  value: unknown;
}

export interface AutomationAction {
  action: AutomationActionType;
  params: Record<string, unknown>;
}

export interface CreateAutomationInput {
  clinicId: number;
  name: string;
  description?: string;
  trigger: AutomationTrigger;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  priority?: number;
  stopOnMatch?: boolean;
  scheduleExpression?: string;
}

// ============================================================================
// Saved View Types
// ============================================================================

export interface CreateSavedViewInput {
  clinicId: number;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  filters: TicketListFilters;
  sortField?: string;
  sortOrder?: 'asc' | 'desc';
  columns?: string[];
  isPersonal?: boolean;
  isDefault?: boolean;
  position?: number;
}

// ============================================================================
// Statistics & Dashboard Types
// ============================================================================

export interface TicketStats {
  total: number;
  byStatus: Record<TicketStatus, number>;
  byPriority: Record<TicketPriority, number>;
  byCategory: Record<TicketCategory, number>;
  unassigned: number;
  overdue: number;
  slaBreach: number;
  avgResolutionTime: number; // in minutes
  avgFirstResponseTime: number; // in minutes
}

export interface TicketTrend {
  date: string; // YYYY-MM-DD
  created: number;
  resolved: number;
  closed: number;
}

export interface AgentPerformance {
  userId: number;
  userName: string;
  ticketsAssigned: number;
  ticketsResolved: number;
  avgResolutionTime: number;
  avgFirstResponseTime: number;
  csatAverage: number;
  slaBreachCount: number;
}

// ============================================================================
// Notification Types
// ============================================================================

export interface TicketNotificationData {
  ticketId: number;
  ticketNumber: string;
  title: string;
  action: string;
  actorId: number;
  actorName: string;
  recipientIds: number[];
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Service Result Types
// ============================================================================

export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

export interface PaginatedResult<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}
