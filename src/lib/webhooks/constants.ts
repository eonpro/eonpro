/**
 * Webhook Events Constants
 */

export const WEBHOOK_EVENTS = {
  // Patient events
  'patient.created': 'When a new patient is created',
  'patient.updated': 'When patient information is updated',
  'patient.deleted': 'When a patient is deleted',

  // Order events
  'order.created': 'When a new order is placed',
  'order.updated': 'When order status changes',
  'order.shipped': 'When order is shipped',
  'order.delivered': 'When order is delivered',

  // Payment events
  'payment.succeeded': 'When a payment is successful',
  'payment.failed': 'When a payment fails',
  'payment.refunded': 'When a payment is refunded',

  // Appointment events
  'appointment.scheduled': 'When appointment is scheduled',
  'appointment.confirmed': 'When appointment is confirmed',
  'appointment.cancelled': 'When appointment is cancelled',
  'appointment.completed': 'When appointment is completed',

  // Provider events
  'provider.created': 'When a new provider is added',
  'provider.updated': 'When provider info is updated',
  'provider.activated': 'When provider is activated',
  'provider.deactivated': 'When provider is deactivated',

  // Security events
  'security.login': 'When user logs in',
  'security.logout': 'When user logs out',
  'security.failed_login': 'When login attempt fails',
  'security.password_changed': 'When password is changed',

  // Compliance events
  'compliance.phi_accessed': 'When PHI is accessed',
  'compliance.audit_exported': 'When audit log is exported',
  'compliance.consent_obtained': 'When patient consent is obtained',

  // Integration events
  'integration.connected': 'When integration is connected',
  'integration.disconnected': 'When integration is disconnected',
  'integration.error': 'When integration has an error',

  // System events
  'system.maintenance': 'When system enters maintenance',
  'system.error': 'When system error occurs',
  'system.backup': 'When backup is performed',
} as const;

export type WebhookEvent = keyof typeof WEBHOOK_EVENTS;
