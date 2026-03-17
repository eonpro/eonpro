/**
 * WellMedR Invoice Generation Service
 *
 * Generates two separate daily invoices for the WellMedR clinic:
 * 1. Pharmacy Products Invoice — medication costs + shipping surcharges
 * 2. Prescription Services Invoice — $20 per prescription sent
 *
 * All amounts are in cents internally, formatted to dollars for display/export.
 */

import { basePrisma } from '@/lib/db';
import { decryptPHI } from '@/lib/security/phi-encryption';
import { logger } from '@/lib/logger';
import { midnightInTz } from '@/lib/utils/timezone';
import {
  WELLMEDR_CLINIC_SUBDOMAIN,
  WELLMEDR_PRICED_PRODUCT_IDS,
  PRESCRIPTION_SERVICE_FEE_CENTS,
  SINGLE_VIAL_SHIPPING_FEE_CENTS,
  OVERNIGHT_SHIPPING_FEE_CENTS,
  getProductPrice,
  isOvernightShipping,
} from '@/lib/invoices/wellmedr-pricing';

const CLINIC_TZ = 'America/New_York';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PharmacyLineItem {
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
}

export interface ShippingLineItem {
  orderId: number;
  lifefileOrderId: string | null;
  orderDate: string;
  paidAt: string | null;
  patientName: string;
  description: string;
  feeCents: number;
}

export interface PharmacyInvoice {
  invoiceType: 'pharmacy';
  clinicId: number;
  clinicName: string;
  invoiceDate: string;
  periodStart: string;
  periodEnd: string;
  lineItems: PharmacyLineItem[];
  shippingLineItems: ShippingLineItem[];
  subtotalMedicationsCents: number;
  subtotalShippingCents: number;
  totalCents: number;
  orderCount: number;
  vialCount: number;
}

export interface PrescriptionServiceLineItem {
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
}

export interface PrescriptionServicesInvoice {
  invoiceType: 'prescription_services';
  clinicId: number;
  clinicName: string;
  invoiceDate: string;
  periodStart: string;
  periodEnd: string;
  lineItems: PrescriptionServiceLineItem[];
  feePerPrescriptionCents: number;
  totalPrescriptions: number;
  totalCents: number;
}

