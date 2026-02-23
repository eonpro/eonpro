/**
 * Role-based Permission and Feature Access Control System
 * Enterprise-grade permission matrix with per-user override support.
 *
 * Override model: effective = (role defaults) + granted − revoked
 * Stored in User.permissions / User.features JSON columns.
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

/**
 * Schema for the User.permissions / User.features JSON columns.
 * `granted` adds permissions beyond the role defaults.
 * `revoked` removes permissions from the role defaults.
 */
export interface UserPermissionOverrides {
  granted: string[];
  revoked: string[];
}

/** Metadata for a single permission in the effective set */
export interface EffectivePermissionEntry {
  permission: string;
  enabled: boolean;
  source: 'role_default' | 'custom_granted' | 'custom_revoked' | 'not_available';
}

/** Metadata for a single feature in the effective set */
export interface EffectiveFeatureEntry {
  featureId: string;
  enabled: boolean;
  source: 'role_default' | 'custom_granted' | 'custom_revoked' | 'not_available';
}

/** Describes a category of permissions for UI grouping */
export interface PermissionCategoryDef {
  id: string;
  label: string;
  description: string;
  prefix: string;
  permissions: { key: string; value: string; label: string; description: string }[];
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
  PATIENT_MERGE: 'patient:merge',

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

  // Affiliate Management
  AFFILIATE_CREATE: 'affiliate:create',
  AFFILIATE_READ: 'affiliate:read',
  AFFILIATE_UPDATE: 'affiliate:update',
  AFFILIATE_DELETE: 'affiliate:delete',
  AFFILIATE_PAYOUT: 'affiliate:payout',

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

  // Sales Rep (admin-grantable; not in default role)
  SALES_REP_VIEW_ALL_PATIENTS: 'sales_rep:view_all_patients',
} as const;

/**
 * Human-readable labels and descriptions for every permission.
 * Keyed by the permission string value (e.g. 'user:create').
 */
export const PERMISSION_META: Record<string, { label: string; description: string }> = {
  'user:create': { label: 'Create Users', description: 'Create new user accounts' },
  'user:read': { label: 'View Users', description: 'View user profiles and details' },
  'user:update': { label: 'Update Users', description: 'Edit user account information' },
  'user:delete': { label: 'Delete Users', description: 'Permanently remove user accounts' },
  'user:suspend': { label: 'Suspend Users', description: 'Temporarily disable user access' },
  'user:reset_password': { label: 'Reset Passwords', description: 'Reset user passwords' },

  'patient:create': { label: 'Create Patients', description: 'Register new patients' },
  'patient:read': { label: 'View Patients', description: 'View patient records' },
  'patient:update': { label: 'Update Patients', description: 'Edit patient information' },
  'patient:delete': { label: 'Delete Patients', description: 'Remove patient records' },
  'patient:export': { label: 'Export Patient Data', description: 'Export patient data to files' },
  'patient:view_phi': { label: 'View PHI', description: 'Access protected health information' },
  'patient:merge': { label: 'Merge Patients', description: 'Merge duplicate patient records' },

  'provider:create': { label: 'Create Providers', description: 'Add new healthcare providers' },
  'provider:read': { label: 'View Providers', description: 'View provider profiles' },
  'provider:update': { label: 'Update Providers', description: 'Edit provider information' },
  'provider:delete': { label: 'Delete Providers', description: 'Remove provider records' },
  'provider:verify_npi': { label: 'Verify NPI', description: 'Verify provider NPI numbers' },

  'order:create': { label: 'Create Orders', description: 'Place new orders' },
  'order:read': { label: 'View Orders', description: 'View order details' },
  'order:update': { label: 'Update Orders', description: 'Modify existing orders' },
  'order:delete': { label: 'Delete Orders', description: 'Cancel and remove orders' },
  'order:approve': { label: 'Approve Orders', description: 'Approve pending orders' },
  'order:ship': { label: 'Ship Orders', description: 'Mark orders as shipped' },

  'soap:create': { label: 'Create SOAP Notes', description: 'Write clinical SOAP notes' },
  'soap:read': { label: 'View SOAP Notes', description: 'Read SOAP notes' },
  'soap:update': { label: 'Update SOAP Notes', description: 'Edit existing SOAP notes' },
  'soap:delete': { label: 'Delete SOAP Notes', description: 'Remove SOAP notes' },
  'soap:approve': { label: 'Approve SOAP Notes', description: 'Approve and sign SOAP notes' },
  'soap:lock': { label: 'Lock SOAP Notes', description: 'Lock SOAP notes from editing' },

  'billing:view': { label: 'View Billing', description: 'View invoices and payments' },
  'billing:create': { label: 'Create Invoices', description: 'Generate new invoices' },
  'billing:refund': { label: 'Issue Refunds', description: 'Process payment refunds' },
  'billing:export': { label: 'Export Billing Data', description: 'Export financial data' },

  'affiliate:create': { label: 'Create Affiliates', description: 'Add new affiliate partners' },
  'affiliate:read': { label: 'View Affiliates', description: 'View affiliate details' },
  'affiliate:update': { label: 'Update Affiliates', description: 'Edit affiliate settings' },
  'affiliate:delete': { label: 'Delete Affiliates', description: 'Remove affiliate partners' },
  'affiliate:payout': { label: 'Process Payouts', description: 'Process affiliate payouts' },

  'system:config': { label: 'System Config', description: 'Modify system configuration' },
  'system:audit': { label: 'Audit Logs', description: 'Access system audit trail' },
  'system:backup': { label: 'System Backups', description: 'Manage system backups' },
  'system:analytics': { label: 'System Analytics', description: 'View platform-wide analytics' },
  'system:logs': { label: 'System Logs', description: 'View application logs' },

  'integration:create': { label: 'Create Integrations', description: 'Set up new integrations' },
  'integration:read': { label: 'View Integrations', description: 'View integration status' },
  'integration:update': { label: 'Update Integrations', description: 'Modify integration settings' },
  'integration:delete': { label: 'Delete Integrations', description: 'Remove integrations' },

  'report:generate': { label: 'Generate Reports', description: 'Create reports' },
  'report:export': { label: 'Export Reports', description: 'Download report files' },
  'report:schedule': { label: 'Schedule Reports', description: 'Set up recurring reports' },

  'sales_rep:view_all_patients': {
    label: 'View All Patients',
    description: 'Sales rep can see all clinic patients (not only assigned)',
  },
};

