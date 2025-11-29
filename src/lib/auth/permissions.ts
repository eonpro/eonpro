/**
 * Role-based Permission and Feature Access Control System
 * Enterprise-grade permission matrix for the platform
 */

export interface Permission {
  resource: string;
  actions: string[];
}

export interface Feature {
  id: string;
  name: string;
  description: string;
  requiredRole?: string[];
}

// Define all available permissions
export const PERMISSIONS = {
  // User Management
  USER_CREATE: 'user:create',
  USER_READ: 'user:read',
  USER_UPDATE: 'user:update',
  USER_DELETE: 'user:delete',
  USER_SUSPEND: 'user:suspend',
  USER_RESET_PASSWORD: 'user:reset_password',
  
  // Patient Management
  PATIENT_CREATE: 'patient:create',
  PATIENT_READ: 'patient:read',
  PATIENT_UPDATE: 'patient:update',
  PATIENT_DELETE: 'patient:delete',
  PATIENT_EXPORT: 'patient:export',
  PATIENT_VIEW_PHI: 'patient:view_phi',
  
  // Provider Management
  PROVIDER_CREATE: 'provider:create',
  PROVIDER_READ: 'provider:read',
  PROVIDER_UPDATE: 'provider:update',
  PROVIDER_DELETE: 'provider:delete',
  PROVIDER_VERIFY_NPI: 'provider:verify_npi',
  
  // Order Management
  ORDER_CREATE: 'order:create',
  ORDER_READ: 'order:read',
  ORDER_UPDATE: 'order:update',
  ORDER_DELETE: 'order:delete',
  ORDER_APPROVE: 'order:approve',
  ORDER_SHIP: 'order:ship',
  
  // SOAP Notes
  SOAP_CREATE: 'soap:create',
  SOAP_READ: 'soap:read',
  SOAP_UPDATE: 'soap:update',
  SOAP_DELETE: 'soap:delete',
  SOAP_APPROVE: 'soap:approve',
  SOAP_LOCK: 'soap:lock',
  
  // Billing & Payments
  BILLING_VIEW: 'billing:view',
  BILLING_CREATE: 'billing:create',
  BILLING_REFUND: 'billing:refund',
  BILLING_EXPORT: 'billing:export',
  
  // Influencer Management
  INFLUENCER_CREATE: 'influencer:create',
  INFLUENCER_READ: 'influencer:read',
  INFLUENCER_UPDATE: 'influencer:update',
  INFLUENCER_DELETE: 'influencer:delete',
  INFLUENCER_PAYOUT: 'influencer:payout',
  
  // System Administration
  SYSTEM_CONFIG: 'system:config',
  SYSTEM_AUDIT: 'system:audit',
  SYSTEM_BACKUP: 'system:backup',
  SYSTEM_ANALYTICS: 'system:analytics',
  SYSTEM_LOGS: 'system:logs',
  
  // Integration Management
  INTEGRATION_CREATE: 'integration:create',
  INTEGRATION_READ: 'integration:read',
  INTEGRATION_UPDATE: 'integration:update',
  INTEGRATION_DELETE: 'integration:delete',
  
  // Report Generation
  REPORT_GENERATE: 'report:generate',
  REPORT_EXPORT: 'report:export',
  REPORT_SCHEDULE: 'report:schedule',
} as const;