export interface WellmedrDailyInvoices {
  pharmacy: PharmacyInvoice;
  prescriptionServices: PrescriptionServicesInvoice;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Core Generation
// ---------------------------------------------------------------------------

async function resolveClinicId(): Promise<{ clinicId: number; clinicName: string }> {
  const clinic = await basePrisma.clinic.findFirst({
    where: { subdomain: WELLMEDR_CLINIC_SUBDOMAIN, status: 'ACTIVE' },
    select: { id: true, name: true },
  });

  if (!clinic) {
    throw new Error(`WellMedR clinic not found (subdomain: ${WELLMEDR_CLINIC_SUBDOMAIN})`);
  }

  return { clinicId: clinic.id, clinicName: clinic.name };
}

export async function generateDailyInvoices(
  date: string,
  endDate?: string
): Promise<WellmedrDailyInvoices> {
  const { clinicId, clinicName } = await resolveClinicId();

  const [sY, sM, sD] = date.split('-').map(Number);
  const periodStart = midnightInTz(sY, sM - 1, sD, CLINIC_TZ);

  const endStr = endDate ?? date;
  const [eY, eM, eD] = endStr.split('-').map(Number);
  const nextDay = midnightInTz(eY, eM - 1, eD + 1, CLINIC_TZ);
  const periodEnd = new Date(nextDay.getTime() - 1);

  // PRIMARY: Find invoices PAID in this period, then get their linked orders.
  // This ensures the invoice matches Stripe payment records for the same day.
  const paidInvoices = await basePrisma.invoice.findMany({
    where: {
      clinicId,
      paidAt: { gte: periodStart, lte: periodEnd },
      prescriptionProcessed: true,
      orderId: { not: null },
    },
    select: { id: true, orderId: true, paidAt: true, patientId: true, prescriptionProcessedAt: true },
  });

  const invoiceByOrderId = new Map<number, { paidAt: Date | null }>();
  const orderIdsFromInvoices = new Set<number>();
  for (const inv of paidInvoices) {
    if (inv.orderId) {
      invoiceByOrderId.set(inv.orderId, { paidAt: inv.paidAt });
      orderIdsFromInvoices.add(inv.orderId);
    }
  }

  // FALLBACK: Also find invoices paid in this period that don't have orderId linked yet (legacy).
  // Match them to orders by patientId + prescriptionProcessedAt close to order.createdAt.
  const unlinkedInvoices = await basePrisma.invoice.findMany({
    where: {
      clinicId,
      paidAt: { gte: periodStart, lte: periodEnd },
      prescriptionProcessed: true,
      orderId: null,
    },
    select: { id: true, paidAt: true, patientId: true, prescriptionProcessedAt: true },
  });

  // Fetch all WellMedR orders that might match (wider window for fallback matching)
  const wideStart = new Date(periodStart.getTime() - 7 * 24 * 60 * 60 * 1000);
  const wideEnd = new Date(periodEnd.getTime() + 7 * 24 * 60 * 60 * 1000);

  const allOrders = await basePrisma.order.findMany({
    where: {
      clinicId,
      OR: [
        { id: { in: [...orderIdsFromInvoices] } },
        { createdAt: { gte: wideStart, lte: wideEnd } },
      ],
      cancelledAt: null,
      fulfillmentChannel: 'lifefile',
      status: { notIn: ['error', 'cancelled', 'declined', 'queued_for_provider'] },
    },
    select: {
      id: true,
      createdAt: true,
      approvedAt: true,
      lifefileOrderId: true,
      shippingMethod: true,
      patientId: true,
      providerId: true,
      status: true,
      patient: { select: { id: true, firstName: true, lastName: true } },
      provider: { select: { id: true, firstName: true, lastName: true } },
      rxs: {
        select: {
          id: true,
          medicationKey: true,
          medName: true,
          strength: true,
          form: true,
          quantity: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  // Match unlinked invoices to orders by patientId + timestamp proximity
  for (const inv of unlinkedInvoices) {
    if (!inv.prescriptionProcessedAt) continue;
    const processedMs = inv.prescriptionProcessedAt.getTime();
    let bestOrder: typeof allOrders[number] | null = null;
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
      invoiceByOrderId.set(bestOrder.id, { paidAt: inv.paidAt });
      orderIdsFromInvoices.add(bestOrder.id);
    }
  }

  // Final order set: only orders that have a matching paid invoice
  const filteredOrders = allOrders.filter((o) => orderIdsFromInvoices.has(o.id));

  logger.info('WellMedR invoice generation: orders loaded', {
    clinicId,
    date,
    endDate: endDate ?? date,
    linkedInvoices: paidInvoices.length,
    unlinkedInvoices: unlinkedInvoices.length,
    matchedOrders: filteredOrders.length,
  });

  const pharmacyLineItems: PharmacyLineItem[] = [];
  const shippingLineItems: ShippingLineItem[] = [];
  const rxServiceLineItems: PrescriptionServiceLineItem[] = [];

  let subtotalMedicationsCents = 0;
  let subtotalShippingCents = 0;
  let totalVialCount = 0;

  for (const order of filteredOrders) {
    const patientName = order.patient
      ? formatPatientName(order.patient)
      : `Patient #${order.patientId}`;

    const providerName = order.provider
      ? `${order.provider.lastName}, ${order.provider.firstName}`
      : `Provider #${order.providerId}`;

    const sentAt = order.approvedAt ?? order.createdAt;
    const orderDate = sentAt.toISOString();
    const invoiceData = invoiceByOrderId.get(order.id);
    const paidAt = invoiceData?.paidAt?.toISOString() ?? null;

    // --- Pharmacy Products ---
    let orderVialCount = 0;
    let orderMedTotalCents = 0;

    for (const rx of order.rxs) {
      const product = getProductPrice(rx.medicationKey);
      if (!product) continue;

      const qty = parseInt(rx.quantity, 10) || 1;
      orderVialCount += qty;
      orderMedTotalCents += product.priceCents * qty;

      // Expand each vial into its own line item for clear per-unit breakdown
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
          medicationName: product.name,
          strength: product.strength,
          vialSize: product.vialSize,
          medicationKey: rx.medicationKey,
          quantity: 1,
          unitPriceCents: product.priceCents,
          lineTotalCents: product.priceCents,
        });
      }
    }

    subtotalMedicationsCents += orderMedTotalCents;
    totalVialCount += orderVialCount;

    // Shipping surcharges (only if the order has priced medications)
    if (orderVialCount > 0) {
      if (orderVialCount === 1) {
        const fee = SINGLE_VIAL_SHIPPING_FEE_CENTS;
        subtotalShippingCents += fee;
        shippingLineItems.push({
          orderId: order.id,
          lifefileOrderId: order.lifefileOrderId,
          orderDate,
          paidAt,
          patientName,
          description: 'Single vial shipping surcharge',
          feeCents: fee,
        });
      }

      if (isOvernightShipping(order.shippingMethod)) {
        const fee = OVERNIGHT_SHIPPING_FEE_CENTS;
        subtotalShippingCents += fee;
        shippingLineItems.push({
          orderId: order.id,
          lifefileOrderId: order.lifefileOrderId,
          orderDate,
          paidAt,
          patientName,
          description: 'Overnight shipping surcharge',
          feeCents: fee,
        });
      }
    }

    // --- Prescription Services ($20 per prescription sent) ---
    const medicationsList = order.rxs
      .filter((rx) => WELLMEDR_PRICED_PRODUCT_IDS.has(rx.medicationKey))
      .map((rx) => `${rx.medName} ${rx.strength}`)
      .join(', ');

    rxServiceLineItems.push({
      orderId: order.id,
      lifefileOrderId: order.lifefileOrderId,
      orderDate,
      paidAt,
      patientName,
      patientId: order.patientId,
      providerName,
      providerId: order.providerId,
      medications: medicationsList || order.rxs.map((rx) => `${rx.medName} ${rx.strength}`).join(', '),
      feeCents: PRESCRIPTION_SERVICE_FEE_CENTS,
    });
  }

  const pharmacyTotalCents = subtotalMedicationsCents + subtotalShippingCents;
  const rxServicesTotalCents = rxServiceLineItems.length * PRESCRIPTION_SERVICE_FEE_CENTS;

  return {
    pharmacy: {
      invoiceType: 'pharmacy',
      clinicId,
      clinicName,
      invoiceDate: new Date().toISOString(),
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      lineItems: pharmacyLineItems,
      shippingLineItems,
      subtotalMedicationsCents,
      subtotalShippingCents,
      totalCents: pharmacyTotalCents,
      orderCount: filteredOrders.length,
      vialCount: totalVialCount,
    },
    prescriptionServices: {
      invoiceType: 'prescription_services',
      clinicId,
      clinicName,
      invoiceDate: new Date().toISOString(),
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      lineItems: rxServiceLineItems,
      feePerPrescriptionCents: PRESCRIPTION_SERVICE_FEE_CENTS,
      totalPrescriptions: rxServiceLineItems.length,
      totalCents: rxServicesTotalCents,
    },
  };
}

// ---------------------------------------------------------------------------
// CSV Export
// ---------------------------------------------------------------------------

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

export function generatePharmacyCSV(invoice: PharmacyInvoice): string {
  const BOM = '\uFEFF';
  const lines: string[] = [BOM];

  lines.push('WELLMEDR PHARMACY PRODUCTS INVOICE');
  lines.push(`Clinic,${escapeCSV(invoice.clinicName)}`);
  lines.push(`Period,${new Date(invoice.periodStart).toLocaleDateString('en-US')} - ${new Date(invoice.periodEnd).toLocaleDateString('en-US')}`);
  lines.push(`Generated,${new Date(invoice.invoiceDate).toLocaleString('en-US')}`);
  lines.push(`Total Orders,${invoice.orderCount}`);
  lines.push(`Total Vials,${invoice.vialCount}`);
  lines.push('');

  lines.push('=== MEDICATION LINE ITEMS ===');
  lines.push(
    ['Date', 'Order ID', 'LF Order ID', 'Patient', 'Provider', 'Medication', 'Strength', 'Vial Size', 'Qty', 'Unit Price', 'Line Total']
      .map(escapeCSV)
      .join(',')
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
      ]
        .map(escapeCSV)
        .join(',')
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
          .join(',')
      );
    }