/**
 * Permission categories for UI grouping.
 * Each category has a prefix that matches the permission domain (e.g. 'user:', 'patient:').
 */
export const PERMISSION_CATEGORIES: PermissionCategoryDef[] = [
  {
    id: 'user',
    label: 'User Management',
    description: 'Control who can manage user accounts',
    prefix: 'user:',
    permissions: Object.entries(PERMISSIONS)
      .filter(([, v]) => v.startsWith('user:'))
      .map(([k, v]) => ({ key: k, value: v, ...PERMISSION_META[v] })),
  },
  {
    id: 'patient',
    label: 'Patient Management',
    description: 'Access to patient records and PHI',
    prefix: 'patient:',
    permissions: Object.entries(PERMISSIONS)
      .filter(([, v]) => v.startsWith('patient:'))
      .map(([k, v]) => ({ key: k, value: v, ...PERMISSION_META[v] })),
  },
  {
    id: 'provider',
    label: 'Provider Management',
    description: 'Manage healthcare providers',
    prefix: 'provider:',
    permissions: Object.entries(PERMISSIONS)
      .filter(([, v]) => v.startsWith('provider:'))
      .map(([k, v]) => ({ key: k, value: v, ...PERMISSION_META[v] })),
  },
  {
    id: 'order',
    label: 'Order Management',
    description: 'Order creation, fulfillment, and shipping',
    prefix: 'order:',
    permissions: Object.entries(PERMISSIONS)
      .filter(([, v]) => v.startsWith('order:'))
      .map(([k, v]) => ({ key: k, value: v, ...PERMISSION_META[v] })),
  },
  {
    id: 'soap',
    label: 'Clinical / SOAP Notes',
    description: 'Clinical documentation and notes',
    prefix: 'soap:',
    permissions: Object.entries(PERMISSIONS)
      .filter(([, v]) => v.startsWith('soap:'))
      .map(([k, v]) => ({ key: k, value: v, ...PERMISSION_META[v] })),
  },
  {
    id: 'billing',
    label: 'Billing & Payments',
    description: 'Financial operations and invoicing',
    prefix: 'billing:',
    permissions: Object.entries(PERMISSIONS)
      .filter(([, v]) => v.startsWith('billing:'))
      .map(([k, v]) => ({ key: k, value: v, ...PERMISSION_META[v] })),
  },
  {
    id: 'affiliate',
    label: 'Affiliate Management',
    description: 'Affiliate partner administration',
    prefix: 'affiliate:',
    permissions: Object.entries(PERMISSIONS)
      .filter(([, v]) => v.startsWith('affiliate:'))
      .map(([k, v]) => ({ key: k, value: v, ...PERMISSION_META[v] })),
  },
  {
    id: 'system',
    label: 'System Administration',
    description: 'Platform-wide settings and monitoring',
    prefix: 'system:',
    permissions: Object.entries(PERMISSIONS)
      .filter(([, v]) => v.startsWith('system:'))
      .map(([k, v]) => ({ key: k, value: v, ...PERMISSION_META[v] })),
  },
  {
    id: 'integration',
    label: 'Integrations',
    description: 'Third-party service connections',
    prefix: 'integration:',
    permissions: Object.entries(PERMISSIONS)
      .filter(([, v]) => v.startsWith('integration:'))
      .map(([k, v]) => ({ key: k, value: v, ...PERMISSION_META[v] })),
  },
  {
    id: 'report',
    label: 'Reports',
    description: 'Report generation and export',
    prefix: 'report:',
    permissions: Object.entries(PERMISSIONS)
      .filter(([, v]) => v.startsWith('report:'))
      .map(([k, v]) => ({ key: k, value: v, ...PERMISSION_META[v] })),
  },
  {
    id: 'sales_rep',
    label: 'Sales Rep',
    description: 'Sales rep extra permissions (grantable by admin)',
    prefix: 'sales_rep:',
    permissions: Object.entries(PERMISSIONS)
      .filter(([, v]) => v.startsWith('sales_rep:'))
      .map(([k, v]) => ({ key: k, value: v, ...PERMISSION_META[v] })),
  },
];

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
    PERMISSIONS.PATIENT_MERGE,

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

    // Full Affiliate Management
    PERMISSIONS.AFFILIATE_CREATE,
    PERMISSIONS.AFFILIATE_READ,
    PERMISSIONS.AFFILIATE_UPDATE,
    PERMISSIONS.AFFILIATE_DELETE,
    PERMISSIONS.AFFILIATE_PAYOUT,

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
    PERMISSIONS.PATIENT_MERGE,

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

  AFFILIATE: [
    // HIPAA-COMPLIANT: Only aggregated commission data
    PERMISSIONS.BILLING_VIEW, // Own commissions only
    PERMISSIONS.REPORT_GENERATE, // Own aggregated reports only
  ],

  SALES_REP: [
    // Patient Management (assigned patients only)
    PERMISSIONS.PATIENT_READ,
    PERMISSIONS.PATIENT_UPDATE,

    // Limited Billing (view only for assigned patients)
    PERMISSIONS.BILLING_VIEW,

    // Basic Reports (own performance)
    PERMISSIONS.REPORT_GENERATE,
  ],
  // Lowercase aliases for compatibility
  super_admin: [...Object.values(PERMISSIONS)],
  admin: [
    PERMISSIONS.USER_CREATE,
    PERMISSIONS.USER_READ,
    PERMISSIONS.USER_UPDATE,
    PERMISSIONS.USER_SUSPEND,
    PERMISSIONS.USER_RESET_PASSWORD,
    PERMISSIONS.PATIENT_CREATE,
    PERMISSIONS.PATIENT_READ,
    PERMISSIONS.PATIENT_UPDATE,
    PERMISSIONS.PATIENT_DELETE,
    PERMISSIONS.PATIENT_EXPORT,
    PERMISSIONS.PATIENT_VIEW_PHI,
    PERMISSIONS.PATIENT_MERGE,
    PERMISSIONS.PROVIDER_CREATE,
    PERMISSIONS.PROVIDER_READ,
    PERMISSIONS.PROVIDER_UPDATE,
    PERMISSIONS.PROVIDER_DELETE,
    PERMISSIONS.PROVIDER_VERIFY_NPI,
    PERMISSIONS.ORDER_CREATE,
    PERMISSIONS.ORDER_READ,
    PERMISSIONS.ORDER_UPDATE,
    PERMISSIONS.ORDER_DELETE,
    PERMISSIONS.ORDER_APPROVE,
    PERMISSIONS.ORDER_SHIP,
    PERMISSIONS.SOAP_CREATE,
    PERMISSIONS.SOAP_READ,
    PERMISSIONS.SOAP_UPDATE,
    PERMISSIONS.SOAP_DELETE,
    PERMISSIONS.SOAP_APPROVE,
    PERMISSIONS.SOAP_LOCK,
    PERMISSIONS.BILLING_VIEW,
    PERMISSIONS.BILLING_CREATE,
    PERMISSIONS.BILLING_REFUND,
    PERMISSIONS.BILLING_EXPORT,
    PERMISSIONS.AFFILIATE_CREATE,
    PERMISSIONS.AFFILIATE_READ,
    PERMISSIONS.AFFILIATE_UPDATE,
    PERMISSIONS.AFFILIATE_DELETE,
    PERMISSIONS.AFFILIATE_PAYOUT,
    PERMISSIONS.SYSTEM_CONFIG,
    PERMISSIONS.SYSTEM_AUDIT,
    PERMISSIONS.SYSTEM_ANALYTICS,
    PERMISSIONS.SYSTEM_LOGS,
    PERMISSIONS.INTEGRATION_CREATE,
    PERMISSIONS.INTEGRATION_READ,
    PERMISSIONS.INTEGRATION_UPDATE,
    PERMISSIONS.INTEGRATION_DELETE,
    PERMISSIONS.REPORT_GENERATE,
    PERMISSIONS.REPORT_EXPORT,
    PERMISSIONS.REPORT_SCHEDULE,
  ],
  provider: [
    PERMISSIONS.USER_READ,
    PERMISSIONS.PATIENT_CREATE,
    PERMISSIONS.PATIENT_READ,
    PERMISSIONS.PATIENT_UPDATE,
    PERMISSIONS.PATIENT_MERGE,
    PERMISSIONS.SOAP_CREATE,
    PERMISSIONS.SOAP_READ,
    PERMISSIONS.SOAP_UPDATE,
    PERMISSIONS.SOAP_APPROVE,
    PERMISSIONS.ORDER_CREATE,
    PERMISSIONS.ORDER_READ,
    PERMISSIONS.ORDER_UPDATE,
    PERMISSIONS.ORDER_APPROVE,
    PERMISSIONS.BILLING_VIEW,
    PERMISSIONS.REPORT_GENERATE,
  ],
  staff: [
    PERMISSIONS.PATIENT_CREATE,
    PERMISSIONS.PATIENT_READ,
    PERMISSIONS.PATIENT_UPDATE,
    PERMISSIONS.ORDER_CREATE,
    PERMISSIONS.ORDER_READ,
    PERMISSIONS.ORDER_UPDATE,
    PERMISSIONS.SOAP_READ,
    PERMISSIONS.BILLING_VIEW,
    PERMISSIONS.BILLING_CREATE,
    PERMISSIONS.REPORT_GENERATE,
  ],
  support: [
    PERMISSIONS.USER_READ,
    PERMISSIONS.PATIENT_READ,
    PERMISSIONS.ORDER_READ,
    PERMISSIONS.SOAP_READ,
    PERMISSIONS.BILLING_VIEW,
    PERMISSIONS.SYSTEM_LOGS,
  ],
  affiliate: [
    PERMISSIONS.AFFILIATE_READ,
    PERMISSIONS.PATIENT_READ,
    PERMISSIONS.ORDER_READ,
    PERMISSIONS.BILLING_VIEW,
    PERMISSIONS.REPORT_GENERATE,
  ],
  patient: [PERMISSIONS.ORDER_READ, PERMISSIONS.BILLING_VIEW],
  sales_rep: [
    PERMISSIONS.PATIENT_READ,
    PERMISSIONS.PATIENT_UPDATE,
    PERMISSIONS.BILLING_VIEW,
    PERMISSIONS.REPORT_GENERATE,
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

  AFFILIATE: [
    // HIPAA-compliant: aggregated metrics only
    'dashboard_analytics', // Own aggregated data only
  ],

  SALES_REP: [
    // Limited dashboard
    'dashboard_analytics',

    // Communication
    'secure_messaging',
  ],
} as const;