// Define all available features
export const FEATURES = {
  // Dashboard Features
  DASHBOARD_ANALYTICS: {
    id: 'dashboard_analytics',
    name: 'Analytics Dashboard',
    description: 'View platform analytics and metrics',
  },
  DASHBOARD_FINANCIAL: {
    id: 'dashboard_financial',
    name: 'Financial Dashboard',
    description: 'View financial metrics and revenue',
  },
  DASHBOARD_OPERATIONS: {
    id: 'dashboard_operations',
    name: 'Operations Dashboard',
    description: 'Monitor operations and fulfillment',
  },
  
  // Clinical Features
  TELEMEDICINE: {
    id: 'telemedicine',
    name: 'Telemedicine',
    description: 'Video consultations and virtual visits',
  },
  E_PRESCRIBING: {
    id: 'e_prescribing',
    name: 'E-Prescribing',
    description: 'Electronic prescription management',
  },
  LAB_INTEGRATION: {
    id: 'lab_integration',
    name: 'Lab Integration',
    description: 'Order and view lab results',
  },
  
  // Communication Features
  SECURE_MESSAGING: {
    id: 'secure_messaging',
    name: 'Secure Messaging',
    description: 'HIPAA-compliant messaging',
  },
  SMS_NOTIFICATIONS: {
    id: 'sms_notifications',
    name: 'SMS Notifications',
    description: 'Send SMS notifications to patients',
  },
  EMAIL_CAMPAIGNS: {
    id: 'email_campaigns',
    name: 'Email Campaigns',
    description: 'Manage email marketing campaigns',
  },
  
  // AI Features
  AI_ASSISTANT: {
    id: 'ai_assistant',
    name: 'AI Assistant',
    description: 'AI-powered clinical assistant',
  },
  AI_SOAP_NOTES: {
    id: 'ai_soap_notes',
    name: 'AI SOAP Notes',
    description: 'AI-generated SOAP notes from intake',
  },
  AI_ANALYTICS: {
    id: 'ai_analytics',
    name: 'AI Analytics',
    description: 'Predictive analytics and insights',
  },
  
  // Administrative Features
  USER_MANAGEMENT: {
    id: 'user_management',
    name: 'User Management',
    description: 'Create and manage platform users',
  },
  AUDIT_LOGS: {
    id: 'audit_logs',
    name: 'Audit Logs',
    description: 'View system audit logs',
  },
  BULK_OPERATIONS: {
    id: 'bulk_operations',
    name: 'Bulk Operations',
    description: 'Perform bulk data operations',
  },
  
  // Integration Features
  LIFEFILE_INTEGRATION: {
    id: 'lifefile_integration',
    name: 'Lifefile Integration',
    description: 'Lifefile pharmacy integration',
  },
  STRIPE_BILLING: {
    id: 'stripe_billing',
    name: 'Stripe Billing',
    description: 'Stripe payment processing',
  },
  WEBHOOK_MANAGEMENT: {
    id: 'webhook_management',
    name: 'Webhook Management',
    description: 'Configure and monitor webhooks',
  },
} as const;