    lines.push(`Shipping Subtotal,,,,,$${centsToDisplay(invoice.subtotalShippingCents)}`);
  }

  lines.push('');
  lines.push(`TOTAL,,,,,,,,,,$${centsToDisplay(invoice.totalCents)}`);

  return lines.join('\r\n');
}

export function generatePrescriptionServicesCSV(invoice: PrescriptionServicesInvoice): string {
  const BOM = '\uFEFF';
  const lines: string[] = [BOM];

  lines.push('WELLMEDR PRESCRIPTION MEDICAL SERVICES INVOICE');
  lines.push(`Clinic,${escapeCSV(invoice.clinicName)}`);
  lines.push(`Period,${new Date(invoice.periodStart).toLocaleDateString('en-US')} - ${new Date(invoice.periodEnd).toLocaleDateString('en-US')}`);
  lines.push(`Generated,${new Date(invoice.invoiceDate).toLocaleString('en-US')}`);
  lines.push(`Fee Per Prescription,$${centsToDisplay(invoice.feePerPrescriptionCents)}`);
  lines.push(`Total Prescriptions,${invoice.totalPrescriptions}`);
  lines.push('');

  lines.push('=== PRESCRIPTION LINE ITEMS ===');
  lines.push(
    ['Date', 'Order ID', 'LF Order ID', 'Patient', 'Provider', 'Medications', 'Service Fee']
      .map(escapeCSV)
      .join(',')
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
        `$${centsToDisplay(li.feeCents)}`,
      ]
        .map(escapeCSV)
        .join(',')
    );
  }

  lines.push('');
  lines.push(`TOTAL,,,,,,$${centsToDisplay(invoice.totalCents)}`);

  return lines.join('\r\n');
}

