import { US_STATE_CODE_LIST, US_STATE_OPTIONS } from '@/lib/usStates';
import { z } from 'zod';

// Create a map of state names to codes for normalization
const stateNameToCode: Record<string, string> = {};
US_STATE_OPTIONS.forEach((s) => {
  stateNameToCode[s.label.toLowerCase()] = s.value;
  stateNameToCode[s.value.toLowerCase()] = s.value;
});

// Custom state transformer that accepts both codes and full names
const stateSchema = z.string().transform((val, ctx) => {
  if (!val) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'State is required' });
    return z.NEVER;
  }
  const normalized = val.trim();
  // Check if it's already a valid code
  if (US_STATE_CODE_LIST.includes(normalized.toUpperCase() as any)) {
    return normalized.toUpperCase();
  }
  // Try to find by name
  const code = stateNameToCode[normalized.toLowerCase()];
  if (code) {
    return code;
  }
  ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Invalid state: ${val}` });
  return z.NEVER;
});

// Custom gender transformer that accepts various formats and normalizes to 'm' or 'f'
const genderSchema = z.string().transform((val, ctx) => {
  if (!val) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Gender is required' });
    return z.NEVER;
  }
  const normalized = val.trim().toLowerCase();
  // Accept male/m/man variants
  if (['m', 'male', 'man'].includes(normalized)) {
    return 'm';
  }
  // Accept female/f/woman variants
  if (['f', 'female', 'woman'].includes(normalized)) {
    return 'f';
  }
  // Accept other/non-binary
  if (['other', 'o', 'non-binary', 'nonbinary', 'nb'].includes(normalized)) {
    return 'other';
  }
  ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Invalid gender: ${val}` });
  return z.NEVER;
});

export const patientSchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
  dob: z.string(),
  gender: genderSchema,
  phone: z.string(),
  email: z.string(),
  address1: z.string(),
  address2: z.string().nullable().optional(),
  city: z.string(),
  state: stateSchema,
  zip: z.string(),
  notes: z
    .string()
    .optional()
    .or(z.literal(''))
    .transform((val: any) => val || undefined),
  tags: z.array(z.string()).optional(),
  clinicId: z.number().nullable().optional(),
});

export const rxSchema = z.object({
  medicationKey: z.string().min(1, 'Medication is required'),
  sig: z.string().min(1, 'Prescription instructions (SIG) are required'),
  quantity: z.union([z.string(), z.number()]).transform((v) => String(v ?? '')),
  refills: z.union([z.string(), z.number()]).transform((v) => String(v ?? '')),
  daysSupply: z.union([z.string(), z.number()]).optional().transform((v) => {
    if (v === undefined || v === null || v === '') return undefined;
    return String(v);
  }),
});

// Accept null/undefined providerId - API resolves from user.providerId when missing
const providerIdSchema = z
  .union([z.number(), z.null(), z.undefined()])
  .optional()
  .transform((v) => (v === null || v === undefined ? undefined : v));

export const prescriptionSchema = z.object({
  patient: patientSchema,
  patientId: z.number().nullable().optional(), // Existing patient ID - if provided, skips name-based lookup
  rxs: z.array(rxSchema).min(1, 'At least one medication is required'),
  shippingMethod: z.union([z.number(), z.string()]).transform((v) => (typeof v === 'string' ? parseInt(v, 10) : v)),
  signatureDataUrl: z.string().nullable().optional(),
  providerId: providerIdSchema,
  clinicId: z.number().nullable().optional(), // User's active clinic for multi-tenant support
  refillId: z.number().nullable().optional(), // Link to refill queue item if this is a refill prescription
  invoiceId: z.number().nullable().optional(), // Link to invoice (for refill auto-linking)
  /** When true (admin only), create order as queued_for_provider; do not send to Lifefile. */
  queueForProvider: z.boolean().optional().default(false),
});