// Role-based permission matrix
export const ROLE_PERMISSIONS = {
  SUPER_ADMIN: [
    // Has ALL permissions
    ...Object.values(PERMISSIONS),
  ],
  
  ADMIN: [
    // User Management (except delete)
    PERMISSIONS.USER_CREATE,
    PERMISSIONS.USER_READ,
    PERMISSIONS.USER_UPDATE,
    PERMISSIONS.USER_SUSPEND,
    PERMISSIONS.USER_RESET_PASSWORD,
    
    // Full Patient Management
    PERMISSIONS.PATIENT_CREATE,
    PERMISSIONS.PATIENT_READ,
    PERMISSIONS.PATIENT_UPDATE,
    PERMISSIONS.PATIENT_DELETE,
    PERMISSIONS.PATIENT_EXPORT,
    PERMISSIONS.PATIENT_VIEW_PHI,
    
    // Full Provider Management
    PERMISSIONS.PROVIDER_CREATE,
    PERMISSIONS.PROVIDER_READ,
    PERMISSIONS.PROVIDER_UPDATE,
    PERMISSIONS.PROVIDER_DELETE,
    PERMISSIONS.PROVIDER_VERIFY_NPI,
    
    // Full Order Management
    PERMISSIONS.ORDER_CREATE,
    PERMISSIONS.ORDER_READ,
    PERMISSIONS.ORDER_UPDATE,
    PERMISSIONS.ORDER_DELETE,
    PERMISSIONS.ORDER_APPROVE,
    PERMISSIONS.ORDER_SHIP,
    
    // Full SOAP Notes
    PERMISSIONS.SOAP_CREATE,
    PERMISSIONS.SOAP_READ,
    PERMISSIONS.SOAP_UPDATE,
    PERMISSIONS.SOAP_DELETE,
    PERMISSIONS.SOAP_APPROVE,
    PERMISSIONS.SOAP_LOCK,
    
    // Full Billing
    PERMISSIONS.BILLING_VIEW,
    PERMISSIONS.BILLING_CREATE,
    PERMISSIONS.BILLING_REFUND,
    PERMISSIONS.BILLING_EXPORT,
    
    // Full Influencer Management
    PERMISSIONS.INFLUENCER_CREATE,
    PERMISSIONS.INFLUENCER_READ,
    PERMISSIONS.INFLUENCER_UPDATE,
    PERMISSIONS.INFLUENCER_DELETE,
    PERMISSIONS.INFLUENCER_PAYOUT,
    
    // System Access (limited config for admins)
    PERMISSIONS.SYSTEM_CONFIG,
    PERMISSIONS.SYSTEM_AUDIT,
    PERMISSIONS.SYSTEM_ANALYTICS,
    PERMISSIONS.SYSTEM_LOGS,
    
    // Full Integration Management
    PERMISSIONS.INTEGRATION_CREATE,
    PERMISSIONS.INTEGRATION_READ,
    PERMISSIONS.INTEGRATION_UPDATE,
    PERMISSIONS.INTEGRATION_DELETE,
    
    // Full Reports
    PERMISSIONS.REPORT_GENERATE,
    PERMISSIONS.REPORT_EXPORT,
    PERMISSIONS.REPORT_SCHEDULE,
  ],
  
  PROVIDER: [
    // Limited User Access (read only)
    PERMISSIONS.USER_READ,
    
    // Patient Management (their patients only)
    PERMISSIONS.PATIENT_CREATE,
    PERMISSIONS.PATIENT_READ,
    PERMISSIONS.PATIENT_UPDATE,
    PERMISSIONS.PATIENT_VIEW_PHI,
    
    // Order Management (their orders)
    PERMISSIONS.ORDER_CREATE,
    PERMISSIONS.ORDER_READ,
    PERMISSIONS.ORDER_UPDATE,
    
    // SOAP Notes
    PERMISSIONS.SOAP_CREATE,
    PERMISSIONS.SOAP_READ,
    PERMISSIONS.SOAP_UPDATE,
    
    // Limited Billing
    PERMISSIONS.BILLING_VIEW,
    
    // Reports (their data only)
    PERMISSIONS.REPORT_GENERATE,
    PERMISSIONS.REPORT_EXPORT,
  ],
  
  INFLUENCER: [
    // Limited Patient Access (their referrals)
    PERMISSIONS.PATIENT_READ,
    
    // Read-only access to their data
    PERMISSIONS.INFLUENCER_READ,
    
    // Limited Billing
    PERMISSIONS.BILLING_VIEW,
    
    // Basic Reports
    PERMISSIONS.REPORT_GENERATE,
  ],
  
  PATIENT: [
    // Read their own data
    PERMISSIONS.PATIENT_READ,
    PERMISSIONS.ORDER_READ,
    PERMISSIONS.SOAP_READ,
    PERMISSIONS.BILLING_VIEW,
  ],
  
  STAFF: [
    // Patient Management
    PERMISSIONS.PATIENT_CREATE,
    PERMISSIONS.PATIENT_READ,
    PERMISSIONS.PATIENT_UPDATE,
    
    // Order Management
    PERMISSIONS.ORDER_CREATE,
    PERMISSIONS.ORDER_READ,
    PERMISSIONS.ORDER_UPDATE,
    
    // SOAP Notes (read only)
    PERMISSIONS.SOAP_READ,
    
    // Limited Billing
    PERMISSIONS.BILLING_VIEW,
    PERMISSIONS.BILLING_CREATE,
    
    // Basic Reports
    PERMISSIONS.REPORT_GENERATE,
  ],
  
  SUPPORT: [
    // Read-only access to help customers
    PERMISSIONS.USER_READ,
    PERMISSIONS.PATIENT_READ,
    PERMISSIONS.ORDER_READ,
    PERMISSIONS.SOAP_READ,
    PERMISSIONS.BILLING_VIEW,
    PERMISSIONS.SYSTEM_LOGS,
  ],
} as const;

