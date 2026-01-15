import { US_STATE_CODE_LIST, US_STATE_OPTIONS, type USStateCode } from "@/lib/usStates";
import { z, ZodIssueCode } from "zod";

const STATE_CODE_SET = new Set<USStateCode>(US_STATE_CODE_LIST);
const STATE_LABEL_TO_CODE = US_STATE_OPTIONS.reduce<Record<string, USStateCode>>(
  (acc, state) => {
    acc[state.label.toUpperCase()] = state.value;
    return acc;
  },
  {}
);

function normalizeState(value?: string | null) {
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

export const providerSchema = z.object({
  npi: z
    .string()
    .transform((val: any) => val.trim())
    .refine((val: any) => /^\d{10}$/.test(val), {
      message: "NPI must be exactly 10 digits",
    }),
  firstName: z
    .string()
    .transform((val: any) => val.trim())
    .refine((val: any) => val.length > 0, "First name is required"),
  lastName: z
    .string()
    .transform((val: any) => val.trim())
    .refine((val: any) => val.length > 0, "Last name is required"),
  titleLine: z
    .string()
    .optional()
    .transform((val: any) => {
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
          message: "License state must be a valid US state",
          path: ["licenseState"],
        });
      }
    })
    .transform((value: any) => normalizeState(value)),
  licenseNumber: z
    .string()
    .optional()
    .transform((val: any) => (val && val.trim() ? val.trim() : undefined)),
  dea: z
    .string()
    .optional()
    .transform((val: any) => (val && val.trim() ? val.trim() : undefined)),
  email: z
    .string()
    .optional()
    .transform((val: any) => {
      if (!val) return undefined;
      const trimmed = val.trim();
      return trimmed.length ? trimmed : undefined;
    })
    .refine(
      (val: any) => val === undefined || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val),
      "Invalid email"
    ),
  phone: z
    .string()
    .optional()
    .transform((val: any) => (val && val.trim() ? val.trim() : undefined)),
  signatureDataUrl: z
    .union([z.string(), z.null()])
    .optional()
    .transform((value: any) => {
      if (typeof value === "string") {
        const trimmed = value.trim();
        return trimmed.length ? trimmed : undefined;
      }
      return undefined;
    }),
  clinicId: z
    .union([z.number(), z.string(), z.null()])
    .optional()
    .transform((value: any) => {
      if (value === null || value === undefined || value === "") {
        return null;
      }
      const num = typeof value === "number" ? value : parseInt(value, 10);
      return isNaN(num) ? null : num;
    }),
});

