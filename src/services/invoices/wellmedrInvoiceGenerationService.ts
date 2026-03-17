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

  const orders = await basePrisma.order.findMany({
    where: {
      clinicId,
      createdAt: { gte: periodStart, lte: periodEnd },
      cancelledAt: null,
      fulfillmentChannel: 'lifefile',
      status: { notIn: ['error', 'cancelled', 'declined'] },
    },
    include: {
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

  logger.info('WellMedR invoice generation: orders loaded', {
    clinicId,
    date,
    endDate: endDate ?? date,
    orderCount: orders.length,
  });

  const pharmacyLineItems: PharmacyLineItem[] = [];
  const shippingLineItems: ShippingLineItem[] = [];
  const rxServiceLineItems: PrescriptionServiceLineItem[] = [];

  let subtotalMedicationsCents = 0;
  let subtotalShippingCents = 0;
  let totalVialCount = 0;

  for (const order of orders) {
    const patientName = order.patient
      ? formatPatientName(order.patient)
      : `Patient #${order.patientId}`;

    const providerName = order.provider
      ? `${order.provider.lastName}, ${order.provider.firstName}`
      : `Provider #${order.providerId}`;

    const orderDate = order.createdAt.toISOString();

    // --- Pharmacy Products ---
    let orderVialCount = 0;
    let orderMedTotalCents = 0;

    for (const rx of order.rxs) {
      const product = getProductPrice(rx.medicationKey);
      if (!product) continue;

      const qty = parseInt(rx.quantity, 10) || 1;
      orderVialCount += qty;
      const lineTotalCents = product.priceCents * qty;
      orderMedTotalCents += lineTotalCents;

      pharmacyLineItems.push({
        orderId: order.id,
        lifefileOrderId: order.lifefileOrderId,
        orderDate,
        patientName,
        patientId: order.patientId,
        providerName,
        providerId: order.providerId,
        medicationName: product.name,
        strength: product.strength,
        vialSize: product.vialSize,
        medicationKey: rx.medicationKey,
        quantity: qty,
        unitPriceCents: product.priceCents,
        lineTotalCents,
      });
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
      orderCount: orders.length,
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
// PDF Export (using pdf-lib) — Branded design with EONPro logo
// ---------------------------------------------------------------------------

import path from 'path';
import fs from 'fs/promises';
import { BRAND } from '@/lib/constants/brand-assets';

let cachedLogo: Uint8Array | null = null;

async function loadLogo(): Promise<Uint8Array | null> {
  if (cachedLogo) return cachedLogo;
  try {
    const logoPath = path.join(process.cwd(), 'public', BRAND.logos.eonproLogoPdf.replace(/^\//, ''));
    cachedLogo = new Uint8Array(await fs.readFile(logoPath));
    return cachedLogo;
  } catch {
    return null;
  }
}

const PRIMARY = { r: 0.06, g: 0.45, b: 0.31 };
const ACCENT_BG = { r: 0.96, g: 0.98, b: 0.97 };

function fmtDateTimeET(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: CLINIC_TZ,
  });
}

export async function generatePharmacyPDF(invoice: PharmacyInvoice): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  const fontR = await doc.embedFont(StandardFonts.Helvetica);
  const fontB = await doc.embedFont(StandardFonts.HelveticaBold);

  const logoBytes = await loadLogo();
  const logo = logoBytes ? await doc.embedPng(logoBytes) : null;

  const PW = 792;
  const PH = 612;
  const M = 44;
  const ROW_H = 14;
  const TABLE_W = PW - 2 * M;

  let pg = doc.addPage([PW, PH]);
  let y = PH - M;
  let pageNum = 1;

  function newPage() {
    drawFooter();
    pg = doc.addPage([PW, PH]);
    y = PH - M;
    pageNum++;
  }

  function need(h: number) { if (y - h < M + 25) newPage(); }

  function txt(t: string, x: number, font = fontR, size = 8, color = rgb(0.15, 0.15, 0.15)) {
    pg.drawText(sanitizeForPdf(t), { x, y, size, font, color });
  }

  function trunc(t: string, max: number) { return t.length > max ? t.slice(0, max - 1) + '..' : t; }

  function drawFooter() {
    pg.drawLine({ start: { x: M, y: M - 5 }, end: { x: PW - M, y: M - 5 }, thickness: 0.5, color: rgb(0.85, 0.85, 0.85) });
    pg.drawText(sanitizeForPdf(`EONPro Platform  |  WellMedR Pharmacy Invoice  |  Confidential  |  Page ${pageNum}`), {
      x: M, y: M - 16, size: 7, font: fontR, color: rgb(0.55, 0.55, 0.55),
    });
  }

  // ── HEADER ──
  if (logo) {
    const scale = 32 / logo.height;
    pg.drawImage(logo, { x: M, y: y - 8, width: logo.width * scale, height: 32 });
  }
  txt('PHARMACY PRODUCTS INVOICE', M + (logo ? 140 : 0), fontB, 16, rgb(PRIMARY.r, PRIMARY.g, PRIMARY.b));
  y -= 20;

  pg.drawLine({ start: { x: M, y }, end: { x: PW - M, y }, thickness: 2, color: rgb(PRIMARY.r, PRIMARY.g, PRIMARY.b) });
  y -= 18;

  // Info row
  txt(`Clinic: ${invoice.clinicName}`, M, fontB, 10);
  txt(
    `Period: ${new Date(invoice.periodStart).toLocaleDateString('en-US')} - ${new Date(invoice.periodEnd).toLocaleDateString('en-US')}`,
    PW / 2,
    fontR,
    9,
  );
  y -= 14;
  txt(`Orders: ${invoice.orderCount}   |   Vials: ${invoice.vialCount}`, M, fontR, 9, rgb(0.4, 0.4, 0.4));
  txt(`Generated: ${new Date().toLocaleString('en-US')}`, PW / 2, fontR, 8, rgb(0.4, 0.4, 0.4));
  y -= 22;

  // ── MEDICATION TABLE ──
  pg.drawRectangle({ x: M, y: y - 2, width: TABLE_W, height: 18, color: rgb(PRIMARY.r, PRIMARY.g, PRIMARY.b) });
  const hdrColor = rgb(1, 1, 1);
  const c = [M + 4, M + 58, M + 118, M + 250, M + 370, M + 470, M + 530, M + 570, M + 620, M + 670];
  txt('Date/Time (ET)', c[0], fontB, 6.5, hdrColor);
  txt('Order #', c[1], fontB, 7, hdrColor);
  txt('Patient', c[2], fontB, 7, hdrColor);
  txt('LF Order ID', c[3], fontB, 7, hdrColor);
  txt('Medication', c[4], fontB, 7, hdrColor);
  txt('Strength', c[5], fontB, 7, hdrColor);
  txt('Vial', c[6], fontB, 7, hdrColor);
  txt('Qty', c[7], fontB, 7, hdrColor);
  txt('Unit $', c[8], fontB, 7, hdrColor);
  txt('Total', c[9], fontB, 7, hdrColor);
  y -= 20;

  function drawMedHeader() {
    pg.drawRectangle({ x: M, y: y - 2, width: TABLE_W, height: 18, color: rgb(PRIMARY.r, PRIMARY.g, PRIMARY.b) });
    txt('Date/Time (ET)', c[0], fontB, 6.5, hdrColor);
    txt('Order #', c[1], fontB, 7, hdrColor);
    txt('Patient', c[2], fontB, 7, hdrColor);
    txt('LF Order ID', c[3], fontB, 7, hdrColor);
    txt('Medication', c[4], fontB, 7, hdrColor);
    txt('Strength', c[5], fontB, 7, hdrColor);
    txt('Vial', c[6], fontB, 7, hdrColor);
    txt('Qty', c[7], fontB, 7, hdrColor);
    txt('Unit $', c[8], fontB, 7, hdrColor);
    txt('Total', c[9], fontB, 7, hdrColor);
    y -= 20;
  }

  let prevOrderId = -1;

  for (let i = 0; i < invoice.lineItems.length; i++) {
    need(ROW_H + 6);
    if (y >= PH - M - 5) drawMedHeader();

    const li = invoice.lineItems[i];

    if (li.orderId !== prevOrderId && prevOrderId !== -1) {
      pg.drawLine({ start: { x: M, y: y + ROW_H - 1 }, end: { x: PW - M, y: y + ROW_H - 1 }, thickness: 0.8, color: rgb(0.78, 0.78, 0.78) });
      y -= 3;
      need(ROW_H + 4);
    }
    prevOrderId = li.orderId;

    if (i % 2 === 0) {
      pg.drawRectangle({ x: M, y: y - 2, width: TABLE_W, height: ROW_H, color: rgb(ACCENT_BG.r, ACCENT_BG.g, ACCENT_BG.b) });
    }

    txt(fmtDateTimeET(li.orderDate), c[0], fontR, 6.5);
    txt(String(li.orderId), c[1], fontR, 7);
    txt(trunc(li.patientName, 20), c[2], fontB, 7);
    txt(li.lifefileOrderId ?? '-', c[3], fontR, 7, rgb(0.4, 0.4, 0.4));
    txt(trunc(li.medicationName, 16), c[4], fontR, 7);
    txt(li.strength, c[5], fontR, 7);
    txt(li.vialSize, c[6], fontR, 7);
    txt(String(li.quantity), c[7], fontR, 7);
    txt(`$${centsToDisplay(li.unitPriceCents)}`, c[8], fontR, 7);
    txt(`$${centsToDisplay(li.lineTotalCents)}`, c[9], fontB, 7, rgb(PRIMARY.r, PRIMARY.g, PRIMARY.b));
    y -= ROW_H;
  }

  // Medications subtotal
  y -= 6;
  need(20);
  pg.drawLine({ start: { x: M + 500, y: y + 12 }, end: { x: PW - M, y: y + 12 }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
  txt('Medications Subtotal:', M + 500, fontB, 9);
  txt(`$${centsToDisplay(invoice.subtotalMedicationsCents)}`, c[9], fontB, 9, rgb(PRIMARY.r, PRIMARY.g, PRIMARY.b));
  y -= 18;

  // ── SHIPPING SURCHARGES ──
  if (invoice.shippingLineItems.length > 0) {
    need(50);
    y -= 6;
    pg.drawRectangle({ x: M, y: y - 2, width: TABLE_W, height: 18, color: rgb(0.95, 0.92, 0.85) });
    txt('SHIPPING SURCHARGES', M + 4, fontB, 8, rgb(0.5, 0.35, 0.1));
    y -= 20;

    pg.drawRectangle({ x: M, y: y - 2, width: TABLE_W, height: 15, color: rgb(0.93, 0.93, 0.93) });
    txt('Date', M + 4, fontB, 7, rgb(0.3, 0.3, 0.3));
    txt('Order #', M + 62, fontB, 7, rgb(0.3, 0.3, 0.3));
    txt('Patient', M + 120, fontB, 7, rgb(0.3, 0.3, 0.3));
    txt('Description', M + 280, fontB, 7, rgb(0.3, 0.3, 0.3));
    txt('Fee', M + 530, fontB, 7, rgb(0.3, 0.3, 0.3));
    y -= 17;

    for (const sl of invoice.shippingLineItems) {
      need(ROW_H + 2);
      txt(fmtDateTimeET(sl.orderDate), M + 4, fontR, 6.5);
      txt(String(sl.orderId), M + 62, fontR, 7);
      txt(trunc(sl.patientName, 24), M + 120, fontR, 7);
      txt(sl.description, M + 280, fontR, 7);
      txt(`$${centsToDisplay(sl.feeCents)}`, M + 530, fontR, 7);
      y -= ROW_H;
    }

    y -= 4;
    need(16);
    txt('Shipping Subtotal:', M + 500, fontB, 9);
    txt(`$${centsToDisplay(invoice.subtotalShippingCents)}`, c[9], fontB, 9, rgb(0.5, 0.35, 0.1));
    y -= 18;
  }

  // ── GRAND TOTAL ──
  need(36);
  y -= 6;
  pg.drawRectangle({ x: M, y: y - 6, width: TABLE_W, height: 28, color: rgb(PRIMARY.r, PRIMARY.g, PRIMARY.b) });
  y -= 1;
  txt('INVOICE TOTAL', M + 10, fontB, 12, rgb(1, 1, 1));
  txt(`$${centsToDisplay(invoice.totalCents)}`, c[9] - 10, fontB, 14, rgb(1, 1, 1));
  y -= 30;

  drawFooter();
  return doc.save();
}

export async function generatePrescriptionServicesPDF(invoice: PrescriptionServicesInvoice): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  const fontR = await doc.embedFont(StandardFonts.Helvetica);
  const fontB = await doc.embedFont(StandardFonts.HelveticaBold);

  const logoBytes = await loadLogo();
  const logo = logoBytes ? await doc.embedPng(logoBytes) : null;

  const PW = 792;
  const PH = 612;
  const M = 44;
  const ROW_H = 14;
  const TABLE_W = PW - 2 * M;

  let pg = doc.addPage([PW, PH]);
  let y = PH - M;
  let pageNum = 1;

  function newPage() {
    drawFooter();
    pg = doc.addPage([PW, PH]);
    y = PH - M;
    pageNum++;
  }

  function need(h: number) { if (y - h < M + 25) newPage(); }

  function txt(t: string, x: number, font = fontR, size = 8, color = rgb(0.15, 0.15, 0.15)) {
    pg.drawText(sanitizeForPdf(t), { x, y, size, font, color });
  }

  function trunc(t: string, max: number) { return t.length > max ? t.slice(0, max - 1) + '..' : t; }

  function drawFooter() {
    pg.drawLine({ start: { x: M, y: M - 5 }, end: { x: PW - M, y: M - 5 }, thickness: 0.5, color: rgb(0.85, 0.85, 0.85) });
    pg.drawText(sanitizeForPdf(`EONPro Platform  |  WellMedR Rx Services Invoice  |  Confidential  |  Page ${pageNum}`), {
      x: M, y: M - 16, size: 7, font: fontR, color: rgb(0.55, 0.55, 0.55),
    });
  }

  const AMBER = { r: 0.72, g: 0.49, b: 0.07 };

  // ── HEADER ──
  if (logo) {
    const scale = 32 / logo.height;
    pg.drawImage(logo, { x: M, y: y - 8, width: logo.width * scale, height: 32 });
  }
  txt('PRESCRIPTION MEDICAL SERVICES INVOICE', M + (logo ? 140 : 0), fontB, 15, rgb(AMBER.r, AMBER.g, AMBER.b));
  y -= 20;
  pg.drawLine({ start: { x: M, y }, end: { x: PW - M, y }, thickness: 2, color: rgb(AMBER.r, AMBER.g, AMBER.b) });
  y -= 18;

  txt(`Clinic: ${invoice.clinicName}`, M, fontB, 10);
  txt(
    `Period: ${new Date(invoice.periodStart).toLocaleDateString('en-US')} - ${new Date(invoice.periodEnd).toLocaleDateString('en-US')}`,
    PW / 2,
    fontR,
    9,
  );
  y -= 14;
  txt(`Prescriptions: ${invoice.totalPrescriptions}   |   Fee Per Rx: $${centsToDisplay(invoice.feePerPrescriptionCents)}`, M, fontR, 9, rgb(0.4, 0.4, 0.4));
  txt(`Generated: ${new Date().toLocaleString('en-US')}`, PW / 2, fontR, 8, rgb(0.4, 0.4, 0.4));
  y -= 22;

  // ── TABLE ──
  const rxC = [M + 4, M + 58, M + 118, M + 260, M + 370, M + 580];

  pg.drawRectangle({ x: M, y: y - 2, width: TABLE_W, height: 18, color: rgb(AMBER.r, AMBER.g, AMBER.b) });
  const hc = rgb(1, 1, 1);
  txt('Date/Time (ET)', rxC[0], fontB, 6.5, hc);
  txt('Order #', rxC[1], fontB, 7, hc);
  txt('Patient', rxC[2], fontB, 7, hc);
  txt('LF Order ID', rxC[3], fontB, 7, hc);
  txt('Medications', rxC[4], fontB, 7, hc);
  txt('Service Fee', rxC[5], fontB, 7, hc);
  y -= 20;

  function drawRxHeader() {
    pg.drawRectangle({ x: M, y: y - 2, width: TABLE_W, height: 18, color: rgb(AMBER.r, AMBER.g, AMBER.b) });
    txt('Date/Time (ET)', rxC[0], fontB, 6.5, hc);
    txt('Order #', rxC[1], fontB, 7, hc);
    txt('Patient', rxC[2], fontB, 7, hc);
    txt('LF Order ID', rxC[3], fontB, 7, hc);
    txt('Medications', rxC[4], fontB, 7, hc);
    txt('Service Fee', rxC[5], fontB, 7, hc);
    y -= 20;
  }

  for (let i = 0; i < invoice.lineItems.length; i++) {
    need(ROW_H + 4);
    if (y >= PH - M - 5) drawRxHeader();

    const li = invoice.lineItems[i];

    if (i > 0) {
      pg.drawLine({ start: { x: M, y: y + ROW_H }, end: { x: PW - M, y: y + ROW_H }, thickness: 0.3, color: rgb(0.85, 0.85, 0.85) });
    }

    if (i % 2 === 0) {
      pg.drawRectangle({ x: M, y: y - 2, width: TABLE_W, height: ROW_H, color: rgb(0.99, 0.97, 0.93) });
    }

    txt(fmtDateTimeET(li.orderDate), rxC[0], fontR, 6.5);
    txt(String(li.orderId), rxC[1], fontR, 7);
    txt(trunc(li.patientName, 22), rxC[2], fontB, 7);
    txt(li.lifefileOrderId ?? '-', rxC[3], fontR, 7, rgb(0.4, 0.4, 0.4));
    txt(trunc(li.medications, 32), rxC[4], fontR, 7);
    txt(`$${centsToDisplay(li.feeCents)}`, rxC[5], fontB, 7, rgb(AMBER.r, AMBER.g, AMBER.b));
    y -= ROW_H;
  }

  // ── GRAND TOTAL ──
  y -= 10;
  need(36);
  pg.drawRectangle({ x: M, y: y - 6, width: TABLE_W, height: 28, color: rgb(AMBER.r, AMBER.g, AMBER.b) });
  y -= 1;
  txt('INVOICE TOTAL', M + 10, fontB, 12, rgb(1, 1, 1));
  txt(`$${centsToDisplay(invoice.totalCents)}`, rxC[5] - 10, fontB, 14, rgb(1, 1, 1));
  y -= 30;

  drawFooter();
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
