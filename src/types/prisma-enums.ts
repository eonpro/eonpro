/**
 * AUTO-GENERATED — DO NOT EDIT MANUALLY
 * Generated from prisma/schema.prisma on 2026-02-28
 * Run: node scripts/generate-prisma-enums.js
 *
 * Client-safe Prisma enum types. Use these in 'use client' components instead of
 * importing from '@prisma/client', which pulls Node.js-only runtime code.
 */

export type ReconciliationStatus =
  | 'PENDING'
  | 'MATCHED'
  | 'CREATED'
  | 'FAILED'
  | 'SKIPPED';

export const ReconciliationStatus = {
  PENDING: 'PENDING' as const,
  MATCHED: 'MATCHED' as const,
  CREATED: 'CREATED' as const,
  FAILED: 'FAILED' as const,
  SKIPPED: 'SKIPPED' as const,
} as const;

export type ProfileStatus =
  | 'ACTIVE'
  | 'PENDING_COMPLETION'
  | 'MERGED'
  | 'ARCHIVED';

export const ProfileStatus = {
  ACTIVE: 'ACTIVE' as const,
  PENDING_COMPLETION: 'PENDING_COMPLETION' as const,
  MERGED: 'MERGED' as const,
  ARCHIVED: 'ARCHIVED' as const,
} as const;

export type InfluencerStatus =
  | 'ACTIVE'
  | 'INACTIVE'
  | 'SUSPENDED'
  | 'PENDING_APPROVAL';

export const InfluencerStatus = {
  ACTIVE: 'ACTIVE' as const,
  INACTIVE: 'INACTIVE' as const,
  SUSPENDED: 'SUSPENDED' as const,
  PENDING_APPROVAL: 'PENDING_APPROVAL' as const,
} as const;

export type CommissionStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'PAID'
  | 'CANCELLED'
  | 'DISPUTED';

export const CommissionStatus = {
  PENDING: 'PENDING' as const,
  APPROVED: 'APPROVED' as const,
  PAID: 'PAID' as const,
  CANCELLED: 'CANCELLED' as const,
  DISPUTED: 'DISPUTED' as const,
} as const;

export type PayoutStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export const PayoutStatus = {
  PENDING: 'PENDING' as const,
  PROCESSING: 'PROCESSING' as const,
  COMPLETED: 'COMPLETED' as const,
  FAILED: 'FAILED' as const,
  CANCELLED: 'CANCELLED' as const,
} as const;

export type PatientDocumentCategory =
  | 'MEDICAL_INTAKE_FORM'
  | 'MEDICAL_RECORDS'
  | 'LAB_RESULTS'
  | 'INSURANCE'
  | 'CONSENT_FORMS'
  | 'PRESCRIPTIONS'
  | 'IMAGING'
  | 'ID_PHOTO'
  | 'OTHER';

export const PatientDocumentCategory = {
  MEDICAL_INTAKE_FORM: 'MEDICAL_INTAKE_FORM' as const,
  MEDICAL_RECORDS: 'MEDICAL_RECORDS' as const,
  LAB_RESULTS: 'LAB_RESULTS' as const,
  INSURANCE: 'INSURANCE' as const,
  CONSENT_FORMS: 'CONSENT_FORMS' as const,
  PRESCRIPTIONS: 'PRESCRIPTIONS' as const,
  IMAGING: 'IMAGING' as const,
  ID_PHOTO: 'ID_PHOTO' as const,
  OTHER: 'OTHER' as const,
} as const;

export type WebhookStatus =
  | 'SUCCESS'
  | 'ERROR'
  | 'INVALID_AUTH'
  | 'INVALID_PAYLOAD'
  | 'PROCESSING_ERROR';

export const WebhookStatus = {
  SUCCESS: 'SUCCESS' as const,
  ERROR: 'ERROR' as const,
  INVALID_AUTH: 'INVALID_AUTH' as const,
  INVALID_PAYLOAD: 'INVALID_PAYLOAD' as const,
  PROCESSING_ERROR: 'PROCESSING_ERROR' as const,
} as const;

export type InvoiceStatus =
  | 'DRAFT'
  | 'OPEN'
  | 'PAID'
  | 'VOID'
  | 'UNCOLLECTIBLE'
  | 'REFUNDED'
  | 'PARTIALLY_REFUNDED';

export const InvoiceStatus = {
  DRAFT: 'DRAFT' as const,
  OPEN: 'OPEN' as const,
  PAID: 'PAID' as const,
  VOID: 'VOID' as const,
  UNCOLLECTIBLE: 'UNCOLLECTIBLE' as const,
  REFUNDED: 'REFUNDED' as const,
  PARTIALLY_REFUNDED: 'PARTIALLY_REFUNDED' as const,
} as const;

export type PaymentStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CANCELED'
  | 'REFUNDED'
  | 'PARTIALLY_REFUNDED';

export const PaymentStatus = {
  PENDING: 'PENDING' as const,
  PROCESSING: 'PROCESSING' as const,
  SUCCEEDED: 'SUCCEEDED' as const,
  FAILED: 'FAILED' as const,
  CANCELED: 'CANCELED' as const,
  REFUNDED: 'REFUNDED' as const,
  PARTIALLY_REFUNDED: 'PARTIALLY_REFUNDED' as const,
} as const;

export type SOAPNoteStatus =
  | 'DRAFT'
  | 'PENDING_REVIEW'
  | 'APPROVED'
  | 'LOCKED'
  | 'ARCHIVED';

export const SOAPNoteStatus = {
  DRAFT: 'DRAFT' as const,
  PENDING_REVIEW: 'PENDING_REVIEW' as const,
  APPROVED: 'APPROVED' as const,
  LOCKED: 'LOCKED' as const,
  ARCHIVED: 'ARCHIVED' as const,
} as const;

export type SOAPSourceType =
  | 'MANUAL'
  | 'MEDLINK_INTAKE'
  | 'AI_GENERATED'
  | 'IMPORTED'
  | 'INVOICE_METADATA';

export const SOAPSourceType = {
  MANUAL: 'MANUAL' as const,
  MEDLINK_INTAKE: 'MEDLINK_INTAKE' as const,
  AI_GENERATED: 'AI_GENERATED' as const,
  IMPORTED: 'IMPORTED' as const,
  INVOICE_METADATA: 'INVOICE_METADATA' as const,
} as const;

export type SubscriptionStatus =
  | 'ACTIVE'
  | 'PAUSED'
  | 'CANCELED'
  | 'PAST_DUE'
  | 'EXPIRED';

export const SubscriptionStatus = {
  ACTIVE: 'ACTIVE' as const,
  PAUSED: 'PAUSED' as const,
  CANCELED: 'CANCELED' as const,
  PAST_DUE: 'PAST_DUE' as const,
  EXPIRED: 'EXPIRED' as const,
} as const;

export type UserRole =
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'PROVIDER'
  | 'INFLUENCER'
  | 'AFFILIATE'
  | 'PATIENT'
  | 'STAFF'
  | 'SUPPORT'
  | 'SALES_REP';

export const UserRole = {
  SUPER_ADMIN: 'SUPER_ADMIN' as const,
  ADMIN: 'ADMIN' as const,
  PROVIDER: 'PROVIDER' as const,
  INFLUENCER: 'INFLUENCER' as const,
  AFFILIATE: 'AFFILIATE' as const,
  PATIENT: 'PATIENT' as const,
  STAFF: 'STAFF' as const,
  SUPPORT: 'SUPPORT' as const,
  SALES_REP: 'SALES_REP' as const,
} as const;

export type UserStatus =
  | 'ACTIVE'
  | 'INACTIVE'
  | 'SUSPENDED'
  | 'PENDING_VERIFICATION'
  | 'LOCKED';

export const UserStatus = {
  ACTIVE: 'ACTIVE' as const,
  INACTIVE: 'INACTIVE' as const,
  SUSPENDED: 'SUSPENDED' as const,
  PENDING_VERIFICATION: 'PENDING_VERIFICATION' as const,
  LOCKED: 'LOCKED' as const,
} as const;

