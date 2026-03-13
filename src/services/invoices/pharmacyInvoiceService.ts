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
import { decryptPHI } from '@/lib/security/phi-encryption';
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

    // 5. Run duplicate check after storing
    await checkDuplicateLineItems(upload.id, clinicId);

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

export async function getLineItemsGroupedByOrder(
  invoiceUploadId: number,
  options?: { matchStatus?: string; search?: string; page?: number; limit?: number; duplicatesOnly?: boolean }
) {
  const { matchStatus, search, page = 1, limit = 50, duplicatesOnly } = options ?? {};

  const where: Record<string, unknown> = { invoiceUploadId };
  if (duplicatesOnly) where.isDuplicate = true;
  else if (matchStatus && matchStatus !== 'all') where.matchStatus = matchStatus;
  if (search) {
    where.OR = [
      { patientName: { contains: search, mode: 'insensitive' } },
      { lifefileOrderId: { contains: search } },
      { rxNumber: { contains: search } },
      { medicationName: { contains: search, mode: 'insensitive' } },
    ];
  }

  const items = await prisma.pharmacyInvoiceLineItem.findMany({
    where,
    orderBy: [{ lifefileOrderId: 'asc' }, { lineNumber: 'asc' }],
    select: {
      id: true,
      lineNumber: true,
      lineType: true,
      date: true,
      lifefileOrderId: true,
      rxNumber: true,
      fillId: true,
      patientName: true,
      doctorName: true,
      medicationName: true,
      strength: true,
      form: true,
      vialSize: true,
      shippingMethod: true,
      quantity: true,
      unitPriceCents: true,
      amountCents: true,
      orderSubtotalCents: true,
      matchStatus: true,
      matchedOrderId: true,
      matchConfidence: true,
      matchNotes: true,
      adminNotes: true,
      disputed: true,
      adjustedAmountCents: true,
      isDuplicate: true,
      duplicateOfLineItemId: true,
    },
  });

  // Group by order
  const groups = new Map<string, typeof items>();
  for (const item of items) {
    const key = item.lifefileOrderId ?? 'unknown';
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }

  // Batch-load prescription dates from matched orders
  const matchedOrderIds = [
    ...new Set(items.map((i) => i.matchedOrderId).filter((id): id is number => id !== null)),
  ];
  const orderDates = new Map<number, Date>();
  if (matchedOrderIds.length > 0) {
    const orders = await prisma.order.findMany({
      where: { id: { in: matchedOrderIds } },
      select: { id: true, createdAt: true },
    });
    for (const o of orders) orderDates.set(o.id, o.createdAt);
  }

  const allGroups = Array.from(groups.entries()).map(([orderId, lineItems]) => {
    const matchedOrderId = lineItems[0]?.matchedOrderId ?? null;
    return {
      lifefileOrderId: orderId,
      lineItems,
      subtotalCents: lineItems.reduce((sum, li) => sum + li.amountCents, 0),
      matchStatus: lineItems[0]?.matchStatus ?? 'PENDING',
      matchedOrderId,
      prescriptionDate: matchedOrderId ? (orderDates.get(matchedOrderId)?.toISOString() ?? null) : null,
    };
  });

  // Paginate the order groups
  const totalGroups = allGroups.length;
  const start = (page - 1) * limit;
  const paginatedGroups = allGroups.slice(start, start + limit);

  return {
    orderGroups: paginatedGroups,
    totalGroups,
    page,
    limit,
    totalPages: Math.ceil(totalGroups / limit),
  };
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

// ---------------------------------------------------------------------------
// Line Item Editing
// ---------------------------------------------------------------------------

export async function updateLineItem(
  lineItemId: number,
  invoiceUploadId: number,
  data: {
    adminNotes?: string | null;
    disputed?: boolean;
    adjustedAmountCents?: number | null;
    matchStatus?: PharmacyInvoiceMatchStatus;
  }
) {
  const item = await prisma.pharmacyInvoiceLineItem.findFirst({
    where: { id: lineItemId, invoiceUploadId },
  });
  if (!item) return null;

  return prisma.pharmacyInvoiceLineItem.update({
    where: { id: lineItemId },
    data: {
      ...(data.adminNotes !== undefined && { adminNotes: data.adminNotes }),
      ...(data.disputed !== undefined && { disputed: data.disputed }),
      ...(data.adjustedAmountCents !== undefined && { adjustedAmountCents: data.adjustedAmountCents }),
      ...(data.matchStatus !== undefined && { matchStatus: data.matchStatus }),
    },
  });
}

// ---------------------------------------------------------------------------
// Manual Matching
// ---------------------------------------------------------------------------

export async function manualMatchLineItems(
  invoiceUploadId: number,
  lineItemIds: number[],
  orderId: number,
  userId: number
) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, patientId: true, providerId: true, createdAt: true },
  });
  if (!order) throw new Error('Order not found');

  await prisma.pharmacyInvoiceLineItem.updateMany({
    where: {
      id: { in: lineItemIds },
      invoiceUploadId,
    },
    data: {
      matchStatus: 'MANUALLY_MATCHED',
      matchedOrderId: order.id,
      matchedPatientId: order.patientId,
      matchedProviderId: order.providerId,
      matchConfidence: 1.0,
      matchNotes: 'Manually matched by admin',
      manuallyMatchedBy: userId,
      manuallyMatchedAt: new Date(),
    },
  });

  // Recount matched/unmatched on the upload
  await recountUploadSummary(invoiceUploadId);

  return { orderId: order.id, prescriptionDate: order.createdAt };
}

