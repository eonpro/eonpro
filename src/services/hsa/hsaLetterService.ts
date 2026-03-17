/**
 * HSA/FSA Letter of Medical Necessity Generation Service
 *
 * Generates a PDF letter that patients can submit to their HSA/FSA provider
 * for reimbursement of medical expenses. The letter includes provider/merchant
 * info, patient info, service details, cost breakdown, a medical necessity
 * statement, and the prescribing provider's signature.
 */

import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont } from 'pdf-lib';
import { basePrisma } from '@/lib/db';
import { decryptPHI } from '@/lib/security/phi-encryption';
import { logger } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HsaLetterData {
  clinic: {
    name: string;
    practiceType: string;
    paymentProcessor: string;
  };
  provider: {
    fullName: string;
    signatureDataUrl: string | null;
  };
  patient: {
    fullName: string;
    dob: string;
    patientId: string;
  };
  service: {
    dateOfService: string;
    description: string;
    medication: string;
    prescribedBy: string;
  };
  cost: {
    amountPaid: string;
    paymentDate: string;
    invoiceNumber: string;
  };
}

// ---------------------------------------------------------------------------
// Clinic config: practice type + payment processor per clinic
// ---------------------------------------------------------------------------

const CLINIC_CONFIG: Record<string, { practiceType: string; paymentProcessor: string }> = {
  eonmeds: {
    practiceType: 'Telehealth Medical Provider',
    paymentProcessor: 'Stripe (via IntakeQ)',
  },
  eonpro: {
    practiceType: 'Telehealth Medical Provider',
    paymentProcessor: 'Stripe',
  },
  wellmedr: {
    practiceType: 'Telehealth Medical Provider',
    paymentProcessor: 'Stripe',
  },
  otmeds: {
    practiceType: 'Telehealth Medical Provider',
    paymentProcessor: 'Stripe',
  },
};

const DEFAULT_CLINIC_CONFIG = {
  practiceType: 'Medical Provider',
  paymentProcessor: 'Stripe',
};

// ---------------------------------------------------------------------------
// Medication-specific service descriptions
// ---------------------------------------------------------------------------

const MEDICATION_DESCRIPTIONS: Record<string, string> = {
  TIRZEPATIDE:
    'Medical weight loss treatment including provider evaluation and prescription for Tirzepatide/Glycine based on medical necessity.',
  SEMAGLUTIDE:
    'Medical weight loss treatment including provider evaluation and prescription for Semaglutide/Glycine based on medical necessity.',
  TESTOSTERONE:
    'Hormone replacement therapy including provider evaluation and prescription for Testosterone based on medical necessity.',
  SILDENAFIL:
    'Medical treatment including provider evaluation and prescription for Sildenafil based on medical necessity.',
  TADALAFIL:
    'Medical treatment including provider evaluation and prescription for Tadalafil based on medical necessity.',
};

const DEFAULT_DESCRIPTION =
  'Medical treatment including provider evaluation and prescription based on medical necessity.';

function getServiceDescription(medicationName: string): string {
  const upper = medicationName.toUpperCase();
  for (const [key, desc] of Object.entries(MEDICATION_DESCRIPTIONS)) {
    if (upper.includes(key)) return desc;
  }
  return DEFAULT_DESCRIPTION;
}

// ---------------------------------------------------------------------------
// PDF text helper (sanitize for WinAnsi encoding)
// ---------------------------------------------------------------------------