export type ProviderStatus =
  | 'ACTIVE'
  | 'ARCHIVED'
  | 'SUSPENDED';

export const ProviderStatus = {
  ACTIVE: 'ACTIVE' as const,
  ARCHIVED: 'ARCHIVED' as const,
  SUSPENDED: 'SUSPENDED' as const,
} as const;

export type IntegrationStatus =
  | 'ACTIVE'
  | 'INACTIVE'
  | 'ERROR'
  | 'MAINTENANCE';

export const IntegrationStatus = {
  ACTIVE: 'ACTIVE' as const,
  INACTIVE: 'INACTIVE' as const,
  ERROR: 'ERROR' as const,
  MAINTENANCE: 'MAINTENANCE' as const,
} as const;

export type ApiKeyStatus =
  | 'ACTIVE'
  | 'INACTIVE'
  | 'EXPIRED'
  | 'REVOKED';

export const ApiKeyStatus = {
  ACTIVE: 'ACTIVE' as const,
  INACTIVE: 'INACTIVE' as const,
  EXPIRED: 'EXPIRED' as const,
  REVOKED: 'REVOKED' as const,
} as const;

export type WebhookDeliveryStatus =
  | 'PENDING'
  | 'DELIVERED'
  | 'FAILED'
  | 'RETRYING';

export const WebhookDeliveryStatus = {
  PENDING: 'PENDING' as const,
  DELIVERED: 'DELIVERED' as const,
  FAILED: 'FAILED' as const,
  RETRYING: 'RETRYING' as const,
} as const;

export type InternalMessageType =
  | 'DIRECT'
  | 'BROADCAST'
  | 'CHANNEL'
  | 'ALERT';

export const InternalMessageType = {
  DIRECT: 'DIRECT' as const,
  BROADCAST: 'BROADCAST' as const,
  CHANNEL: 'CHANNEL' as const,
  ALERT: 'ALERT' as const,
} as const;

export type TicketPriority =
  | 'P5_PLANNING'
  | 'P4_LOW'
  | 'P3_MEDIUM'
  | 'P2_HIGH'
  | 'P1_URGENT'
  | 'P0_CRITICAL'
  | 'LOW'
  | 'MEDIUM'
  | 'HIGH'
  | 'URGENT';

export const TicketPriority = {
  P5_PLANNING: 'P5_PLANNING' as const,
  P4_LOW: 'P4_LOW' as const,
  P3_MEDIUM: 'P3_MEDIUM' as const,
  P2_HIGH: 'P2_HIGH' as const,
  P1_URGENT: 'P1_URGENT' as const,
  P0_CRITICAL: 'P0_CRITICAL' as const,
  LOW: 'LOW' as const,
  MEDIUM: 'MEDIUM' as const,
  HIGH: 'HIGH' as const,
  URGENT: 'URGENT' as const,
} as const;

export type TicketStatus =
  | 'NEW'
  | 'OPEN'
  | 'IN_PROGRESS'
  | 'PENDING'
  | 'PENDING_CUSTOMER'
  | 'PENDING_INTERNAL'
  | 'ON_HOLD'
  | 'ESCALATED'
  | 'RESOLVED'
  | 'CLOSED'
  | 'CANCELLED'
  | 'REOPENED';

export const TicketStatus = {
  NEW: 'NEW' as const,
  OPEN: 'OPEN' as const,
  IN_PROGRESS: 'IN_PROGRESS' as const,
  PENDING: 'PENDING' as const,
  PENDING_CUSTOMER: 'PENDING_CUSTOMER' as const,
  PENDING_INTERNAL: 'PENDING_INTERNAL' as const,
  ON_HOLD: 'ON_HOLD' as const,
  ESCALATED: 'ESCALATED' as const,
  RESOLVED: 'RESOLVED' as const,
  CLOSED: 'CLOSED' as const,
  CANCELLED: 'CANCELLED' as const,
  REOPENED: 'REOPENED' as const,
} as const;

export type TicketDisposition =
  | 'RESOLVED_SUCCESSFULLY'
  | 'RESOLVED_WITH_WORKAROUND'
  | 'NOT_RESOLVED'
  | 'DUPLICATE'
  | 'NOT_REPRODUCIBLE'
  | 'BY_DESIGN'
  | 'CUSTOMER_ERROR'
  | 'TRAINING_ISSUE'
  | 'REFERRED_TO_SPECIALIST'
  | 'PENDING_CUSTOMER'
  | 'CANCELLED_BY_CUSTOMER';

export const TicketDisposition = {
  RESOLVED_SUCCESSFULLY: 'RESOLVED_SUCCESSFULLY' as const,
  RESOLVED_WITH_WORKAROUND: 'RESOLVED_WITH_WORKAROUND' as const,
  NOT_RESOLVED: 'NOT_RESOLVED' as const,
  DUPLICATE: 'DUPLICATE' as const,
  NOT_REPRODUCIBLE: 'NOT_REPRODUCIBLE' as const,
  BY_DESIGN: 'BY_DESIGN' as const,
  CUSTOMER_ERROR: 'CUSTOMER_ERROR' as const,
  TRAINING_ISSUE: 'TRAINING_ISSUE' as const,
  REFERRED_TO_SPECIALIST: 'REFERRED_TO_SPECIALIST' as const,
  PENDING_CUSTOMER: 'PENDING_CUSTOMER' as const,
  CANCELLED_BY_CUSTOMER: 'CANCELLED_BY_CUSTOMER' as const,
} as const;

export type TicketCategory =
  | 'PATIENT_ISSUE'
  | 'PATIENT_COMPLAINT'
  | 'PATIENT_REQUEST'
  | 'ORDER_ISSUE'
  | 'ORDER_MODIFICATION'
  | 'SHIPPING_ISSUE'
  | 'REFUND_REQUEST'
  | 'PRESCRIPTION'
  | 'PRESCRIPTION_ISSUE'
  | 'PROVIDER_INQUIRY'
  | 'CLINICAL_QUESTION'
  | 'MEDICATION_QUESTION'
  | 'SIDE_EFFECTS'
  | 'DOSAGE'
  | 'REFILL'
  | 'SYSTEM_BUG'
  | 'FEATURE_REQUEST'
  | 'ACCESS_ISSUE'
  | 'INTEGRATION_ERROR'
  | 'TECHNICAL_ISSUE'
  | 'PORTAL_ACCESS'
  | 'BILLING'
  | 'BILLING_ISSUE'
  | 'COMPLIANCE_ISSUE'
  | 'DATA_CORRECTION'
  | 'ACCOUNT_ISSUE'
  | 'INSURANCE'
  | 'APPOINTMENT'
  | 'SCHEDULING_ISSUE'
  | 'GENERAL'
  | 'GENERAL_INQUIRY'
  | 'FEEDBACK'
  | 'DELIVERY'
  | 'OTHER';

export const TicketCategory = {
  PATIENT_ISSUE: 'PATIENT_ISSUE' as const,
  PATIENT_COMPLAINT: 'PATIENT_COMPLAINT' as const,
  PATIENT_REQUEST: 'PATIENT_REQUEST' as const,
  ORDER_ISSUE: 'ORDER_ISSUE' as const,
  ORDER_MODIFICATION: 'ORDER_MODIFICATION' as const,
  SHIPPING_ISSUE: 'SHIPPING_ISSUE' as const,
  REFUND_REQUEST: 'REFUND_REQUEST' as const,
  PRESCRIPTION: 'PRESCRIPTION' as const,
  PRESCRIPTION_ISSUE: 'PRESCRIPTION_ISSUE' as const,
  PROVIDER_INQUIRY: 'PROVIDER_INQUIRY' as const,
  CLINICAL_QUESTION: 'CLINICAL_QUESTION' as const,
  MEDICATION_QUESTION: 'MEDICATION_QUESTION' as const,
  SIDE_EFFECTS: 'SIDE_EFFECTS' as const,
  DOSAGE: 'DOSAGE' as const,
  REFILL: 'REFILL' as const,
  SYSTEM_BUG: 'SYSTEM_BUG' as const,
  FEATURE_REQUEST: 'FEATURE_REQUEST' as const,
  ACCESS_ISSUE: 'ACCESS_ISSUE' as const,
  INTEGRATION_ERROR: 'INTEGRATION_ERROR' as const,
  TECHNICAL_ISSUE: 'TECHNICAL_ISSUE' as const,
  PORTAL_ACCESS: 'PORTAL_ACCESS' as const,
  BILLING: 'BILLING' as const,
  BILLING_ISSUE: 'BILLING_ISSUE' as const,
  COMPLIANCE_ISSUE: 'COMPLIANCE_ISSUE' as const,
  DATA_CORRECTION: 'DATA_CORRECTION' as const,
  ACCOUNT_ISSUE: 'ACCOUNT_ISSUE' as const,
  INSURANCE: 'INSURANCE' as const,
  APPOINTMENT: 'APPOINTMENT' as const,
  SCHEDULING_ISSUE: 'SCHEDULING_ISSUE' as const,
  GENERAL: 'GENERAL' as const,
  GENERAL_INQUIRY: 'GENERAL_INQUIRY' as const,
  FEEDBACK: 'FEEDBACK' as const,
  DELIVERY: 'DELIVERY' as const,
  OTHER: 'OTHER' as const,
} as const;