// Role-based feature access
export const ROLE_FEATURES = {
  SUPER_ADMIN: [
    // Has access to ALL features
    ...Object.keys(FEATURES),
  ],
  
  ADMIN: [
    // All dashboards
    'dashboard_analytics',
    'dashboard_financial',
    'dashboard_operations',
    
    // All clinical features
    'telemedicine',
    'e_prescribing',
    'lab_integration',
    
    // All communication
    'secure_messaging',
    'sms_notifications',
    'email_campaigns',
    
    // All AI features
    'ai_assistant',
    'ai_soap_notes',
    'ai_analytics',
    
    // All administrative
    'user_management',
    'audit_logs',
    'bulk_operations',
    
    // All integrations
    'lifefile_integration',
    'stripe_billing',
    'webhook_management',
  ],
  
  PROVIDER: [
    // Dashboards
    'dashboard_analytics',
    'dashboard_operations',
    
    // Clinical features
    'telemedicine',
    'e_prescribing',
    'lab_integration',
    
    // Communication
    'secure_messaging',
    
    // AI features
    'ai_assistant',
    'ai_soap_notes',
    
    // Integrations
    'lifefile_integration',
  ],
  
  INFLUENCER: [
    // Limited dashboard
    'dashboard_analytics',
    
    // Communication
    'secure_messaging',
    'email_campaigns',
  ],
  
  PATIENT: [
    // Communication only
    'secure_messaging',
  ],
  
  STAFF: [
    // Dashboards
    'dashboard_operations',
    
    // Clinical support
    'lab_integration',
    
    // Communication
    'secure_messaging',
    'sms_notifications',
    
    // Integrations
    'lifefile_integration',
    'stripe_billing',
  ],
  
  SUPPORT: [
    // Limited features
    'secure_messaging',
    'audit_logs',
  ],
} as const;

/**
 * Check if a user role has a specific permission
 */
export function hasPermission(
  userRole: keyof typeof ROLE_PERMISSIONS,
  permission: string
): boolean {
  const rolePermissions = ROLE_PERMISSIONS[userRole];
  return rolePermissions ? rolePermissions.includes(permission as any) : false;
}

/**
 * Check if a user role has access to a feature
 */
export function hasFeature(
  userRole: keyof typeof ROLE_FEATURES,
  featureId: string
): boolean {
  const roleFeatures = ROLE_FEATURES[userRole];
  return roleFeatures ? roleFeatures.includes(featureId as any) : false;
}

/**
 * Get all permissions for a role
 */
export function getRolePermissions(
  userRole: keyof typeof ROLE_PERMISSIONS
): string[] {
  return [...(ROLE_PERMISSIONS[userRole] || [])];
}

/**
 * Get all features for a role
 */
export function getRoleFeatures(
  userRole: keyof typeof ROLE_FEATURES
): string[] {
  return [...(ROLE_FEATURES[userRole] || [])];
}

/**
 * Check multiple permissions at once
 */
export function hasAllPermissions(
  userRole: keyof typeof ROLE_PERMISSIONS,
  permissions: string[]
): boolean {
  return permissions.every((permission: any) => hasPermission(userRole, permission));
}

/**
 * Check if user has any of the specified permissions
 */
export function hasAnyPermission(
  userRole: keyof typeof ROLE_PERMISSIONS,
  permissions: string[]
): boolean {
  return permissions.some((permission: any) => hasPermission(userRole, permission));
}