export async function manualMatchByLifefileOrderId(
  invoiceUploadId: number,
  lineItemIds: number[],
  lifefileOrderId: string,
  clinicId: number,
  userId: number
) {
  const order = await prisma.order.findFirst({
    where: { lifefileOrderId, clinicId },
    select: { id: true, patientId: true, providerId: true, createdAt: true },
  });
  if (!order) throw new Error(`No order found with Lifefile ID ${lifefileOrderId}`);

  return manualMatchLineItems(invoiceUploadId, lineItemIds, order.id, userId);
}

async function recountUploadSummary(invoiceUploadId: number) {
  const matched = await prisma.pharmacyInvoiceLineItem.count({
    where: { invoiceUploadId, matchStatus: { in: ['MATCHED', 'MANUALLY_MATCHED'] } },
  });
  const unmatched = await prisma.pharmacyInvoiceLineItem.count({
    where: { invoiceUploadId, matchStatus: 'UNMATCHED' },
  });
  const discrepancy = await prisma.pharmacyInvoiceLineItem.count({
    where: { invoiceUploadId, matchStatus: { in: ['DISCREPANCY', 'DISPUTED'] } },
  });

  const matchedSum = await prisma.pharmacyInvoiceLineItem.aggregate({
    where: { invoiceUploadId, matchStatus: { in: ['MATCHED', 'MANUALLY_MATCHED'] } },
    _sum: { amountCents: true },
  });
  const unmatchedSum = await prisma.pharmacyInvoiceLineItem.aggregate({
    where: { invoiceUploadId, matchStatus: 'UNMATCHED' },
    _sum: { amountCents: true },
  });

  await prisma.pharmacyInvoiceUpload.update({
    where: { id: invoiceUploadId },
    data: {
      matchedCount: matched,
      unmatchedCount: unmatched,
      discrepancyCount: discrepancy,
      matchedTotalCents: matchedSum._sum.amountCents ?? 0,
      unmatchedTotalCents: unmatchedSum._sum.amountCents ?? 0,
    },
  });
}

// ---------------------------------------------------------------------------
// Order Search (for manual matching)
// ---------------------------------------------------------------------------

