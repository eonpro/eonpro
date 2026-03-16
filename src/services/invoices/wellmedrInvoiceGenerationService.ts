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
import {
  WELLMEDR_CLINIC_SUBDOMAIN,
  WELLMEDR_PRICED_PRODUCT_IDS,
  PRESCRIPTION_SERVICE_FEE_CENTS,
  SINGLE_VIAL_SHIPPING_FEE_CENTS,
  OVERNIGHT_SHIPPING_FEE_CENTS,
  getProductPrice,
  isOvernightShipping,
} from '@/lib/invoices/wellmedr-pricing';

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

  const periodStart = new Date(date);
  periodStart.setUTCHours(0, 0, 0, 0);

  const periodEnd = endDate ? new Date(endDate) : new Date(date);
  periodEnd.setUTCHours(23, 59, 59, 999);

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
// PDF Export (using pdf-lib)
// ---------------------------------------------------------------------------

export async function generatePharmacyPDF(invoice: PharmacyInvoice): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');

  const doc = await PDFDocument.create();
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const PAGE_W = 792;
  const PAGE_H = 612;
  const MARGIN = 40;
  const LINE_H = 13;

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  function addNewPage() {
    page = doc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN;
  }

  function ensureSpace(needed: number) {
    if (y - needed < MARGIN + 20) addNewPage();
  }

  function drawText(text: string, x: number, font = fontRegular, size = 8, color = rgb(0.1, 0.1, 0.1)) {
    const safe = sanitizeForPdf(text);
    page.drawText(safe, { x, y, size, font, color });
  }

  function truncate(text: string, maxLen: number): string {
    return text.length > maxLen ? text.slice(0, maxLen - 2) + '..' : text;
  }

  // Title
  drawText('PHARMACY PRODUCTS INVOICE', MARGIN, fontBold, 14, rgb(0.06, 0.45, 0.31));
  y -= 18;
  drawText(`Clinic: ${invoice.clinicName}`, MARGIN, fontRegular, 10);
  y -= 14;
  drawText(
    `Period: ${new Date(invoice.periodStart).toLocaleDateString('en-US')} - ${new Date(invoice.periodEnd).toLocaleDateString('en-US')}`,
    MARGIN,
    fontRegular,
    9,
  );
  y -= 12;
  drawText(
    `Orders: ${invoice.orderCount}  |  Vials: ${invoice.vialCount}  |  Generated: ${new Date().toLocaleString('en-US')}`,
    MARGIN,
    fontRegular,
    8,
    rgb(0.4, 0.4, 0.4),
  );
  y -= 20;

  // Medication table
  drawText('MEDICATION LINE ITEMS', MARGIN, fontBold, 10);
  y -= 16;

  const cols = [MARGIN, MARGIN + 60, MARGIN + 100, MARGIN + 200, MARGIN + 310, MARGIN + 420, MARGIN + 500, MARGIN + 545, MARGIN + 580, MARGIN + 620, MARGIN + 670];

  function drawMedHeader() {
    page.drawRectangle({ x: MARGIN, y: y - 2, width: PAGE_W - 2 * MARGIN, height: LINE_H + 2, color: rgb(0.93, 0.93, 0.93) });
    drawText('Date', cols[0] + 2, fontBold, 7);
    drawText('Order', cols[1] + 2, fontBold, 7);
    drawText('Patient', cols[2] + 2, fontBold, 7);
    drawText('Provider', cols[3] + 2, fontBold, 7);
    drawText('Medication', cols[4] + 2, fontBold, 7);
    drawText('Strength', cols[5] + 2, fontBold, 7);
    drawText('Vial', cols[6] + 2, fontBold, 7);
    drawText('Qty', cols[7] + 2, fontBold, 7);
    drawText('Unit $', cols[8] + 2, fontBold, 7);
    drawText('Total', cols[9] + 2, fontBold, 7);
    y -= LINE_H + 3;
  }

  drawMedHeader();

  for (let i = 0; i < invoice.lineItems.length; i++) {
    ensureSpace(LINE_H + 2);
    if (y >= PAGE_H - MARGIN - 5) drawMedHeader();

    const li = invoice.lineItems[i];
    if (i % 2 === 0) {
      page.drawRectangle({ x: MARGIN, y: y - 2, width: PAGE_W - 2 * MARGIN, height: LINE_H, color: rgb(0.97, 0.97, 0.97) });
    }

    drawText(new Date(li.orderDate).toLocaleDateString('en-US'), cols[0] + 2, fontRegular, 7);
    drawText(String(li.orderId), cols[1] + 2, fontRegular, 7);
    drawText(truncate(li.patientName, 18), cols[2] + 2, fontRegular, 7);
    drawText(truncate(li.providerName, 18), cols[3] + 2, fontRegular, 7);
    drawText(truncate(li.medicationName, 18), cols[4] + 2, fontRegular, 7);
    drawText(li.strength, cols[5] + 2, fontRegular, 7);
    drawText(li.vialSize, cols[6] + 2, fontRegular, 7);
    drawText(String(li.quantity), cols[7] + 2, fontRegular, 7);
    drawText(`$${centsToDisplay(li.unitPriceCents)}`, cols[8] + 2, fontRegular, 7);
    drawText(`$${centsToDisplay(li.lineTotalCents)}`, cols[9] + 2, fontRegular, 7);
    y -= LINE_H;
  }

  y -= 6;
  ensureSpace(30);
  drawText(`Medications Subtotal: $${centsToDisplay(invoice.subtotalMedicationsCents)}`, MARGIN + 500, fontBold, 9);
  y -= 16;

  // Shipping surcharges
  if (invoice.shippingLineItems.length > 0) {
    ensureSpace(40);
    drawText('SHIPPING SURCHARGES', MARGIN, fontBold, 10);
    y -= 16;

    page.drawRectangle({ x: MARGIN, y: y - 2, width: PAGE_W - 2 * MARGIN, height: LINE_H + 2, color: rgb(0.93, 0.93, 0.93) });
    drawText('Date', MARGIN + 2, fontBold, 7);
    drawText('Order', MARGIN + 62, fontBold, 7);
    drawText('Patient', MARGIN + 102, fontBold, 7);
    drawText('Description', MARGIN + 250, fontBold, 7);
    drawText('Fee', MARGIN + 500, fontBold, 7);
    y -= LINE_H + 3;

    for (const sl of invoice.shippingLineItems) {
      ensureSpace(LINE_H + 2);
      drawText(new Date(sl.orderDate).toLocaleDateString('en-US'), MARGIN + 2, fontRegular, 7);
      drawText(String(sl.orderId), MARGIN + 62, fontRegular, 7);
      drawText(truncate(sl.patientName, 22), MARGIN + 102, fontRegular, 7);
      drawText(sl.description, MARGIN + 250, fontRegular, 7);
      drawText(`$${centsToDisplay(sl.feeCents)}`, MARGIN + 500, fontRegular, 7);
      y -= LINE_H;
    }

    y -= 6;
    ensureSpace(20);
    drawText(`Shipping Subtotal: $${centsToDisplay(invoice.subtotalShippingCents)}`, MARGIN + 500, fontBold, 9);
    y -= 16;
  }

  // Grand Total
  ensureSpace(30);
  y -= 4;
  page.drawRectangle({ x: MARGIN + 480, y: y - 4, width: PAGE_W - MARGIN - (MARGIN + 480), height: 22, color: rgb(0.06, 0.45, 0.31) });
  drawText(`TOTAL: $${centsToDisplay(invoice.totalCents)}`, MARGIN + 490, fontBold, 12, rgb(1, 1, 1));
  y -= 30;

  // Footer
  page.drawText(
    sanitizeForPdf(`EONPro Platform - WellMedR Pharmacy Invoice - Confidential - ${new Date().toISOString()}`),
    { x: MARGIN, y: 15, size: 7, font: fontRegular, color: rgb(0.6, 0.6, 0.6) },
  );

  return doc.save();
}

