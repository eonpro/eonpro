/**
 * Zod Validation Schemas
 * Centralized validation for all API endpoints
 * HIPAA-compliant input validation
 */

import { z } from 'zod';

// ============================================================================
// Common Validators
// ============================================================================

export const emailSchema = z.string().email('Invalid email address').toLowerCase().trim();

export const phoneSchema = z
  .string()
  .regex(/^\+?[1-9]\d{1,14}$|^\d{10,11}$/, 'Invalid phone number')
  .transform((val) => val.replace(/\D/g, ''));

export const passwordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

export const uuidSchema = z.string().uuid('Invalid UUID');

export const idSchema = z.coerce.number().int().positive('ID must be a positive integer');

export const dateSchema = z.string().datetime().or(z.date());

export const dobSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}$|^\d{2}\/\d{2}\/\d{4}$/,
    'Invalid date format (YYYY-MM-DD or MM/DD/YYYY)'
  );

export const zipCodeSchema = z.string().regex(/^\d{5}(-\d{4})?$/, 'Invalid ZIP code');

export const stateSchema = z.string().length(2, 'State must be 2-letter code').toUpperCase();

export const npiSchema = z.string().regex(/^\d{10}$/, 'NPI must be exactly 10 digits');

export const deaSchema = z.string().regex(/^[A-Z]{2}\d{7}$/, 'Invalid DEA number format');

export const currencyAmountSchema = z.coerce
  .number()
  .int('Amount must be in cents (integer)')
  .nonnegative('Amount cannot be negative');

// ============================================================================
// Pagination Schemas
// ============================================================================

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export const searchSchema = paginationSchema.extend({
  q: z.string().trim().optional(),
  search: z.string().trim().optional(),
});

// ============================================================================
// Authentication Schemas
// ============================================================================

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
  role: z
    .enum(['admin', 'provider', 'patient', 'affiliate', 'staff', 'support'])
    .default('patient'),
  mfaCode: z.string().length(6).optional(),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export const resetPasswordRequestSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1, 'Token is required'),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const verifyEmailSchema = z.object({
  token: z.string().min(1, 'Token is required'),
});

// ============================================================================
// Patient Schemas
// ============================================================================

export const patientCreateSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(100),
  lastName: z.string().min(1, 'Last name is required').max(100),
  email: emailSchema,
  phone: phoneSchema,
  dob: dobSchema,
  gender: z.enum(['Male', 'Female', 'Other', 'Prefer not to say']),
  address1: z.string().min(1, 'Address is required').max(200),
  address2: z.string().max(200).optional(),
  city: z.string().min(1, 'City is required').max(100),
  state: stateSchema,
  zip: zipCodeSchema,
  notes: z.string().max(5000).optional(),
  tags: z.array(z.string()).optional(),
  source: z.enum(['manual', 'webhook', 'api', 'referral', 'import']).default('manual'),
  clinicId: idSchema.optional(),
});

export const patientUpdateSchema = patientCreateSchema.partial();

export const patientSearchSchema = searchSchema.extend({
  status: z.string().optional(),
  source: z.string().optional(),
  clinicId: z.coerce.number().int().positive().optional(),
});

// ============================================================================
// Provider Schemas
// ============================================================================

export const providerCreateSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(100),
  lastName: z.string().min(1, 'Last name is required').max(100),
  npi: npiSchema,
  email: emailSchema.optional(),
  phone: phoneSchema.optional(),
  titleLine: z.string().max(100).optional(),
  licenseState: stateSchema.optional(),
  licenseNumber: z.string().max(50).optional(),
  dea: deaSchema.optional(),
  clinicId: idSchema.optional(),
});

export const providerUpdateSchema = providerCreateSchema.partial();

export const providerSetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

// ============================================================================
// Order/Prescription Schemas
// ============================================================================

export const rxSchema = z.object({
  medicationKey: z.string().min(1),
  medName: z.string().min(1, 'Medication name is required'),
  strength: z.string().min(1, 'Strength is required'),
  form: z.string().min(1, 'Form is required'),
  quantity: z.string().min(1, 'Quantity is required'),
  refills: z.string().default('0'),
  sig: z.string().min(1, 'Sig is required'),
});

export const orderCreateSchema = z.object({
  patientId: idSchema,
  providerId: idSchema,
  shippingMethod: z.number().int().min(1).max(10),
  rxs: z.array(rxSchema).min(1, 'At least one prescription is required'),
  notes: z.string().max(2000).optional(),
});

// ============================================================================
// Invoice/Payment Schemas
// ============================================================================