// Type for role keys as stored in database/auth (lowercase)
export type UserRole =
  | 'super_admin'
  | 'admin'
  | 'provider'
  | 'staff'
  | 'patient'
  | 'support'
  | 'affiliate'
  | 'sales_rep';

// Type for role keys in ROLE_PERMISSIONS (uppercase)
type RoleKey = keyof typeof ROLE_PERMISSIONS;

// Map from lowercase role to uppercase key
const ROLE_KEY_MAP: Record<UserRole, RoleKey> = {
  super_admin: 'SUPER_ADMIN',
  admin: 'ADMIN',
  provider: 'PROVIDER',
  staff: 'STAFF',
  patient: 'PATIENT',
  affiliate: 'AFFILIATE',
  support: 'SUPPORT',
  sales_rep: 'SALES_REP',
};

/**
 * Normalize role string to the ROLE_PERMISSIONS key format
 * Accepts both 'admin' and 'ADMIN' formats
 */
function normalizeRoleKey(role: string): RoleKey | undefined {
  const lowerRole = role.toLowerCase() as UserRole;
  return ROLE_KEY_MAP[lowerRole] ?? (role.toUpperCase() as RoleKey);
}

/**
 * Safely parse a UserPermissionOverrides JSON value from the database.
 * Returns a normalized object with empty arrays as defaults.
 */