export type TicketAction =
  | 'CREATED'
  | 'ASSIGNED'
  | 'REASSIGNED'
  | 'STARTED_WORK'
  | 'STOPPED_WORK'
  | 'ADDED_COMMENT'
  | 'UPDATED_STATUS'
  | 'ESCALATED'
  | 'DE_ESCALATED'
  | 'REQUESTED_INFO'
  | 'PROVIDED_INFO'
  | 'RESEARCHED'
  | 'CONTACTED_PATIENT'
  | 'CONTACTED_PROVIDER'
  | 'CONTACTED_PHARMACY'
  | 'CONTACTED_INSURANCE'
  | 'APPLIED_SOLUTION'
  | 'TESTED_SOLUTION'
  | 'RESOLVED'
  | 'REOPENED'
  | 'CLOSED'
  | 'MERGED'
  | 'SPLIT'
  | 'PRIORITY_CHANGED'
  | 'CATEGORY_CHANGED'
  | 'ATTACHMENT_ADDED'
  | 'WATCHER_ADDED'
  | 'WATCHER_REMOVED'
  | 'LINKED'
  | 'UNLINKED'
  | 'SLA_BREACH_WARNING'
  | 'SLA_BREACHED'
  | 'AUTO_ASSIGNED'
  | 'AUTO_ESCALATED'
  | 'AUTO_CLOSED'
  | 'MENTIONED'
  | 'TIME_LOGGED';

export const TicketAction = {
  CREATED: 'CREATED' as const,
  ASSIGNED: 'ASSIGNED' as const,
  REASSIGNED: 'REASSIGNED' as const,
  STARTED_WORK: 'STARTED_WORK' as const,
  STOPPED_WORK: 'STOPPED_WORK' as const,
  ADDED_COMMENT: 'ADDED_COMMENT' as const,
  UPDATED_STATUS: 'UPDATED_STATUS' as const,
  ESCALATED: 'ESCALATED' as const,
  DE_ESCALATED: 'DE_ESCALATED' as const,
  REQUESTED_INFO: 'REQUESTED_INFO' as const,
  PROVIDED_INFO: 'PROVIDED_INFO' as const,
  RESEARCHED: 'RESEARCHED' as const,
  CONTACTED_PATIENT: 'CONTACTED_PATIENT' as const,
  CONTACTED_PROVIDER: 'CONTACTED_PROVIDER' as const,
  CONTACTED_PHARMACY: 'CONTACTED_PHARMACY' as const,
  CONTACTED_INSURANCE: 'CONTACTED_INSURANCE' as const,
  APPLIED_SOLUTION: 'APPLIED_SOLUTION' as const,
  TESTED_SOLUTION: 'TESTED_SOLUTION' as const,
  RESOLVED: 'RESOLVED' as const,
  REOPENED: 'REOPENED' as const,
  CLOSED: 'CLOSED' as const,
  MERGED: 'MERGED' as const,
  SPLIT: 'SPLIT' as const,
  PRIORITY_CHANGED: 'PRIORITY_CHANGED' as const,
  CATEGORY_CHANGED: 'CATEGORY_CHANGED' as const,
  ATTACHMENT_ADDED: 'ATTACHMENT_ADDED' as const,
  WATCHER_ADDED: 'WATCHER_ADDED' as const,
  WATCHER_REMOVED: 'WATCHER_REMOVED' as const,
  LINKED: 'LINKED' as const,
  UNLINKED: 'UNLINKED' as const,
  SLA_BREACH_WARNING: 'SLA_BREACH_WARNING' as const,
  SLA_BREACHED: 'SLA_BREACHED' as const,
  AUTO_ASSIGNED: 'AUTO_ASSIGNED' as const,
  AUTO_ESCALATED: 'AUTO_ESCALATED' as const,
  AUTO_CLOSED: 'AUTO_CLOSED' as const,
  MENTIONED: 'MENTIONED' as const,
  TIME_LOGGED: 'TIME_LOGGED' as const,
} as const;

export type TicketSource =
  | 'INTERNAL'
  | 'PATIENT_PORTAL'
  | 'PHONE'
  | 'EMAIL'
  | 'CHAT'
  | 'FORM'
  | 'SYSTEM'
  | 'API';

export const TicketSource = {
  INTERNAL: 'INTERNAL' as const,
  PATIENT_PORTAL: 'PATIENT_PORTAL' as const,
  PHONE: 'PHONE' as const,
  EMAIL: 'EMAIL' as const,
  CHAT: 'CHAT' as const,
  FORM: 'FORM' as const,
  SYSTEM: 'SYSTEM' as const,
  API: 'API' as const,
} as const;

export type TicketActivityType =
  | 'CREATED'
  | 'UPDATED'
  | 'STATUS_CHANGED'
  | 'PRIORITY_CHANGED'
  | 'CATEGORY_CHANGED'
  | 'ASSIGNED'
  | 'UNASSIGNED'
  | 'REASSIGNED'
  | 'ESCALATED'
  | 'COMMENT_ADDED'
  | 'INTERNAL_NOTE_ADDED'
  | 'ATTACHMENT_ADDED'
  | 'RESOLVED'
  | 'REOPENED'
  | 'CLOSED'
  | 'LINKED'
  | 'UNLINKED'
  | 'MERGED'
  | 'SPLIT'
  | 'SLA_BREACH_WARNING'
  | 'SLA_BREACHED'
  | 'SLA_PAUSED'
  | 'SLA_RESUMED'
  | 'AUTO_ASSIGNED'
  | 'AUTO_ESCALATED'
  | 'AUTO_CLOSED'
  | 'AUTOMATION_TRIGGERED'
  | 'WATCHER_ADDED'
  | 'WATCHER_REMOVED'
  | 'MENTIONED'
  | 'VIEWED'
  | 'LOCKED'
  | 'UNLOCKED'
  | 'TIME_LOGGED';