export async function searchOrdersForMatch(
  clinicId: number,
  query: { q?: string; lifefileOrderId?: string }
) {
  const orderInclude = {
    patient: { select: { id: true, firstName: true, lastName: true } },
    provider: { select: { id: true, firstName: true, lastName: true } },
    rxs: { select: { id: true, medName: true, strength: true, form: true } },
  };

  // Search by exact lifefileOrderId
  if (query.lifefileOrderId) {
    const orders = await prisma.order.findMany({
      where: { clinicId, lifefileOrderId: query.lifefileOrderId },
      include: orderInclude,
      take: 10,
      orderBy: { createdAt: 'desc' },
    });
    return orders.map(formatOrderForSearch);
  }

  if (query.q && query.q.length >= 2) {
    const q = query.q.trim();

    // If the query looks like a number, search by order IDs
    if (/^\d+$/.test(q)) {
      const orders = await prisma.order.findMany({
        where: {
          clinicId,
          OR: [
            { lifefileOrderId: { contains: q } },
            { id: parseInt(q, 10) || 0 },
          ],
        },
        include: orderInclude,
        take: 20,
        orderBy: { createdAt: 'desc' },
      });
      return orders.map(formatOrderForSearch);
    }

    // For text queries (patient names): patient names are encrypted in the DB,
    // so we search by Rx medication name instead, or by provider last name
    // (which is NOT encrypted)
    const orders = await prisma.order.findMany({
      where: {
        clinicId,
        OR: [
          { provider: { lastName: { contains: q, mode: 'insensitive' } } },
          { rxs: { some: { medName: { contains: q, mode: 'insensitive' } } } },
          { primaryMedName: { contains: q, mode: 'insensitive' } },
        ],
      },
      include: orderInclude,
      take: 20,
      orderBy: { createdAt: 'desc' },
    });

    if (orders.length > 0) return orders.map(formatOrderForSearch);

    // Last resort: search recent orders and show all (let the user pick)
    const recent = await prisma.order.findMany({
      where: { clinicId },
      include: orderInclude,
      take: 20,
      orderBy: { createdAt: 'desc' },
    });
    return recent.map(formatOrderForSearch);
  }

  return [];
}

function formatOrderForSearch(order: {
  id: number;
  lifefileOrderId: string | null;
  createdAt: Date;
  status: string | null;
  patient: { id: number; firstName: string; lastName: string };
  provider: { id: number; firstName: string; lastName: string };
  rxs: Array<{ id: number; medName: string; strength: string; form: string }>;
}) {
  let patientName = `${order.patient.lastName}, ${order.patient.firstName}`;
  try {
    const lastName = decryptPHI(order.patient.lastName) ?? order.patient.lastName;
    const firstName = decryptPHI(order.patient.firstName) ?? order.patient.firstName;
    patientName = `${lastName}, ${firstName}`;
  } catch { /* use raw values */ }

  return {
    id: order.id,
    lifefileOrderId: order.lifefileOrderId,
    createdAt: order.createdAt.toISOString(),
    status: order.status,
    patientName,
    patientId: order.patient.id,
    providerName: `${order.provider.lastName}, ${order.provider.firstName}`,
    providerId: order.provider.id,
    medications: order.rxs.map((rx) => `${rx.medName} ${rx.strength}`).join(', '),
    rxCount: order.rxs.length,
  };
}

// ---------------------------------------------------------------------------
// Payment Tracking
// ---------------------------------------------------------------------------

export async function markInvoicePaid(
  id: number,
  clinicId: number,
  data: {
    paymentStatus: 'UNPAID' | 'PARTIAL' | 'PAID';
    paidAmountCents?: number;
    paymentReference?: string;
    paymentNotes?: string;
    paidAt?: string;
  },
  userId: number
) {
  const upload = await prisma.pharmacyInvoiceUpload.findFirst({ where: { id, clinicId } });
  if (!upload) return null;

  return prisma.pharmacyInvoiceUpload.update({
    where: { id },
    data: {
      paymentStatus: data.paymentStatus,
      paidAmountCents: data.paidAmountCents ?? (data.paymentStatus === 'PAID' ? upload.invoiceTotalCents : 0),
      paymentReference: data.paymentReference ?? null,
      paymentNotes: data.paymentNotes ?? null,
      paidAt: data.paymentStatus !== 'UNPAID' ? (data.paidAt ? new Date(data.paidAt) : new Date()) : null,
      paidBy: data.paymentStatus !== 'UNPAID' ? userId : null,
    },
  });
}

// ---------------------------------------------------------------------------
// Consolidated Statements
// ---------------------------------------------------------------------------

export async function createConsolidatedStatement(
  clinicId: number,
  invoiceUploadIds: number[],
  title: string,
  userId: number,
  notes?: string
) {
  const invoices = await prisma.pharmacyInvoiceUpload.findMany({
    where: { id: { in: invoiceUploadIds }, clinicId },
    select: { id: true, invoiceTotalCents: true },
  });

  if (invoices.length === 0) throw new Error('No valid invoices found');

  const totalCents = invoices.reduce((sum, inv) => sum + inv.invoiceTotalCents, 0);

  return prisma.pharmacyConsolidatedStatement.create({
    data: {
      clinicId,
      createdBy: userId,
      title,
      totalCents,
      invoiceIds: invoices.map((inv) => inv.id),
      notes: notes ?? null,
    },
  });
}