export function parseOverrides(raw: unknown): UserPermissionOverrides {
  if (!raw || typeof raw !== 'object') return { granted: [], revoked: [] };
  const obj = raw as Record<string, unknown>;
  return {
    granted: Array.isArray(obj.granted) ? (obj.granted as string[]) : [],
    revoked: Array.isArray(obj.revoked) ? (obj.revoked as string[]) : [],
  };
}

// ─── Permission checks with override support ───────────────────────────

/**
 * Check if a user role has a specific permission.
 * When `userOverrides` is supplied the additive/subtractive model is applied:
 *   effective = (role defaults) + granted − revoked
 */
export function hasPermission(
  userRole: string,
  permission: string,
  userOverrides?: UserPermissionOverrides | null,
): boolean {
  const overrides = userOverrides ? parseOverrides(userOverrides) : null;

  // Explicit revoke takes priority
  if (overrides?.revoked.includes(permission)) return false;
  // Explicit grant
  if (overrides?.granted.includes(permission)) return true;

  // Fall back to role default
  const roleKey = normalizeRoleKey(userRole);
  if (!roleKey) return false;

  const rolePermissions = ROLE_PERMISSIONS[roleKey];
  if (!rolePermissions) return false;

  return (rolePermissions as readonly string[]).includes(permission);
}

