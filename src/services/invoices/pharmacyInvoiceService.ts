/**
 * Pharmacy Invoice Reconciliation Service.
 *
 * Orchestrates: PDF upload to S3, text parsing, order matching,
 * and reconciliation queries for WellMedR/Lifefile invoices.
 *
 * PHI: Patient names from the invoice PDF are stored encrypted at rest by the
 * database layer. Never log patient or provider names.
 */

import { prisma } from '@/lib/db';
import { uploadToS3, generateSignedUrl } from '@/lib/integrations/aws/s3Service';
import { FileCategory } from '@/lib/integrations/aws/s3Config';
// PHI decryption is intentionally not used in reconciliation matching.
// The lifefileOrderId match is deterministic and sufficient.
import { parseWellmedrInvoicePdf, parseWellmedrInvoiceCsv } from '@/lib/invoices/wellmedr-parser';
import type { ParsedInvoice, ParsedInvoiceLineItem } from '@/lib/invoices/wellmedr-parser';
import { logger } from '@/lib/logger';
import type {
  PharmacyInvoiceUpload,
  PharmacyInvoiceLineItem,
  PharmacyInvoiceMatchStatus,
} from '@prisma/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UploadInvoiceInput {
  clinicId: number;
  uploadedBy: number;
  pdfBuffer: Buffer;
  fileName: string;
  fileType?: 'pdf' | 'csv';
}

export interface UploadInvoiceResult {
  upload: PharmacyInvoiceUpload;
  parsed: ParsedInvoice;
}

export interface ReconciliationSummary {
  upload: PharmacyInvoiceUpload;
  matchedCents: number;
  unmatchedCents: number;
  discrepancyCents: number;
  totalCents: number;
  matchRate: number;
}

export interface LineItemWithMatch extends PharmacyInvoiceLineItem {
  matchedOrder?: {
    id: number;
    lifefileOrderId: string | null;
    status: string | null;
    createdAt: Date;
    patientName: string;
    providerName: string;
    rxCount: number;
  } | null;
}

export interface ListUploadsFilters {
  clinicId: number;
  status?: string;
  page?: number;
  limit?: number;
}

export interface ListLineItemsFilters {
  invoiceUploadId: number;
  matchStatus?: PharmacyInvoiceMatchStatus;
  lifefileOrderId?: string;
  search?: string;
  page?: number;
  limit?: number;
}

// ---------------------------------------------------------------------------
// Upload + Parse
// ---------------------------------------------------------------------------