export async function listStatements(clinicId: number) {
  return prisma.pharmacyConsolidatedStatement.findMany({
    where: { clinicId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getStatement(id: number, clinicId: number) {
  const statement = await prisma.pharmacyConsolidatedStatement.findFirst({
    where: { id, clinicId },
  });
  if (!statement) return null;

  const invoiceIds = (statement.invoiceIds as number[]) ?? [];
  const invoices = await prisma.pharmacyInvoiceUpload.findMany({
    where: { id: { in: invoiceIds } },
    select: {
      id: true,
      fileName: true,
      invoiceNumber: true,
      invoiceDate: true,
      invoiceTotalCents: true,
      matchedCount: true,
      unmatchedCount: true,
      totalLineItems: true,
      paymentStatus: true,
      paidAmountCents: true,
      paymentReference: true,
      paidAt: true,
    },
  });

  return { statement, invoices };
}

export async function exportStatementCsv(id: number, clinicId: number): Promise<string | null> {
  const data = await getStatement(id, clinicId);
  if (!data) return null;

  const invoiceIds = (data.statement.invoiceIds as number[]) ?? [];
  const lineItems = await prisma.pharmacyInvoiceLineItem.findMany({
    where: { invoiceUploadId: { in: invoiceIds } },
    orderBy: [{ invoiceUploadId: 'asc' }, { lifefileOrderId: 'asc' }, { lineNumber: 'asc' }],
    select: {
      invoiceUploadId: true,
      lifefileOrderId: true,
      rxNumber: true,
      patientName: true,
      doctorName: true,
      medicationName: true,
      strength: true,
      lineType: true,
      shippingMethod: true,
      quantity: true,
      unitPriceCents: true,
      amountCents: true,
      matchStatus: true,
    },
  });

  const header = 'Invoice ID,Order ID,Patient,Doctor,Type,Medication,Qty,Unit Price,Amount,Match Status';
  const rows = lineItems.map((li) =>
    [
      li.invoiceUploadId,
      li.lifefileOrderId ?? '',
      `"${(li.patientName ?? '').replace(/"/g, '""')}"`,
      `"${(li.doctorName ?? '').replace(/"/g, '""')}"`,
      li.lineType,
      `"${(li.medicationName ?? li.shippingMethod ?? '').replace(/"/g, '""')}"`,
      li.quantity,
      (li.unitPriceCents / 100).toFixed(2),
      (li.amountCents / 100).toFixed(2),
      li.matchStatus,
    ].join(',')
  );

  return [header, ...rows].join('\n');
}

// ---------------------------------------------------------------------------
// Duplicate Detection
// ---------------------------------------------------------------------------

/**
 * Check for duplicate Rx line items across all uploads for this clinic.
 * Flags items where the same rxNumber already exists in a DIFFERENT upload,
 * and also flags internal duplicates within the same upload.
 */
export async function checkDuplicateLineItems(invoiceUploadId: number, clinicId: number) {
  // Get all rx numbers from the new upload
  const newItems = await prisma.pharmacyInvoiceLineItem.findMany({
    where: { invoiceUploadId, rxNumber: { not: null } },
    select: { id: true, rxNumber: true },
  });

  if (newItems.length === 0) return;

  const rxNumbers = newItems.map((i) => i.rxNumber).filter(Boolean) as string[];
  if (rxNumbers.length === 0) return;

  // Find existing items with matching rx numbers in OTHER uploads for this clinic
  const existingDupes = await prisma.pharmacyInvoiceLineItem.findMany({
    where: {
      rxNumber: { in: rxNumbers },
      invoiceUpload: { clinicId },
      invoiceUploadId: { not: invoiceUploadId },
    },
    select: { id: true, rxNumber: true, invoiceUploadId: true },
  });

  const existingRxMap = new Map<string, number>();
  for (const item of existingDupes) {
    if (item.rxNumber && !existingRxMap.has(item.rxNumber)) {
      existingRxMap.set(item.rxNumber, item.id);
    }
  }

  // Check for internal duplicates (same rxNumber appearing multiple times in this upload)
  const internalRxCount = new Map<string, number>();
  const internalFirstId = new Map<string, number>();
  for (const item of newItems) {
    if (!item.rxNumber) continue;
    const count = (internalRxCount.get(item.rxNumber) ?? 0) + 1;
    internalRxCount.set(item.rxNumber, count);
    if (!internalFirstId.has(item.rxNumber)) internalFirstId.set(item.rxNumber, item.id);
  }

  // Flag duplicates
  const dupeIds: number[] = [];
  const dupeData: Array<{ id: number; duplicateOfLineItemId: number | null }> = [];

  for (const item of newItems) {
    if (!item.rxNumber) continue;

    // Cross-upload duplicate
    const crossDupeId = existingRxMap.get(item.rxNumber);
    if (crossDupeId) {
      dupeIds.push(item.id);
      dupeData.push({ id: item.id, duplicateOfLineItemId: crossDupeId });
      continue;
    }

    // Internal duplicate (second+ occurrence of same rx in this upload)
    const firstId = internalFirstId.get(item.rxNumber);
    if (firstId && firstId !== item.id && (internalRxCount.get(item.rxNumber) ?? 0) > 1) {
      dupeIds.push(item.id);
      dupeData.push({ id: item.id, duplicateOfLineItemId: firstId });
    }
  }

  // Bulk update
  if (dupeIds.length > 0) {
    await prisma.pharmacyInvoiceLineItem.updateMany({
      where: { id: { in: dupeIds } },
      data: { isDuplicate: true },
    });
    // Set individual duplicateOfLineItemId references
    for (const d of dupeData) {
      await prisma.pharmacyInvoiceLineItem.update({
        where: { id: d.id },
        data: { duplicateOfLineItemId: d.duplicateOfLineItemId },
      });
    }
    logger.info('Duplicate line items flagged', {
      invoiceUploadId,
      duplicateCount: dupeIds.length,
    });
  }
}

// ---------------------------------------------------------------------------
// Unmatched Prescriptions (Orders not on any invoice)
// ---------------------------------------------------------------------------

export async function getUnmatchedOrders(
  clinicId: number,
  startDate: Date,
  page: number = 1,
  limit: number = 50
) {
  // Get all distinct lifefileOrderIds that appear on any invoice for this clinic
  const invoicedOrderIds = await prisma.pharmacyInvoiceLineItem.findMany({
    where: {
      invoiceUpload: { clinicId },
      lifefileOrderId: { not: null },
    },
    select: { lifefileOrderId: true },
    distinct: ['lifefileOrderId'],
  });

  const invoicedSet = new Set(invoicedOrderIds.map((i) => i.lifefileOrderId).filter(Boolean));

  // Get orders for this clinic from the start date that have a lifefileOrderId
  const skip = (page - 1) * limit;

  const where = {
    clinicId,
    createdAt: { gte: startDate },
    lifefileOrderId: { not: null },
  };

  const [allOrders, totalCount] = await Promise.all([
    prisma.order.findMany({
      where,
      include: {
        patient: { select: { id: true, firstName: true, lastName: true } },
        provider: { select: { id: true, firstName: true, lastName: true } },
        rxs: { select: { medName: true, strength: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit + invoicedSet.size, // fetch extra to account for filtering
    }),
    prisma.order.count({ where }),
  ]);

  // Filter out orders that ARE on an invoice
  const unmatchedOrders = allOrders
    .filter((o) => o.lifefileOrderId && !invoicedSet.has(o.lifefileOrderId))
    .slice(0, limit);

  const formattedOrders = unmatchedOrders.map((o) => {
    let patientName = '—';
    if (o.patient) {
      try {
        const lastName = decryptPHI(o.patient.lastName) ?? o.patient.lastName;
        const firstName = decryptPHI(o.patient.firstName) ?? o.patient.firstName;
        patientName = `${lastName}, ${firstName}`;
      } catch {
        patientName = `${o.patient.lastName}, ${o.patient.firstName}`;
      }
    }
    return {
      id: o.id,
      lifefileOrderId: o.lifefileOrderId,
      createdAt: o.createdAt.toISOString(),
      status: o.status,
      patientName,
      providerName: o.provider ? `${o.provider.lastName}, ${o.provider.firstName}` : '—',
      medications: o.rxs.map((rx) => `${rx.medName} ${rx.strength}`).join(', '),
      rxCount: o.rxs.length,
    };
  });

  return {
    orders: formattedOrders,
    total: Math.max(0, totalCount - invoicedSet.size),
    page,
    limit,
  };
}