function sanitizeForPdf(text: string): string {
  if (!text) return text;
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

// ---------------------------------------------------------------------------
// PHI decryption helpers
// ---------------------------------------------------------------------------

function safeDecrypt(encrypted: string | null): string {
  if (!encrypted) return '';
  try {
    return decryptPHI(encrypted) ?? encrypted;
  } catch {
    return encrypted;
  }
}

function formatDob(dob: string | Date | null): string {
  if (!dob) return 'N/A';
  const d = typeof dob === 'string' ? new Date(dob) : dob;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function formatDate(date: Date | string | null): string {
  if (!date) return 'N/A';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// Data resolution
// ---------------------------------------------------------------------------

export async function resolveHsaLetterData(
  invoiceId: number,
  patientId: number
): Promise<HsaLetterData> {
  const invoice = await basePrisma.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true,
      patientId: true,
      clinicId: true,
      orderId: true,
      amountPaid: true,
      paidAt: true,
      stripeInvoiceNumber: true,
      status: true,
      description: true,
      metadata: true,
      items: {
        select: {
          description: true,
          product: { select: { name: true } },
        },
      },
    },
  });

  if (!invoice) {
    throw new Error('Invoice not found');
  }

  if (invoice.patientId !== patientId) {
    throw new Error('Invoice does not belong to this patient');
  }

  const patient = await basePrisma.patient.findUnique({
    where: { id: patientId },
    select: {
      id: true,
      patientId: true,
      firstName: true,
      lastName: true,
      dob: true,
      clinicId: true,
    },
  });

  if (!patient) {
    throw new Error('Patient not found');
  }

  const clinic = invoice.clinicId
    ? await basePrisma.clinic.findUnique({
        where: { id: invoice.clinicId },
        select: {
          id: true,
          name: true,
          subdomain: true,
          lifefilePracticeName: true,
        },
      })
    : null;

  let order: {
    id: number;
    createdAt: Date;
    providerId: number;
    rxs: Array<{ medName: string | null; medicationKey: string | null }>;
    provider: {
      firstName: string;
      lastName: string;
      titleLine: string | null;
      signatureDataUrl: string | null;
    };
  } | null = null;

  if (invoice.orderId) {
    order = await basePrisma.order.findUnique({
      where: { id: invoice.orderId },
      select: {
        id: true,
        createdAt: true,
        providerId: true,
        rxs: {
          select: { medName: true, medicationKey: true },
        },
        provider: {
          select: {
            firstName: true,
            lastName: true,
            titleLine: true,
            signatureDataUrl: true,
          },
        },
      },
    });
  }

  // Build data
  const clinicSubdomain = clinic?.subdomain ?? '';
  const clinicConfig = CLINIC_CONFIG[clinicSubdomain] ?? DEFAULT_CLINIC_CONFIG;
  const clinicDisplayName = clinic?.lifefilePracticeName || clinic?.name || 'Medical Provider';

  const providerName = order
    ? `${order.provider.firstName} ${order.provider.lastName}${order.provider.titleLine ? `, ${order.provider.titleLine}` : ', MD'}`
    : 'Provider';

  const decryptedFirst = safeDecrypt(patient.firstName);
  const decryptedLast = safeDecrypt(patient.lastName);
  const decryptedDob = safeDecrypt(patient.dob as string);

  const primaryMed = order?.rxs?.[0]?.medName || order?.rxs?.[0]?.medicationKey || '';
  const medicationDisplay = primaryMed || getMedicationFromInvoice(invoice);

  const serviceDescription = primaryMed
    ? getServiceDescription(primaryMed)
    : invoice.description || DEFAULT_DESCRIPTION;

  return {
    clinic: {
      name: clinicDisplayName,
      practiceType: clinicConfig.practiceType,
      paymentProcessor: clinicConfig.paymentProcessor,
    },
    provider: {
      fullName: providerName,
      signatureDataUrl: order?.provider?.signatureDataUrl ?? null,
    },
    patient: {
      fullName: `${decryptedFirst} ${decryptedLast}`,
      dob: formatDob(decryptedDob),
      patientId: patient.patientId || String(patient.id),
    },
    service: {
      dateOfService: formatDate(order?.createdAt ?? invoice.paidAt),
      description: serviceDescription,
      medication: medicationDisplay || 'Prescribed Medication',
      prescribedBy: providerName,
    },
    cost: {
      amountPaid: formatCurrency(invoice.amountPaid),
      paymentDate: formatDate(invoice.paidAt),
      invoiceNumber: invoice.stripeInvoiceNumber || `INV-${invoice.id}`,
    },
  };
}

