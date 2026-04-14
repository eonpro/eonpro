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
    /(SEMAGLUTIDE|TIRZEPATIDE|LIRAGLUTIDE|PHENTERMINE)[\/\w\s,]*([\d.]+\/[\d.]+MG\/ML)/i
  );
  if (medMatch) {
    return {
      medicationName: medMatch[1].toUpperCase(),
      strength: medMatch[2].toUpperCase(),
      form: desc.includes('Injectable')
        ? 'Injectable'
        : desc.includes('SOLUTION')
          ? 'Solution'
          : null,
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

/**
 * On Vercel serverless, PDF text extraction often produces text without proper
 * line breaks — table rows run together. This function re-inserts newlines
 * before recognizable patterns so the line-by-line parser works correctly.
 */
function normalizeTextLineBreaks(text: string): string {
  // If the text already has a healthy number of newlines, it's fine
  const lineCount = (text.match(/\n/g) || []).length;
  if (lineCount > 20) return text;

  logger.info('Invoice text has few newlines, normalizing', { lineCount, textLen: text.length });

  let normalized = text;

  // Insert newlines before date patterns that start a table row: MM/DD/YYYY followed by an order number
  normalized = normalized.replace(/(?<!\n)\s*(\d{2}\/\d{2}\/\d{4})\s+(\d{6,12})\s/g, '\n$1 $2 ');

  // Insert newlines before Subtotal
  normalized = normalized.replace(/(?<!\n)\s*(Subtotal\s+\$)/g, '\n$1');

  // Insert newlines before TOTAL (grand total)
  normalized = normalized.replace(/(?<!\n)\s*(TOTAL\s+\$)/g, '\n$1');

  // Insert newlines before page break patterns
  normalized = normalized.replace(
    /(?<!\n)\s*(\d{1,2}\/\d{1,2}\/\d{2,4},\s+\d{1,2}:\d{2}\s+[AP]M\s+Invoice for Order)/g,
    '\n$1'
  );

  // Insert newlines before "-- N of N --"
  normalized = normalized.replace(/(?<!\n)\s*(-- \d+ of \d+ --)/g, '\n$1');

  return normalized;
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

  // Normalize line breaks for serverless environments
  text = normalizeTextLineBreaks(text);

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

  // Pharmacy name: extract from known patterns or first short line
  const pharmacyMatch = text.match(/^([A-Z][A-Za-z\s]+Pharmacy)/m);
  if (pharmacyMatch) {
    header.pharmacyName = pharmacyMatch[1].trim();
  } else {
    const firstLine = text.split('\n')[0]?.trim();
    if (firstLine && firstLine.length < 100 && !firstLine.match(/^\d/)) {
      header.pharmacyName = firstLine;
    }
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
  const dateMatch = text.match(/(?:^|\n)(\d{2}\/\d{2}\/\d{4})\s+\d{6,12}/m);
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
        if (!nextLine) {
          j++;
          continue;
        }
        if (DATE_RE.test(nextLine) || SUBTOTAL_RE.test(nextLine) || TOTAL_RE.test(nextLine)) break;
        // Page-break remnants
        if (nextLine.startsWith('http') || /^-- \d+ of \d+ --/.test(nextLine)) {
          j++;
          continue;
        }
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
      const patNameMatch = afterRxNum.match(
        /^([A-Z][a-z]+(?:[-'][A-Z][a-z]+)?,\s*\n?\s*[A-Za-z]+(?:\s+[A-Za-z]+)*)/
      );
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
        lineType === 'MEDICATION'
          ? extractMedicationDetails(descBlock)
          : { medicationName: null, strength: null, form: null, vialSize: null };

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
        description: descBlock
          .replace(THREE_AMOUNTS_RE, '')
          .replace(TWO_AMOUNTS_RE, '')
          .trim()
          .slice(0, 1000),
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
        if (!nextLine) {
          j++;
          continue;
        }
        if (DATE_RE.test(nextLine) || SUBTOTAL_RE.test(nextLine) || TOTAL_RE.test(nextLine)) break;
        if (nextLine.startsWith('http') || /^-- \d+ of \d+ --/.test(nextLine)) {
          j++;
          continue;
        }
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
        shippingMethod = shippingMatch[2].replace(/\s+\d+\s*\$.*$/, '').trim();
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
        description: descBlock
          .replace(TWO_AMOUNTS_RE, '')
          .replace(AMOUNT_TAIL_RE, '')
          .trim()
          .slice(0, 500),
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

// ---------------------------------------------------------------------------
// CSV Parser
// ---------------------------------------------------------------------------

/**
 * Parse CSV row with robust handling for broken quoting (e.g., 5/16" in
 * syringe descriptions that breaks Google Sheets CSV quoting).
 *
 * Strategy: parse columns from the RIGHT side first (dollar amounts are
 * always the last 2 columns), then split the remaining left part.
 */
function parseCsvRowRobust(line: string): string[] {
  // First, try standard CSV parsing
  const standardResult = parseCsvRowStandard(line);

  // Validate: the last column should look like a dollar amount or be empty/numeric
  // for data rows (not header). If it does, the standard parse worked.
  const lastCol = standardResult[standardResult.length - 1]?.trim() ?? '';
  const secondLast = standardResult[standardResult.length - 2]?.trim() ?? '';
  if (
    standardResult.length >= 4 &&
    (lastCol.match(/^\$?[\d,.]+$/) ||
      lastCol === '' ||
      lastCol === '0' ||
      lastCol.match(/^Amount/i))
  ) {
    return standardResult;
  }

  // Standard parse failed (likely due to broken quoting). Use right-to-left approach:
  // Find the last 3 comma-separated numeric/dollar fields from the right.
  const parts = line.split(',');
  if (parts.length < 4) return standardResult;

  // Work from the right: Amount, Unit Price, Qty are the last 3 fields
  const amountStr = parts[parts.length - 1]?.trim();
  const priceStr = parts[parts.length - 2]?.trim();
  const qtyStr = parts[parts.length - 3]?.trim();

  // If the last 3 fields look like Amount/Price/Qty, reconstruct
  if (priceStr.match(/^\$?[\d,.]+$/) && amountStr.match(/^\$?[\d,.]+$/)) {
    const leftParts = parts.slice(0, parts.length - 3);
    const leftText = leftParts.join(',');

    // From the left: first field is Order (digits), rest is Patient + Description merged
    const orderMatch = leftText.match(/^"?(\d{6,12})"?\s*,\s*(.*)/s);
    if (orderMatch) {
      const orderId = orderMatch[1];
      const remaining = orderMatch[2].replace(/^"|"$/g, '');

      // Split remaining into Patient and Description at the first "RX " or "Order #" or "WELLMEDR"
      const descSplit =
        remaining.match(/^(.*?),\s*((?:RX |Order #|WELLMEDR|SYRINGES).*)$/s) ??
        remaining.match(/^(.*?),\s*(".*")$/s);

      if (descSplit) {
        return [
          orderId,
          descSplit[1].replace(/^"|"$/g, '').trim(),
          descSplit[2].replace(/^"|"$/g, '').trim(),
          qtyStr,
          priceStr,
          amountStr,
        ];
      }

      return [orderId, '', remaining.replace(/^"|"$/g, '').trim(), qtyStr, priceStr, amountStr];
    }
  }

  return standardResult;
}

function parseCsvRowStandard(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

function parseCsvDollar(s: string): number {
  if (!s) return 0;
  const cleaned = s.replace(/[$,\s"]/g, '');
  const val = parseFloat(cleaned);
  return isNaN(val) ? 0 : Math.round(val * 100);
}

/**
 * Reassemble CSV lines that were split by newlines inside quoted fields.
 * Google Sheets exports multi-line cell content within quotes, but splitting
 * by \n breaks those lines apart. This function joins them back.
 *
 * Strategy: a data row starts with a number (order ID) or known keywords
 * (Subtotal, $). Lines that don't start with these are continuations
 * of the previous line's quoted field.
 */
function reassembleCsvLines(csvText: string): string[] {
  const physicalLines = csvText.split(/\r?\n/);
  const logicalLines: string[] = [];

  for (let i = 0; i < physicalLines.length; i++) {
    const line = physicalLines[i];
    if (!line.trim()) continue;

    // A logical CSV row starts with: a digit (order ID), "Order" (header),
    // "Subtotal", a dollar sign, or is the header row
    const isRowStart = /^\s*(\d{5,}|"?\d{5,}|Order\b|Subtotal|"\$|\$)/i.test(line);

    if (isRowStart || logicalLines.length === 0) {
      logicalLines.push(line);
    } else {
      // Continuation of previous line's multi-line field
      logicalLines[logicalLines.length - 1] += ' ' + line.trim();
    }
  }

  return logicalLines;
}

/**
 * Parse a WellMedR invoice CSV (exported from Google Sheets or similar).
 *
 * Expected columns:
 *   Order | Patient | Description | Qty | Unit Price | Amount
 *   (Doctor column is optional and auto-detected)
 *
 * Handles broken CSV quoting from 5/16" syringe descriptions.
 */
export function parseWellmedrInvoiceCsv(csvText: string): ParsedInvoice {
  // Reassemble multi-line CSV fields: Google Sheets exports cells with newlines
  // inside quoted fields. Join continuation lines before processing.
  const rawLines = reassembleCsvLines(csvText);

  // Detect and skip header row
  let startIdx = 0;
  let colOrder = -1,
    colPatient = -1,
    colDesc = -1,
    colDoctor = -1;
  let colQty = -1,
    colPrice = -1,
    colAmount = -1;

  for (let i = 0; i < Math.min(5, rawLines.length); i++) {
    const row = parseCsvRowStandard(rawLines[i]);
    const lower = row.map((c) => c.toLowerCase());
    if (lower.includes('order') && (lower.includes('patient') || lower.includes('description'))) {
      colOrder = lower.indexOf('order');
      colPatient = lower.indexOf('patient');
      colDesc = lower.indexOf('description');
      colDoctor = lower.indexOf('doctor');
      colQty = lower.indexOf('qty');
      colPrice = lower.findIndex((c) => c.includes('unit') && c.includes('price'));
      colAmount = lower.indexOf('amount');
      startIdx = i + 1;
      break;
    }
  }

  // Fallback: assume standard column order if no header found
  if (colOrder === -1) {
    colOrder = 0;
    colPatient = 1;
    colDesc = 2;
    colDoctor = 3;
    colQty = 4;
    colPrice = 5;
    colAmount = 6;
  }

  const items: ParsedInvoiceLineItem[] = [];
  let lineNumber = 0;
  let totalCents = 0;

  for (let i = startIdx; i < rawLines.length; i++) {
    const line = rawLines[i].trim();
    if (!line) continue;

    const cols = parseCsvRowRobust(line);
    const orderVal = cols[colOrder] ?? '';
    const patientVal = cols[colPatient] ?? '';
    const descVal = cols[colDesc] ?? '';
    const doctorVal = cols[colDoctor] ?? '';
    const qtyVal = cols[colQty] ?? '';
    const priceVal = cols[colPrice] ?? '';
    const amountVal = cols[colAmount] ?? '';

    // Subtotal row: "Subtotal" in order or patient column, or just a dollar amount in order column
    if (orderVal.toLowerCase() === 'subtotal' || patientVal.toLowerCase() === 'subtotal') {
      const subtotalStr = patientVal.match(/\$/) ? patientVal : descVal || amountVal || orderVal;
      const subtotalCents = parseCsvDollar(subtotalStr);
      for (let j = items.length - 1; j >= 0; j--) {
        if (items[j].orderSubtotalCents === null) {
          items[j].orderSubtotalCents = subtotalCents;
          break;
        }
      }
      continue;
    }

    // Rows where order column is just a dollar amount (subtotal without label)
    if (/^\$[\d,.]+$/.test(orderVal) && !patientVal) {
      const subtotalCents = parseCsvDollar(orderVal);
      for (let j = items.length - 1; j >= 0; j--) {
        if (items[j].orderSubtotalCents === null) {
          items[j].orderSubtotalCents = subtotalCents;
          break;
        }
      }
      continue;
    }

    // Skip non-order rows
    const orderId = orderVal.replace(/\D/g, '');
    if (!orderId || orderId.length < 6) continue;

    // Determine line type
    const isShippingCarrier = ORDER_SHIPPING_RE.test(patientVal) || ORDER_SHIPPING_RE.test(descVal);
    const isShippingFee =
      WELLMEDR_SHIPPING_RE.test(patientVal) || WELLMEDR_SHIPPING_RE.test(descVal);
    const isSupply = SUPPLY_RE.test(descVal) || SUPPLY_RE.test(patientVal);

    let lineType: InvoiceLineType;
    if (isShippingCarrier) lineType = 'SHIPPING_CARRIER';
    else if (isShippingFee) lineType = 'SHIPPING_FEE';
    else if (isSupply) lineType = 'SUPPLY';
    else lineType = 'MEDICATION';

    // Extract rx number and fill ID from description
    const rxMatch = descVal.match(/RX\s*(\d{6,12})/);
    const fillMatch = descVal.match(FILL_ID_RE);
    const rxNumber = rxMatch ? rxMatch[1] : null;
    const fillId = fillMatch ? fillMatch[1] : null;

    // Medication details
    const medDetails =
      lineType === 'MEDICATION'
        ? extractMedicationDetails(descVal)
        : { medicationName: null, strength: null, form: null, vialSize: null };

    // Shipping method
    let shippingMethod: string | null = null;
    if (isShippingCarrier) {
      const sm = (patientVal || descVal).match(ORDER_SHIPPING_RE);
      shippingMethod = sm ? sm[2].trim() : null;
    } else if (isShippingFee) {
      shippingMethod = 'WELLMEDR SHIPPING';
    }

    // For shipping/fee rows, price and amount may be in shifted columns
    let quantity = parseInt(qtyVal, 10) || 1;
    let unitPriceCents = parseCsvDollar(priceVal);
    let amountCents = parseCsvDollar(amountVal);

    // If amount is 0 but there's a dollar value in doctor/qty columns (shifted), try those
    if (amountCents === 0 && (isShippingCarrier || isShippingFee)) {
      if (parseCsvDollar(doctorVal) > 0) {
        unitPriceCents = parseCsvDollar(doctorVal);
        amountCents = parseCsvDollar(qtyVal);
        quantity = parseInt(descVal, 10) || 1;
      }
    }

    // Patient name (only for rx/supply lines)
    const patientName =
      lineType === 'MEDICATION' || lineType === 'SUPPLY' ? patientVal || null : null;
    const doctorName =
      lineType === 'MEDICATION' || lineType === 'SUPPLY' ? doctorVal || null : null;

    lineNumber++;
    items.push({
      lineNumber,
      lineType,
      date: null,
      lifefileOrderId: orderId,
      rxNumber,
      fillId,
      patientName,
      doctorName,
      description: descVal.slice(0, 1000) || null,
      medicationName: medDetails.medicationName,
      strength: medDetails.strength,
      form: medDetails.form,
      vialSize: medDetails.vialSize,
      shippingMethod,
      quantity,
      unitPriceCents,
      discountCents: 0,
      amountCents,
      orderSubtotalCents: null,
    });

    totalCents += amountCents;
  }

  const uniqueOrders = new Set(items.map((item) => item.lifefileOrderId).filter(Boolean));

  logger.info('WellMedR invoice CSV parsed', {
    lineItemCount: items.length,
    orderCount: uniqueOrders.size,
    totalCents,
  });

  return {
    header: {
      pharmacyName: 'WellMedR / Logos Pharmacy',
      invoiceNumber: null,
      amountDueCents: totalCents,
      payorId: null,
      billingProfileId: null,
      invoiceDate: null,
    },
    lineItems: items,
    totalCents,
    orderCount: uniqueOrders.size,
  };
}
