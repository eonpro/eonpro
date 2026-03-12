/**
 * WellMedR / Lifefile pharmacy invoice PDF parser.
 * Extracts header metadata and line-item details from the tabular invoice
 * format used by Logos Pharmacy / WellMedR.
 *
 * PHI: Parsed patient names are stored only in the database (encrypted at rest
 * by the service layer). Never log patient names or doctor names.
 */

import { logger } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParsedInvoiceHeader {
  pharmacyName: string | null;
  invoiceNumber: string | null;
  amountDueCents: number | null;
  payorId: string | null;
  billingProfileId: string | null;
  invoiceDate: Date | null;
}

export type InvoiceLineType = 'MEDICATION' | 'SUPPLY' | 'SHIPPING_CARRIER' | 'SHIPPING_FEE';

export interface ParsedInvoiceLineItem {
  lineNumber: number;
  lineType: InvoiceLineType;
  date: Date | null;
  lifefileOrderId: string | null;
  rxNumber: string | null;
  fillId: string | null;
  patientName: string | null;
  doctorName: string | null;
  description: string | null;
  medicationName: string | null;
  strength: string | null;
  form: string | null;
  vialSize: string | null;
  shippingMethod: string | null;
  quantity: number;
  unitPriceCents: number;
  discountCents: number;
  amountCents: number;
  orderSubtotalCents: number | null;
}

export interface ParsedInvoice {
  header: ParsedInvoiceHeader;
  lineItems: ParsedInvoiceLineItem[];
  totalCents: number;
  orderCount: number;
}

// ---------------------------------------------------------------------------
// Constants / regexes
// ---------------------------------------------------------------------------

const MAX_PDF_BYTES = 50 * 1024 * 1024; // 50 MB
const PARSE_TIMEOUT_MS = 30_000;

/** Page-break noise injected by the browser print-to-PDF */
const PAGE_BREAK_RE =
  /\d{1,2}\/\d{1,2}\/\d{2,4},\s+\d{1,2}:\d{2}\s+[AP]M\s+Invoice for Order #\d+\nhttps?:\/\/[^\n]+\n+-- \d+ of \d+ --\n*/g;

/** Date at line start: MM/DD/YYYY */
const DATE_RE = /^(\d{2}\/\d{2}\/\d{4})/;

/** Row starting with a date + order number + rx number (medication/supply line) */
const RX_LINE_RE = /^(\d{2}\/\d{2}\/\d{4})\s+(\d{6,12})\s+(\d{6,12})\s+/;

/** Row starting with date + order number but NO rx (carrier/shipping/subtotal) */
const ORDER_LINE_RE = /^(\d{2}\/\d{2}\/\d{4})\s+(\d{6,12})(?:\s+|$)/;

/** Subtotal row */
const SUBTOTAL_RE = /^Subtotal\s+\$\s*([\d,]+\.\d{2})/;

/** Grand total row */
const TOTAL_RE = /^TOTAL\s+\$\s*([\d,]+\.\d{2})/;

/** Dollar amount at end of a line (with optional leading whitespace/tab) */
const AMOUNT_TAIL_RE = /\$\s*([\d,]+\.\d{2})\s*$/;

/** Two dollar amounts at end (unitPrice + amount) */
const TWO_AMOUNTS_RE = /\$\s*([\d,]+\.\d{2})\s+\$\s*([\d,]+\.\d{2})\s*$/;

/** Three dollar amounts (unitPrice + discount + amount) */
const THREE_AMOUNTS_RE = /\$\s*([\d,]+\.\d{2})\s+\$\s*([\d,]+\.\d{2})\s+\$\s*([\d,]+\.\d{2})\s*$/;

/** Fill ID embedded in description */
const FILL_ID_RE = /\(Fill ID:\s*(\d+)\)/;

/** Formula ID embedded in description */
const FORMULA_ID_RE = /\(Formula ID:\s*(\d+)\)/;

/** Qty embedded in description: (Qty: N each) */
const QTY_DESC_RE = /\(Qty:\s*(\d+)\s*each\)/;