/**
 * Check if a user role has access to a feature.
 * When `userOverrides` is supplied the additive/subtractive model is applied.
 */
export function hasFeature(
  userRole: string,
  featureId: string,
  userOverrides?: UserPermissionOverrides | null,
): boolean {
  const overrides = userOverrides ? parseOverrides(userOverrides) : null;

  if (overrides?.revoked.includes(featureId)) return false;
  if (overrides?.granted.includes(featureId)) return true;

  const roleKey = normalizeRoleKey(userRole);
  if (!roleKey) return false;

  const roleFeatures = ROLE_FEATURES[roleKey as keyof typeof ROLE_FEATURES];
  if (!roleFeatures) return false;

  return (roleFeatures as readonly string[]).includes(featureId);
}

// ─── Role-default accessors (unchanged signatures) ─────────────────────

/**
 * Get all permissions for a role (without overrides).
 */
export function getRolePermissions(userRole: string): string[] {
  const roleKey = normalizeRoleKey(userRole);
  if (!roleKey) return [];

  const permissions = ROLE_PERMISSIONS[roleKey];
  return permissions ? [...permissions] : [];
}

/**
 * Get all features for a role (without overrides).
 */
export function getRoleFeatures(userRole: string): string[] {
  const roleKey = normalizeRoleKey(userRole);
  if (!roleKey) return [];

  const features = ROLE_FEATURES[roleKey as keyof typeof ROLE_FEATURES];
  return features ? [...features] : [];
}

// ─── Effective (merged) accessors ───────────────────────────────────────

/**
 * Compute the effective permission set for a user.
 * Returns detailed entries with source metadata for every known permission.
 */