export const TicketActivityType = {
  CREATED: 'CREATED' as const,
  UPDATED: 'UPDATED' as const,
  STATUS_CHANGED: 'STATUS_CHANGED' as const,
  PRIORITY_CHANGED: 'PRIORITY_CHANGED' as const,
  CATEGORY_CHANGED: 'CATEGORY_CHANGED' as const,
  ASSIGNED: 'ASSIGNED' as const,
  UNASSIGNED: 'UNASSIGNED' as const,
  REASSIGNED: 'REASSIGNED' as const,
  ESCALATED: 'ESCALATED' as const,
  COMMENT_ADDED: 'COMMENT_ADDED' as const,
  INTERNAL_NOTE_ADDED: 'INTERNAL_NOTE_ADDED' as const,
  ATTACHMENT_ADDED: 'ATTACHMENT_ADDED' as const,
  RESOLVED: 'RESOLVED' as const,
  REOPENED: 'REOPENED' as const,
  CLOSED: 'CLOSED' as const,
  LINKED: 'LINKED' as const,
  UNLINKED: 'UNLINKED' as const,
  MERGED: 'MERGED' as const,
  SPLIT: 'SPLIT' as const,
  SLA_BREACH_WARNING: 'SLA_BREACH_WARNING' as const,
  SLA_BREACHED: 'SLA_BREACHED' as const,
  SLA_PAUSED: 'SLA_PAUSED' as const,
  SLA_RESUMED: 'SLA_RESUMED' as const,
  AUTO_ASSIGNED: 'AUTO_ASSIGNED' as const,
  AUTO_ESCALATED: 'AUTO_ESCALATED' as const,
  AUTO_CLOSED: 'AUTO_CLOSED' as const,
  AUTOMATION_TRIGGERED: 'AUTOMATION_TRIGGERED' as const,
  WATCHER_ADDED: 'WATCHER_ADDED' as const,
  WATCHER_REMOVED: 'WATCHER_REMOVED' as const,
  MENTIONED: 'MENTIONED' as const,
  VIEWED: 'VIEWED' as const,
  LOCKED: 'LOCKED' as const,
  UNLOCKED: 'UNLOCKED' as const,
  TIME_LOGGED: 'TIME_LOGGED' as const,
} as const;

export type SlaMetricType =
  | 'FIRST_RESPONSE'
  | 'RESOLUTION'
  | 'NEXT_RESPONSE';

export const SlaMetricType = {
  FIRST_RESPONSE: 'FIRST_RESPONSE' as const,
  RESOLUTION: 'RESOLUTION' as const,
  NEXT_RESPONSE: 'NEXT_RESPONSE' as const,
} as const;

export type AutomationTrigger =
  | 'ON_CREATE'
  | 'ON_UPDATE'
  | 'ON_STATUS_CHANGE'
  | 'ON_ASSIGNMENT'
  | 'ON_PRIORITY_CHANGE'
  | 'ON_CATEGORY_CHANGE'
  | 'ON_COMMENT_ADDED'
  | 'ON_SLA_WARNING'
  | 'ON_SLA_BREACH'
  | 'ON_NO_ACTIVITY'
  | 'ON_REOPEN'
  | 'SCHEDULED';

export const AutomationTrigger = {
  ON_CREATE: 'ON_CREATE' as const,
  ON_UPDATE: 'ON_UPDATE' as const,
  ON_STATUS_CHANGE: 'ON_STATUS_CHANGE' as const,
  ON_ASSIGNMENT: 'ON_ASSIGNMENT' as const,
  ON_PRIORITY_CHANGE: 'ON_PRIORITY_CHANGE' as const,
  ON_CATEGORY_CHANGE: 'ON_CATEGORY_CHANGE' as const,
  ON_COMMENT_ADDED: 'ON_COMMENT_ADDED' as const,
  ON_SLA_WARNING: 'ON_SLA_WARNING' as const,
  ON_SLA_BREACH: 'ON_SLA_BREACH' as const,
  ON_NO_ACTIVITY: 'ON_NO_ACTIVITY' as const,
  ON_REOPEN: 'ON_REOPEN' as const,
  SCHEDULED: 'SCHEDULED' as const,
} as const;

export type AutomationActionType =
  | 'SET_PRIORITY'
  | 'SET_STATUS'
  | 'SET_CATEGORY'
  | 'ADD_TAG'
  | 'REMOVE_TAG'
  | 'ASSIGN_TO_USER'
  | 'ASSIGN_TO_TEAM'
  | 'ADD_WATCHER'
  | 'SEND_NOTIFICATION'
  | 'SEND_EMAIL'
  | 'ADD_COMMENT'
  | 'ADD_INTERNAL_NOTE'
  | 'ESCALATE'
  | 'CLOSE_TICKET'
  | 'APPLY_MACRO';

export const AutomationActionType = {
  SET_PRIORITY: 'SET_PRIORITY' as const,
  SET_STATUS: 'SET_STATUS' as const,
  SET_CATEGORY: 'SET_CATEGORY' as const,
  ADD_TAG: 'ADD_TAG' as const,
  REMOVE_TAG: 'REMOVE_TAG' as const,
  ASSIGN_TO_USER: 'ASSIGN_TO_USER' as const,
  ASSIGN_TO_TEAM: 'ASSIGN_TO_TEAM' as const,
  ADD_WATCHER: 'ADD_WATCHER' as const,
  SEND_NOTIFICATION: 'SEND_NOTIFICATION' as const,
  SEND_EMAIL: 'SEND_EMAIL' as const,
  ADD_COMMENT: 'ADD_COMMENT' as const,
  ADD_INTERNAL_NOTE: 'ADD_INTERNAL_NOTE' as const,
  ESCALATE: 'ESCALATE' as const,
  CLOSE_TICKET: 'CLOSE_TICKET' as const,
  APPLY_MACRO: 'APPLY_MACRO' as const,
} as const;

export type ClinicStatus =
  | 'ACTIVE'
  | 'INACTIVE'
  | 'SUSPENDED'
  | 'TRIAL'
  | 'EXPIRED'
  | 'PENDING_SETUP';

export const ClinicStatus = {
  ACTIVE: 'ACTIVE' as const,
  INACTIVE: 'INACTIVE' as const,
  SUSPENDED: 'SUSPENDED' as const,
  TRIAL: 'TRIAL' as const,
  EXPIRED: 'EXPIRED' as const,
  PENDING_SETUP: 'PENDING_SETUP' as const,
} as const;

export type AppointmentStatus =
  | 'SCHEDULED'
  | 'CONFIRMED'
  | 'CHECKED_IN'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW'
  | 'RESCHEDULED';

export const AppointmentStatus = {
  SCHEDULED: 'SCHEDULED' as const,
  CONFIRMED: 'CONFIRMED' as const,
  CHECKED_IN: 'CHECKED_IN' as const,
  IN_PROGRESS: 'IN_PROGRESS' as const,
  COMPLETED: 'COMPLETED' as const,
  CANCELLED: 'CANCELLED' as const,
  NO_SHOW: 'NO_SHOW' as const,
  RESCHEDULED: 'RESCHEDULED' as const,
} as const;

export type AppointmentModeType =
  | 'IN_PERSON'
  | 'VIDEO'
  | 'PHONE';

export const AppointmentModeType = {
  IN_PERSON: 'IN_PERSON' as const,
  VIDEO: 'VIDEO' as const,
  PHONE: 'PHONE' as const,
} as const;

export type ReminderType =
  | 'EMAIL'
  | 'SMS'
  | 'BOTH';

export const ReminderType = {
  EMAIL: 'EMAIL' as const,
  SMS: 'SMS' as const,
  BOTH: 'BOTH' as const,
} as const;

export type ReminderStatus =
  | 'PENDING'
  | 'SENT'
  | 'FAILED'
  | 'CANCELLED';

export const ReminderStatus = {
  PENDING: 'PENDING' as const,
  SENT: 'SENT' as const,
  FAILED: 'FAILED' as const,
  CANCELLED: 'CANCELLED' as const,
} as const;

export type CarePlanStatus =
  | 'DRAFT'
  | 'ACTIVE'
  | 'COMPLETED'
  | 'ARCHIVED'
  | 'CANCELLED';

export const CarePlanStatus = {
  DRAFT: 'DRAFT' as const,
  ACTIVE: 'ACTIVE' as const,
  COMPLETED: 'COMPLETED' as const,
  ARCHIVED: 'ARCHIVED' as const,
  CANCELLED: 'CANCELLED' as const,
} as const;

export type GoalStatus =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'PAUSED'
  | 'CANCELLED';

export const GoalStatus = {
  NOT_STARTED: 'NOT_STARTED' as const,
  IN_PROGRESS: 'IN_PROGRESS' as const,
  COMPLETED: 'COMPLETED' as const,
  PAUSED: 'PAUSED' as const,
  CANCELLED: 'CANCELLED' as const,
} as const;

export type MessageDirection =
  | 'INBOUND'
  | 'OUTBOUND';

