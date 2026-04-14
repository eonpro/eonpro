/**
 * HSA/FSA Letter of Medical Necessity Generation Service
 *
 * Generates a formal Letter of Medical Necessity PDF matching the standard
 * HealthEquity / HSA provider format. Includes clinic logo, IRS explanation,
 * patient info, diagnosed condition, recommended treatment, duration,
 * medical necessity attestation, and provider signature block.
 */

import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont } from 'pdf-lib';
import { basePrisma } from '@/lib/db';
import { decryptPHI } from '@/lib/security/phi-encryption';
import { logger } from '@/lib/logger';
import { BRAND } from '@/lib/constants/brand-assets';
import * as fs from 'fs/promises';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HsaLetterData {
  clinic: {
    name: string;
  };
  provider: {
    fullName: string;
    licenseNumber: string | null;
    address: string;
    phone: string;
    signatureDataUrl: string | null;
  };
  patient: {
    fullName: string;
  };
  diagnosedCondition: string;
  recommendedTreatment: string;
  durationOfTreatment: string;
  dateOfService: string;
  amountPaid: string;
}

// ---------------------------------------------------------------------------
// Medication → diagnosis + treatment mapping
// ---------------------------------------------------------------------------

const MEDICATION_CLINICAL: Record<string, { condition: string; treatment: string }> = {
  TIRZEPATIDE: {
    condition:
      'Obesity / Overweight (BMI >= 27) with weight-related comorbidities. ' +
      'Patient has been evaluated and diagnosed with a medical condition requiring pharmacological intervention for weight management.',
    treatment:
      'Tirzepatide (GLP-1/GIP receptor agonist) subcutaneous injection as prescribed, ' +
      'in conjunction with a reduced-calorie diet and increased physical activity. ' +
      'Includes provider evaluation, prescription, and ongoing monitoring.',
  },
  SEMAGLUTIDE: {
    condition:
      'Obesity / Overweight (BMI >= 27) with weight-related comorbidities. ' +
      'Patient has been evaluated and diagnosed with a medical condition requiring pharmacological intervention for weight management.',
    treatment:
      'Semaglutide (GLP-1 receptor agonist) subcutaneous injection as prescribed, ' +
      'in conjunction with a reduced-calorie diet and increased physical activity. ' +
      'Includes provider evaluation, prescription, and ongoing monitoring.',
  },
  TESTOSTERONE: {
    condition:
      'Hypogonadism / Low Testosterone. Patient has been evaluated and diagnosed with ' +
      'clinically low testosterone levels requiring hormone replacement therapy.',
    treatment:
      'Testosterone Cypionate intramuscular injection as prescribed for hormone replacement therapy. ' +
      'Includes provider evaluation, prescription, and ongoing lab monitoring.',
  },
  SILDENAFIL: {
    condition:
      'Erectile Dysfunction. Patient has been evaluated and diagnosed with erectile dysfunction ' +
      'requiring pharmacological treatment.',
    treatment:
      'Sildenafil (PDE5 inhibitor) oral tablet as prescribed. ' +
      'Includes provider evaluation and prescription.',
  },
  TADALAFIL: {
    condition:
      'Erectile Dysfunction. Patient has been evaluated and diagnosed with erectile dysfunction ' +
      'requiring pharmacological treatment.',
    treatment:
      'Tadalafil (PDE5 inhibitor) oral tablet as prescribed. ' +
      'Includes provider evaluation and prescription.',
  },
};

const DEFAULT_CLINICAL = {
  condition:
    'Patient has been evaluated and diagnosed with a medical condition ' +
    'requiring pharmacological treatment as prescribed by a licensed physician.',
  treatment:
    'Prescription medication as directed by physician. ' +
    'Includes provider evaluation, prescription, and monitoring.',
};

function getClinicalInfo(medicationName: string): { condition: string; treatment: string } {
  const upper = medicationName.toUpperCase();
  for (const [key, info] of Object.entries(MEDICATION_CLINICAL)) {
    if (upper.includes(key)) return info;
  }
  return DEFAULT_CLINICAL;
}

// ---------------------------------------------------------------------------
// Sanitization + helpers
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

