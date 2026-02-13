/**
 * Ticket Domain
 * =============
 *
 * Enterprise ticket system for problem resolution.
 * Provides comprehensive ticket management with teams, SLA,
 * automation, and full audit trail.
 *
 * @module domains/ticket
 */

// Services
export { ticketService } from './services';

// Error tracking (Sentry + observability)
export { reportTicketError, type TicketErrorContext } from './lib/ticket-error-tracking';

// Repositories
export { ticketRepository } from './repositories';

// Types
export type {
  // Base types
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
  // Enums
  TicketPriority,
  TicketStatus,
  TicketCategory,
  TicketDisposition,
  TicketSource,
  TicketAction,
  TicketActivityType,
  AutomationTrigger,
  AutomationActionType,
  // Extended types
  TicketWithRelations,
  TicketListItem,
  TicketCommentWithAuthor,
  TicketActivityWithUser,
  TicketTeamWithMembers,
  // Input types
  CreateTicketInput,
  UpdateTicketInput,
  AssignTicketInput,
  ResolveTicketInput,
  CreateCommentInput,
  UpdateCommentInput,
  AddWatcherInput,
  CreateRelationInput,
  MergeTicketsInput,
  BulkUpdateTicketsInput,
  CreateTeamInput,
  UpdateTeamInput,
  AddTeamMemberInput,
  CreateSlaPolicyInput,
  CreateBusinessHoursInput,
  CreateMacroInput,
  CreateTemplateInput,
  CreateAutomationInput,
  CreateSavedViewInput,
  // Filter types
  TicketListFilters,
  TicketListOptions,
  TicketListResult,
  // Statistics types
  TicketStats,
  TicketTrend,
  AgentPerformance,
  // Other types
  AutomationCondition,
  AutomationAction,
  TicketNotificationData,
  ServiceResult,
  TicketPaginatedResult,
} from './types';