export const MessageDirection = {
  INBOUND: 'INBOUND' as const,
  OUTBOUND: 'OUTBOUND' as const,
} as const;

export type MessageChannel =
  | 'WEB'
  | 'SMS'
  | 'EMAIL';

export const MessageChannel = {
  WEB: 'WEB' as const,
  SMS: 'SMS' as const,
  EMAIL: 'EMAIL' as const,
} as const;

export type SenderType =
  | 'PATIENT'
  | 'STAFF'
  | 'PROVIDER'
  | 'SYSTEM';

export const SenderType = {
  PATIENT: 'PATIENT' as const,
  STAFF: 'STAFF' as const,
  PROVIDER: 'PROVIDER' as const,
  SYSTEM: 'SYSTEM' as const,
} as const;

export type MessageStatus =
  | 'PENDING'
  | 'SENT'
  | 'DELIVERED'
  | 'READ'
  | 'FAILED';

export const MessageStatus = {
  PENDING: 'PENDING' as const,
  SENT: 'SENT' as const,
  DELIVERED: 'DELIVERED' as const,
  READ: 'READ' as const,
  FAILED: 'FAILED' as const,
} as const;

export type StreakType =
  | 'DAILY_CHECK_IN'
  | 'WEIGHT_LOG'
  | 'WATER_LOG'
  | 'EXERCISE_LOG'
  | 'MEAL_LOG'
  | 'MEDICATION_TAKEN'
  | 'SLEEP_LOG';

export const StreakType = {
  DAILY_CHECK_IN: 'DAILY_CHECK_IN' as const,
  WEIGHT_LOG: 'WEIGHT_LOG' as const,
  WATER_LOG: 'WATER_LOG' as const,
  EXERCISE_LOG: 'EXERCISE_LOG' as const,
  MEAL_LOG: 'MEAL_LOG' as const,
  MEDICATION_TAKEN: 'MEDICATION_TAKEN' as const,
  SLEEP_LOG: 'SLEEP_LOG' as const,
} as const;

export type AchievementCategory =
  | 'GETTING_STARTED'
  | 'CONSISTENCY'
  | 'WEIGHT_LOSS'
  | 'HEALTH_TRACKING'
  | 'ENGAGEMENT'
  | 'MILESTONES'
  | 'SPECIAL';

export const AchievementCategory = {
  GETTING_STARTED: 'GETTING_STARTED' as const,
  CONSISTENCY: 'CONSISTENCY' as const,
  WEIGHT_LOSS: 'WEIGHT_LOSS' as const,
  HEALTH_TRACKING: 'HEALTH_TRACKING' as const,
  ENGAGEMENT: 'ENGAGEMENT' as const,
  MILESTONES: 'MILESTONES' as const,
  SPECIAL: 'SPECIAL' as const,
} as const;

export type AchievementTier =
  | 'BRONZE'
  | 'SILVER'
  | 'GOLD'
  | 'PLATINUM'
  | 'DIAMOND';

export const AchievementTier = {
  BRONZE: 'BRONZE' as const,
  SILVER: 'SILVER' as const,
  GOLD: 'GOLD' as const,
  PLATINUM: 'PLATINUM' as const,
  DIAMOND: 'DIAMOND' as const,
} as const;

export type ChallengeType =
  | 'STREAK'
  | 'CUMULATIVE'
  | 'MILESTONE'
  | 'COMPETITION';

export const ChallengeType = {
  STREAK: 'STREAK' as const,
  CUMULATIVE: 'CUMULATIVE' as const,
  MILESTONE: 'MILESTONE' as const,
  COMPETITION: 'COMPETITION' as const,
} as const;

export type ProductCategory =
  | 'SERVICE'
  | 'MEDICATION'
  | 'SUPPLEMENT'
  | 'LAB_TEST'
  | 'PROCEDURE'
  | 'PACKAGE'
  | 'MEMBERSHIP'
  | 'OTHER';

export const ProductCategory = {
  SERVICE: 'SERVICE' as const,
  MEDICATION: 'MEDICATION' as const,
  SUPPLEMENT: 'SUPPLEMENT' as const,
  LAB_TEST: 'LAB_TEST' as const,
  PROCEDURE: 'PROCEDURE' as const,
  PACKAGE: 'PACKAGE' as const,
  MEMBERSHIP: 'MEMBERSHIP' as const,
  OTHER: 'OTHER' as const,
} as const;

export type BillingType =
  | 'ONE_TIME'
  | 'RECURRING';

export const BillingType = {
  ONE_TIME: 'ONE_TIME' as const,
  RECURRING: 'RECURRING' as const,
} as const;

export type BillingInterval =
  | 'WEEKLY'
  | 'MONTHLY'
  | 'QUARTERLY'
  | 'SEMI_ANNUAL'
  | 'ANNUAL'
  | 'CUSTOM';

export const BillingInterval = {
  WEEKLY: 'WEEKLY' as const,
  MONTHLY: 'MONTHLY' as const,
  QUARTERLY: 'QUARTERLY' as const,
  SEMI_ANNUAL: 'SEMI_ANNUAL' as const,
  ANNUAL: 'ANNUAL' as const,
  CUSTOM: 'CUSTOM' as const,
} as const;

export type DiscountType =
  | 'PERCENTAGE'
  | 'FIXED_AMOUNT'
  | 'FREE_SHIPPING'
  | 'FREE_TRIAL'
  | 'BUY_X_GET_Y';

export const DiscountType = {
  PERCENTAGE: 'PERCENTAGE' as const,
  FIXED_AMOUNT: 'FIXED_AMOUNT' as const,
  FREE_SHIPPING: 'FREE_SHIPPING' as const,
  FREE_TRIAL: 'FREE_TRIAL' as const,
  BUY_X_GET_Y: 'BUY_X_GET_Y' as const,
} as const;

export type DiscountApplyTo =
  | 'ALL_PRODUCTS'
  | 'LIMITED_PRODUCTS'
  | 'LIMITED_CATEGORIES'
  | 'SUBSCRIPTIONS_ONLY'
  | 'ONE_TIME_ONLY';

export const DiscountApplyTo = {
  ALL_PRODUCTS: 'ALL_PRODUCTS' as const,
  LIMITED_PRODUCTS: 'LIMITED_PRODUCTS' as const,
  LIMITED_CATEGORIES: 'LIMITED_CATEGORIES' as const,
  SUBSCRIPTIONS_ONLY: 'SUBSCRIPTIONS_ONLY' as const,
  ONE_TIME_ONLY: 'ONE_TIME_ONLY' as const,
} as const;

export type PromotionType =
  | 'SALE'
  | 'FLASH_SALE'
  | 'SEASONAL'
  | 'CLEARANCE'
  | 'NEW_PATIENT'
  | 'LOYALTY'
  | 'BUNDLE'
  | 'UPGRADE';

export const PromotionType = {
  SALE: 'SALE' as const,
  FLASH_SALE: 'FLASH_SALE' as const,
  SEASONAL: 'SEASONAL' as const,
  CLEARANCE: 'CLEARANCE' as const,
  NEW_PATIENT: 'NEW_PATIENT' as const,
  LOYALTY: 'LOYALTY' as const,
  BUNDLE: 'BUNDLE' as const,
  UPGRADE: 'UPGRADE' as const,
} as const;

export type PricingRuleType =
  | 'VOLUME_DISCOUNT'
  | 'TIERED_PRICING'
  | 'PATIENT_SEGMENT'
  | 'LOYALTY_DISCOUNT'
  | 'TIME_BASED'
  | 'LOCATION_BASED'
  | 'CUSTOM';

export const PricingRuleType = {
  VOLUME_DISCOUNT: 'VOLUME_DISCOUNT' as const,
  TIERED_PRICING: 'TIERED_PRICING' as const,
  PATIENT_SEGMENT: 'PATIENT_SEGMENT' as const,
  LOYALTY_DISCOUNT: 'LOYALTY_DISCOUNT' as const,
  TIME_BASED: 'TIME_BASED' as const,
  LOCATION_BASED: 'LOCATION_BASED' as const,
  CUSTOM: 'CUSTOM' as const,
} as const;