export const invoiceCreateSchema = z.object({
  patientId: idSchema,
  description: z.string().min(1).max(500),
  amount: currencyAmountSchema,
  lineItems: z
    .array(
      z.object({
        description: z.string(),
        amount: currencyAmountSchema,
        quantity: z.number().int().positive().default(1),
      })
    )
    .optional(),
  dueDate: dateSchema.optional(),
  metadata: z.record(z.string()).optional(),
});

export const paymentProcessSchema = z.object({
  patientId: idSchema,
  amount: currencyAmountSchema,
  paymentMethodId: z.string().optional(),
  description: z.string().max(500).optional(),
  invoiceId: idSchema.optional(),
});

export const paymentMethodCreateSchema = z.object({
  patientId: idSchema,
  cardNumber: z.string().regex(/^\d{13,19}$/, 'Invalid card number'),
  expiryMonth: z.coerce.number().int().min(1).max(12),
  expiryYear: z.coerce.number().int().min(new Date().getFullYear()),
  cvv: z.string().regex(/^\d{3,4}$/, 'Invalid CVV'),
  cardholderName: z.string().min(1).max(100),
  billingZip: zipCodeSchema,
  isDefault: z.boolean().default(false),
});

// ============================================================================
// SOAP Note Schemas
// ============================================================================

export const soapNoteCreateSchema = z.object({
  patientId: idSchema,
  subjective: z.string().min(1, 'Subjective is required').max(10000),
  objective: z.string().min(1, 'Objective is required').max(10000),
  assessment: z.string().min(1, 'Assessment is required').max(10000),
  plan: z.string().min(1, 'Plan is required').max(10000),
  medicalNecessity: z.string().max(5000).optional(),
  intakeDocumentId: idSchema.optional(),
});

export const soapNoteUpdateSchema = soapNoteCreateSchema.partial().extend({
  status: z.enum(['DRAFT', 'PENDING_REVIEW', 'APPROVED', 'LOCKED', 'ARCHIVED']).optional(),
});

// ============================================================================
// Appointment Schemas
// ============================================================================

export const appointmentCreateSchema = z.object({
  patientId: idSchema,
  providerId: idSchema,
  appointmentTypeId: idSchema.optional(),
  title: z.string().max(200).optional(),
  startTime: dateSchema,
  endTime: dateSchema.optional(),
  duration: z.coerce.number().int().min(5).max(480).default(30),
  type: z.enum(['IN_PERSON', 'VIDEO', 'PHONE']).default('VIDEO'),
  reason: z.string().max(500).optional(),
  notes: z.string().max(2000).optional(),
  location: z.string().max(200).optional(),
});

export const appointmentUpdateSchema = appointmentCreateSchema.partial().extend({
  status: z
    .enum([
      'SCHEDULED',
      'CONFIRMED',
      'CHECKED_IN',
      'IN_PROGRESS',
      'COMPLETED',
      'CANCELLED',
      'NO_SHOW',
      'RESCHEDULED',
    ])
    .optional(),
  cancellationReason: z.string().max(500).optional(),
});

// ============================================================================
// Ticket Schemas
// ============================================================================

export const ticketCreateSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(5000),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  category: z
    .enum([
      'GENERAL',
      'BILLING',
      'PRESCRIPTION',
      'APPOINTMENT',
      'TECHNICAL_ISSUE',
      'MEDICATION_QUESTION',
      'INSURANCE',
      'DELIVERY',
      'SIDE_EFFECTS',
      'DOSAGE',
      'REFILL',
      'PORTAL_ACCESS',
      'OTHER',
    ])
    .default('GENERAL'),
  patientId: idSchema.optional(),
  orderId: idSchema.optional(),
  assignedToId: idSchema.optional(),
});

export const ticketUpdateSchema = ticketCreateSchema.partial().extend({
  status: z
    .enum([
      'OPEN',
      'IN_PROGRESS',
      'PENDING',
      'ON_HOLD',
      'ESCALATED',
      'RESOLVED',
      'CLOSED',
      'CANCELLED',
    ])
    .optional(),
  disposition: z
    .enum([
      'RESOLVED_SUCCESSFULLY',
      'RESOLVED_WITH_WORKAROUND',
      'NOT_RESOLVED',
      'DUPLICATE',
      'NOT_REPRODUCIBLE',
      'BY_DESIGN',
      'CUSTOMER_ERROR',
      'TRAINING_ISSUE',
      'REFERRED_TO_SPECIALIST',
      'PENDING_CUSTOMER',
      'CANCELLED_BY_CUSTOMER',
    ])
    .optional(),
  resolutionNotes: z.string().max(5000).optional(),
});

// ============================================================================
// Intake Form Schemas
// ============================================================================

export const intakeSubmissionSchema = z.object({
  submissionId: z.string().optional(),
  submittedAt: dateSchema.optional(),
  data: z.record(z.unknown()).optional(),
  sections: z
    .array(
      z.object({
        title: z.string(),
        fields: z.array(
          z.object({
            id: z.string(),
            label: z.string(),
            value: z.unknown(),
          })
        ),
      })
    )
    .optional(),
});