// ---------------------------------------------------------------------------
// PDF Export — Premium branded design with Sofia Pro, grouped by order
// ---------------------------------------------------------------------------

import path from 'path';
import fs from 'fs/promises';
import { BRAND } from '@/lib/constants/brand-assets';

let cachedLogo: Uint8Array | null = null;
let cachedFont: Uint8Array | null = null;

async function loadAsset(relPath: string): Promise<Uint8Array | null> {
  // Try local filesystem first (works in dev + standalone builds)
  try {
    return new Uint8Array(await fs.readFile(path.join(process.cwd(), 'public', relPath)));
  } catch { /* fall through */ }

  // On Vercel serverless, public/ files aren't on disk — fetch via HTTP
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL;
  if (baseUrl) {
    try {
      const url = baseUrl.startsWith('http') ? `${baseUrl}/${relPath}` : `https://${baseUrl}/${relPath}`;
      const res = await fetch(url);
      if (res.ok) return new Uint8Array(await res.arrayBuffer());
    } catch { /* fall through */ }
  }

  return null;
}

async function loadLogo(): Promise<Uint8Array | null> {
  if (cachedLogo) return cachedLogo;
  cachedLogo = await loadAsset(BRAND.logos.eonproLogoPdf.replace(/^\//, ''));
  return cachedLogo;
}

async function loadSofiaFont(): Promise<Uint8Array | null> {
  if (cachedFont) return cachedFont;
  cachedFont = await loadAsset('fonts/Sofia-Pro-Regular.ttf');
  return cachedFont;
}

const G = { r: 0.06, g: 0.45, b: 0.31 }; // primary green
const A = { r: 0.72, g: 0.49, b: 0.07 }; // amber

function fmtDateTimeET(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: CLINIC_TZ,
  });
}

