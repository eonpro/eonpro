/**
 * OT (Overtime / ot.eonpro.io) — EONPro internal invoices: pharmacy, doctor approvals,
 * fulfillment (non-SKU invoice lines), and platform compensation (% of gross sales).
 */

import path from 'path';
import fs from 'fs/promises';
import { basePrisma } from '@/lib/db';
import { decryptPHI } from '@/lib/security/phi-encryption';
import { logger } from '@/lib/logger';
import { midnightInTz } from '@/lib/utils/timezone';
import {
  OT_CLINIC_SUBDOMAIN,
  OT_FULFILLMENT_FEE_PER_OTHER_LINE_CENTS,
  OT_PLATFORM_COMPENSATION_BPS,
  getOtProductPrice,
  getOtShippingMethodSurchargeCents,
  OT_RX_ASYNC_APPROVAL_FEE_CENTS,
  OT_RX_SYNC_APPROVAL_FEE_CENTS,
  OT_SINGLE_VIAL_SURCHARGE_CENTS,
} from '@/lib/invoices/ot-pricing';
import { BRAND } from '@/lib/constants/brand-assets';

const CLINIC_TZ = 'America/New_York';

export interface OtPharmacyLineItem {
  orderId: number;
  lifefileOrderId: string | null;
  orderDate: string;
  paidAt: string | null;
  patientName: string;
  patientId: number;
  providerName: string;
  providerId: number;
  medicationName: string;
  strength: string;
  vialSize: string;
  medicationKey: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
  pricingStatus: 'priced' | 'missing';
}

export interface OtShippingLineItem {
  orderId: number;
  lifefileOrderId: string | null;
  orderDate: string;
  paidAt: string | null;
  patientName: string;
  description: string;
  feeCents: number;
}

export interface OtPharmacyInvoice {
  invoiceType: 'pharmacy';
  clinicId: number;
  clinicName: string;
  invoiceDate: string;
  periodStart: string;
  periodEnd: string;
  lineItems: OtPharmacyLineItem[];
  shippingLineItems: OtShippingLineItem[];
  subtotalMedicationsCents: number;
  subtotalShippingCents: number;
  totalCents: number;
  orderCount: number;
  vialCount: number;
  missingPriceCount: number;
}

export interface OtDoctorApprovalLineItem {
  orderId: number;
  lifefileOrderId: string | null;
  orderDate: string;
  paidAt: string | null;
  patientName: string;
  patientId: number;
  providerName: string;
  providerId: number;
  medications: string;
  feeCents: number;
  approvalMode: 'async' | 'sync';
}

export interface OtDoctorApprovalsInvoice {
  invoiceType: 'doctor_approvals';
  clinicId: number;
  clinicName: string;
  invoiceDate: string;
  periodStart: string;
  periodEnd: string;
  lineItems: OtDoctorApprovalLineItem[];
  asyncFeeCents: number;
  syncFeeCents: number;
  asyncCount: number;
  syncCount: number;
  totalCents: number;
}

export interface OtFulfillmentLineItem {
  orderId: number;
  invoiceDbId: number;
  lifefileOrderId: string | null;
  orderDate: string;
  paidAt: string | null;
  patientName: string;
  description: string;
  patientLineAmountCents: number;
  feeCents: number;
}

export interface OtFulfillmentInvoice {
  invoiceType: 'fulfillment';
  clinicId: number;
  clinicName: string;
  invoiceDate: string;
  periodStart: string;
  periodEnd: string;
  lineItems: OtFulfillmentLineItem[];
  totalCents: number;
}

export interface OtPlatformCompensation {
  grossSalesCents: number;
  rateBps: number;
  feeCents: number;
  invoiceCount: number;
}

export interface OtDailyInvoices {
  pharmacy: OtPharmacyInvoice;
  doctorApprovals: OtDoctorApprovalsInvoice;
  fulfillment: OtFulfillmentInvoice;
  platformCompensation: OtPlatformCompensation;
  /** Pharmacy + doctor + fulfillment + platform (what OT owes EONPro for the period). */
  grandTotalCents: number;
}

interface RawInvoiceLine {
  description?: string;
  amount?: number;
  quantity?: number;
}