export async function uploadAndParseInvoice(
  input: UploadInvoiceInput
): Promise<UploadInvoiceResult> {
  const { clinicId, uploadedBy, pdfBuffer, fileName } = input;

  // 1. Upload PDF to S3
  const s3Result = await uploadToS3({
    file: pdfBuffer,
    fileName,
    category: FileCategory.PHARMACY_INVOICES,
    contentType: 'application/pdf',
    metadata: { type: 'pharmacy-invoice', clinicId: String(clinicId) },
  });

  // 2. Create upload record
  const upload = await prisma.pharmacyInvoiceUpload.create({
    data: {
      clinicId,
      uploadedBy,
      s3Key: s3Result.key,
      fileName,
      status: 'PARSING',
    },
  });

  try {
    // 3. Parse the file (PDF or CSV)
    const isCsv = input.fileType === 'csv' || fileName.toLowerCase().endsWith('.csv');
    const parsed = isCsv
      ? parseWellmedrInvoiceCsv(pdfBuffer.toString('utf-8'))
      : await parseWellmedrInvoicePdf(pdfBuffer);

    // 3a. Check for duplicate invoice number
    if (parsed.header.invoiceNumber) {
      const existing = await prisma.pharmacyInvoiceUpload.findFirst({
        where: {
          clinicId,
          invoiceNumber: parsed.header.invoiceNumber,
          id: { not: upload.id },
        },
      });
      if (existing) {
        await prisma.pharmacyInvoiceUpload.update({
          where: { id: upload.id },
          data: { status: 'ERROR', errorMessage: `Duplicate invoice #${parsed.header.invoiceNumber}` },
        });
        const err = new Error(
          `Invoice #${parsed.header.invoiceNumber} has already been uploaded for this clinic.`
        ) as Error & { statusCode?: number };
        err.statusCode = 409;
        throw err;
      }
    }

    // 4. Store line items + update header in a transaction
    const updated = await prisma.$transaction(async (tx) => {
      // Insert line items
      if (parsed.lineItems.length > 0) {
        await tx.pharmacyInvoiceLineItem.createMany({
          data: parsed.lineItems.map((li) => ({
            invoiceUploadId: upload.id,
            lineNumber: li.lineNumber,
            lineType: li.lineType,
            date: li.date,
            lifefileOrderId: li.lifefileOrderId,
            rxNumber: li.rxNumber,
            fillId: li.fillId,
            patientName: li.patientName,
            doctorName: li.doctorName,
            description: li.description,
            medicationName: li.medicationName,
            strength: li.strength,
            form: li.form,
            vialSize: li.vialSize,
            shippingMethod: li.shippingMethod,
            quantity: li.quantity,
            unitPriceCents: li.unitPriceCents,
            discountCents: li.discountCents,
            amountCents: li.amountCents,
            orderSubtotalCents: li.orderSubtotalCents,
            matchStatus: 'PENDING',
          })),
        });
      }

      // Update upload with header info
      return tx.pharmacyInvoiceUpload.update({
        where: { id: upload.id },
        data: {
          status: 'PARSED',
          invoiceNumber: parsed.header.invoiceNumber,
          invoiceDate: parsed.header.invoiceDate,
          amountDueCents: parsed.header.amountDueCents,
          payorId: parsed.header.payorId,
          billingProfileId: parsed.header.billingProfileId,
          pharmacyName: parsed.header.pharmacyName,
          totalLineItems: parsed.lineItems.length,
          invoiceTotalCents: parsed.totalCents,
          parsedAt: new Date(),
        },
      });
    }, { timeout: 30_000 });

    logger.info('Pharmacy invoice parsed and stored', {
      uploadId: upload.id,
      clinicId,
      lineItems: parsed.lineItems.length,
      invoiceNumber: parsed.header.invoiceNumber,
    });

    return { upload: updated, parsed };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown parse error';
    await prisma.pharmacyInvoiceUpload.update({
      where: { id: upload.id },
      data: { status: 'ERROR', errorMessage: msg },
    });
    logger.error('Pharmacy invoice parse failed', { uploadId: upload.id, clinicId, error: msg });
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Matching Engine
// ---------------------------------------------------------------------------

export async function runReconciliation(uploadId: number, clinicId: number): Promise<ReconciliationSummary> {
  // Mark as matching
  await prisma.pharmacyInvoiceUpload.update({
    where: { id: uploadId },
    data: { status: 'MATCHING' },
  });

  try {
    // Load all line items for this upload
    const lineItems = await prisma.pharmacyInvoiceLineItem.findMany({
      where: { invoiceUploadId: uploadId },
      orderBy: { lineNumber: 'asc' },
    });

    // If no line items, mark as reconciled with 0 matches
    if (lineItems.length === 0) {
      const upload = await prisma.pharmacyInvoiceUpload.update({
        where: { id: uploadId },
        data: { status: 'RECONCILED', reconciledAt: new Date() },
      });
      return {
        upload,
        matchedCents: 0,
        unmatchedCents: 0,
        discrepancyCents: 0,
        totalCents: upload.invoiceTotalCents,
        matchRate: 0,
      };
    }

    // Collect unique Lifefile order IDs from the invoice
    const invoiceOrderIds = [
      ...new Set(lineItems.map((li) => li.lifefileOrderId).filter(Boolean)),
    ] as string[];

    // Batch-load matching orders from the database
    const orders = invoiceOrderIds.length > 0
      ? await prisma.order.findMany({
          where: {
            clinicId,
            lifefileOrderId: { in: invoiceOrderIds },
          },
          include: {
            patient: { select: { id: true } },
            provider: { select: { id: true, lastName: true } },
          },
        })
      : [];

    // Build lookup map: lifefileOrderId -> order
    const orderMap = new Map<string, typeof orders[number]>();
    for (const order of orders) {
      if (order.lifefileOrderId) {
        orderMap.set(order.lifefileOrderId, order);
      }
    }

    // Match each line item in memory, then bulk-write results
    let matchedCount = 0;
    let unmatchedCount = 0;
    let discrepancyCount = 0;
    let matchedTotalCents = 0;
    let unmatchedTotalCents = 0;

    // Collect IDs for each status to do bulk updateMany
    const unmatchedIds: number[] = [];
    const matchedByOrder: Map<string, {
      ids: number[];
      orderId: number;
      patientId: number | null;
      providerId: number | null;
      confidence: number;
    }> = new Map();

    for (const li of lineItems) {
      if (!li.lifefileOrderId) {
        unmatchedIds.push(li.id);
        unmatchedCount++;
        unmatchedTotalCents += li.amountCents;
        continue;
      }

      const order = orderMap.get(li.lifefileOrderId);
      if (!order) {
        unmatchedIds.push(li.id);
        unmatchedCount++;
        unmatchedTotalCents += li.amountCents;
        continue;
      }

      // Order found — deterministic match on lifefileOrderId
      let confidence = 0.9;
      try {
        if (li.doctorName && order.provider) {
          const invoiceDocLast = li.doctorName.split(',')[0]?.trim().toUpperCase();
          const dbProviderLast = (order.provider.lastName ?? '').toUpperCase();
          if (invoiceDocLast === dbProviderLast) confidence = 1.0;
        }
      } catch {
        // Non-critical
      }

      matchedCount++;
      matchedTotalCents += li.amountCents;

      const key = li.lifefileOrderId;
      const existing = matchedByOrder.get(key);
      if (existing) {
        existing.ids.push(li.id);
      } else {
        matchedByOrder.set(key, {
          ids: [li.id],
          orderId: order.id,
          patientId: order.patient?.id ?? null,
          providerId: order.provider?.id ?? null,
          confidence,
        });
      }
    }

    // Bulk update: set all unmatched items in one query
    if (unmatchedIds.length > 0) {
      await prisma.pharmacyInvoiceLineItem.updateMany({
        where: { id: { in: unmatchedIds } },
        data: { matchStatus: 'UNMATCHED' },
      });
    }

    // Bulk update: set matched items per order group (one query per unique order)
    for (const [, group] of matchedByOrder) {
      await prisma.pharmacyInvoiceLineItem.updateMany({
        where: { id: { in: group.ids } },
        data: {
          matchStatus: 'MATCHED',
          matchedOrderId: group.orderId,
          matchedPatientId: group.patientId,
          matchedProviderId: group.providerId,
          matchConfidence: group.confidence,
        },
      });
    }

    // Update upload summary
    const upload = await prisma.pharmacyInvoiceUpload.update({
      where: { id: uploadId },
      data: {
        status: 'RECONCILED',
        matchedCount,
        unmatchedCount,
        discrepancyCount,
        matchedTotalCents,
        unmatchedTotalCents,
        reconciledAt: new Date(),
      },
    });

    logger.info('Pharmacy invoice reconciled', {
      uploadId,
      clinicId,
      matchedCount,
      unmatchedCount,
      discrepancyCount,
    });

    const totalCents = upload.invoiceTotalCents;
    return {
      upload,
      matchedCents: matchedTotalCents,
      unmatchedCents: unmatchedTotalCents,
      discrepancyCents: 0,
      totalCents,
      matchRate: lineItems.length > 0 ? matchedCount / lineItems.length : 0,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown match error';
    await prisma.pharmacyInvoiceUpload.update({
      where: { id: uploadId },
      data: { status: 'ERROR', errorMessage: msg },
    });
    logger.error('Pharmacy invoice reconciliation failed', { uploadId, error: msg });
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function listUploads(filters: ListUploadsFilters) {
  const { clinicId, status, page = 1, limit = 20 } = filters;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = { clinicId };
  if (status) where.status = status;

  const [uploads, total] = await Promise.all([
    prisma.pharmacyInvoiceUpload.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.pharmacyInvoiceUpload.count({ where }),
  ]);

  return { uploads, total, page, limit, totalPages: Math.ceil(total / limit) };
}

export async function getUploadById(id: number, clinicId: number) {
  return prisma.pharmacyInvoiceUpload.findFirst({
    where: { id, clinicId },
  });
}

export async function getUploadSummary(
  id: number,
  clinicId: number
): Promise<ReconciliationSummary | null> {
  const upload = await prisma.pharmacyInvoiceUpload.findFirst({
    where: { id, clinicId },
  });
  if (!upload) return null;

  return {
    upload,
    matchedCents: upload.matchedTotalCents,
    unmatchedCents: upload.unmatchedTotalCents,
    discrepancyCents: 0,
    totalCents: upload.invoiceTotalCents,
    matchRate:
      upload.totalLineItems > 0
        ? upload.matchedCount / upload.totalLineItems
        : 0,
  };
}

export async function listLineItems(filters: ListLineItemsFilters) {
  const { invoiceUploadId, matchStatus, lifefileOrderId, search, page = 1, limit = 50 } = filters;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = { invoiceUploadId };
  if (matchStatus) where.matchStatus = matchStatus;
  if (lifefileOrderId) where.lifefileOrderId = lifefileOrderId;
  if (search) {
    where.OR = [
      { patientName: { contains: search, mode: 'insensitive' } },
      { rxNumber: { contains: search } },
      { lifefileOrderId: { contains: search } },
      { medicationName: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.pharmacyInvoiceLineItem.findMany({
      where,
      orderBy: [{ lifefileOrderId: 'asc' }, { lineNumber: 'asc' }],
      skip,
      take: limit,
    }),
    prisma.pharmacyInvoiceLineItem.count({ where }),
  ]);

  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
}

export async function getLineItemsGroupedByOrder(invoiceUploadId: number) {
  const items = await prisma.pharmacyInvoiceLineItem.findMany({
    where: { invoiceUploadId },
    orderBy: [{ lifefileOrderId: 'asc' }, { lineNumber: 'asc' }],
  });

  const groups = new Map<string, PharmacyInvoiceLineItem[]>();
  for (const item of items) {
    const key = item.lifefileOrderId ?? 'unknown';
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }

  return Array.from(groups.entries()).map(([orderId, lineItems]) => ({
    lifefileOrderId: orderId,
    lineItems,
    subtotalCents: lineItems.reduce((sum, li) => sum + li.amountCents, 0),
    matchStatus: lineItems[0]?.matchStatus ?? 'PENDING',
    matchedOrderId: lineItems[0]?.matchedOrderId ?? null,
  }));
}

export async function getSignedPdfUrl(s3Key: string): Promise<string> {
  return generateSignedUrl(s3Key, 'GET', 3600);
}

export async function deleteUpload(id: number, clinicId: number): Promise<boolean> {
  const upload = await prisma.pharmacyInvoiceUpload.findFirst({
    where: { id, clinicId },
  });
  if (!upload) return false;

  await prisma.$transaction(async (tx) => {
    await tx.pharmacyInvoiceLineItem.deleteMany({ where: { invoiceUploadId: id } });
    await tx.pharmacyInvoiceUpload.delete({ where: { id } });
  });

  return true;
}