/** Vial size from description */
const VIAL_SIZE_RE = /\((\d+ML VIAL)\)/i;

/** Order shipping line: "Order #NNNN - SHIPPING_METHOD" */
const ORDER_SHIPPING_RE = /Order\s+#(\d+)\s*-\s*(.+)/;

/** WellMedR shipping fee: "WELLMEDR SHIPPING-N VIAL" */
const WELLMEDR_SHIPPING_RE = /WELLMEDR SHIPPING-?\s*\d*\s*VIAL/i;

/** Syringe/supply detection */
const SUPPLY_RE = /SYRINGES|ALCOHOL\s*PADS|Device\s+\d+G/i;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseDollarsToCents(s: string): number {
  return Math.round(parseFloat(s.replace(/,/g, '')) * 100);
}

function parseInvoiceDate(s: string): Date | null {
  const m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  return new Date(parseInt(m[3], 10), parseInt(m[1], 10) - 1, parseInt(m[2], 10));
}

function classifyLineType(description: string): InvoiceLineType {
  if (ORDER_SHIPPING_RE.test(description)) return 'SHIPPING_CARRIER';
  if (WELLMEDR_SHIPPING_RE.test(description)) return 'SHIPPING_FEE';
  if (SUPPLY_RE.test(description)) return 'SUPPLY';
  return 'MEDICATION';
}

function extractMedicationDetails(desc: string): {
  medicationName: string | null;
  strength: string | null;
  form: string | null;
  vialSize: string | null;
} {
  const vialMatch = desc.match(VIAL_SIZE_RE);
  const vialSize = vialMatch ? vialMatch[1].toUpperCase() : null;

  const medMatch = desc.match(
    /(SEMAGLUTIDE|TIRZEPATIDE|LIRAGLUTIDE|PHENTERMINE)[\/\w\s]*([\d.]+\/[\d.]+MG\/ML)/i
  );
  if (medMatch) {
    return {
      medicationName: medMatch[1].toUpperCase(),
      strength: medMatch[2].toUpperCase(),
      form: desc.includes('Injectable') ? 'Injectable' : desc.includes('SOLUTION') ? 'Solution' : null,
      vialSize,
    };
  }

  return { medicationName: null, strength: null, form: null, vialSize };
}

// ---------------------------------------------------------------------------
// PDF text extraction (same dual-strategy as quest-parser)
// ---------------------------------------------------------------------------

async function extractWithUnpdf(arrayBuffer: ArrayBuffer, timeout: number): Promise<string> {
  try {
    const { extractText } = await import('unpdf');
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('unpdf timeout')), timeout)
    );
    const result = await Promise.race([
      extractText(arrayBuffer, { mergePages: true }),
      timeoutPromise,
    ]);
    return result?.text ?? '';
  } catch (e) {
    logger.warn('unpdf extraction failed for invoice, trying fallback', {
      error: e instanceof Error ? e.message : String(e),
    });
    return '';
  }
}

async function extractWithPdfParse(buffer: Buffer, timeout: number): Promise<string> {
  try {
    const { PDFParse } = await import('pdf-parse');
    if (typeof PDFParse !== 'function') return '';
    const parser = new PDFParse({ data: buffer });
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('pdf-parse timeout')), timeout)
    );
    const result = await Promise.race([parser.getText(), timeoutPromise]);
    const text = result?.text ?? '';
    await parser.destroy().catch(() => {});
    return text;
  } catch (e) {
    logger.warn('pdf-parse extraction failed for invoice', {
      error: e instanceof Error ? e.message : String(e),
    });
    return '';
  }
}