function safeDecrypt(encrypted: string | null): string {
  if (!encrypted) return '';
  try {
    return decryptPHI(encrypted) ?? encrypted;
  } catch {
    return encrypted;
  }
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
// Logo loading (same pattern as wellmedrInvoiceGenerationService)
// ---------------------------------------------------------------------------

let cachedLogo: Uint8Array | null = null;

async function loadAsset(relPath: string): Promise<Uint8Array | null> {
  try {
    return new Uint8Array(await fs.readFile(path.join(process.cwd(), 'public', relPath)));
  } catch {
    /* fall through */
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL;
  if (baseUrl) {
    try {
      const url = baseUrl.startsWith('http')
        ? `${baseUrl}/${relPath}`
        : `https://${baseUrl}/${relPath}`;
      const res = await fetch(url);
      if (res.ok) return new Uint8Array(await res.arrayBuffer());
    } catch {
      /* fall through */
    }
  }

  return null;
}

async function loadLogo(): Promise<Uint8Array | null> {
  if (cachedLogo) return cachedLogo;
  cachedLogo = await loadAsset(BRAND.logos.eonproLogoPdf.replace(/^\//, ''));
  return cachedLogo;
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

  if (!invoice) throw new Error('Invoice not found');
  if (invoice.patientId !== patientId) throw new Error('Invoice does not belong to this patient');

  const patient = await basePrisma.patient.findUnique({
    where: { id: patientId },
    select: { id: true, firstName: true, lastName: true, clinicId: true },
  });
  if (!patient) throw new Error('Patient not found');

  const clinic = invoice.clinicId
    ? await basePrisma.clinic.findUnique({
        where: { id: invoice.clinicId },
        select: {
          name: true,
          subdomain: true,
          lifefilePracticeName: true,
          lifefilePracticeAddress: true,
          lifefilePracticePhone: true,
        },
      })
    : null;

  let order: {
    createdAt: Date;
    rxs: Array<{ medName: string | null; medicationKey: string | null }>;
    provider: {
      firstName: string;
      lastName: string;
      titleLine: string | null;
      licenseNumber: string | null;
      signatureDataUrl: string | null;
    };
  } | null = null;

  if (invoice.orderId) {
    order = await basePrisma.order.findUnique({
      where: { id: invoice.orderId },
      select: {
        createdAt: true,
        rxs: { select: { medName: true, medicationKey: true } },
        provider: {
          select: {
            firstName: true,
            lastName: true,
            titleLine: true,
            licenseNumber: true,
            signatureDataUrl: true,
          },
        },
      },
    });
  }

  const EONPRO_ADDRESS = '401 Jackson St Suite 2340-K23, Tampa, FL 33602';
  const EONPRO_PHONE = '+1-813-213-0301';

  const clinicName = clinic?.lifefilePracticeName || clinic?.name || 'Medical Provider';
  const providerName = order
    ? `${order.provider.firstName} ${order.provider.lastName}, MD`
    : 'Provider';

  const decryptedFirst = safeDecrypt(patient.firstName);
  const decryptedLast = safeDecrypt(patient.lastName);

  const primaryMed = order?.rxs?.[0]?.medName || order?.rxs?.[0]?.medicationKey || '';
  const medName = primaryMed || getMedicationFromInvoice(invoice);
  const clinical = getClinicalInfo(medName);

  return {
    clinic: { name: clinicName },
    provider: {
      fullName: providerName,
      licenseNumber: order?.provider?.licenseNumber ?? null,
      address: EONPRO_ADDRESS,
      phone: EONPRO_PHONE,
      signatureDataUrl: order?.provider?.signatureDataUrl ?? null,
    },
    patient: { fullName: `${decryptedFirst} ${decryptedLast}` },
    diagnosedCondition: clinical.condition,
    recommendedTreatment: clinical.treatment,
    durationOfTreatment: '12 months',
    dateOfService: formatDate(order?.createdAt ?? invoice.paidAt),
    amountPaid: formatCurrency(invoice.amountPaid),
  };
}

function getMedicationFromInvoice(invoice: {
  description: string | null;
  metadata: any;
  items: Array<{ description: string; product: { name: string } | null }>;
}): string {
  if (invoice.items?.length > 0) {
    const name = invoice.items[0].product?.name || invoice.items[0].description;
    if (name) return name;
  }
  if (invoice.metadata && typeof invoice.metadata === 'object') {
    const meta = invoice.metadata as Record<string, unknown>;
    if (meta.medicationType) return String(meta.medicationType);
    if (meta.product) return String(meta.product);
  }
  return '';
}

// ---------------------------------------------------------------------------
// PDF Generation — HealthEquity Letter of Medical Necessity style
// ---------------------------------------------------------------------------

export async function generateHsaLetterPdf(data: HsaLetterData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const PW = 612;
  const PH = 792;
  const M = 50; // margin
  const CW = PW - 2 * M; // content width
  const INNER = 8; // padding inside boxes

  // Colors
  const black = rgb(0, 0, 0);
  const darkGray = rgb(0.2, 0.2, 0.2);
  const lineGray = rgb(0.55, 0.55, 0.55);
  const fillBeige = rgb(0.99, 0.95, 0.9);

  // Load logo
  let logoImage: Awaited<ReturnType<typeof doc.embedPng>> | null = null;
  try {
    const logoBytes = await loadLogo();
    logoImage = logoBytes ? await doc.embedPng(logoBytes) : null;
  } catch {
    /* skip logo */
  }

  // --- Helpers ---
  const txt = (
    page: PDFPage,
    text: string,
    x: number,
    y: number,
    opts: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb> } = {}
  ) => {
    page.drawText(sanitizeForPdf(text || ''), {
      x,
      y,
      size: opts.size ?? 9.5,
      font: opts.font ?? regular,
      color: opts.color ?? darkGray,
    });
  };

  const wrapText = (text: string, maxW: number, font: PDFFont, size: number): string[] => {
    const sanitized = sanitizeForPdf(text || '');
    const words = sanitized.split(' ');
    const lines: string[] = [];
    let cur = '';
    for (const w of words) {
      const test = cur ? `${cur} ${w}` : w;
      if (font.widthOfTextAtSize(test, size) > maxW && cur) {
        lines.push(cur);
        cur = w;
      } else {
        cur = test;
      }
    }
    if (cur) lines.push(cur);
    return lines;
  };

  const drawBox = (page: PDFPage, x: number, y: number, w: number, h: number) => {
    page.drawRectangle({
      x,
      y: y - h,
      width: w,
      height: h,
      borderColor: black,
      borderWidth: 1,
    });
  };

  const drawBoxHeader = (page: PDFPage, title: string, x: number, y: number, w: number): number => {
    const headerH = 22;
    page.drawRectangle({
      x,
      y: y - headerH,
      width: w,
      height: headerH,
      color: rgb(0.92, 0.92, 0.92),
      borderColor: black,
      borderWidth: 1,
    });
    txt(page, title, x + INNER, y - 15, { size: 11, font: bold, color: black });
    return y - headerH;
  };

  const drawFieldLine = (page: PDFPage, x: number, y: number, w: number) => {
    page.drawLine({
      start: { x, y: y - 2 },
      end: { x: x + w, y: y - 2 },
      thickness: 0.5,
      color: fillBeige,
    });
  };

  const drawFilledLine = (page: PDFPage, x: number, y: number, w: number, h: number = 16) => {
    page.drawRectangle({
      x,
      y: y - h + 2,
      width: w,
      height: h,
      color: fillBeige,
    });
  };

  // =========================================================================
  // Single page layout
  // =========================================================================
  const page = doc.addPage([PW, PH]);
  let y = PH - 45;

  // --- Header: Title + Logo ---
  txt(page, 'HSA Letter of Medical Necessity', M, y, { size: 14, font: bold, color: black });

  if (logoImage) {
    const naturalW = logoImage.width;
    const naturalH = logoImage.height;
    const targetH = 40;
    const scale = targetH / naturalH;
    const logoW = naturalW * scale;
    page.drawImage(logoImage, { x: PW - M - logoW, y: y - 12, width: logoW, height: targetH });
  }

  y -= 35;

  // =========================================================================
  // Section 1: Letter of Medical Necessity
  // =========================================================================
  const sec1H = 128;
  const sec1Top = y;
  y = drawBoxHeader(page, 'Letter of Medical Necessity', M, y, CW);
  drawBox(page, M, sec1Top, CW, sec1H);

  const innerX = M + INNER;
  const innerW = CW - 2 * INNER;
  y -= 14;

  const irsText =
    'Under Internal Revenue Service (IRS) rules, some health care services and products are only eligible for ' +
    'reimbursement from your health savings account (HSA) when your doctor or other licensed health care provider ' +
    "certifies that they are medically necessary. Your provider must indicate your (or your qualified dependent's) specific " +
    'diagnosed medical condition, the specific treatment needed, the length of treatment, and how this treatment will ' +
    'alleviate your medical condition.';
  const irsLines = wrapText(irsText, innerW, regular, 8.5);
  for (const line of irsLines) {
    txt(page, line, innerX, y, { size: 8.5 });
    y -= 11;
  }
  y -= 4;

  const convText =
    'This letter has been provided in case you are audited by the IRS and need to provide documentation that the ' +
    'health care services and products you purchased were medically necessary. You do NOT need to submit this form to ' +
    'your HSA provider. It is provided for your convenience.';
  const convLines = wrapText(convText, innerW, regular, 8.5);
  for (const line of convLines) {
    txt(page, line, innerX, y, { size: 8.5 });
    y -= 11;
  }

  // =========================================================================
  // Section 2: Patient Information
  // =========================================================================
  y = sec1Top - sec1H - 12;
  const sec2Top = y;
  const sec2H = 400;
  y = drawBoxHeader(page, 'Patient Information', M, y, CW);
  drawBox(page, M, sec2Top, CW, sec2H);

  // Patient Name field
  y -= 16;
  txt(page, 'Patient Name', innerX, y, { size: 9.5 });
  const nameX = innerX + regular.widthOfTextAtSize('Patient Name', 9.5) + 6;
  txt(page, data.patient.fullName, nameX, y, { size: 9.5, font: bold, color: black });
  const nameLineX = nameX - 2;
  drawFieldLine(page, nameLineX, y, innerW - (nameLineX - innerX));

  // Instruction text
  y -= 22;
  const formText =
    'This form should be completed by the attending physician to confirm treatment is necessary for a specific medical ' +
    'condition.';
  const formLines = wrapText(formText, innerW, regular, 9);
  for (const line of formLines) {
    txt(page, line, innerX, y, { size: 9 });
    y -= 13;
  }

  // Diagnosed condition
  y -= 8;
  txt(page, 'Describe the diagnosed medical condition being treated:', innerX, y, {
    size: 9.5,
    color: black,
  });
  y -= 16;
  const condLines = wrapText(data.diagnosedCondition, innerW - 4, regular, 9);
  for (const line of condLines) {
    drawFilledLine(page, innerX, y, innerW);
    txt(page, line, innerX + 3, y, { size: 9 });
    y -= 16;
  }

  // Recommended treatment
  y -= 10;
  txt(page, 'Describe the recommended treatment:', innerX, y, { size: 9.5, color: black });
  y -= 16;
  const txLines = wrapText(data.recommendedTreatment, innerW - 4, regular, 9);
  for (const line of txLines) {
    drawFilledLine(page, innerX, y, innerW);
    txt(page, line, innerX + 3, y, { size: 9 });
    y -= 16;
  }

  // Duration of treatment
  y -= 10;
  txt(page, 'Duration of treatment (not to exceed 12 months):', innerX, y, {
    size: 9.5,
    color: black,
  });
  const durLabelW = regular.widthOfTextAtSize(
    'Duration of treatment (not to exceed 12 months):',
    9.5
  );
  txt(page, data.durationOfTreatment, innerX + durLabelW + 8, y, {
    size: 9.5,
    font: bold,
    color: black,
  });
  drawFieldLine(page, innerX + durLabelW + 4, y, innerW - durLabelW - 4);

  // Amount Paid
  y -= 20;
  txt(page, 'Amount Paid by Patient:', innerX, y, { size: 9.5, color: black });
  const amtLabelW = regular.widthOfTextAtSize('Amount Paid by Patient:', 9.5);
  txt(page, data.amountPaid, innerX + amtLabelW + 8, y, { size: 9.5, font: bold, color: black });
  drawFieldLine(page, innerX + amtLabelW + 4, y, innerW - amtLabelW - 4);

  // Attestation paragraph
  y -= 24;
  const attestText =
    'This treatment is medically necessary to treat the specific medical condition described above. This treatment is not ' +
    'in any way for general health and is not for cosmetic purposes to improve appearance.';
  const attestLines = wrapText(attestText, innerW, regular, 9);
  for (const line of attestLines) {
    txt(page, line, innerX, y, { size: 9, color: black });
    y -= 13;
  }

  // --- Provider grid at bottom of section 2 ---
  y -= 12;
  const gridY = y;
  const halfW = CW / 2;

  // Row 1: Physician Name | Signature
  page.drawLine({
    start: { x: M, y: gridY },
    end: { x: M + CW, y: gridY },
    thickness: 0.5,
    color: lineGray,
  });
  const row1H = 38;
  page.drawLine({
    start: { x: M + halfW, y: gridY },
    end: { x: M + halfW, y: gridY - row1H },
    thickness: 0.5,
    color: lineGray,
  });
  page.drawLine({
    start: { x: M, y: gridY - row1H },
    end: { x: M + CW, y: gridY - row1H },
    thickness: 0.5,
    color: lineGray,
  });

  txt(page, 'Print Physician Name', M + INNER, gridY - 12, { size: 8, color: lineGray });
  txt(page, data.provider.fullName, M + INNER, gridY - 28, { size: 10, font: bold, color: black });

  txt(page, 'Signature of Attending Physician', M + halfW + INNER, gridY - 12, {
    size: 8,
    color: lineGray,
  });

  // Embed provider signature
  if (data.provider.signatureDataUrl) {
    try {
      const prefix = 'data:image/png;base64,';
      const b64 = data.provider.signatureDataUrl.startsWith(prefix)
        ? data.provider.signatureDataUrl.replace(prefix, '')
        : data.provider.signatureDataUrl;
      const sigBytes = Buffer.from(b64, 'base64');
      const sigImg = await doc.embedPng(sigBytes);
      page.drawImage(sigImg, {
        x: M + halfW + INNER + 10,
        y: gridY - row1H + 4,
        width: 120,
        height: 28,
      });
    } catch (err) {
      logger.error('Failed to embed signature in HSA letter', { error: (err as Error).message });
    }
  }

  // Row 2: License Number | Date
  const row2Top = gridY - row1H;
  const row2H = 32;
  page.drawLine({
    start: { x: M + halfW, y: row2Top },
    end: { x: M + halfW, y: row2Top - row2H },
    thickness: 0.5,
    color: lineGray,
  });
  page.drawLine({
    start: { x: M, y: row2Top - row2H },
    end: { x: M + CW, y: row2Top - row2H },
    thickness: 0.5,
    color: lineGray,
  });

  txt(page, 'Provider License Number', M + INNER, row2Top - 12, { size: 8, color: lineGray });
  txt(page, data.provider.licenseNumber || '', M + INNER, row2Top - 25, {
    size: 9.5,
    color: black,
  });

  txt(page, 'Date', M + halfW + INNER, row2Top - 12, { size: 8, color: lineGray });
  txt(page, data.dateOfService, M + halfW + INNER, row2Top - 25, { size: 9.5, color: black });

  // Row 3: Address | Phone
  const row3Top = row2Top - row2H;
  const row3H = 32;
  page.drawLine({
    start: { x: M + halfW, y: row3Top },
    end: { x: M + halfW, y: row3Top - row3H },
    thickness: 0.5,
    color: lineGray,
  });
  page.drawLine({
    start: { x: M, y: row3Top - row3H },
    end: { x: M + CW, y: row3Top - row3H },
    thickness: 0.5,
    color: lineGray,
  });

  txt(page, 'Provider Address', M + INNER, row3Top - 12, { size: 8, color: lineGray });
  txt(page, data.provider.address || '', M + INNER, row3Top - 25, { size: 9, color: black });

  txt(page, 'Provider Phone Number', M + halfW + INNER, row3Top - 12, { size: 8, color: lineGray });
  txt(page, data.provider.phone || '', M + halfW + INNER, row3Top - 25, {
    size: 9.5,
    color: black,
  });

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

  logger.info('Generating HSA/FSA letter', { invoiceId, patientId, clinic: data.clinic.name });

  const pdf = await generateHsaLetterPdf(data);

  const safeName = sanitizeForPdf(data.patient.fullName).replace(/\s+/g, '_').toUpperCase();
  const safeClinic = sanitizeForPdf(data.clinic.name).replace(/\s+/g, '_').toUpperCase();
  const filename = `HSA_Letter_${safeClinic}_${safeName}.pdf`;

  return { pdf, filename };
}