export const sendIntakeFormSchema = z.object({
  patientId: idSchema.optional(),
  templateId: idSchema,
  email: emailSchema,
  phone: phoneSchema.optional(),
  sendVia: z.enum(['email', 'sms', 'both']).default('email'),
});

// ============================================================================
// Webhook Schemas
// ============================================================================

export const webhookPayloadSchema = z
  .object({
    submissionId: z.string().optional(),
    data: z.record(z.unknown()).optional(),
    sections: z.array(z.unknown()).optional(),
    timestamp: z.string().optional(),
  })
  .passthrough(); // Allow additional fields

// ============================================================================
// Settings Schemas
// ============================================================================

export const settingUpdateSchema = z.object({
  category: z.string().min(1),
  key: z.string().min(1),
  value: z.unknown(),
  description: z.string().optional(),
  isPublic: z.boolean().optional(),
});

// ============================================================================
// API Key Schemas
// ============================================================================

export const apiKeyCreateSchema = z.object({
  name: z.string().min(1).max(100),
  permissions: z.record(z.boolean()),
  rateLimit: z.number().int().min(1).max(100000).default(1000),
  expiresAt: dateSchema.optional(),
});

// ============================================================================
// User Schemas
// ============================================================================

export const userCreateSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  role: z.enum(['SUPER_ADMIN', 'ADMIN', 'PROVIDER', 'AFFILIATE', 'PATIENT', 'STAFF', 'SUPPORT']),
  clinicId: idSchema.optional(),
  providerId: idSchema.optional(),
  patientId: idSchema.optional(),
});

export const userUpdateSchema = userCreateSchema.partial().omit({ password: true });

// ============================================================================
// Clinic Schemas
// ============================================================================

export const clinicCreateSchema = z.object({
  name: z.string().min(1).max(200),
  subdomain: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z0-9-]+$/, 'Subdomain can only contain lowercase letters, numbers, and hyphens'),
  adminEmail: emailSchema,
  phone: phoneSchema.optional(),
  timezone: z.string().default('America/New_York'),
  billingPlan: z.enum(['starter', 'professional', 'enterprise']).default('starter'),
});

export const clinicUpdateSchema = clinicCreateSchema.partial();

// ============================================================================
// Care Plan Schemas
// ============================================================================

export const carePlanCreateSchema = z.object({
  patientId: idSchema,
  providerId: idSchema.optional(),
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  templateId: idSchema.optional(),
  startDate: dateSchema.optional(),
  endDate: dateSchema.optional(),
  goals: z
    .array(
      z.object({
        title: z.string().min(1),
        description: z.string().optional(),
        targetValue: z.string().optional(),
        unit: z.string().optional(),
        targetDate: dateSchema.optional(),
      })
    )
    .optional(),
});

// ============================================================================
// Superbill Schemas
// ============================================================================

export const superbillCreateSchema = z.object({
  patientId: idSchema,
  providerId: idSchema,
  appointmentId: idSchema.optional(),
  serviceDate: dateSchema,
  items: z
    .array(
      z.object({
        cptCode: z.string().regex(/^\d{5}$/, 'Invalid CPT code'),
        cptDescription: z.string(),
        icdCodes: z.array(z.string()),
        icdDescriptions: z.array(z.string()),
        modifier: z.string().optional(),
        units: z.number().int().positive().default(1),
        unitPrice: currencyAmountSchema,
      })
    )
    .min(1),
  notes: z.string().max(2000).optional(),
});

// ============================================================================
// Export Type Inference Helpers
// ============================================================================

export type LoginInput = z.infer<typeof loginSchema>;
export type PatientCreateInput = z.infer<typeof patientCreateSchema>;
export type PatientUpdateInput = z.infer<typeof patientUpdateSchema>;
export type ProviderCreateInput = z.infer<typeof providerCreateSchema>;
export type OrderCreateInput = z.infer<typeof orderCreateSchema>;
export type InvoiceCreateInput = z.infer<typeof invoiceCreateSchema>;
export type SOAPNoteCreateInput = z.infer<typeof soapNoteCreateSchema>;
export type AppointmentCreateInput = z.infer<typeof appointmentCreateSchema>;
export type TicketCreateInput = z.infer<typeof ticketCreateSchema>;
export type UserCreateInput = z.infer<typeof userCreateSchema>;
export type ClinicCreateInput = z.infer<typeof clinicCreateSchema>;
export type CarePlanCreateInput = z.infer<typeof carePlanCreateSchema>;
export type SuperbillCreateInput = z.infer<typeof superbillCreateSchema>;