function parseInvoiceLineItemsJson(raw: unknown): RawInvoiceLine[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(Boolean).map((row) => {
    if (typeof row !== 'object' || row === null) return {};
    const o = row as Record<string, unknown>;
    return {
      description: typeof o.description === 'string' ? o.description : undefined,
      amount: typeof o.amount === 'number' ? o.amount : undefined,
      quantity: typeof o.quantity === 'number' ? o.quantity : undefined,
    };
  });
}

function safeDecryptName(encrypted: string): string {
  try {
    return decryptPHI(encrypted) ?? encrypted;
  } catch {
    return encrypted;
  }
}

function formatPatientName(patient: { firstName: string; lastName: string }): string {
  const first = safeDecryptName(patient.firstName);
  const last = safeDecryptName(patient.lastName);
  return `${last}, ${first}`;
}

function normalizeGrossCents(inv: { amountPaid: number; amountDue: number | null }): number {
  if (inv.amountPaid > 0) return inv.amountPaid;
  if (inv.amountDue != null && inv.amountDue > 0) return inv.amountDue;
  return 0;
}

async function resolveOtClinic(): Promise<{ clinicId: number; clinicName: string }> {
  const clinic = await basePrisma.clinic.findFirst({
    where: { subdomain: OT_CLINIC_SUBDOMAIN, status: 'ACTIVE' },
    select: { id: true, name: true },
  });
  if (!clinic) {
    throw new Error(`OT clinic not found (subdomain: ${OT_CLINIC_SUBDOMAIN})`);
  }
  return { clinicId: clinic.id, clinicName: clinic.name };
}

function lineLooksLikeExcludedService(descLower: string): boolean {
  return (
    descLower.includes('shipping') ||
    descLower.includes('overnight') ||
    descLower.includes('fedex') ||
    descLower.includes('ups ') ||
    descLower.includes('delivery')
  );
}

function shouldCountAsFulfillmentLine(
  description: string,
  rxs: { medName: string; strength: string }[],
): boolean {
  const d = description.toLowerCase().trim();
  if (!d || lineLooksLikeExcludedService(d)) return false;
  for (const rx of rxs) {
    const fragment = rx.medName.toLowerCase().trim();
    if (fragment.length >= 3 && d.includes(fragment)) return false;
  }
  return true;
}

