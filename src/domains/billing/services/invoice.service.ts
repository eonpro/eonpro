/**
 * Invoice/Billing Service
 * =======================
 *
 * Data access layer for invoice operations with enterprise-safe defaults:
 * - Bounded queries (take/limit enforced)
 * - Explicit select projections (no full-table reads)
 * - PHI decryption for patient names
 * - Clinic isolation checks
 *
 * @module domains/billing/services
 */

import { prisma } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { logger } from '@/lib/logger';
import { decryptPHI } from '@/lib/security/phi-encryption';
import { PATIENT_REF_SELECT } from '@/lib/database/projections';
import type {
  InvoiceFilterOptions,
  InvoicePaginationOptions,
  InvoiceSummary,
  PaginatedInvoices,
  UserContext,
} from '../types';

// =============================================================================
// CONSTANTS
// =============================================================================

const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 50;

// =============================================================================
// SELECT PROJECTIONS
// =============================================================================

/**
 * Minimal invoice fields for list views (dashboards, tables).
 */
export const INVOICE_LIST_SELECT = {
  id: true,
  clinicId: true,
  patientId: true,
  amount: true,
  amountDue: true,
  amountPaid: true,
  currency: true,
  status: true,
  description: true,
  dueDate: true,
  paidAt: true,
  createdAt: true,
  updatedAt: true,
  stripeInvoiceId: true,
  stripeInvoiceNumber: true,
  prescriptionProcessed: true,
  prescriptionProcessedAt: true,
  metadata: true,
} satisfies Prisma.InvoiceSelect;

/**
 * Invoice with patient reference (most common pattern — used in 80%+ of queries).
 */
export const INVOICE_WITH_PATIENT_SELECT = {
  ...INVOICE_LIST_SELECT,
  patient: { select: PATIENT_REF_SELECT },
} satisfies Prisma.InvoiceSelect;

/**
 * Full invoice detail for single-record views.
 */
