/**
 * Provider Domain Validation
 * ==========================
 *
 * Zod schemas for provider domain validation.
 * Includes input normalization (trim, case conversion).
 *
 * @module domains/provider/validation
 */

import { z, ZodIssueCode } from 'zod';
import { US_STATE_CODE_LIST, US_STATE_OPTIONS, type USStateCode } from '@/lib/usStates';

// State lookup helpers
const STATE_CODE_SET = new Set<USStateCode>(US_STATE_CODE_LIST);
const STATE_LABEL_TO_CODE = US_STATE_OPTIONS.reduce<Record<string, USStateCode>>(
  (acc, state) => {
    acc[state.label.toUpperCase()] = state.value;
    return acc;
  },
  {}
);

/**
 * Normalize state input to valid US state code
 */
function normalizeState(value?: string | null): USStateCode | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const upper = trimmed.toUpperCase();
  if (STATE_CODE_SET.has(upper as USStateCode)) {
    return upper as USStateCode;
  }
  const mapped = STATE_LABEL_TO_CODE[upper];
  return mapped ?? undefined;
}

/**
 * Validate NPI using Luhn algorithm
 * NPI checksum validation per CMS specification
 */
function isValidNpiChecksum(npi: string): boolean {
  if (!/^\d{10}$/.test(npi)) return false;

  // NPI uses a modified Luhn algorithm with prefix 80840
  const prefixedNpi = '80840' + npi;
  let sum = 0;
  let alternate = false;

  for (let i = prefixedNpi.length - 1; i >= 0; i--) {
    let digit = parseInt(prefixedNpi[i], 10);

    if (alternate) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }

    sum += digit;
    alternate = !alternate;
  }

  return sum % 10 === 0;
}

/**
 * Schema for creating a new provider
 */
export const createProviderSchema = z.object({
  npi: z
    .string()
    .transform((val) => val.trim())
    .refine((val) => /^\d{10}$/.test(val), {
      message: 'NPI must be exactly 10 digits',
    })
    .refine(isValidNpiChecksum, {
      message: 'Invalid NPI checksum',
    }),
  firstName: z
    .string()
    .transform((val) => val.trim())
    .refine((val) => val.length > 0, 'First name is required'),
  lastName: z
    .string()
    .transform((val) => val.trim())
    .refine((val) => val.length > 0, 'Last name is required'),
  titleLine: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return undefined;
      const trimmed = val.trim();
      return trimmed.length ? trimmed : undefined;
    }),
  licenseState: z
    .union([z.string(), z.null()])
    .optional()
    .superRefine((value, ctx) => {
      if (!value || !value.toString().trim()) {
        return;
      }
      if (!normalizeState(value)) {
        ctx.addIssue({
          code: ZodIssueCode.custom,
          message: 'License state must be a valid US state',
          path: ['licenseState'],
        });
      }
    })
    .transform((value) => normalizeState(value)),
  licenseNumber: z
    .string()
    .optional()
    .transform((val) => (val && val.trim() ? val.trim() : undefined)),
  dea: z
    .string()
    .optional()
    .transform((val) => (val && val.trim() ? val.trim() : undefined)),
  email: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return undefined;
      const trimmed = val.trim().toLowerCase();
      return trimmed.length ? trimmed : undefined;
    })
    .refine(
      (val) => val === undefined || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val),
      'Invalid email format'
    ),
  phone: z
    .string()
    .optional()
    .transform((val) => (val && val.trim() ? val.trim() : undefined)),
  signatureDataUrl: z
    .union([z.string(), z.null()])
    .optional()
    .transform((value) => {
      if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed.length ? trimmed : undefined;
      }
      return undefined;
    }),
  clinicId: z
    .union([z.number(), z.string(), z.null()])
    .optional()
    .transform((value) => {
      if (value === null || value === undefined || value === '') {
        return null;
      }
      const num = typeof value === 'number' ? value : parseInt(value, 10);
      return isNaN(num) ? null : num;
    }),
});

/**
 * Schema for updating an existing provider
 * All fields optional, validates only provided fields
 */
export const updateProviderSchema = createProviderSchema.partial();

/**
 * Schema for NPI verification request
 */
export const verifyNpiSchema = z.object({
  npi: z
    .string()
    .min(10, 'NPI must be 10 digits')
    .max(10, 'NPI must be 10 digits')
    .regex(/^\d{10}$/, 'NPI must be exactly 10 digits'),
});

/**
 * Schema for setting provider password
 */
export const setPasswordSchema = z
  .object({
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

// Type exports
export type CreateProviderInput = z.infer<typeof createProviderSchema>;
export type UpdateProviderInput = z.infer<typeof updateProviderSchema>;
export type VerifyNpiInput = z.infer<typeof verifyNpiSchema>;
export type SetPasswordInput = z.infer<typeof setPasswordSchema>;