function fmtPeriod(start: string, end: string): string {
  const s = new Date(start).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const e = new Date(end).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  return s === e ? s : `${s}  -  ${e}`;
}

function $(cents: number): string { return `$${centsToDisplay(cents)}`; }

// ═══════════════════════════════════════════════════════════════════════════
// PHARMACY PRODUCTS PDF — grouped by order, shipping inline, per-order totals
// ═══════════════════════════════════════════════════════════════════════════

export async function generatePharmacyPDF(invoice: PharmacyInvoice): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const doc = await PDFDocument.create();

  let sofia: Awaited<ReturnType<typeof doc.embedFont>>;
  try {
    const sofiaBytes = await loadSofiaFont();
    sofia = sofiaBytes ? await doc.embedFont(sofiaBytes) : await doc.embedFont(StandardFonts.Helvetica);
  } catch {
    sofia = await doc.embedFont(StandardFonts.Helvetica);
  }
  const helvB = await doc.embedFont(StandardFonts.HelveticaBold);

  let logo: Awaited<ReturnType<typeof doc.embedPng>> | null = null;
  try {
    const logoBytes = await loadLogo();
    logo = logoBytes ? await doc.embedPng(logoBytes) : null;
  } catch { /* skip logo */ }

  const PW = 792; const PH = 612; const M = 42; const TW = PW - 2 * M;
  const R = 13;

  let pg = doc.addPage([PW, PH]);
  let y = PH - M;
  let pageNum = 1;

  const white = rgb(1, 1, 1);
  const dark = rgb(0.12, 0.12, 0.12);
  const mid = rgb(0.45, 0.45, 0.45);
  const light = rgb(0.65, 0.65, 0.65);
  const green = rgb(G.r, G.g, G.b);
  const greenBg = rgb(0.94, 0.98, 0.96);
  const shipAmber = rgb(0.6, 0.42, 0.05);

  function t(s: string, x: number, f = sofia, sz = 8, c = dark) {
    pg.drawText(sanitizeForPdf(s), { x, y, size: sz, font: f, color: c });
  }
  function tr(s: string, max: number) { return s.length > max ? s.slice(0, max - 1) + '..' : s; }
  function line(x1: number, x2: number, th = 0.5, c = rgb(0.88, 0.88, 0.88)) {
    pg.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: th, color: c });
  }
  function rect(x: number, w: number, h: number, c = greenBg) {
    pg.drawRectangle({ x, y: y - 3, width: w, height: h, color: c });
  }
  function newPg() { footer(); pg = doc.addPage([PW, PH]); y = PH - M; pageNum++; }
  function need(h: number) { if (y - h < M + 22) newPg(); }
  function footer() {
    pg.drawLine({ start: { x: M, y: 28 }, end: { x: PW - M, y: 28 }, thickness: 0.4, color: rgb(0.88, 0.88, 0.88) });
    pg.drawText(sanitizeForPdf(`EONPro  |  WellMedR Pharmacy Invoice  |  Confidential  |  Page ${pageNum}`), {
      x: M, y: 16, size: 6.5, font: sofia, color: light,
    });
  }

  // ── HEADER ──
  if (logo) {
    const sc = 36 / logo.height;
    pg.drawImage(logo, { x: M, y: y - 10, width: logo.width * sc, height: 36 });
  }
  y -= 4;
  t('PHARMACY PRODUCTS INVOICE', PW - M - 260, helvB, 14, green);
  y -= 22;
  pg.drawRectangle({ x: M, y, width: TW, height: 2, color: green });
  y -= 20;

  // Info block
  t(invoice.clinicName, M, helvB, 11);
  t(fmtPeriod(invoice.periodStart, invoice.periodEnd), PW - M - 260, sofia, 9, mid);
  y -= 14;
  t(`${invoice.orderCount} orders   |   ${invoice.vialCount} vials   |   ${invoice.shippingLineItems.length} shipping charges`, M, sofia, 8, mid);
  t(`Generated ${new Date().toLocaleString('en-US')}`, PW - M - 260, sofia, 7.5, light);
  y -= 20;

  // ── BUILD ORDER GROUPS ──
  interface OG { id: number; items: PharmacyLineItem[]; ship: ShippingLineItem[]; medCents: number; shipCents: number; total: number; }
  const medMap = new Map<number, PharmacyLineItem[]>();
  for (const li of invoice.lineItems) { const a = medMap.get(li.orderId) ?? []; a.push(li); medMap.set(li.orderId, a); }
  const shipMap = new Map<number, ShippingLineItem[]>();
  for (const sl of invoice.shippingLineItems) { const a = shipMap.get(sl.orderId) ?? []; a.push(sl); shipMap.set(sl.orderId, a); }
  const groups: OG[] = [];
  for (const [id, items] of medMap) {
    const ship = shipMap.get(id) ?? [];
    const medCents = items.reduce((s, i) => s + i.lineTotalCents, 0);
    const shipCents = ship.reduce((s, i) => s + i.feeCents, 0);
    groups.push({ id, items, ship, medCents, shipCents, total: medCents + shipCents });
  }

  // Column positions
  const cx = { desc: M + 6, strength: M + 200, vial: M + 310, price: M + 380, amt: TW + M - 60 };

  // ── RENDER EACH ORDER ──
  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi];
    const first = g.items[0];
    const rowCount = g.items.length + g.ship.length + 1;
    need(R * rowCount + 34);

    // Order header bar
    rect(M, TW, 18, rgb(0.15, 0.15, 0.15));
    y -= 1;
    t(`#${g.id}`, M + 6, helvB, 7.5, white);
    t(tr(first.patientName, 26), M + 60, helvB, 7.5, white);
    t(`LF ${first.lifefileOrderId ?? '-'}`, M + 220, sofia, 7, rgb(0.7, 0.7, 0.7));
    const paidLabel = first.paidAt ? `Paid: ${fmtDateTimeET(first.paidAt)} ET` : '';
    const sentLabel = `Sent: ${fmtDateTimeET(first.orderDate)} ET`;
    t(paidLabel, M + 340, sofia, 6.5, rgb(0.55, 0.95, 0.7));
    t(sentLabel, M + 480, sofia, 6.5, rgb(0.7, 0.7, 0.7));
    t(`Order Total:  ${$(g.total)}`, cx.amt - 30, helvB, 8, rgb(0.45, 0.95, 0.65));
    y -= 17;

    // Column sub-headers
    rect(M, TW, R + 1, rgb(0.96, 0.96, 0.96));
    t('Description', cx.desc, helvB, 6.5, mid);
    t('Strength', cx.strength, helvB, 6.5, mid);
    t('Vial', cx.vial, helvB, 6.5, mid);
    t('Unit Price', cx.price, helvB, 6.5, mid);
    t('Amount', cx.amt, helvB, 6.5, mid);
    y -= R + 2;

    // Medication rows
    for (let i = 0; i < g.items.length; i++) {
      const li = g.items[i];
      if (i % 2 === 0) rect(M, TW, R, greenBg);
      t(tr(li.medicationName, 32), cx.desc, sofia, 7.5);
      t(li.strength, cx.strength, sofia, 7.5);
      t(li.vialSize, cx.vial, sofia, 7.5);
      t($(li.unitPriceCents), cx.price, sofia, 7.5);
      t($(li.lineTotalCents), cx.amt, sofia, 7.5);
      y -= R;
    }

    // Shipping rows (inline)
    for (const sl of g.ship) {
      rect(M, TW, R, rgb(1, 0.98, 0.94));
      t(`Shipping: ${sl.description}`, cx.desc, sofia, 7, shipAmber);
      t($(sl.feeCents), cx.amt, sofia, 7, shipAmber);
      y -= R;
    }

    // Order total row
    y -= 1;
    pg.drawLine({ start: { x: cx.price - 10, y: y + R - 1 }, end: { x: PW - M, y: y + R - 1 }, thickness: 0.6, color: green });
    t('Order Total', cx.price - 10, helvB, 7.5, green);
    t($(g.total), cx.amt, helvB, 8, green);
    y -= R + 6;
  }

  // ── INVOICE TOTAL ──
  need(40);
  y -= 4;
  pg.drawRectangle({ x: M, y: y - 8, width: TW, height: 30, color: green });
  y += 2;
  t('INVOICE TOTAL', M + 12, helvB, 13, white);
  t($(invoice.totalCents), cx.amt - 20, helvB, 15, white);
  y -= 34;

  footer();
  return doc.save();
}

