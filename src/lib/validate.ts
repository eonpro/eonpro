import { US_STATE_CODE_LIST, US_STATE_OPTIONS } from "@/lib/usStates";
import { z } from "zod";

// Create a map of state names to codes for normalization
const stateNameToCode: Record<string, string> = {};
US_STATE_OPTIONS.forEach(s => {
  stateNameToCode[s.label.toLowerCase()] = s.value;
  stateNameToCode[s.value.toLowerCase()] = s.value;
});

// Custom state transformer that accepts both codes and full names
const stateSchema = z.string().transform((val, ctx) => {
  if (!val) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "State is required" });
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
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Gender is required" });
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
  notes: z.string().optional().or(z.literal("")).transform((val: any) => val || undefined),
  tags: z.array(z.string()).optional(),
  clinicId: z.number().nullable().optional(),
});

export const rxSchema = z.object({
  medicationKey: z.string(),
  sig: z.string(),
  quantity: z.string(),
  refills: z.string(),
});

export const prescriptionSchema = z.object({
  patient: patientSchema,
  rxs: z.array(rxSchema).min(1),
  shippingMethod: z.number(),
  signatureDataUrl: z.string().nullable().optional(),
  providerId: z.number().default(1),
  clinicId: z.number().nullable().optional(), // User's active clinic for multi-tenant support
});
