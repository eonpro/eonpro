/**
 * Invoice/Billing Service
 * =======================
 *
 * Business logic for invoice operations.
 * Extracted from api/invoices/ route handlers.
 *
 * @module domains/billing/services
 */

import { prisma, basePrisma } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { logger } from '@/lib/logger';
import { decryptPHI } from '@/lib/security/phi-encryption';
import type {
  InvoiceFilterOptions,
  InvoicePaginationOptions,
  InvoiceSummary,
  PaginatedInvoices,
  UserContext,
} from '../types';

const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 50;

export interface InvoiceService {
  listInvoices(
    filter: InvoiceFilterOptions,
    pagination?: InvoicePaginationOptions,
    user?: UserContext
  ): Promise<PaginatedInvoices>;

  getInvoiceById(
    id: number,
    user: UserContext
  ): Promise<Record<string, unknown> | null>;

  markPrescriptionProcessed(
    invoiceId: number,
    providerId: number | null
  ): Promise<void>;
}

export function createInvoiceService(): InvoiceService {
  return {
    async listInvoices(
      filter: InvoiceFilterOptions,
      pagination: InvoicePaginationOptions = {},
      user?: UserContext
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
          include: {
            patient: { select: { id: true, firstName: true, lastName: true } },
          },
          orderBy: { [orderBy]: orderDir },
          take: limit,
          skip: offset,
        }),
        prisma.invoice.count({ where }),
      ]);

      const data: InvoiceSummary[] = invoices.map((inv: any) => {
        let patientName: string | undefined;
        if (inv.patient) {
          const fn = safeDecrypt(inv.patient.firstName);
          const ln = safeDecrypt(inv.patient.lastName);
          patientName = [fn, ln].filter(Boolean).join(' ') || undefined;
        }

        return {
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          status: inv.status,
          totalAmount: inv.totalAmount,
          patientId: inv.patientId,
          patientName,
          clinicId: inv.clinicId,
          createdAt: inv.createdAt,
          paidAt: inv.paidAt,
          stripeInvoiceId: inv.stripeInvoiceId,
          prescriptionProcessed: inv.prescriptionProcessed ?? false,
        };
      });

      return { data, total, limit, offset, hasMore: offset + data.length < total };
    },

    async getInvoiceById(id: number, user: UserContext): Promise<Record<string, unknown> | null> {
      const invoice = await prisma.invoice.findUnique({
        where: { id },
        include: {
          patient: true,
          items: true,
        },
      });

      if (!invoice) return null;

      // Clinic isolation check
      if (user.role !== 'super_admin' && invoice.clinicId !== user.clinicId) {
        logger.security('Cross-clinic invoice access blocked', {
          userId: user.id,
          invoiceClinicId: invoice.clinicId,
          userClinicId: user.clinicId,
        });
        return null;
      }

      return invoice as unknown as Record<string, unknown>;
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