export async function generatePrescriptionServicesPDF(invoice: PrescriptionServicesInvoice): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');

  const doc = await PDFDocument.create();
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const PAGE_W = 792;
  const PAGE_H = 612;
  const MARGIN = 40;
  const LINE_H = 13;

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  function addNewPage() {
    page = doc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN;
  }

  function ensureSpace(needed: number) {
    if (y - needed < MARGIN + 20) addNewPage();
  }

  function drawText(text: string, x: number, font = fontRegular, size = 8, color = rgb(0.1, 0.1, 0.1)) {
    page.drawText(sanitizeForPdf(text), { x, y, size, font, color });
  }

  function truncate(text: string, maxLen: number): string {
    return text.length > maxLen ? text.slice(0, maxLen - 2) + '..' : text;
  }

  // Title
  drawText('PRESCRIPTION MEDICAL SERVICES INVOICE', MARGIN, fontBold, 14, rgb(0.06, 0.45, 0.31));
  y -= 18;
  drawText(`Clinic: ${invoice.clinicName}`, MARGIN, fontRegular, 10);
  y -= 14;
  drawText(
    `Period: ${new Date(invoice.periodStart).toLocaleDateString('en-US')} - ${new Date(invoice.periodEnd).toLocaleDateString('en-US')}`,
    MARGIN,
    fontRegular,
    9,
  );
  y -= 12;
  drawText(
    `Prescriptions: ${invoice.totalPrescriptions}  |  Fee Per Rx: $${centsToDisplay(invoice.feePerPrescriptionCents)}  |  Generated: ${new Date().toLocaleString('en-US')}`,
    MARGIN,
    fontRegular,
    8,
    rgb(0.4, 0.4, 0.4),
  );
  y -= 20;

  // Table
  drawText('PRESCRIPTION LINE ITEMS', MARGIN, fontBold, 10);
  y -= 16;

  const cols = [MARGIN, MARGIN + 60, MARGIN + 100, MARGIN + 210, MARGIN + 320, MARGIN + 430, MARGIN + 650];

  function drawHeader() {
    page.drawRectangle({ x: MARGIN, y: y - 2, width: PAGE_W - 2 * MARGIN, height: LINE_H + 2, color: rgb(0.93, 0.93, 0.93) });
    drawText('Date', cols[0] + 2, fontBold, 7);
    drawText('Order', cols[1] + 2, fontBold, 7);
    drawText('Patient', cols[2] + 2, fontBold, 7);
    drawText('Provider', cols[3] + 2, fontBold, 7);
    drawText('Medications', cols[4] + 2, fontBold, 7);
    drawText('Service Fee', cols[5] + 2, fontBold, 7);
    y -= LINE_H + 3;
  }

  drawHeader();

  for (let i = 0; i < invoice.lineItems.length; i++) {
    ensureSpace(LINE_H + 2);
    if (y >= PAGE_H - MARGIN - 5) drawHeader();

    const li = invoice.lineItems[i];
    if (i % 2 === 0) {
      page.drawRectangle({ x: MARGIN, y: y - 2, width: PAGE_W - 2 * MARGIN, height: LINE_H, color: rgb(0.97, 0.97, 0.97) });
    }

    drawText(new Date(li.orderDate).toLocaleDateString('en-US'), cols[0] + 2, fontRegular, 7);
    drawText(String(li.orderId), cols[1] + 2, fontRegular, 7);
    drawText(truncate(li.patientName, 18), cols[2] + 2, fontRegular, 7);
    drawText(truncate(li.providerName, 18), cols[3] + 2, fontRegular, 7);
    drawText(truncate(li.medications, 35), cols[4] + 2, fontRegular, 7);
    drawText(`$${centsToDisplay(li.feeCents)}`, cols[5] + 2, fontRegular, 7);
    y -= LINE_H;
  }

  // Grand Total
  y -= 10;
  ensureSpace(30);
  page.drawRectangle({ x: MARGIN + 480, y: y - 4, width: PAGE_W - MARGIN - (MARGIN + 480), height: 22, color: rgb(0.06, 0.45, 0.31) });
  drawText(`TOTAL: $${centsToDisplay(invoice.totalCents)}`, MARGIN + 490, fontBold, 12, rgb(1, 1, 1));
  y -= 30;

  // Footer
  page.drawText(
    sanitizeForPdf(`EONPro Platform - WellMedR Prescription Services Invoice - Confidential - ${new Date().toISOString()}`),
    { x: MARGIN, y: 15, size: 7, font: fontRegular, color: rgb(0.6, 0.6, 0.6) },
  );

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