export type CommissionType =
  | 'PERCENTAGE'
  | 'FIXED_AMOUNT';

export const CommissionType = {
  PERCENTAGE: 'PERCENTAGE' as const,
  FIXED_AMOUNT: 'FIXED_AMOUNT' as const,
} as const;

export type PayoutFrequency =
  | 'WEEKLY'
  | 'BIWEEKLY'
  | 'MONTHLY'
  | 'QUARTERLY';

export const PayoutFrequency = {
  WEEKLY: 'WEEKLY' as const,
  BIWEEKLY: 'BIWEEKLY' as const,
  MONTHLY: 'MONTHLY' as const,
  QUARTERLY: 'QUARTERLY' as const,
} as const;

export type ReferralStatus =
  | 'PENDING'
  | 'CONVERTED'
  | 'ACTIVE'
  | 'CHURNED';

export const ReferralStatus = {
  PENDING: 'PENDING' as const,
  CONVERTED: 'CONVERTED' as const,
  ACTIVE: 'ACTIVE' as const,
  CHURNED: 'CHURNED' as const,
} as const;

export type SubscriptionActionType =
  | 'CREATED'
  | 'ACTIVATED'
  | 'PAUSED'
  | 'RESUMED'
  | 'UPGRADED'
  | 'DOWNGRADED'
  | 'CANCELLED'
  | 'REACTIVATED'
  | 'PAYMENT_FAILED'
  | 'PAYMENT_SUCCEEDED'
  | 'RETENTION_OFFERED'
  | 'RETENTION_ACCEPTED'
  | 'RETENTION_DECLINED';

export const SubscriptionActionType = {
  CREATED: 'CREATED' as const,
  ACTIVATED: 'ACTIVATED' as const,
  PAUSED: 'PAUSED' as const,
  RESUMED: 'RESUMED' as const,
  UPGRADED: 'UPGRADED' as const,
  DOWNGRADED: 'DOWNGRADED' as const,
  CANCELLED: 'CANCELLED' as const,
  REACTIVATED: 'REACTIVATED' as const,
  PAYMENT_FAILED: 'PAYMENT_FAILED' as const,
  PAYMENT_SUCCEEDED: 'PAYMENT_SUCCEEDED' as const,
  RETENTION_OFFERED: 'RETENTION_OFFERED' as const,
  RETENTION_ACCEPTED: 'RETENTION_ACCEPTED' as const,
  RETENTION_DECLINED: 'RETENTION_DECLINED' as const,
} as const;

export type RetentionOfferType =
  | 'DISCOUNT'
  | 'FREE_PERIOD'
  | 'PAUSE'
  | 'DOWNGRADE'
  | 'BONUS';

export const RetentionOfferType = {
  DISCOUNT: 'DISCOUNT' as const,
  FREE_PERIOD: 'FREE_PERIOD' as const,
  PAUSE: 'PAUSE' as const,
  DOWNGRADE: 'DOWNGRADE' as const,
  BONUS: 'BONUS' as const,
} as const;

export type AffiliateStatus =
  | 'ACTIVE'
  | 'PAUSED'
  | 'SUSPENDED'
  | 'INACTIVE';

export const AffiliateStatus = {
  ACTIVE: 'ACTIVE' as const,
  PAUSED: 'PAUSED' as const,
  SUSPENDED: 'SUSPENDED' as const,
  INACTIVE: 'INACTIVE' as const,
} as const;

export type AffiliateApplicationStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED';

export const AffiliateApplicationStatus = {
  PENDING: 'PENDING' as const,
  APPROVED: 'APPROVED' as const,
  REJECTED: 'REJECTED' as const,
} as const;

export type CommissionPlanType =
  | 'FLAT'
  | 'PERCENT';

export const CommissionPlanType = {
  FLAT: 'FLAT' as const,
  PERCENT: 'PERCENT' as const,
} as const;

export type CommissionAppliesTo =
  | 'FIRST_PAYMENT_ONLY'
  | 'ALL_PAYMENTS';

export const CommissionAppliesTo = {
  FIRST_PAYMENT_ONLY: 'FIRST_PAYMENT_ONLY' as const,
  ALL_PAYMENTS: 'ALL_PAYMENTS' as const,
} as const;

export type CommissionEventStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'PAID'
  | 'REVERSED';

export const CommissionEventStatus = {
  PENDING: 'PENDING' as const,
  APPROVED: 'APPROVED' as const,
  PAID: 'PAID' as const,
  REVERSED: 'REVERSED' as const,
} as const;

export type CompetitionMetric =
  | 'CLICKS'
  | 'CONVERSIONS'
  | 'REVENUE'
  | 'CONVERSION_RATE'
  | 'NEW_CUSTOMERS';

export const CompetitionMetric = {
  CLICKS: 'CLICKS' as const,
  CONVERSIONS: 'CONVERSIONS' as const,
  REVENUE: 'REVENUE' as const,
  CONVERSION_RATE: 'CONVERSION_RATE' as const,
  NEW_CUSTOMERS: 'NEW_CUSTOMERS' as const,
} as const;

export type CompetitionStatus =
  | 'SCHEDULED'
  | 'ACTIVE'
  | 'COMPLETED'
  | 'CANCELLED';

export const CompetitionStatus = {
  SCHEDULED: 'SCHEDULED' as const,
  ACTIVE: 'ACTIVE' as const,
  COMPLETED: 'COMPLETED' as const,
  CANCELLED: 'CANCELLED' as const,
} as const;

export type TouchType =
  | 'CLICK'
  | 'IMPRESSION'
  | 'POSTBACK';

export const TouchType = {
  CLICK: 'CLICK' as const,
  IMPRESSION: 'IMPRESSION' as const,
  POSTBACK: 'POSTBACK' as const,
} as const;

export type AttributionModel =
  | 'FIRST_CLICK'
  | 'LAST_CLICK'
  | 'LINEAR'
  | 'TIME_DECAY'
  | 'POSITION';

export const AttributionModel = {
  FIRST_CLICK: 'FIRST_CLICK' as const,
  LAST_CLICK: 'LAST_CLICK' as const,
  LINEAR: 'LINEAR' as const,
  TIME_DECAY: 'TIME_DECAY' as const,
  POSITION: 'POSITION' as const,
} as const;

export type PayoutMethodType =
  | 'STRIPE_CONNECT'
  | 'PAYPAL'
  | 'BANK_WIRE'
  | 'CHECK'
  | 'MANUAL';

export const PayoutMethodType = {
  STRIPE_CONNECT: 'STRIPE_CONNECT' as const,
  PAYPAL: 'PAYPAL' as const,
  BANK_WIRE: 'BANK_WIRE' as const,
  CHECK: 'CHECK' as const,
  MANUAL: 'MANUAL' as const,
} as const;

export type AffiliatePayoutStatus =
  | 'PENDING'
  | 'SCHEDULED'
  | 'AWAITING_APPROVAL'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'ON_HOLD';

export const AffiliatePayoutStatus = {
  PENDING: 'PENDING' as const,
  SCHEDULED: 'SCHEDULED' as const,
  AWAITING_APPROVAL: 'AWAITING_APPROVAL' as const,
  PROCESSING: 'PROCESSING' as const,
  COMPLETED: 'COMPLETED' as const,
  FAILED: 'FAILED' as const,
  CANCELLED: 'CANCELLED' as const,
  ON_HOLD: 'ON_HOLD' as const,
} as const;

export type TaxDocumentType =
  | 'W9'
  | 'W8BEN'
  | 'W8BENE';

export const TaxDocumentType = {
  W9: 'W9' as const,
  W8BEN: 'W8BEN' as const,
  W8BENE: 'W8BENE' as const,
} as const;

export type TaxDocumentStatus =
  | 'PENDING'
  | 'SUBMITTED'
  | 'VERIFIED'
  | 'REJECTED'
  | 'EXPIRED';

export const TaxDocumentStatus = {
  PENDING: 'PENDING' as const,
  SUBMITTED: 'SUBMITTED' as const,
  VERIFIED: 'VERIFIED' as const,
  REJECTED: 'REJECTED' as const,
  EXPIRED: 'EXPIRED' as const,
} as const;