export function getEffectivePermissions(
  userRole: string,
  userOverrides?: UserPermissionOverrides | null,
): EffectivePermissionEntry[] {
  const rolePerms = getRolePermissions(userRole);
  const overrides = userOverrides ? parseOverrides(userOverrides) : { granted: [], revoked: [] };
  const allPermValues = Object.values(PERMISSIONS) as string[];

  return allPermValues.map((perm) => {
    const isRoleDefault = rolePerms.includes(perm);
    const isGranted = overrides.granted.includes(perm);
    const isRevoked = overrides.revoked.includes(perm);

    if (isRevoked) {
      return { permission: perm, enabled: false, source: 'custom_revoked' as const };
    }
    if (isGranted) {
      return { permission: perm, enabled: true, source: 'custom_granted' as const };
    }
    if (isRoleDefault) {
      return { permission: perm, enabled: true, source: 'role_default' as const };
    }
    return { permission: perm, enabled: false, source: 'not_available' as const };
  });
}

/**
 * Compute the effective feature set for a user.
 * Returns detailed entries with source metadata for every known feature.
 */
export function getEffectiveFeatures(
  userRole: string,
  userOverrides?: UserPermissionOverrides | null,
): EffectiveFeatureEntry[] {
  const roleFeats = getRoleFeatures(userRole);
  const overrides = userOverrides ? parseOverrides(userOverrides) : { granted: [], revoked: [] };
  const allFeatureIds = Object.values(FEATURES).map((f) => f.id);

  return allFeatureIds.map((fid) => {
    const isRoleDefault = roleFeats.includes(fid);
    const isGranted = overrides.granted.includes(fid);
    const isRevoked = overrides.revoked.includes(fid);

    if (isRevoked) {
      return { featureId: fid, enabled: false, source: 'custom_revoked' as const };
    }
    if (isGranted) {
      return { featureId: fid, enabled: true, source: 'custom_granted' as const };
    }
    if (isRoleDefault) {
      return { featureId: fid, enabled: true, source: 'role_default' as const };
    }
    return { featureId: fid, enabled: false, source: 'not_available' as const };
  });
}

/**
 * Get only the enabled permission strings for a user (role defaults + overrides).
 */
export function getEffectivePermissionStrings(
  userRole: string,
  userOverrides?: UserPermissionOverrides | null,
): string[] {
  return getEffectivePermissions(userRole, userOverrides)
    .filter((e) => e.enabled)
    .map((e) => e.permission);
}

/**
 * Get only the enabled feature IDs for a user (role defaults + overrides).
 */
export function getEffectiveFeatureStrings(
  userRole: string,
  userOverrides?: UserPermissionOverrides | null,
): string[] {
  return getEffectiveFeatures(userRole, userOverrides)
    .filter((e) => e.enabled)
    .map((e) => e.featureId);
}

// ─── Multi-permission helpers ───────────────────────────────────────────

/**
 * Check multiple permissions at once
 */
export function hasAllPermissions(
  userRole: string,
  permissions: string[],
  userOverrides?: UserPermissionOverrides | null,
): boolean {
  return permissions.every((permission) => hasPermission(userRole, permission, userOverrides));
}

/**
 * Check if user has any of the specified permissions
 */
export function hasAnyPermission(
  userRole: string,
  permissions: string[],
  userOverrides?: UserPermissionOverrides | null,
): boolean {
  return permissions.some((permission) => hasPermission(userRole, permission, userOverrides));
}

/**
 * Type guard to check if a string is a valid UserRole
 */
export function isValidRole(role: string): role is UserRole {
  return Object.keys(ROLE_KEY_MAP).includes(role.toLowerCase());
}

/**
 * Build an overrides object from a desired permission set compared to role defaults.
 * Useful when saving the UI state back to the database.
 */
export function buildOverridesFromDesired(
  userRole: string,
  desiredPermissions: string[],
  desiredFeatures: string[],
): { permissionOverrides: UserPermissionOverrides; featureOverrides: UserPermissionOverrides } {
  const rolePerms = getRolePermissions(userRole);
  const roleFeats = getRoleFeatures(userRole);

  const permGranted = desiredPermissions.filter((p) => !rolePerms.includes(p));
  const permRevoked = rolePerms.filter((p) => !desiredPermissions.includes(p));

  const featGranted = desiredFeatures.filter((f) => !roleFeats.includes(f));
  const featRevoked = roleFeats.filter((f) => !desiredFeatures.includes(f));

  return {
    permissionOverrides: { granted: permGranted, revoked: permRevoked },
    featureOverrides: { granted: featGranted, revoked: featRevoked },
  };
}
