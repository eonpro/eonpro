/**
 * Prescription Domain Types
 *
 * @module domains/prescription/types
 */

export interface PrescriptionRx {
  medicationKey: string;
  quantity: number;
  refills: number;
  sig: string;
  daysSupply?: number;
}

export interface PrescriptionPatientInput {
  firstName: string;
  lastName: string;
  dob: string;
  gender: string;
  phone: string;
  email: string;
  address1: string;
  address2?: string;
  city: string;
  state: string;
  zip: string;
}

export interface CreatePrescriptionInput {
  patientId?: number;
  providerId?: number;
  clinicId?: number;
  rxs: PrescriptionRx[];
  patient: PrescriptionPatientInput;
  shippingMethod: string;
  signatureDataUrl?: string;
  queueForProvider?: boolean;
  invoiceId?: number;
  refillId?: number;
}

export interface PrescriptionResult {
  success: boolean;
  order: Record<string, unknown>;
  lifefile?: Record<string, unknown> | null;
  patientId?: number;
  duplicate?: boolean;
  queuedForProvider?: boolean;
  message?: string;
  refill?: {
    currentId: number;
    nextId?: number;
    nextRefillDate?: Date;
  } | null;
}

export interface UserContext {
  id: number;
  email: string;
  role: string;
  clinicId?: number;
  providerId?: number;
}
