import { US_STATE_CODE_LIST } from "@/lib/usStates";
import { z } from "zod";

export const patientSchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
  dob: z.string(),
  gender: z.enum(["m", "f"]),
  phone: z.string(),
  email: z.string(),
  address1: z.string(),
  address2: z.string().nullable().optional(),
  city: z.string(),
  state: z.enum(US_STATE_CODE_LIST),
  zip: z.string(),
  notes: z.string().optional().or(z.literal("")).transform((val: any) => val || undefined),
  tags: z.array(z.string()).optional(),
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
});
