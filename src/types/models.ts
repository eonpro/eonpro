/**
 * Domain model type definitions
 * Strongly typed interfaces for core business entities
 */

import { BaseRecord } from './common';

// Patient types
export interface Patient extends BaseRecord {
  patientId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dob: string;
  gender?: string;
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  zip?: string;
  ssn?: string;
  allergies?: string;
  medications?: string;
  conditions?: string;
  insurance?: string;
  providerId?: number;
  tags?: string[];
  source?: 'manual' | 'webhook' | 'referral' | 'import';
  metadata?: Record<string, unknown>;
}

// Provider types
export interface Provider extends BaseRecord {
  firstName: string;
  lastName: string;
  titleLine?: string;
  npi: string;
  licenseState?: string;
  licenseNumber?: string;
  dea?: string;
  email?: string;
  phone?: string;
  signatureDataUrl?: string;
  npiVerifiedAt?: Date;
  lastLogin?: Date;
  passwordHash?: string;
}

// Order types
export interface Order extends BaseRecord {
  messageId: string;
  referenceId: string;
  lifefileOrderId?: string;
  status?: string;
  patientId: number;
  providerId: number;
  shippingMethod: number;
  primaryMedName?: string;
  primaryMedStrength?: string;
  primaryMedForm?: string;
  errorMessage?: string;
  requestJson?: string;
  responseJson?: string;
  lastWebhookAt?: Date;
  shippingStatus?: string;
  trackingNumber?: string;
  trackingUrl?: string;
}

// Prescription types
export interface Prescription {
  medicationKey: string;
  medName: string;
  strength: string;
  form: string;
  quantity: string;
  refills: string;
  sig?: string;
  daw?: boolean;
  notes?: string;
}

// SOAP Note types
export interface SOAPNote extends BaseRecord {
  patientId: number;
  providerId?: number;
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  status: 'DRAFT' | 'PENDING_REVIEW' | 'APPROVED' | 'LOCKED';
  approvedAt?: Date;
  approvedById?: number;
  lockedAt?: Date;
  tokenUsage?: number;
  medicalNecessity?: string;
}

// Invoice types
export interface Invoice extends BaseRecord {
  stripeInvoiceId?: string;
  patientId: number;
  amountDue: number;
  amountPaid: number;
  currency: string;
  status: 'DRAFT' | 'OPEN' | 'PAID' | 'VOID' | 'UNCOLLECTIBLE';
  dueDate?: Date;
  paidAt?: Date;
  items?: InvoiceItem[];
}

export interface InvoiceItem {
  description: string;
  amount: number;
  quantity: number;
  unitPrice: number;
}

// Subscription types
export interface Subscription extends BaseRecord {
  stripeSubscriptionId: string;
  patientId: number;
  status: 'active' | 'canceled' | 'past_due' | 'trialing' | 'unpaid';
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  planId: string;
  planName: string;
  planAmount: number;
}

// Payment types
export interface Payment extends BaseRecord {
  stripePaymentIntentId?: string;
  patientId: number;
  amount: number;
  currency: string;
  status: "PENDING" | 'processing' | 'succeeded' | 'failed' | 'canceled';
  paymentMethod?: string;
  invoiceId?: number;
  metadata?: Record<string, unknown>;
}

// Influencer types
export interface Influencer extends BaseRecord {
  name: string;
  email: string;
  promoCode: string;
  commissionRate: number;
  isActive: boolean;
  passwordHash?: string;
  totalReferrals?: number;
  totalCommission?: number;
  bankAccounts?: BankAccount[];
}

export interface BankAccount {
  id: number;
  accountName: string;
  accountNumber: string;
  routingNumber: string;
  accountType: 'checking' | 'savings';
  isDefault: boolean;
}

// Audit types
export interface AuditEntry {
  id: number;
  action: string;
  entityType: string;
  entityId: number;
  performedById?: number;
  performedByEmail?: string;
  changes?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

// Clinic types
export interface Clinic extends BaseRecord {
  name: string;
  slug: string;
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'PENDING';
  subdomain?: string;
  customDomain?: string;
  settings?: ClinicSettings;
  branding?: ClinicBranding;
  lifefileVendorId?: string;
  lifefilePracticeId?: string;
  stripeAccountId?: string;
  twilioAccountSid?: string;
}

export interface ClinicSettings {
  timezone?: string;
  currency?: string;
  language?: string;
  enableTelehealth?: boolean;
  enableMessaging?: boolean;
  enablePrescriptions?: boolean;
  sessionTimeout?: number;
  requireMFA?: boolean;
}

export interface ClinicBranding {
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  faviconUrl?: string;
}