export const INVOICE_DETAIL_SELECT = {
  ...INVOICE_LIST_SELECT,
  stripeInvoiceUrl: true,
  stripePdfUrl: true,
  lineItems: true,
  orderId: true,
  commissionGenerated: true,
  createSubscription: true,
  subscriptionCreated: true,
  prescriptionProcessedBy: true,
  patient: {
    select: {
      ...PATIENT_REF_SELECT,
      clinicId: true,
      phone: true,
      patientId: true,
    },
  },
  items: {
    select: {
      id: true,
      description: true,
      quantity: true,
      unitPrice: true,
      amount: true,
      productId: true,
      product: { select: { id: true, name: true } },
    },
  },
  payments: {
    select: {
      id: true,
      amount: true,
      status: true,
      paymentMethod: true,
      stripePaymentIntentId: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' as const },
    take: 20,
  },
  clinic: { select: { id: true, name: true, subdomain: true } },
} satisfies Prisma.InvoiceSelect;

// =============================================================================
// TYPES
// =============================================================================

export type InvoiceListItem = Prisma.InvoiceGetPayload<{
  select: typeof INVOICE_LIST_SELECT;
}>;

export type InvoiceWithPatient = Prisma.InvoiceGetPayload<{
  select: typeof INVOICE_WITH_PATIENT_SELECT;
}>;

export type InvoiceDetailItem = Prisma.InvoiceGetPayload<{
  select: typeof INVOICE_DETAIL_SELECT;
}>;

// =============================================================================
// SERVICE
// =============================================================================

export interface InvoiceService {
  listInvoices(
    filter: InvoiceFilterOptions,
    pagination?: InvoicePaginationOptions,
    user?: UserContext
  ): Promise<PaginatedInvoices>;

  getInvoiceById(
    id: number,
    user: UserContext
  ): Promise<InvoiceDetailItem | null>;

  markPrescriptionProcessed(
    invoiceId: number,
    providerId: number | null
  ): Promise<void>;

  countByStatus(
    clinicId: number | undefined,
    status: string
  ): Promise<number>;
}

export function createInvoiceService(): InvoiceService {
  return {
    async listInvoices(
      filter: InvoiceFilterOptions,
      pagination: InvoicePaginationOptions = {},
      _user?: UserContext
    ): Promise<PaginatedInvoices> {
      const limit = Math.min(Math.max(1, pagination.limit ?? DEFAULT_LIMIT), MAX_LIMIT);
      const offset = Math.max(0, pagination.offset ?? 0);
      const orderBy = pagination.orderBy ?? 'createdAt';
      const orderDir = pagination.orderDir ?? 'desc';

      const where: Prisma.InvoiceWhereInput = {};
      if (filter.clinicId) where.clinicId = filter.clinicId;
      if (filter.patientId) where.patientId = filter.patientId;
      if (filter.status) where.status = filter.status as any;
      if (filter.prescriptionProcessed !== undefined) {
        where.prescriptionProcessed = filter.prescriptionProcessed;
      }
      if (filter.startDate || filter.endDate) {
        where.createdAt = {};
        if (filter.startDate) where.createdAt.gte = filter.startDate;
        if (filter.endDate) where.createdAt.lte = filter.endDate;
      }

      const [invoices, total] = await Promise.all([
        prisma.invoice.findMany({
          where,
          select: INVOICE_WITH_PATIENT_SELECT,
          orderBy: { [orderBy]: orderDir },
          take: limit,
          skip: offset,
        }),
        prisma.invoice.count({ where }),
      ]);

      const data: InvoiceSummary[] = invoices.map((inv) => {
        let patientName: string | undefined;
        if (inv.patient) {
          const fn = safeDecrypt(inv.patient.firstName);
          const ln = safeDecrypt(inv.patient.lastName);
          patientName = [fn, ln].filter(Boolean).join(' ') || undefined;
        }

        return {
          id: inv.id,
          invoiceNumber: inv.stripeInvoiceNumber,
          status: inv.status,
          totalAmount: inv.amount,
          patientId: inv.patientId,
          patientName,
          clinicId: inv.clinicId!,
          createdAt: inv.createdAt,
          paidAt: inv.paidAt,
          stripeInvoiceId: inv.stripeInvoiceId,
          prescriptionProcessed: inv.prescriptionProcessed ?? false,
        };
      });

      return { data, total, limit, offset, hasMore: offset + data.length < total };
    },

    async getInvoiceById(id: number, user: UserContext): Promise<InvoiceDetailItem | null> {
      const invoice = await prisma.invoice.findUnique({
        where: { id },
        select: INVOICE_DETAIL_SELECT,
      });

      if (!invoice) return null;

      if (user.role !== 'super_admin' && invoice.clinicId !== user.clinicId) {
        logger.security('Cross-clinic invoice access blocked', {
          userId: user.id,
          invoiceClinicId: invoice.clinicId,
          userClinicId: user.clinicId,
        });
        return null;
      }

      return invoice;
    },

    async markPrescriptionProcessed(invoiceId: number, providerId: number | null): Promise<void> {
      await prisma.invoice.update({
        where: { id: invoiceId },
        data: {
          prescriptionProcessed: true,
          prescriptionProcessedAt: new Date(),
          prescriptionProcessedBy: providerId,
        },
      });
    },

    async countByStatus(clinicId: number | undefined, status: string): Promise<number> {
      const where: Prisma.InvoiceWhereInput = { status: status as any };
      if (clinicId) where.clinicId = clinicId;
      return prisma.invoice.count({ where });
    },
  };
}

function safeDecrypt(value: unknown): string {
  if (value == null || typeof value !== 'string') return '';
  try {
    return decryptPHI(value) ?? '';
  } catch {
    return '[Encrypted]';
  }
}

export const invoiceService = createInvoiceService();