function getMedicationFromInvoice(invoice: {
  description: string | null;
  metadata: any;
  items: Array<{ description: string; product: { name: string } | null }>;
}): string {
  if (invoice.items?.length > 0) {
    const productName = invoice.items[0].product?.name || invoice.items[0].description;
    if (productName) return productName;
  }
  if (invoice.metadata && typeof invoice.metadata === 'object') {
    const meta = invoice.metadata as Record<string, unknown>;
    if (meta.medicationType) return String(meta.medicationType);
    if (meta.product) return String(meta.product);
  }
  return '';
}

// ---------------------------------------------------------------------------
// PDF Generation
// ---------------------------------------------------------------------------

export async function generateHsaLetterPdf(data: HsaLetterData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const PAGE_W = 612;
  const PAGE_H = 792;
  const MARGIN = 60;
  const CONTENT_W = PAGE_W - MARGIN * 2;

  // --- Helpers ---
  const drawText = (
    page: PDFPage,
    text: string,
    x: number,
    y: number,
    opts: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb> } = {}
  ) => {
    page.drawText(sanitizeForPdf(text || ''), {
      x,
      y,
      size: opts.size ?? 10,
      font: opts.font ?? regular,
      color: opts.color ?? rgb(0, 0, 0),
    });
  };

  const drawLine = (page: PDFPage, y: number) => {
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE_W - MARGIN, y },
      thickness: 0.75,
      color: rgb(0.6, 0.6, 0.6),
    });
  };

  const drawSectionHeader = (page: PDFPage, title: string, y: number): number => {
    drawText(page, title, MARGIN, y, { size: 12, font: bold });
    return y - 20;
  };

  const drawField = (
    page: PDFPage,
    label: string,
    value: string,
    x: number,
    y: number
  ): number => {
    drawText(page, `${label}:`, x, y, { size: 10, font: bold });
    const labelW = bold.widthOfTextAtSize(sanitizeForPdf(`${label}:`), 10);
    drawText(page, value, x + labelW + 6, y, { size: 10 });
    return y - 16;
  };

  const wrapText = (text: string, maxWidth: number, font: PDFFont, size: number): string[] => {
    const sanitized = sanitizeForPdf(text || '');
    const words = sanitized.split(' ');
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
      const test = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(test, size) > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
    return lines;
  };

  // =========================================================================
  // PAGE 1
  // =========================================================================
  const page1 = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - 60;

  // Title
  drawText(page1, 'HSA / FSA Reimbursement Letter', MARGIN, y, { size: 16, font: bold });
  y -= 30;
  drawLine(page1, y);
  y -= 25;

  // --- Provider / Merchant Information ---
  y = drawSectionHeader(page1, 'Provider / Merchant Information', y);
  y = drawField(page1, 'Provider Name', data.clinic.name, MARGIN, y);
  y = drawField(page1, 'Rendering Provider', data.provider.fullName, MARGIN, y);
  y = drawField(page1, 'Practice Type', data.clinic.practiceType, MARGIN, y);
  y = drawField(page1, 'Payment Processor', data.clinic.paymentProcessor, MARGIN, y);

  y -= 10;
  drawLine(page1, y);
  y -= 25;

  // --- Patient Information ---
  y = drawSectionHeader(page1, 'Patient Information', y);
  y = drawField(page1, 'Patient Name', data.patient.fullName, MARGIN, y);
  y = drawField(page1, 'Date of Birth', data.patient.dob, MARGIN, y);
  y = drawField(page1, 'Patient ID', data.patient.patientId, MARGIN, y);

  y -= 10;
  drawLine(page1, y);
  y -= 25;

  // --- Service Information ---
  y = drawSectionHeader(page1, 'Service Information', y);
  y = drawField(page1, 'Date of Service', data.service.dateOfService, MARGIN, y);

  // Description (wrapped paragraph)
  drawText(page1, 'Description of Service / Purchase:', MARGIN, y, { size: 10, font: bold });
  y -= 16;
  const descLines = wrapText(data.service.description, CONTENT_W, regular, 10);
  for (const line of descLines) {
    drawText(page1, line, MARGIN, y, { size: 10 });
    y -= 14;
  }
  y -= 4;

  y = drawField(page1, 'Medication', data.service.medication, MARGIN, y);
  y = drawField(page1, 'Prescription Required', 'Yes', MARGIN, y);
  y = drawField(page1, 'Prescription Issued By', data.service.prescribedBy, MARGIN, y);

  // =========================================================================
  // PAGE 2
  // =========================================================================
  const page2 = doc.addPage([PAGE_W, PAGE_H]);
  y = PAGE_H - 60;

  // --- Cost Information ---
  y = drawSectionHeader(page2, 'Cost Information', y);
  y = drawField(page2, 'Amount Paid by Patient', data.cost.amountPaid, MARGIN, y);
  y = drawField(page2, 'Payment Date', data.cost.paymentDate, MARGIN, y);
  y = drawField(page2, 'Invoice Number', data.cost.invoiceNumber, MARGIN, y);

  y -= 10;
  drawLine(page2, y);
  y -= 25;

  // --- Medical Necessity Statement ---
  y = drawSectionHeader(page2, 'Medical Necessity Statement', y);
  const necessityText =
    'This service was provided pursuant to a medical evaluation and prescription by a licensed ' +
    'physician. The medication prescribed is intended for the treatment of a medical condition and ' +
    'qualifies as an eligible medical expense under IRS guidelines when prescribed by a licensed ' +
    'provider.';
  const necessityLines = wrapText(necessityText, CONTENT_W, regular, 10);
  for (const line of necessityLines) {
    drawText(page2, line, MARGIN, y, { size: 10 });
    y -= 14;
  }

  y -= 10;
  drawLine(page2, y);
  y -= 25;

  // --- Provider Attestation ---
  y = drawSectionHeader(page2, 'Provider Attestation', y);
  const attestText =
    'I certify that the above service was rendered to the named patient and that the charges reflect ' +
    'medically necessary healthcare services.';
  const attestLines = wrapText(attestText, CONTENT_W, regular, 10);
  for (const line of attestLines) {
    drawText(page2, line, MARGIN, y, { size: 10 });
    y -= 14;
  }
  y -= 10;

  // Signature
  drawText(page2, 'Provider Signature:', MARGIN, y, { size: 10, font: bold });
  y -= 8;

  if (data.provider.signatureDataUrl) {
    try {
      const prefix = 'data:image/png;base64,';
      const base64 = data.provider.signatureDataUrl.startsWith(prefix)
        ? data.provider.signatureDataUrl.replace(prefix, '')
        : data.provider.signatureDataUrl;
      const sigBytes = Buffer.from(base64, 'base64');
      const sigImage = await doc.embedPng(sigBytes);
      page2.drawImage(sigImage, { x: MARGIN, y: y - 50, width: 150, height: 50 });
      y -= 60;
    } catch (err) {
      logger.error('Failed to embed signature in HSA letter', { error: (err as Error).message });
      drawText(page2, '____________________', MARGIN, y - 20, { size: 12 });
      y -= 35;
    }
  } else {
    drawText(page2, '____________________', MARGIN, y - 20, { size: 12 });
    y -= 35;
  }

  y -= 4;
  y = drawField(page2, 'Provider Name', data.provider.fullName, MARGIN, y);
  y = drawField(page2, 'Date', data.service.dateOfService, MARGIN, y);

  // Save
  return doc.save();
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function generateHsaLetter(
  invoiceId: number,
  patientId: number
): Promise<{ pdf: Uint8Array; filename: string }> {
  const data = await resolveHsaLetterData(invoiceId, patientId);

  logger.info('Generating HSA/FSA letter', {
    invoiceId,
    patientId,
    clinic: data.clinic.name,
  });

  const pdf = await generateHsaLetterPdf(data);

  const safeName = sanitizeForPdf(data.patient.fullName).replace(/\s+/g, '_').toUpperCase();
  const safeClinic = sanitizeForPdf(data.clinic.name).replace(/\s+/g, '_').toUpperCase();
  const filename = `HSA_Letter_${safeClinic}_${safeName}.pdf`;

  return { pdf, filename };
}