// ═══════════════════════════════════════════════════════════════════════════
// PRESCRIPTION SERVICES PDF
// ═══════════════════════════════════════════════════════════════════════════

export async function generatePrescriptionServicesPDF(invoice: PrescriptionServicesInvoice): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const doc = await PDFDocument.create();

  let sofia: Awaited<ReturnType<typeof doc.embedFont>>;
  try {
    const sofiaBytes = await loadSofiaFont();
    sofia = sofiaBytes ? await doc.embedFont(sofiaBytes) : await doc.embedFont(StandardFonts.Helvetica);
  } catch {
    sofia = await doc.embedFont(StandardFonts.Helvetica);
  }
  const helvB = await doc.embedFont(StandardFonts.HelveticaBold);

  let logo: Awaited<ReturnType<typeof doc.embedPng>> | null = null;
  try {
    const logoBytes = await loadLogo();
    logo = logoBytes ? await doc.embedPng(logoBytes) : null;
  } catch { /* skip logo */ }

  const PW = 792; const PH = 612; const M = 42; const TW = PW - 2 * M;
  const R = 14;

  let pg = doc.addPage([PW, PH]);
  let y = PH - M;
  let pageNum = 1;

  const white = rgb(1, 1, 1);
  const dark = rgb(0.12, 0.12, 0.12);
  const mid = rgb(0.45, 0.45, 0.45);
  const light = rgb(0.65, 0.65, 0.65);
  const amber = rgb(A.r, A.g, A.b);
  const amberBg = rgb(0.99, 0.97, 0.93);

  function t(s: string, x: number, f = sofia, sz = 8, c = dark) {
    pg.drawText(sanitizeForPdf(s), { x, y, size: sz, font: f, color: c });
  }
  function tr(s: string, max: number) { return s.length > max ? s.slice(0, max - 1) + '..' : s; }
  function newPg() { footer(); pg = doc.addPage([PW, PH]); y = PH - M; pageNum++; }
  function need(h: number) { if (y - h < M + 22) newPg(); }
  function footer() {
    pg.drawLine({ start: { x: M, y: 28 }, end: { x: PW - M, y: 28 }, thickness: 0.4, color: rgb(0.88, 0.88, 0.88) });
    pg.drawText(sanitizeForPdf(`EONPro  |  WellMedR Rx Services Invoice  |  Confidential  |  Page ${pageNum}`), {
      x: M, y: 16, size: 6.5, font: sofia, color: light,
    });
  }

  // ── HEADER ──
  if (logo) {
    const sc = 36 / logo.height;
    pg.drawImage(logo, { x: M, y: y - 10, width: logo.width * sc, height: 36 });
  }
  y -= 4;
  t('PRESCRIPTION MEDICAL SERVICES INVOICE', PW - M - 310, helvB, 14, amber);
  y -= 22;
  pg.drawRectangle({ x: M, y, width: TW, height: 2, color: amber });
  y -= 20;

  t(invoice.clinicName, M, helvB, 11);
  t(fmtPeriod(invoice.periodStart, invoice.periodEnd), PW - M - 260, sofia, 9, mid);
  y -= 14;
  t(`${invoice.totalPrescriptions} prescriptions   |   ${$(invoice.feePerPrescriptionCents)} per Rx`, M, sofia, 8, mid);
  t(`Generated ${new Date().toLocaleString('en-US')}`, PW - M - 260, sofia, 7.5, light);
  y -= 22;

  // Column header
  const rc = { paid: M + 6, sent: M + 85, order: M + 160, patient: M + 200, lf: M + 330, meds: M + 440, fee: TW + M - 60 };
  pg.drawRectangle({ x: M, y: y - 3, width: TW, height: 18, color: amber });
  t('Paid (ET)', rc.paid, helvB, 6.5, white);
  t('Sent (ET)', rc.sent, helvB, 6.5, white);
  t('Order #', rc.order, helvB, 7, white);
  t('Patient', rc.patient, helvB, 7, white);
  t('LF Order ID', rc.lf, helvB, 7, white);
  t('Medications', rc.meds, helvB, 7, white);
  t('Fee', rc.fee, helvB, 7, white);
  y -= 20;

  function drawRxH() {
    pg.drawRectangle({ x: M, y: y - 3, width: TW, height: 18, color: amber });
    t('Paid (ET)', rc.paid, helvB, 6.5, white);
    t('Sent (ET)', rc.sent, helvB, 6.5, white);
    t('Order #', rc.order, helvB, 7, white);
    t('Patient', rc.patient, helvB, 7, white);
    t('LF Order ID', rc.lf, helvB, 7, white);
    t('Medications', rc.meds, helvB, 7, white);
    t('Fee', rc.fee, helvB, 7, white);
    y -= 20;
  }

  for (let i = 0; i < invoice.lineItems.length; i++) {
    need(R + 4);
    if (y >= PH - M - 5) drawRxH();
    const li = invoice.lineItems[i];

    if (i % 2 === 0) {
      pg.drawRectangle({ x: M, y: y - 3, width: TW, height: R, color: amberBg });
    }
    if (i > 0) {
      pg.drawLine({ start: { x: M, y: y + R - 1 }, end: { x: PW - M, y: y + R - 1 }, thickness: 0.25, color: rgb(0.88, 0.88, 0.88) });
    }

    t(li.paidAt ? fmtDateTimeET(li.paidAt) : '-', rc.paid, sofia, 6.5, rgb(0.15, 0.55, 0.35));
    t(fmtDateTimeET(li.orderDate), rc.sent, sofia, 6.5);
    t(String(li.orderId), rc.order, sofia, 7);
    t(tr(li.patientName, 22), rc.patient, helvB, 7.5);
    t(li.lifefileOrderId ?? '-', rc.lf, sofia, 7, mid);
    t(tr(li.medications, 24), rc.meds, sofia, 7);
    t($(li.feeCents), rc.fee, helvB, 7.5, amber);
    y -= R;
  }

  // ── TOTAL ──
  y -= 10;
  need(40);
  pg.drawRectangle({ x: M, y: y - 8, width: TW, height: 30, color: amber });
  y += 2;
  t('INVOICE TOTAL', M + 12, helvB, 13, white);
  t($(invoice.totalCents), rc.fee - 20, helvB, 15, white);
  y -= 34;

  footer();
  return doc.save();
}

// ---------------------------------------------------------------------------
// Shared PDF helper
// ---------------------------------------------------------------------------

function sanitizeForPdf(text: string): string {
  if (!text) return '';
  return text
    .replace(/[\u02BB\u02BC\u02BD\u02BE\u02BF]/g, "'")
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u00A0/g, ' ')
    .replace(/\u2022/g, '*')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '');
}