export type FraudAlertType =
  | 'SELF_REFERRAL'
  | 'DUPLICATE_IP'
  | 'VELOCITY_SPIKE'
  | 'SUSPICIOUS_PATTERN'
  | 'GEO_MISMATCH'
  | 'REFUND_ABUSE'
  | 'COOKIE_STUFFING'
  | 'CLICK_FRAUD'
  | 'DEVICE_FRAUD'
  | 'INCENTIVIZED_TRAFFIC';

export const FraudAlertType = {
  SELF_REFERRAL: 'SELF_REFERRAL' as const,
  DUPLICATE_IP: 'DUPLICATE_IP' as const,
  VELOCITY_SPIKE: 'VELOCITY_SPIKE' as const,
  SUSPICIOUS_PATTERN: 'SUSPICIOUS_PATTERN' as const,
  GEO_MISMATCH: 'GEO_MISMATCH' as const,
  REFUND_ABUSE: 'REFUND_ABUSE' as const,
  COOKIE_STUFFING: 'COOKIE_STUFFING' as const,
  CLICK_FRAUD: 'CLICK_FRAUD' as const,
  DEVICE_FRAUD: 'DEVICE_FRAUD' as const,
  INCENTIVIZED_TRAFFIC: 'INCENTIVIZED_TRAFFIC' as const,
} as const;

export type FraudSeverity =
  | 'LOW'
  | 'MEDIUM'
  | 'HIGH'
  | 'CRITICAL';

export const FraudSeverity = {
  LOW: 'LOW' as const,
  MEDIUM: 'MEDIUM' as const,
  HIGH: 'HIGH' as const,
  CRITICAL: 'CRITICAL' as const,
} as const;

export type FraudAlertStatus =
  | 'OPEN'
  | 'INVESTIGATING'
  | 'CONFIRMED_FRAUD'
  | 'FALSE_POSITIVE'
  | 'DISMISSED';

export const FraudAlertStatus = {
  OPEN: 'OPEN' as const,
  INVESTIGATING: 'INVESTIGATING' as const,
  CONFIRMED_FRAUD: 'CONFIRMED_FRAUD' as const,
  FALSE_POSITIVE: 'FALSE_POSITIVE' as const,
  DISMISSED: 'DISMISSED' as const,
} as const;

export type FraudResolutionAction =
  | 'NO_ACTION'
  | 'WARNING_ISSUED'
  | 'COMMISSION_REVERSED'
  | 'COMMISSIONS_HELD'
  | 'AFFILIATE_SUSPENDED'
  | 'AFFILIATE_TERMINATED';

export const FraudResolutionAction = {
  NO_ACTION: 'NO_ACTION' as const,
  WARNING_ISSUED: 'WARNING_ISSUED' as const,
  COMMISSION_REVERSED: 'COMMISSION_REVERSED' as const,
  COMMISSIONS_HELD: 'COMMISSIONS_HELD' as const,
  AFFILIATE_SUSPENDED: 'AFFILIATE_SUSPENDED' as const,
  AFFILIATE_TERMINATED: 'AFFILIATE_TERMINATED' as const,
} as const;

export type ShippingStatus =
  | 'PENDING'
  | 'LABEL_CREATED'
  | 'SHIPPED'
  | 'IN_TRANSIT'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'RETURNED'
  | 'EXCEPTION'
  | 'CANCELLED';

export const ShippingStatus = {
  PENDING: 'PENDING' as const,
  LABEL_CREATED: 'LABEL_CREATED' as const,
  SHIPPED: 'SHIPPED' as const,
  IN_TRANSIT: 'IN_TRANSIT' as const,
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY' as const,
  DELIVERED: 'DELIVERED' as const,
  RETURNED: 'RETURNED' as const,
  EXCEPTION: 'EXCEPTION' as const,
  CANCELLED: 'CANCELLED' as const,
} as const;

export type RefillStatus =
  | 'SCHEDULED'
  | 'PENDING_PAYMENT'
  | 'PENDING_ADMIN'
  | 'APPROVED'
  | 'PENDING_PROVIDER'
  | 'PRESCRIBED'
  | 'COMPLETED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'ON_HOLD';

export const RefillStatus = {
  SCHEDULED: 'SCHEDULED' as const,
  PENDING_PAYMENT: 'PENDING_PAYMENT' as const,
  PENDING_ADMIN: 'PENDING_ADMIN' as const,
  APPROVED: 'APPROVED' as const,
  PENDING_PROVIDER: 'PENDING_PROVIDER' as const,
  PRESCRIBED: 'PRESCRIBED' as const,
  COMPLETED: 'COMPLETED' as const,
  REJECTED: 'REJECTED' as const,
  CANCELLED: 'CANCELLED' as const,
  ON_HOLD: 'ON_HOLD' as const,
} as const;

export type PaymentVerificationMethod =
  | 'STRIPE_AUTO'
  | 'MANUAL_VERIFIED'
  | 'EXTERNAL_REFERENCE'
  | 'PAYMENT_SKIPPED';

export const PaymentVerificationMethod = {
  STRIPE_AUTO: 'STRIPE_AUTO' as const,
  MANUAL_VERIFIED: 'MANUAL_VERIFIED' as const,
  EXTERNAL_REFERENCE: 'EXTERNAL_REFERENCE' as const,
  PAYMENT_SKIPPED: 'PAYMENT_SKIPPED' as const,
} as const;

export type ReportType =
  | 'REVENUE'
  | 'PATIENTS'
  | 'PAYOUTS'
  | 'RECONCILIATION'
  | 'SUBSCRIPTIONS'
  | 'CUSTOM';

export const ReportType = {
  REVENUE: 'REVENUE' as const,
  PATIENTS: 'PATIENTS' as const,
  PAYOUTS: 'PAYOUTS' as const,
  RECONCILIATION: 'RECONCILIATION' as const,
  SUBSCRIPTIONS: 'SUBSCRIPTIONS' as const,
  CUSTOM: 'CUSTOM' as const,
} as const;

export type ReportGranularity =
  | 'DAILY'
  | 'WEEKLY'
  | 'MONTHLY'
  | 'QUARTERLY'
  | 'YEARLY';

export const ReportGranularity = {
  DAILY: 'DAILY' as const,
  WEEKLY: 'WEEKLY' as const,
  MONTHLY: 'MONTHLY' as const,
  QUARTERLY: 'QUARTERLY' as const,
  YEARLY: 'YEARLY' as const,
} as const;

export type RoutingStrategy =
  | 'STATE_LICENSE_MATCH'
  | 'ROUND_ROBIN'
  | 'MANUAL_ASSIGNMENT'
  | 'PROVIDER_CHOICE';

export const RoutingStrategy = {
  STATE_LICENSE_MATCH: 'STATE_LICENSE_MATCH' as const,
  ROUND_ROBIN: 'ROUND_ROBIN' as const,
  MANUAL_ASSIGNMENT: 'MANUAL_ASSIGNMENT' as const,
  PROVIDER_CHOICE: 'PROVIDER_CHOICE' as const,
} as const;

export type SoapApprovalMode =
  | 'REQUIRED'
  | 'ADVISORY'
  | 'DISABLED';

export const SoapApprovalMode = {
  REQUIRED: 'REQUIRED' as const,
  ADVISORY: 'ADVISORY' as const,
  DISABLED: 'DISABLED' as const,
} as const;

export type CompensationEventStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'PAID'
  | 'VOIDED';

export const CompensationEventStatus = {
  PENDING: 'PENDING' as const,
  APPROVED: 'APPROVED' as const,
  PAID: 'PAID' as const,
  VOIDED: 'VOIDED' as const,
} as const;

export type CompensationType =
  | 'FLAT_RATE'
  | 'PERCENTAGE'
  | 'HYBRID';

export const CompensationType = {
  FLAT_RATE: 'FLAT_RATE' as const,
  PERCENTAGE: 'PERCENTAGE' as const,
  HYBRID: 'HYBRID' as const,
} as const;