export async function generateOtDailyInvoices(date: string, endDate?: string): Promise<OtDailyInvoices> {
  const { clinicId, clinicName } = await resolveOtClinic();

  const [sY, sM, sD] = date.split('-').map(Number);
  const periodStart = midnightInTz(sY, sM - 1, sD, CLINIC_TZ);
  const endStr = endDate ?? date;
  const [eY, eM, eD] = endStr.split('-').map(Number);
  const nextDay = midnightInTz(eY, eM - 1, eD + 1, CLINIC_TZ);
  const periodEnd = new Date(nextDay.getTime() - 1);

  const paidInvoices = await basePrisma.invoice.findMany({
    where: {
      clinicId,
      paidAt: { gte: periodStart, lte: periodEnd },
      prescriptionProcessed: true,
      orderId: { not: null },
    },
    select: {
      id: true,
      orderId: true,
      paidAt: true,
      patientId: true,
      prescriptionProcessedAt: true,
      amountPaid: true,
      amountDue: true,
      lineItems: true,
    },
  });

  const invoiceByOrderId = new Map<
    number,
    {
      paidAt: Date | null;
      invoiceDbId: number;
      amountPaid: number;
      amountDue: number | null;
      lineItems: unknown;
    }
  >();
  const orderIdsFromInvoices = new Set<number>();
  for (const inv of paidInvoices) {
    if (inv.orderId) {
      invoiceByOrderId.set(inv.orderId, {
        paidAt: inv.paidAt,
        invoiceDbId: inv.id,
        amountPaid: inv.amountPaid,
        amountDue: inv.amountDue,
        lineItems: inv.lineItems,
      });
      orderIdsFromInvoices.add(inv.orderId);
    }
  }

  const unlinkedInvoices = await basePrisma.invoice.findMany({
    where: {
      clinicId,
      paidAt: { gte: periodStart, lte: periodEnd },
      prescriptionProcessed: true,
      orderId: null,
    },
    select: {
      id: true,
      paidAt: true,
      patientId: true,
      prescriptionProcessedAt: true,
      amountPaid: true,
      amountDue: true,
      lineItems: true,
    },
  });

  const wideStart = new Date(periodStart.getTime() - 7 * 24 * 60 * 60 * 1000);
  const wideEnd = new Date(periodEnd.getTime() + 7 * 24 * 60 * 60 * 1000);

  const allOrders = await basePrisma.order.findMany({
    where: {
      clinicId,
      OR: [{ id: { in: [...orderIdsFromInvoices] } }, { createdAt: { gte: wideStart, lte: wideEnd } }],
      cancelledAt: null,
      fulfillmentChannel: 'lifefile',
      status: { notIn: ['error', 'cancelled', 'declined', 'queued_for_provider'] },
    },
    select: {
      id: true,
      createdAt: true,
      approvedAt: true,
      queuedForProviderAt: true,
      lifefileOrderId: true,
      shippingMethod: true,
      patientId: true,
      providerId: true,
      patient: { select: { id: true, firstName: true, lastName: true } },
      provider: { select: { id: true, firstName: true, lastName: true } },
      rxs: {
        select: { medicationKey: true, medName: true, strength: true, form: true, quantity: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  for (const inv of unlinkedInvoices) {
    if (!inv.prescriptionProcessedAt) continue;
    const processedMs = inv.prescriptionProcessedAt.getTime();
    let bestOrder: (typeof allOrders)[number] | null = null;
    let bestDiff = Infinity;
    for (const o of allOrders) {
      if (o.patientId !== inv.patientId) continue;
      if (orderIdsFromInvoices.has(o.id)) continue;
      const diff = Math.abs(o.createdAt.getTime() - processedMs);
      if (diff < bestDiff && diff < 5 * 60 * 1000) {
        bestDiff = diff;
        bestOrder = o;
      }
    }
    if (bestOrder) {
      invoiceByOrderId.set(bestOrder.id, {
        paidAt: inv.paidAt,
        invoiceDbId: inv.id,
        amountPaid: inv.amountPaid,
        amountDue: inv.amountDue,
        lineItems: inv.lineItems,
      });
      orderIdsFromInvoices.add(bestOrder.id);
    }
  }

  const filteredOrders = allOrders.filter((o) => orderIdsFromInvoices.has(o.id));

  logger.info('OT invoice generation: orders loaded', {
    clinicId,
    date,
    endDate: endDate ?? date,
    matchedOrders: filteredOrders.length,
  });

  const pharmacyLineItems: OtPharmacyLineItem[] = [];
  const shippingLineItems: OtShippingLineItem[] = [];
  const doctorLines: OtDoctorApprovalLineItem[] = [];
  const fulfillmentLines: OtFulfillmentLineItem[] = [];

  let subtotalMedicationsCents = 0;
  let subtotalShippingCents = 0;
  let totalVials = 0;
  let missingPriceCount = 0;
  let grossSalesCents = 0;
  const grossInvoicesCounted = new Set<number>();

  for (const order of filteredOrders) {
    const patientName = order.patient
      ? formatPatientName(order.patient)
      : `Patient #${order.patientId}`;
    const providerName = order.provider
      ? `${order.provider.lastName}, ${order.provider.firstName}`
      : `Provider #${order.providerId}`;
    const sentAt = order.approvedAt ?? order.createdAt;
    const orderDate = sentAt.toISOString();
    const invMeta = invoiceByOrderId.get(order.id);
    const paidAt = invMeta?.paidAt?.toISOString() ?? null;

    if (invMeta && !grossInvoicesCounted.has(invMeta.invoiceDbId)) {
      grossInvoicesCounted.add(invMeta.invoiceDbId);
      grossSalesCents += normalizeGrossCents({
        amountPaid: invMeta.amountPaid,
        amountDue: invMeta.amountDue,
      });
    }

    let orderVialCount = 0;
    let orderMedTotalCents = 0;

    for (const rx of order.rxs) {
      const priced = getOtProductPrice(rx.medicationKey);
      const qty = parseInt(rx.quantity, 10) || 1;
      orderVialCount += qty;
      const unitCents = priced?.priceCents ?? 0;
      if (!priced) missingPriceCount += qty;
      orderMedTotalCents += unitCents * qty;

      const pricingStatus = priced ? 'priced' : 'missing';
      const displayName = priced?.name ?? rx.medName;
      const displayStrength = priced?.strength ?? rx.strength;
      const displayVial = priced?.vialSize ?? (rx.form || '');

      for (let v = 0; v < qty; v++) {
        pharmacyLineItems.push({
          orderId: order.id,
          lifefileOrderId: order.lifefileOrderId,
          orderDate,
          paidAt,
          patientName,
          patientId: order.patientId,
          providerName,
          providerId: order.providerId,
          medicationName: displayName,
          strength: displayStrength,
          vialSize: displayVial,
          medicationKey: rx.medicationKey,
          quantity: 1,
          unitPriceCents: unitCents,
          lineTotalCents: unitCents,
          pricingStatus,
        });
      }
    }

    subtotalMedicationsCents += orderMedTotalCents;
    totalVials += orderVialCount;

    if (orderVialCount > 0) {
      if (orderVialCount === 1 && OT_SINGLE_VIAL_SURCHARGE_CENTS > 0) {
        subtotalShippingCents += OT_SINGLE_VIAL_SURCHARGE_CENTS;
        shippingLineItems.push({
          orderId: order.id,
          lifefileOrderId: order.lifefileOrderId,
          orderDate,
          paidAt,
          patientName,
          description: 'Single vial shipping surcharge',
          feeCents: OT_SINGLE_VIAL_SURCHARGE_CENTS,
        });
      }
      const shipExtra = getOtShippingMethodSurchargeCents(order.shippingMethod);
      if (shipExtra > 0) {
        subtotalShippingCents += shipExtra;
        shippingLineItems.push({
          orderId: order.id,
          lifefileOrderId: order.lifefileOrderId,
          orderDate,
          paidAt,
          patientName,
          description: `Shipping method ${order.shippingMethod} surcharge`,
          feeCents: shipExtra,
        });
      }
    }

    const approvalMode: 'async' | 'sync' = order.queuedForProviderAt ? 'async' : 'sync';
    const approvalFee =
      approvalMode === 'async' ? OT_RX_ASYNC_APPROVAL_FEE_CENTS : OT_RX_SYNC_APPROVAL_FEE_CENTS;
    const medicationsList = order.rxs.map((rx) => `${rx.medName} ${rx.strength}`).join(', ');

    doctorLines.push({
      orderId: order.id,
      lifefileOrderId: order.lifefileOrderId,
      orderDate,
      paidAt,
      patientName,
      patientId: order.patientId,
      providerName,
      providerId: order.providerId,
      medications: medicationsList,
      feeCents: approvalFee,
      approvalMode,
    });

    if (invMeta?.lineItems != null) {
      const lines = parseInvoiceLineItemsJson(invMeta.lineItems);
      for (const li of lines) {
        const desc = li.description?.trim() ?? '';
        if (!desc) continue;
        if (!shouldCountAsFulfillmentLine(desc, order.rxs)) continue;
        const patientAmt = typeof li.amount === 'number' ? li.amount : 0;
        const fee = OT_FULFILLMENT_FEE_PER_OTHER_LINE_CENTS;
        if (fee <= 0 && patientAmt <= 0) continue;
        fulfillmentLines.push({
          orderId: order.id,
          invoiceDbId: invMeta.invoiceDbId,
          lifefileOrderId: order.lifefileOrderId,
          orderDate,
          paidAt,
          patientName,
          description: desc,
          patientLineAmountCents: patientAmt,
          feeCents: fee,
        });
      }
    }
  }

  const pharmacyTotal = subtotalMedicationsCents + subtotalShippingCents;
  const asyncCount = doctorLines.filter((l) => l.approvalMode === 'async').length;
  const syncCount = doctorLines.filter((l) => l.approvalMode === 'sync').length;
  const doctorTotal = doctorLines.reduce((s, l) => s + l.feeCents, 0);
  const fulfillmentTotal = fulfillmentLines.reduce((s, l) => s + l.feeCents, 0);
  const platformFee = Math.round((grossSalesCents * OT_PLATFORM_COMPENSATION_BPS) / 10_000);
  const grandTotal = pharmacyTotal + doctorTotal + fulfillmentTotal + platformFee;

  const nowIso = new Date().toISOString();

  return {
    pharmacy: {
      invoiceType: 'pharmacy',
      clinicId,
      clinicName,
      invoiceDate: nowIso,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      lineItems: pharmacyLineItems,
      shippingLineItems,
      subtotalMedicationsCents,
      subtotalShippingCents,
      totalCents: pharmacyTotal,
      orderCount: filteredOrders.length,
      vialCount: totalVials,
      missingPriceCount,
    },
    doctorApprovals: {
      invoiceType: 'doctor_approvals',
      clinicId,
      clinicName,
      invoiceDate: nowIso,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      lineItems: doctorLines,
      asyncFeeCents: OT_RX_ASYNC_APPROVAL_FEE_CENTS,
      syncFeeCents: OT_RX_SYNC_APPROVAL_FEE_CENTS,
      asyncCount,
      syncCount,
      totalCents: doctorTotal,
    },
    fulfillment: {
      invoiceType: 'fulfillment',
      clinicId,
      clinicName,
      invoiceDate: nowIso,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      lineItems: fulfillmentLines,
      totalCents: fulfillmentTotal,
    },
    platformCompensation: {
      grossSalesCents,
      rateBps: OT_PLATFORM_COMPENSATION_BPS,
      feeCents: platformFee,
      invoiceCount: grossInvoicesCounted.size,
    },
    grandTotalCents: grandTotal,
  };
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

function stripCsvBom(s: string): string {
  return s.replace(/^\uFEFF/, '');
}

function escapeCSV(value: string | number | null | undefined): string {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function centsToDisplay(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function generateOtPharmacyCSV(invoice: OtPharmacyInvoice): string {
  const BOM = '\uFEFF';
  const lines: string[] = [BOM];
  lines.push('OT (OVERTIME) PHARMACY PRODUCTS INVOICE');
  lines.push(`Clinic,${escapeCSV(invoice.clinicName)}`);
  lines.push(
    `Period,${new Date(invoice.periodStart).toLocaleDateString('en-US')} - ${new Date(invoice.periodEnd).toLocaleDateString('en-US')}`,
  );
  lines.push(`Generated,${new Date(invoice.invoiceDate).toLocaleString('en-US')}`);
  lines.push(`Missing internal prices (line items),${invoice.missingPriceCount}`);
  lines.push('');

  lines.push('=== MEDICATION LINE ITEMS ===');
  lines.push(
    ['Date', 'Order ID', 'LF Order ID', 'Patient', 'Provider', 'Medication', 'Strength', 'Vial', 'Qty', 'Unit', 'Line', 'Priced']
      .map(escapeCSV)
      .join(','),
  );
  for (const li of invoice.lineItems) {
    lines.push(
      [
        new Date(li.orderDate).toLocaleDateString('en-US'),
        li.orderId,
        li.lifefileOrderId ?? '',
        li.patientName,
        li.providerName,
        li.medicationName,
        li.strength,
        li.vialSize,
        li.quantity,
        `$${centsToDisplay(li.unitPriceCents)}`,
        `$${centsToDisplay(li.lineTotalCents)}`,
        li.pricingStatus,
      ]
        .map(escapeCSV)
        .join(','),
    );
  }
  lines.push('');
  lines.push(`Medications Subtotal,,,,,,,,,,$${centsToDisplay(invoice.subtotalMedicationsCents)}`);
  if (invoice.shippingLineItems.length > 0) {
    lines.push('');
    lines.push('=== SHIPPING SURCHARGES ===');
    lines.push(['Date', 'Order ID', 'LF Order ID', 'Patient', 'Description', 'Fee'].map(escapeCSV).join(','));
    for (const sl of invoice.shippingLineItems) {
      lines.push(
        [
          new Date(sl.orderDate).toLocaleDateString('en-US'),
          sl.orderId,
          sl.lifefileOrderId ?? '',
          sl.patientName,
          sl.description,
          `$${centsToDisplay(sl.feeCents)}`,
        ]
          .map(escapeCSV)
          .join(','),
      );
    }
    lines.push(`Shipping Subtotal,,,,,$${centsToDisplay(invoice.subtotalShippingCents)}`);
  }
  lines.push('');
  lines.push(`PHARMACY TOTAL,,,,,,,,,,$${centsToDisplay(invoice.totalCents)}`);
  return lines.join('\r\n');
}

export function generateOtDoctorApprovalsCSV(invoice: OtDoctorApprovalsInvoice): string {
  const BOM = '\uFEFF';
  const lines: string[] = [BOM];
  lines.push('OT DOCTOR APPROVAL SERVICES INVOICE');
  lines.push(`Clinic,${escapeCSV(invoice.clinicName)}`);
  lines.push(
    `Period,${new Date(invoice.periodStart).toLocaleDateString('en-US')} - ${new Date(invoice.periodEnd).toLocaleDateString('en-US')}`,
  );
  lines.push(`Async fee,$${centsToDisplay(invoice.asyncFeeCents)}`);
  lines.push(`Sync fee,$${centsToDisplay(invoice.syncFeeCents)}`);
  lines.push(`Async count,${invoice.asyncCount}`);
  lines.push(`Sync count,${invoice.syncCount}`);
  lines.push('');
  lines.push(
    ['Date', 'Order ID', 'LF Order ID', 'Patient', 'Provider', 'Medications', 'Mode', 'Fee'].map(escapeCSV).join(','),
  );
  for (const li of invoice.lineItems) {
    lines.push(
      [
        new Date(li.orderDate).toLocaleDateString('en-US'),
        li.orderId,
        li.lifefileOrderId ?? '',
        li.patientName,
        li.providerName,
        li.medications,
        li.approvalMode === 'async' ? 'async' : 'sync',
        `$${centsToDisplay(li.feeCents)}`,
      ]
        .map(escapeCSV)
        .join(','),
    );
  }
  lines.push('');
  lines.push(`TOTAL,,,,,,,$${centsToDisplay(invoice.totalCents)}`);
  return lines.join('\r\n');
}

export function generateOtFulfillmentCSV(invoice: OtFulfillmentInvoice): string {
  const BOM = '\uFEFF';
  const lines: string[] = [BOM];
  lines.push('OT FULFILLMENT (NON-PHARMACY STRIPE LINES) INVOICE');
  lines.push(`Clinic,${escapeCSV(invoice.clinicName)}`);
  lines.push(
    `Period,${new Date(invoice.periodStart).toLocaleDateString('en-US')} - ${new Date(invoice.periodEnd).toLocaleDateString('en-US')}`,
  );
  lines.push('');
  lines.push(
    ['Date', 'Order ID', 'Invoice ID', 'Patient', 'Description', 'Patient line $', 'Fee'].map(escapeCSV).join(','),
  );
  for (const li of invoice.lineItems) {
    lines.push(
      [
        new Date(li.orderDate).toLocaleDateString('en-US'),
        li.orderId,
        li.invoiceDbId,
        li.patientName,
        li.description,
        `$${centsToDisplay(li.patientLineAmountCents)}`,
        `$${centsToDisplay(li.feeCents)}`,
      ]
        .map(escapeCSV)
        .join(','),
    );
  }
  lines.push('');
  lines.push(`TOTAL,,,,,,$${centsToDisplay(invoice.totalCents)}`);
  return lines.join('\r\n');
}

export function generateOtCombinedCSV(data: OtDailyInvoices): string {
  const BOM = '\uFEFF';
  const lines: string[] = [
    BOM,
    'OT / EONPRO COMBINED INTERNAL INVOICE (SUMMARY)',
    `Clinic,${escapeCSV(data.pharmacy.clinicName)}`,
    `Period,${new Date(data.pharmacy.periodStart).toLocaleDateString('en-US')} - ${new Date(data.pharmacy.periodEnd).toLocaleDateString('en-US')}`,
    '',
    `Pharmacy (meds + shipping),$${centsToDisplay(data.pharmacy.totalCents)}`,
    `Doctor approvals,$${centsToDisplay(data.doctorApprovals.totalCents)}`,
    `Fulfillment (other lines),$${centsToDisplay(data.fulfillment.totalCents)}`,
    `Platform compensation (${data.platformCompensation.rateBps / 100}% of gross),$${centsToDisplay(data.platformCompensation.feeCents)}`,
    `Gross sales (patient paid, ${data.platformCompensation.invoiceCount} invoices),$${centsToDisplay(data.platformCompensation.grossSalesCents)}`,
    '',
    `GRAND TOTAL,$${centsToDisplay(data.grandTotalCents)}`,
    '',
    '--- DETAIL: PHARMACY ---',
    stripCsvBom(generateOtPharmacyCSV(data.pharmacy)),
    '',
    '--- DETAIL: DOCTOR APPROVALS ---',
    stripCsvBom(generateOtDoctorApprovalsCSV(data.doctorApprovals)),
    '',
    '--- DETAIL: FULFILLMENT ---',
    stripCsvBom(generateOtFulfillmentCSV(data.fulfillment)),
  ];
  return lines.join('\r\n');
}

// ---------------------------------------------------------------------------
// PDF — compact summary statement (all sections)
// ---------------------------------------------------------------------------

let cachedLogo: Uint8Array | null = null;

async function loadLogoBytes(): Promise<Uint8Array | null> {
  if (cachedLogo) return cachedLogo;
  try {
    cachedLogo = new Uint8Array(await fs.readFile(path.join(process.cwd(), 'public', BRAND.logos.eonproLogoPdf.replace(/^\//, ''))));
    return cachedLogo;
  } catch {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL;
    if (baseUrl) {
      try {
        const url = baseUrl.startsWith('http') ? `${baseUrl}/${BRAND.logos.eonproLogoPdf.replace(/^\//, '')}` : `https://${baseUrl}/${BRAND.logos.eonproLogoPdf.replace(/^\//, '')}`;
        const res = await fetch(url);
        if (res.ok) {
          cachedLogo = new Uint8Array(await res.arrayBuffer());
          return cachedLogo;
        }
      } catch { /* noop */ }
    }
  }
  return null;
}

function sanitizeForPdf(text: string): string {
  if (!text) return '';
  return text
    .replace(/[\u02BB\u02BC\u02BD\u02BE\u02BF]/g, "'")
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u00A0/g, ' ')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '');
}

export async function generateOtSummaryPDF(data: OtDailyInvoices): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  let logo = null as Awaited<ReturnType<typeof doc.embedPng>> | null;
  try {
    const b = await loadLogoBytes();
    if (b) logo = await doc.embedPng(b);
  } catch {
    /* skip */
  }

  const PW = 612;
  const PH = 792;
  const M = 48;
  let page = doc.addPage([PW, PH]);
  let y = PH - M;

  const dark = rgb(0.12, 0.12, 0.12);
  const mid = rgb(0.4, 0.4, 0.4);
  const green = rgb(0.06, 0.45, 0.31);

  const draw = (s: string, x: number, size: number, f = font, c = dark) => {
    page.drawText(sanitizeForPdf(s), { x, y, size, font: f, color: c });
  };

  if (logo) {
    const sc = 32 / logo.height;
    page.drawImage(logo, { x: M, y: y - 8, width: logo.width * sc, height: 32 });
    y -= 40;
  } else {
    y -= 8;
  }

  draw('OT / OVERTIME — EONPRO INTERNAL INVOICE', M, 15, fontBold, green);
  y -= 28;
  draw(data.pharmacy.clinicName, M, 11, fontBold);
  y -= 16;
  const period = `${new Date(data.pharmacy.periodStart).toLocaleDateString('en-US')} — ${new Date(data.pharmacy.periodEnd).toLocaleDateString('en-US')}`;
  draw(period, M, 9, font, mid);
  y -= 28;

  const rows: [string, string][] = [
    ['Pharmacy (medications + shipping)', `$${centsToDisplay(data.pharmacy.totalCents)}`],
    ['Doctor approvals (async + sync)', `$${centsToDisplay(data.doctorApprovals.totalCents)}`],
    ['Fulfillment (other Stripe lines)', `$${centsToDisplay(data.fulfillment.totalCents)}`],
    [
      `Platform compensation (${data.platformCompensation.rateBps / 100}% of gross sales)`,
      `$${centsToDisplay(data.platformCompensation.feeCents)}`,
    ],
    ['Patient gross (reference)', `$${centsToDisplay(data.platformCompensation.grossSalesCents)}`],
  ];

  for (const [label, amt] of rows) {
    draw(label, M, 10, font);
    draw(amt, PW - M - 90, 10, fontBold);
    y -= 18;
  }

  y -= 10;
  page.drawLine({ start: { x: M, y }, end: { x: PW - M, y }, thickness: 1, color: green });
  y -= 20;
  draw('TOTAL DUE TO EONPRO', M, 12, fontBold, green);
  draw(`$${centsToDisplay(data.grandTotalCents)}`, PW - M - 100, 12, fontBold, green);
  y -= 36;
  draw(`Pharmacy orders: ${data.pharmacy.orderCount} · Vials: ${data.pharmacy.vialCount}`, M, 8, font, mid);
  y -= 14;
  draw(
    `Approvals: ${data.doctorApprovals.asyncCount} async · ${data.doctorApprovals.syncCount} sync`,
    M,
    8,
    font,
    mid,
  );
  y -= 14;
  draw(`Unpriced medication lines (qty): ${data.pharmacy.missingPriceCount}`, M, 8, font, mid);

  return doc.save();
}