async function extractText(buffer: Buffer): Promise<string> {
  if (buffer.length > MAX_PDF_BYTES) {
    throw new Error('Invoice PDF exceeds maximum size (50 MB).');
  }
  if (buffer.length === 0) {
    throw new Error('Invoice PDF file is empty.');
  }

  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  ) as ArrayBuffer;

  let text = await extractWithUnpdf(arrayBuffer, PARSE_TIMEOUT_MS);

  if (text.length < 200) {
    const fallbackText = await extractWithPdfParse(buffer, PARSE_TIMEOUT_MS);
    if (fallbackText.length > text.length) {
      text = fallbackText;
    }
  }

  if (!text || text.length < 200) {
    throw new Error(
      'Invoice PDF produced insufficient text. Ensure it is a WellMedR/Lifefile invoice (not a scanned image).'
    );
  }

  return text;
}

// ---------------------------------------------------------------------------
// Header parser
// ---------------------------------------------------------------------------

function parseHeader(text: string): ParsedInvoiceHeader {
  const header: ParsedInvoiceHeader = {
    pharmacyName: null,
    invoiceNumber: null,
    amountDueCents: null,
    payorId: null,
    billingProfileId: null,
    invoiceDate: null,
  };

  // Pharmacy name: first line of the PDF
  const firstLine = text.split('\n')[0]?.trim();
  if (firstLine && !firstLine.match(/^\d/)) {
    header.pharmacyName = firstLine;
  }

  // Invoice number
  const invoiceMatch = text.match(/Invoice\s*#(\d+)/);
  if (invoiceMatch) header.invoiceNumber = invoiceMatch[1];

  // Amount Due
  const amountDueMatch = text.match(/Amount\s*Due\s*\$\s*([\d,]+\.\d{2})/);
  if (amountDueMatch) header.amountDueCents = parseDollarsToCents(amountDueMatch[1]);

  // Payor ID
  const payorMatch = text.match(/Payor\s*ID\s*(\d+)/);
  if (payorMatch) header.payorId = payorMatch[1];

  // Billing Profile ID
  const bpMatch = text.match(/Billing\s*Profile\s*ID\s*(\d+)/i);
  if (bpMatch) header.billingProfileId = bpMatch[1];

  // Invoice date: first date in the table rows
  const dateMatch = text.match(/\n(\d{2}\/\d{2}\/\d{4})\s+\d{6,12}/);
  if (dateMatch) header.invoiceDate = parseInvoiceDate(dateMatch[1]);

  return header;
}

// ---------------------------------------------------------------------------
// Line-item parser
// ---------------------------------------------------------------------------

/**
 * Parse the cleaned text (page breaks removed) into an array of order blocks,
 * each block ending with a Subtotal line.
 */
function parseLineItems(text: string): { items: ParsedInvoiceLineItem[]; totalCents: number } {
  const cleanText = text.replace(PAGE_BREAK_RE, '\n');
  const lines = cleanText.split('\n');

  const items: ParsedInvoiceLineItem[] = [];
  let lineNumber = 0;
  let totalCents = 0;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();

    // Grand total
    const totalMatch = line.match(TOTAL_RE);
    if (totalMatch) {
      totalCents = parseDollarsToCents(totalMatch[1]);
      i++;
      continue;
    }

    // Subtotal — attach to the most recent line item for this order
    const subtotalMatch = line.match(SUBTOTAL_RE);
    if (subtotalMatch) {
      const subtotalCents = parseDollarsToCents(subtotalMatch[1]);
      // Find last item and set subtotal
      for (let j = items.length - 1; j >= 0; j--) {
        if (items[j].orderSubtotalCents === null) {
          items[j].orderSubtotalCents = subtotalCents;
          break;
        }
      }
      i++;
      continue;
    }

    // Lines starting with a date are data rows
    if (!DATE_RE.test(line)) {
      i++;
      continue;
    }

    // Check if this is a Rx/medication/supply line (date + order + rx)
    const rxMatch = line.match(RX_LINE_RE);
    if (rxMatch) {
      const dateStr = rxMatch[1];
      const orderId = rxMatch[2];
      const rxNum = rxMatch[3];

      // Collect the full description block: everything after the rx number
      // until we hit dollar amounts, plus continuation lines
      let descBlock = line.slice(rxMatch[0].length);
      let j = i + 1;

      // Continuation lines: lines that don't start with a date, subtotal, or total
      while (j < lines.length) {
        const nextLine = lines[j].trim();
        if (!nextLine) { j++; continue; }
        if (DATE_RE.test(nextLine) || SUBTOTAL_RE.test(nextLine) || TOTAL_RE.test(nextLine)) break;
        // Page-break remnants
        if (nextLine.startsWith('http') || /^-- \d+ of \d+ --/.test(nextLine)) { j++; continue; }
        descBlock += '\n' + nextLine;
        j++;
      }
      i = j;

      // Extract financial data from the end of the description block
      let unitPriceCents = 0;
      let discountCents = 0;
      let amountCents = 0;
      let quantity = 1;

      const threeMatch = descBlock.match(THREE_AMOUNTS_RE);
      const twoMatch = descBlock.match(TWO_AMOUNTS_RE);

      if (threeMatch) {
        unitPriceCents = parseDollarsToCents(threeMatch[1]);
        discountCents = parseDollarsToCents(threeMatch[2]);
        amountCents = parseDollarsToCents(threeMatch[3]);
      } else if (twoMatch) {
        unitPriceCents = parseDollarsToCents(twoMatch[1]);
        amountCents = parseDollarsToCents(twoMatch[2]);
      }

      // Extract quantity: look for a standalone digit before the dollar amounts
      const qtyFromDesc = descBlock.match(QTY_DESC_RE);
      const qtyBeforeDollar = descBlock.match(/\b(\d{1,3})\s+\$\s*[\d,]+\.\d{2}/);
      if (qtyBeforeDollar) {
        quantity = parseInt(qtyBeforeDollar[1], 10);
      } else if (qtyFromDesc) {
        quantity = parseInt(qtyFromDesc[1], 10);
      }

      // Extract fill ID
      const fillMatch = descBlock.match(FILL_ID_RE);
      const fillId = fillMatch ? fillMatch[1] : null;

      // Extract patient name — text between the rx number and the "RX NNNN" description
      let patientName: string | null = null;
      const afterRxNum = line.slice(rxMatch[0].length).trim();
      // Patient name is text before "RX " or before the first line break with "RX "
      const patNameMatch = afterRxNum.match(/^([A-Z][a-z]+(?:[-'][A-Z][a-z]+)?,\s*\n?\s*[A-Za-z]+(?:\s+[A-Za-z]+)*)/);
      if (patNameMatch) {
        patientName = patNameMatch[1].replace(/\n\s*/g, ' ').trim();
      }

      // Extract doctor name
      let doctorName: string | null = null;
      const docMatch = descBlock.match(
        /([A-Z][a-z]+(?:[-'][A-Z][a-z]+)?),\s*\n?\s*([A-Z][a-z]+)\s+\d+\s+\$/
      );
      if (docMatch) {
        doctorName = `${docMatch[1]}, ${docMatch[2]}`.trim();
      }

      // Classify
      const lineType = classifyLineType(descBlock);
      const medDetails =
        lineType === 'MEDICATION' ? extractMedicationDetails(descBlock) : { medicationName: null, strength: null, form: null, vialSize: null };

      lineNumber++;
      items.push({
        lineNumber,
        lineType,
        date: parseInvoiceDate(dateStr),
        lifefileOrderId: orderId,
        rxNumber: rxNum,
        fillId,
        patientName,
        doctorName,
        description: descBlock.replace(THREE_AMOUNTS_RE, '').replace(TWO_AMOUNTS_RE, '').trim().slice(0, 1000),
        medicationName: medDetails.medicationName,
        strength: medDetails.strength,
        form: medDetails.form,
        vialSize: medDetails.vialSize,
        shippingMethod: null,
        quantity,
        unitPriceCents,
        discountCents,
        amountCents,
        orderSubtotalCents: null,
      });
      continue;
    }

    // Order-level line (shipping carrier or WellMedR shipping fee)
    const orderMatch = line.match(ORDER_LINE_RE);
    if (orderMatch) {
      const dateStr = orderMatch[1];
      const orderId = orderMatch[2];
      const rest = line.slice(orderMatch[0].length).trim();

      // Collect continuation lines
      let descBlock = rest;
      let j = i + 1;
      while (j < lines.length) {
        const nextLine = lines[j].trim();
        if (!nextLine) { j++; continue; }
        if (DATE_RE.test(nextLine) || SUBTOTAL_RE.test(nextLine) || TOTAL_RE.test(nextLine)) break;
        if (nextLine.startsWith('http') || /^-- \d+ of \d+ --/.test(nextLine)) { j++; continue; }
        descBlock += '\n' + nextLine;
        j++;
      }
      i = j;

      // Collapse newlines for pattern matching (PDF wraps across lines)
      const descFlat = descBlock.replace(/\n/g, ' ');

      let unitPriceCents = 0;
      let amountCents = 0;
      let quantity = 1;

      const twoMatch = descFlat.match(TWO_AMOUNTS_RE);
      const singleMatch = descFlat.match(AMOUNT_TAIL_RE);

      if (twoMatch) {
        unitPriceCents = parseDollarsToCents(twoMatch[1]);
        amountCents = parseDollarsToCents(twoMatch[2]);
      } else if (singleMatch) {
        amountCents = parseDollarsToCents(singleMatch[1]);
      }

      const qtyMatch = descFlat.match(/\b(\d{1,3})\s+\$/);
      if (qtyMatch) quantity = parseInt(qtyMatch[1], 10);
      const shippingMatch = descFlat.match(ORDER_SHIPPING_RE);
      const isWellmedrShipping = WELLMEDR_SHIPPING_RE.test(descFlat);

      let lineType: InvoiceLineType = 'SHIPPING_CARRIER';
      let shippingMethod: string | null = null;

      if (shippingMatch) {
        shippingMethod = shippingMatch[2]
          .replace(/\s+\d+\s*\$.*$/, '')
          .trim();
        lineType = 'SHIPPING_CARRIER';
      } else if (isWellmedrShipping) {
        lineType = 'SHIPPING_FEE';
        shippingMethod = 'WELLMEDR SHIPPING';
      }

      lineNumber++;
      items.push({
        lineNumber,
        lineType,
        date: parseInvoiceDate(dateStr),
        lifefileOrderId: orderId,
        rxNumber: null,
        fillId: null,
        patientName: null,
        doctorName: null,
        description: descBlock.replace(TWO_AMOUNTS_RE, '').replace(AMOUNT_TAIL_RE, '').trim().slice(0, 500),
        medicationName: null,
        strength: null,
        form: null,
        vialSize: null,
        shippingMethod,
        quantity,
        unitPriceCents,
        discountCents: 0,
        amountCents,
        orderSubtotalCents: null,
      });
      continue;
    }

    i++;
  }

  return { items, totalCents };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a WellMedR/Lifefile pharmacy invoice PDF buffer into structured data.
 */
export async function parseWellmedrInvoicePdf(buffer: Buffer): Promise<ParsedInvoice> {
  const text = await extractText(buffer);

  const header = parseHeader(text);
  const { items, totalCents } = parseLineItems(text);

  const uniqueOrders = new Set(items.map((item) => item.lifefileOrderId).filter(Boolean));

  logger.info('WellMedR invoice parsed', {
    invoiceNumber: header.invoiceNumber,
    lineItemCount: items.length,
    orderCount: uniqueOrders.size,
    totalCents,
  });

  return {
    header,
    lineItems: items,
    totalCents,
    orderCount: uniqueOrders.size,
  };
}

/**
 * Parse raw extracted text (for testing without PDF extraction).
 */
export function parseWellmedrInvoiceText(text: string): ParsedInvoice {
  const header = parseHeader(text);
  const { items, totalCents } = parseLineItems(text);
  const uniqueOrders = new Set(items.map((item) => item.lifefileOrderId).filter(Boolean));

  return {
    header,
    lineItems: items,
    totalCents,
    orderCount: uniqueOrders.size,
  };
}
