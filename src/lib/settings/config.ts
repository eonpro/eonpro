/**
 * Settings Configuration System
 * Central management for all platform settings
 */

export interface SettingCategory {
  id: string;
  name: string;
  description: string;
  icon?: string;
  requiredPermission?: string;
  subcategories?: SettingSubcategory[];
}

export interface SettingSubcategory {
  id: string;
  name: string;
  description: string;
  settings: Setting[];
}

export interface Setting {
  id: string;
  name: string;
  description: string;
  type: 'boolean' | 'string' | 'number' | 'select' | 'multiselect' | 'json' | 'password' | 'api_key';
  value?: any;
  defaultValue?: any;
  options?: { label: string; value: any }[];
  validation?: {
    required?: boolean;
    min?: number;
    max?: number;
    pattern?: string;
    custom?: (value: any) => boolean;
  };
  sensitive?: boolean;
  restartRequired?: boolean;
}

// Define all settings categories
export const SETTINGS_CATEGORIES: SettingCategory[] = [
  {
    id: 'general',
    name: 'General Settings',
    description: 'Basic platform configuration',
    icon: '⚙️',
    subcategories: [
      {
        id: 'platform',
        name: 'Platform',
        description: 'Core platform settings',
        settings: [
          {
            id: 'platform.name',
            name: 'Platform Name',
            description: 'The name of your platform',
            type: 'string',
            defaultValue: 'Lifefile EHR',
            validation: { required: true },
          },
          {
            id: 'platform.url',
            name: 'Platform URL',
            description: 'The base URL of your platform',
            type: 'string',
            defaultValue: 'https://lifefile.com',
            validation: { 
              required: true,
              pattern: '^https?://.+',
            },
          },
          {
            id: 'platform.timezone',
            name: 'Default Timezone',
            description: 'Default timezone for the platform',
            type: 'select',
            defaultValue: 'America/New_York',
            options: [
              { label: 'Eastern Time', value: 'America/New_York' },
              { label: 'Central Time', value: 'America/Chicago' },
              { label: 'Mountain Time', value: 'America/Denver' },
              { label: 'Pacific Time', value: 'America/Los_Angeles' },
              { label: 'UTC', value: 'UTC' },
            ],
          },
          {
            id: 'platform.maintenance_mode',
            name: 'Maintenance Mode',
            description: 'Enable maintenance mode to prevent user access',
            type: 'boolean',
            defaultValue: false,
          },
        ],
      },
      {
        id: 'branding',
        name: 'Branding',
        description: 'Customize platform appearance',
        settings: [
          {
            id: 'branding.logo_url',
            name: 'Logo URL',
            description: 'URL to your platform logo',
            type: 'string',
            defaultValue: '/logo.png',
          },
          {
            id: 'branding.primary_color',
            name: 'Primary Color',
            description: 'Primary brand color (hex)',
            type: 'string',
            defaultValue: '#4CAF50',
            validation: { pattern: '^#[0-9A-Fa-f]{6}$' },
          },
          {
            id: 'branding.support_email',
            name: 'Support Email',
            description: 'Email for customer support',
            type: 'string',
            defaultValue: 'support@lifefile.com',
            validation: { pattern: '^.+@.+\\..+$' },
          },
        ],
      },
    ],
  },
  
  {
    id: 'integrations',
    name: 'Integrations',
    description: 'External service integrations',
    icon: '🔌',
    requiredPermission: 'integration:read',
    subcategories: [
      {
        id: 'lifefile',
        name: 'Lifefile Pharmacy',
        description: 'Lifefile pharmacy integration settings',
        settings: [
          {
            id: 'lifefile.enabled',
            name: 'Enable Lifefile Integration',
            description: 'Connect to Lifefile pharmacy services',
            type: 'boolean',
            defaultValue: true,
          },
          {
            id: 'lifefile.base_url',
            name: 'API Base URL',
            description: 'Lifefile API endpoint',
            type: 'string',
            defaultValue: 'https://portal.lifefilehealth.com',
            sensitive: true,
          },
          {
            id: 'lifefile.username',
            name: 'API Username',
            description: 'Lifefile API username',
            type: 'string',
            sensitive: true,
          },
          {
            id: 'lifefile.password',
            name: 'API Password',
            description: 'Lifefile API password',
            type: 'password',
            sensitive: true,
          },
          {
            id: 'lifefile.webhook_secret',
            name: 'Webhook Secret',
            description: 'Secret for validating Lifefile webhooks',
            type: 'password',
            sensitive: true,
          },
        ],
      },
      {
        id: 'stripe',
        name: 'Stripe Payments',
        description: 'Stripe payment processing',
        settings: [
          {
            id: 'stripe.enabled',
            name: 'Enable Stripe',
            description: 'Enable Stripe payment processing',
            type: 'boolean',
            defaultValue: true,
          },
          {
            id: 'stripe.mode',
            name: 'Stripe Mode',
            description: 'Use test or live mode',
            type: 'select',
            defaultValue: 'test',
            options: [
              { label: 'Test Mode', value: 'test' },
              { label: 'Live Mode', value: 'live' },
            ],
          },
          {
            id: 'stripe.publishable_key',
            name: 'Publishable Key',
            description: 'Stripe publishable API key',
            type: 'string',
            sensitive: false,
          },
          {
            id: 'stripe.secret_key',
            name: 'Secret Key',
            description: 'Stripe secret API key',
            type: 'password',
            sensitive: true,
          },
          {
            id: 'stripe.webhook_secret',
            name: 'Webhook Endpoint Secret',
            description: 'Stripe webhook endpoint secret',
            type: 'password',
            sensitive: true,
          },
        ],
      },
      {
        id: 'twilio',
        name: 'Twilio Communications',
        description: 'SMS and voice communications',
        settings: [
          {
            id: 'twilio.enabled',
            name: 'Enable Twilio',
            description: 'Enable SMS and voice features',
            type: 'boolean',
            defaultValue: false,
          },
          {
            id: 'twilio.account_sid',
            name: 'Account SID',
            description: 'Twilio Account SID',
            type: 'string',
            sensitive: true,
          },
          {
            id: 'twilio.auth_token',
            name: 'Auth Token',
            description: 'Twilio Auth Token',
            type: 'password',
            sensitive: true,
          },
          {
            id: 'twilio.phone_number',
            name: 'Phone Number',
            description: 'Twilio phone number for SMS',
            type: 'string',
            validation: { pattern: '^\\+1[0-9]{10}$' },
          },
        ],
      },
      {
        id: 'sendgrid',
        name: 'SendGrid Email',
        description: 'Email delivery service',
        settings: [
          {
            id: 'sendgrid.enabled',
            name: 'Enable SendGrid',
            description: 'Use SendGrid for email delivery',
            type: 'boolean',
            defaultValue: false,
          },
          {
            id: 'sendgrid.api_key',
            name: 'API Key',
            description: 'SendGrid API key',
            type: 'password',
            sensitive: true,
          },
          {
            id: 'sendgrid.from_email',
            name: 'From Email',
            description: 'Default sender email address',
            type: 'string',
            validation: { pattern: '^.+@.+\\..+$' },
          },
          {
            id: 'sendgrid.from_name',
            name: 'From Name',
            description: 'Default sender name',
            type: 'string',
            defaultValue: 'Lifefile EHR',
          },
        ],
      },
      {
        id: 'openai',
        name: 'OpenAI',
        description: 'AI and language model integration',
        settings: [
          {
            id: 'openai.enabled',
            name: 'Enable OpenAI',
            description: 'Enable AI features',
            type: 'boolean',
            defaultValue: true,
          },
          {
            id: 'openai.api_key',
            name: 'API Key',
            description: 'OpenAI API key',
            type: 'password',
            sensitive: true,
          },
          {
            id: 'openai.model',
            name: 'Model',
            description: 'Default AI model to use',
            type: 'select',
            defaultValue: 'gpt-4',
            options: [
              { label: 'GPT-4', value: 'gpt-4' },
              { label: 'GPT-4 Turbo', value: 'gpt-4-turbo' },
              { label: 'GPT-3.5 Turbo', value: 'gpt-3.5-turbo' },
            ],
          },
          {
            id: 'openai.max_tokens',
            name: 'Max Tokens',
            description: 'Maximum tokens per request',
            type: 'number',
            defaultValue: 2000,
            validation: { min: 100, max: 8000 },
          },
        ],
      },
    ],
  },
  
  {
    id: 'developer',
    name: 'Developer Tools',
    description: 'API and developer settings',
    icon: '🛠️',
    requiredPermission: 'system:config',
    subcategories: [
      {
        id: 'api',
        name: 'API Configuration',
        description: 'API access and rate limiting',
        settings: [
          {
            id: 'api.enabled',
            name: 'Enable API Access',
            description: 'Allow external API access',
            type: 'boolean',
            defaultValue: true,
          },
          {
            id: 'api.rate_limit',
            name: 'Rate Limit (requests/minute)',
            description: 'Maximum API requests per minute',
            type: 'number',
            defaultValue: 60,
            validation: { min: 1, max: 1000 },
          },
          {
            id: 'api.cors_origins',
            name: 'CORS Origins',
            description: 'Allowed CORS origins (comma-separated)',
            type: 'string',
            defaultValue: 'http://localhost:3000,http://localhost:3001',
          },
          {
            id: 'api.require_authentication',
            name: 'Require Authentication',
            description: 'Require authentication for all API endpoints',
            type: 'boolean',
            defaultValue: true,
          },
        ],
      },
      {
        id: 'webhooks',
        name: 'Webhooks',
        description: 'Webhook configuration',
        settings: [
          {
            id: 'webhooks.enabled',
            name: 'Enable Webhooks',
            description: 'Allow webhook subscriptions',
            type: 'boolean',
            defaultValue: true,
          },
          {
            id: 'webhooks.max_retries',
            name: 'Max Retries',
            description: 'Maximum webhook retry attempts',
            type: 'number',
            defaultValue: 3,
            validation: { min: 0, max: 10 },
          },
          {
            id: 'webhooks.timeout',
            name: 'Timeout (seconds)',
            description: 'Webhook request timeout',
            type: 'number',
            defaultValue: 30,
            validation: { min: 5, max: 300 },
          },
          {
            id: 'webhooks.signature_header',
            name: 'Signature Header',
            description: 'Header name for webhook signatures',
            type: 'string',
            defaultValue: 'X-Webhook-Signature',
          },
        ],
      },
      {
        id: 'logging',
        name: 'Logging & Monitoring',
        description: 'System logging configuration',
        settings: [
          {
            id: 'logging.level',
            name: 'Log Level',
            description: 'Minimum log level to record',
            type: 'select',
            defaultValue: 'info',
            options: [
              { label: 'Debug', value: 'debug' },
              { label: 'Info', value: 'info' },
              { label: 'Warning', value: 'warn' },
              { label: 'Error', value: 'error' },
            ],
          },
          {
            id: 'logging.retention_days',
            name: 'Log Retention (days)',
            description: 'Days to retain logs',
            type: 'number',
            defaultValue: 90,
            validation: { min: 7, max: 365 },
          },
          {
            id: 'logging.enable_sentry',
            name: 'Enable Sentry',
            description: 'Send errors to Sentry',
            type: 'boolean',
            defaultValue: true,
          },
          {
            id: 'logging.sentry_dsn',
            name: 'Sentry DSN',
            description: 'Sentry error tracking DSN',
            type: 'password',
            sensitive: true,
          },
        ],
      },
    ],
  },
  
  {
    id: 'security',
    name: 'Security',
    description: 'Security and compliance settings',
    icon: 'security',
    requiredPermission: 'system:config',
    subcategories: [
      {
        id: 'authentication',
        name: 'Authentication',
        description: 'User authentication settings',
        settings: [
          {
            id: 'auth.session_timeout',
            name: 'Session Timeout (minutes)',
            description: 'User session timeout period',
            type: 'number',
            defaultValue: 60,
            validation: { min: 5, max: 1440 },
          },
          {
            id: 'auth.max_login_attempts',
            name: 'Max Login Attempts',
            description: 'Maximum failed login attempts',
            type: 'number',
            defaultValue: 5,
            validation: { min: 3, max: 10 },
          },
          {
            id: 'auth.lockout_duration',
            name: 'Lockout Duration (minutes)',
            description: 'Account lockout duration',
            type: 'number',
            defaultValue: 15,
            validation: { min: 5, max: 60 },
          },
          {
            id: 'auth.require_2fa',
            name: 'Require 2FA',
            description: 'Require two-factor authentication',
            type: 'boolean',
            defaultValue: false,
          },
          {
            id: 'auth.password_min_length',
            name: 'Min Password Length',
            description: 'Minimum password length',
            type: 'number',
            defaultValue: 8,
            validation: { min: 6, max: 32 },
          },
        ],
      },
      {
        id: 'hipaa',
        name: 'HIPAA Compliance',
        description: 'HIPAA compliance settings',
        settings: [
          {
            id: 'hipaa.phi_encryption',
            name: 'PHI Encryption',
            description: 'Encrypt PHI at rest',
            type: 'boolean',
            defaultValue: true,
          },
          {
            id: 'hipaa.audit_logging',
            name: 'Audit Logging',
            description: 'Enable HIPAA audit logging',
            type: 'boolean',
            defaultValue: true,
          },
          {
            id: 'hipaa.auto_logoff',
            name: 'Auto Logoff (minutes)',
            description: 'Automatic logoff after inactivity',
            type: 'number',
            defaultValue: 15,
            validation: { min: 5, max: 30 },
          },
          {
            id: 'hipaa.phi_access_logging',
            name: 'PHI Access Logging',
            description: 'Log all PHI access attempts',
            type: 'boolean',
            defaultValue: true,
          },
        ],
      },
    ],
  },
  
  {
    id: 'users',
    name: 'User Management',
    description: 'User and role configuration',
    icon: 'users',
    requiredPermission: 'user:read',
    subcategories: [
      {
        id: 'registration',
        name: 'User Registration',
        description: 'New user registration settings',
        settings: [
          {
            id: 'users.allow_registration',
            name: 'Allow Registration',
            description: 'Allow new user registration',
            type: 'boolean',
            defaultValue: false,
          },
          {
            id: 'users.require_email_verification',
            name: 'Require Email Verification',
            description: 'Require email verification for new users',
            type: 'boolean',
            defaultValue: true,
          },
          {
            id: 'users.default_role',
            name: 'Default Role',
            description: 'Default role for new users',
            type: 'select',
            defaultValue: "patient",
            options: [
              { label: 'Patient', value: "patient" },
              { label: 'Staff', value: 'staff' },
              { label: 'Support', value: 'support' },
            ],
          },
        ],
      },
    ],
  },
];