export type TelehealthSessionStatus =
  | 'SCHEDULED'
  | 'WAITING'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW'
  | 'TECHNICAL_ISSUES';

export const TelehealthSessionStatus = {
  SCHEDULED: 'SCHEDULED' as const,
  WAITING: 'WAITING' as const,
  IN_PROGRESS: 'IN_PROGRESS' as const,
  COMPLETED: 'COMPLETED' as const,
  CANCELLED: 'CANCELLED' as const,
  NO_SHOW: 'NO_SHOW' as const,
  TECHNICAL_ISSUES: 'TECHNICAL_ISSUES' as const,
} as const;

export type NotificationCategory =
  | 'PRESCRIPTION'
  | 'PATIENT'
  | 'ORDER'
  | 'SYSTEM'
  | 'APPOINTMENT'
  | 'MESSAGE'
  | 'PAYMENT'
  | 'REFILL'
  | 'SHIPMENT';

export const NotificationCategory = {
  PRESCRIPTION: 'PRESCRIPTION' as const,
  PATIENT: 'PATIENT' as const,
  ORDER: 'ORDER' as const,
  SYSTEM: 'SYSTEM' as const,
  APPOINTMENT: 'APPOINTMENT' as const,
  MESSAGE: 'MESSAGE' as const,
  PAYMENT: 'PAYMENT' as const,
  REFILL: 'REFILL' as const,
  SHIPMENT: 'SHIPMENT' as const,
} as const;

export type NotificationPriority =
  | 'LOW'
  | 'NORMAL'
  | 'HIGH'
  | 'URGENT';

export const NotificationPriority = {
  LOW: 'LOW' as const,
  NORMAL: 'NORMAL' as const,
  HIGH: 'HIGH' as const,
  URGENT: 'URGENT' as const,
} as const;

export type EmailLogStatus =
  | 'PENDING'
  | 'QUEUED'
  | 'SENDING'
  | 'SENT'
  | 'DELIVERED'
  | 'OPENED'
  | 'CLICKED'
  | 'BOUNCED'
  | 'COMPLAINED'
  | 'FAILED'
  | 'SUPPRESSED';

export const EmailLogStatus = {
  PENDING: 'PENDING' as const,
  QUEUED: 'QUEUED' as const,
  SENDING: 'SENDING' as const,
  SENT: 'SENT' as const,
  DELIVERED: 'DELIVERED' as const,
  OPENED: 'OPENED' as const,
  CLICKED: 'CLICKED' as const,
  BOUNCED: 'BOUNCED' as const,
  COMPLAINED: 'COMPLAINED' as const,
  FAILED: 'FAILED' as const,
  SUPPRESSED: 'SUPPRESSED' as const,
} as const;

export type ScheduledEmailStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'SENT'
  | 'FAILED'
  | 'CANCELLED';

export const ScheduledEmailStatus = {
  PENDING: 'PENDING' as const,
  PROCESSING: 'PROCESSING' as const,
  SENT: 'SENT' as const,
  FAILED: 'FAILED' as const,
  CANCELLED: 'CANCELLED' as const,
} as const;

export type PlatformFeeType =
  | 'PRESCRIPTION'
  | 'TRANSMISSION'
  | 'ADMIN';

export const PlatformFeeType = {
  PRESCRIPTION: 'PRESCRIPTION' as const,
  TRANSMISSION: 'TRANSMISSION' as const,
  ADMIN: 'ADMIN' as const,
} as const;

export type PlatformFeeStatus =
  | 'PENDING'
  | 'INVOICED'
  | 'PAID'
  | 'WAIVED'
  | 'VOIDED';

export const PlatformFeeStatus = {
  PENDING: 'PENDING' as const,
  INVOICED: 'INVOICED' as const,
  PAID: 'PAID' as const,
  WAIVED: 'WAIVED' as const,
  VOIDED: 'VOIDED' as const,
} as const;

export type PlatformFeeCalculationType =
  | 'FLAT'
  | 'PERCENTAGE';

export const PlatformFeeCalculationType = {
  FLAT: 'FLAT' as const,
  PERCENTAGE: 'PERCENTAGE' as const,
} as const;

export type PlatformAdminFeeType =
  | 'NONE'
  | 'FLAT_WEEKLY'
  | 'PERCENTAGE_WEEKLY';

export const PlatformAdminFeeType = {
  NONE: 'NONE' as const,
  FLAT_WEEKLY: 'FLAT_WEEKLY' as const,
  PERCENTAGE_WEEKLY: 'PERCENTAGE_WEEKLY' as const,
} as const;

export type ClinicInvoicePeriodType =
  | 'WEEKLY'
  | 'MONTHLY'
  | 'QUARTERLY'
  | 'YEARLY'
  | 'CUSTOM';

export const ClinicInvoicePeriodType = {
  WEEKLY: 'WEEKLY' as const,
  MONTHLY: 'MONTHLY' as const,
  QUARTERLY: 'QUARTERLY' as const,
  YEARLY: 'YEARLY' as const,
  CUSTOM: 'CUSTOM' as const,
} as const;

export type ClinicInvoiceStatus =
  | 'DRAFT'
  | 'PENDING'
  | 'SENT'
  | 'PAID'
  | 'OVERDUE'
  | 'CANCELLED';

export const ClinicInvoiceStatus = {
  DRAFT: 'DRAFT' as const,
  PENDING: 'PENDING' as const,
  SENT: 'SENT' as const,
  PAID: 'PAID' as const,
  OVERDUE: 'OVERDUE' as const,
  CANCELLED: 'CANCELLED' as const,
} as const;

export type PatientPhotoType =
  | 'PROGRESS_FRONT'
  | 'PROGRESS_SIDE'
  | 'PROGRESS_BACK'
  | 'ID_FRONT'
  | 'ID_BACK'
  | 'SELFIE'
  | 'MEDICAL_SKIN'
  | 'MEDICAL_INJURY'
  | 'MEDICAL_SYMPTOM'
  | 'MEDICAL_BEFORE'
  | 'MEDICAL_AFTER'
  | 'MEDICAL_OTHER'
  | 'PROFILE_AVATAR';

export const PatientPhotoType = {
  PROGRESS_FRONT: 'PROGRESS_FRONT' as const,
  PROGRESS_SIDE: 'PROGRESS_SIDE' as const,
  PROGRESS_BACK: 'PROGRESS_BACK' as const,
  ID_FRONT: 'ID_FRONT' as const,
  ID_BACK: 'ID_BACK' as const,
  SELFIE: 'SELFIE' as const,
  MEDICAL_SKIN: 'MEDICAL_SKIN' as const,
  MEDICAL_INJURY: 'MEDICAL_INJURY' as const,
  MEDICAL_SYMPTOM: 'MEDICAL_SYMPTOM' as const,
  MEDICAL_BEFORE: 'MEDICAL_BEFORE' as const,
  MEDICAL_AFTER: 'MEDICAL_AFTER' as const,
  MEDICAL_OTHER: 'MEDICAL_OTHER' as const,
  PROFILE_AVATAR: 'PROFILE_AVATAR' as const,
} as const;

export type PatientPhotoVerificationStatus =
  | 'NOT_APPLICABLE'
  | 'PENDING'
  | 'IN_REVIEW'
  | 'VERIFIED'
  | 'REJECTED'
  | 'EXPIRED';

export const PatientPhotoVerificationStatus = {
  NOT_APPLICABLE: 'NOT_APPLICABLE' as const,
  PENDING: 'PENDING' as const,
  IN_REVIEW: 'IN_REVIEW' as const,
  VERIFIED: 'VERIFIED' as const,
  REJECTED: 'REJECTED' as const,
  EXPIRED: 'EXPIRED' as const,
} as const;

export type DraftStatus =
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'EXPIRED'
  | 'ABANDONED';

export const DraftStatus = {
  IN_PROGRESS: 'IN_PROGRESS' as const,
  COMPLETED: 'COMPLETED' as const,
  EXPIRED: 'EXPIRED' as const,
  ABANDONED: 'ABANDONED' as const,
} as const;
