import {
  PDFDocument,
  StandardFonts,
  degrees,
  rgb,
  type PDFPage,
  type PDFFont,
  type PDFImage,
} from 'pdf-lib';
import JsBarcode from 'jsbarcode';
import fontkit from '@pdf-lib/fontkit';
import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { LOGOS_PRODUCTS } from '@/data/logosProducts';

const PT_PER_INCH = 72;
const SHEET_WIDTH = 8.5 * PT_PER_INCH;
const SHEET_HEIGHT = 11 * PT_PER_INCH;
const COLS = 3;
const ROWS = 11;
const MAX_LABELS = COLS * ROWS;

// OL950LP geometry from OnlineLabels specs.
const LABEL_WIDTH = 2.625 * PT_PER_INCH;
const LABEL_HEIGHT = 0.875 * PT_PER_INCH;
const LEFT_MARGIN = 0.1875 * PT_PER_INCH;
const TOP_MARGIN = 0.6875 * PT_PER_INCH;
const H_GAP = 0.125 * PT_PER_INCH;
const V_GAP = 0;
const COLOR_BLUE = rgb(0x13 / 255, 0x7b / 255, 0xc1 / 255);
const COLOR_ORANGE = rgb(0xf7 / 255, 0x94 / 255, 0x1d / 255);
const COLOR_TEXT = rgb(0x23 / 255, 0x1f / 255, 0x20 / 255);
const SHOW_TEMPLATE_OVERLAY = process.env.LABEL_TEMPLATE_OVERLAY === 'true';
const OL950_TEMPLATE_CANDIDATES = [
  path.join(process.cwd(), 'assets', 'labels', 'ol950-template.pdf'),
  path.join(process.cwd(), 'assets', 'labels', 'OL950-4.pdf'),
  path.join(process.cwd(), 'public', 'labels', 'ol950-template.pdf'),
];
const LOGOSRX_LOGO_CANDIDATES = [
  path.join(process.cwd(), 'assets', 'labels', 'logosrx-logo-vertical-180.png'),
  path.join(process.cwd(), 'public', 'labels', 'logosrx-logo-vertical-180.png'),
  path.join(process.cwd(), 'assets', 'labels', 'logosrx-logo-vertical.png'),
  path.join(process.cwd(), 'public', 'labels', 'logosrx-logo-vertical.png'),
  path.join(process.cwd(), 'assets', 'labels', 'logosrx-logo.png'),
  path.join(process.cwd(), 'assets', 'labels', 'logosrx-logo.jpg'),
  path.join(process.cwd(), 'assets', 'labels', 'logosrx-logo.jpeg'),
  path.join(process.cwd(), 'public', 'labels', 'logosrx-logo.png'),
  path.join(process.cwd(), 'public', 'labels', 'logosrx-logo.jpg'),
  path.join(process.cwd(), 'public', 'labels', 'logosrx-logo.jpeg'),
];
const SOFIA_MEDIUM_CANDIDATES = [
  path.join(process.cwd(), 'public', 'fonts', 'Sofia-Pro-Medium.otf'),
  path.join(process.cwd(), 'public', 'fonts', 'SofiaPro-Medium.otf'),
  path.join(process.cwd(), 'public', 'fonts', 'Sofia-Pro-Medium.ttf'),
  path.join(process.cwd(), 'public', 'fonts', 'SofiaPro-Medium.ttf'),
  path.join(process.cwd(), 'public', 'fonts', 'Sofia-Pro-Regular.ttf'),
];
const ROBOTO_CONDENSED_REGULAR_CANDIDATES = [
  path.join(process.cwd(), 'public', 'fonts', 'RobotoCondensed-Regular.ttf'),
  path.join(process.cwd(), 'public', 'fonts', 'Roboto-Condensed-Regular.ttf'),
];
const AMERICAN_TYPEWRITER_CANDIDATES = [
  path.join(process.cwd(), 'public', 'fonts', 'AmericanTypewriter-Regular.ttf'),
  path.join(process.cwd(), 'public', 'fonts', 'American Typewriter Regular.ttf'),
];

function hexToRgb(hex: string) {
  const h = hex.replace('#', '');
  return rgb(
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255
  );
}

type BarcodeEncoding = { data: string };
type BarcodeTarget = { encodings?: BarcodeEncoding[] };

export type VialLabelRequest = {
  productId: number;
  batchNumber: string;
  budIsoDate: string;
  quantity: number;
  proofMode?: boolean;
  yearColor?: string;
};

type ParsedProduct = {
  displayName: string;
  concentration: string;
  vialLine: string;
};

type BudParts = {
  month: string;
  day: string;
  year: string;
};

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function normalizeConcentration(value: string): string {
  return value.toUpperCase().replace(/MCG/g, 'mcg').replace(/MG/g, 'mg').replace(/ML/g, 'mL');
}

function parseProduct(productId: number): ParsedProduct {
  const product = LOGOS_PRODUCTS.find((item) => item.id === productId);
  if (!product) {
    throw new Error(`Unknown product id: ${productId}`);
  }

  const baseName = product.name
    .replace(/\([^)]*\)/g, '')
    .replace(/\s+SOLUTION\s*$/i, '')
    .trim();
  const strengthIdx = baseName.search(/\d/);
  const head = strengthIdx > 0 ? baseName.slice(0, strengthIdx).trim() : baseName;
  const normalizedHead = head
    .replace(/\s+INJECTION$/i, '')
    .replace(/\s+STERILE$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  const compoundName = normalizedHead
    .split('/')
    .map((part) => titleCase(part.trim().replace(/\+/g, '+')))
    .filter(Boolean)
    .join(' and ');

  const sizeMatch = product.name.match(/\((\d+(?:\.\d+)?)\s*ML\b/i);
  const vialSize = sizeMatch ? `${sizeMatch[1]}mL` : '';

  return {
    displayName: `${compoundName} injection`,
    concentration: normalizeConcentration(product.strength || ''),
    vialLine: vialSize ? `${vialSize} Multi-Dose Vial` : 'Multi-Dose Vial',
  };
}

function wrapText(
  font: PDFFont,
  text: string,
  size: number,
  maxWidth: number,
  maxLines: number
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    const candidateWidth = font.widthOfTextAtSize(candidate, size);
    if (candidateWidth > maxWidth && current) {
      lines.push(current);
      current = word;
      if (lines.length >= maxLines) {
        return lines;
      }
    } else {
      current = candidate;
    }
  }

  if (current && lines.length < maxLines) {
    lines.push(current);
  }

  return lines;
}

function getCode128Bits(value: string): string {
  const target: BarcodeTarget = {};
  (JsBarcode as unknown as (t: unknown, v: string, o: Record<string, unknown>) => void)(
    target,
    value,
    {
      format: 'CODE128',
      displayValue: false,
      margin: 0,
      flat: true,
    }
  );

  const encoded = target.encodings?.[0]?.data;
  if (!encoded) {
    throw new Error('Failed to generate Code 128 barcode encoding.');
  }
  return encoded;
}

function drawBarcodeBars(
  page: PDFPage,
  bits: string,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  const moduleHeight = height / bits.length;
  let idx = 0;
  while (idx < bits.length) {
    if (bits[idx] !== '1') {
      idx += 1;
      continue;
    }
    let runEnd = idx + 1;
    while (runEnd < bits.length && bits[runEnd] === '1') {
      runEnd += 1;
    }
    page.drawRectangle({
      x,
      y: y + idx * moduleHeight,
      width,
      height: (runEnd - idx) * moduleHeight,
      color: rgb(0, 0, 0),
    });
    idx = runEnd;
  }
}

function drawLogosMark(page: PDFPage, x: number, y: number): void {
  const cx = x + 8.5;
  const top = y + 54;
  page.drawSvgPath(`M ${cx} ${top} L ${cx - 8.2} ${top - 3.2} L ${cx} ${top - 19.2} Z`, {
    color: rgb(0x74 / 255, 0x58 / 255, 0xa5 / 255),
  });
  page.drawSvgPath(`M ${cx} ${top} L ${cx + 8.2} ${top - 3.2} L ${cx} ${top - 19.2} Z`, {
    color: rgb(0x6e / 255, 0xa5 / 255, 0xd8 / 255),
  });
  page.drawSvgPath(`M ${cx} ${top} L ${cx - 6.6} ${top + 2.6} L ${cx - 5.2} ${top - 2.2} Z`, {
    color: rgb(0xc7 / 255, 0x2f / 255, 0x8a / 255),
  });
  page.drawSvgPath(`M ${cx} ${top} L ${cx + 6.6} ${top + 2.6} L ${cx + 5.2} ${top - 2.2} Z`, {
    color: rgb(0xe3 / 255, 0x64 / 255, 0x7a / 255),
  });
}

function parseBudDateParts(budIsoDate: string): BudParts {
  const v = budIsoDate.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (iso) {
    return { year: iso[1], month: iso[2], day: iso[3] };
  }
  const us = /^(\d{2})-(\d{2})-(\d{4})$/.exec(v);
  if (us) {
    return { month: us[1], day: us[2], year: us[3] };
  }
  // Conservative fallback for malformed values.
  return { month: '00', day: '00', year: '0000' };
}

type LabelRenderContext = {
  page: PDFPage;
  x: number;
  y: number;
  label: ParsedProduct;
  batchNumber: string;
  budIsoDate: string;
  fonts: EmbeddedFonts;
  logoImage?: PDFImage;
  yearColor: ReturnType<typeof rgb>;
};

type EmbeddedFonts = {
  regular: PDFFont;
  robotoCondensed: PDFFont;
  sofiaMedium: PDFFont;
  typewriter: PDFFont;
  serif: PDFFont;
};

function drawMedicationName({
  page,
  contentX,
  top,
  label,
  fonts,
  contentWidth,
}: {
  page: PDFPage;
  contentX: number;
  top: number;
  label: ParsedProduct;
  fonts: EmbeddedFonts;
  contentWidth: number;
}): void {
  const primarySize = 8.64;
  const secondarySize = 6.37;
  const primaryColor = COLOR_BLUE;
  const secondaryColor = COLOR_TEXT;
  const baseY = top - 18.6;
  const lineGap = 8.6;
  const normalized = label.displayName.replace(/\s+injection$/i, '').trim();
  const parts = normalized.split(/\s+and\s+/i);

  if (parts.length >= 2) {
    const left = parts[0].trim();
    const right = parts.slice(1).join(' and ').trim();
    page.drawText(left, {
      x: contentX,
      y: baseY,
      size: primarySize,
      font: fonts.sofiaMedium,
      color: primaryColor,
    });
    page.drawText(' and', {
      x: contentX + fonts.sofiaMedium.widthOfTextAtSize(left, primarySize) + 0.6,
      y: baseY + 0.25,
      size: secondarySize,
      font: fonts.robotoCondensed,
      color: secondaryColor,
    });

    const secondY = baseY - lineGap;
    page.drawText(right, {
      x: contentX,
      y: secondY,
      size: primarySize,
      font: fonts.sofiaMedium,
      color: primaryColor,
    });
    page.drawText(' injection', {
      x: contentX + fonts.sofiaMedium.widthOfTextAtSize(right, primarySize) + 0.6,
      y: secondY + 0.25,
      size: secondarySize,
      font: fonts.robotoCondensed,
      color: secondaryColor,
    });
    return;
  }

  const lines = wrapText(fonts.sofiaMedium, label.displayName, primarySize, contentWidth - 1, 2);
  let textY = baseY;
  for (const line of lines) {
    page.drawText(line, {
      x: contentX,
      y: textY,
      size: primarySize,
      font: fonts.sofiaMedium,
      color: primaryColor,
    });
    textY -= lineGap;
  }
}

function drawLabel({
  page,
  x,
  y,
  label,
  batchNumber,
  budIsoDate,
  fonts,
  logoImage,
  yearColor: yearRgb,
}: LabelRenderContext): void {
  const FRAME_MARGIN_Y = 7;
  const fullWidth = LABEL_WIDTH;
  const fullHeight = LABEL_HEIGHT;
  const brandWidth = 27;
  const warningWidth = 54;
  const barcodeWidth = 29;
  const contentWidth = fullWidth - brandWidth - warningWidth - barcodeWidth - 8;
  const contentX = x + brandWidth + 3;
  const barcodeX = contentX + contentWidth + 3;
  const warningX = barcodeX + barcodeWidth + 3;
  const top = y + fullHeight;
  const contentTop = top - FRAME_MARGIN_Y;
  const contentBottom = y + FRAME_MARGIN_Y;
  const contentHeight = contentTop - contentBottom;

  page.drawRectangle({
    x,
    y,
    width: fullWidth,
    height: fullHeight,
    color: rgb(1, 1, 1),
    borderColor: COLOR_TEXT,
    borderWidth: 0.6,
  });

  page.drawLine({
    start: { x: x + brandWidth, y },
    end: { x: x + brandWidth, y: y + fullHeight },
    thickness: 0.6,
    color: COLOR_BLUE,
  });

  if (logoImage) {
    const logoHeight = fullHeight - FRAME_MARGIN_Y * 2;
    const logoWidth = (logoImage.width / logoImage.height) * logoHeight;
    page.drawImage(logoImage, {
      x: x + (brandWidth - logoWidth) / 2,
      y: y + (fullHeight - logoHeight) / 2,
      width: logoWidth,
      height: logoHeight,
    });
  } else {
    drawLogosMark(page, x + 1.6, y + 4.6);
  }

  const { month, day, year } = parseBudDateParts(budIsoDate);
  const topLineY = contentTop - 4.8;
  page.drawText(`BUD ${month}-${day}-`, {
    x: contentX,
    y: topLineY,
    size: 5,
    font: fonts.robotoCondensed,
    color: COLOR_TEXT,
  });
  const budPrefixWidth = fonts.robotoCondensed.widthOfTextAtSize(`BUD ${month}-${day}-`, 5);
  page.drawText(year, {
    x: contentX + budPrefixWidth + 0.4,
    y: topLineY - 0.2,
    size: 7,
    font: fonts.robotoCondensed,
    color: yearRgb,
  });
  page.drawText('Rx Only', {
    x: contentX + contentWidth - 22,
    y: topLineY,
    size: 4.7,
    font: fonts.robotoCondensed,
    color: COLOR_TEXT,
  });

  drawMedicationName({ page, contentX, top: contentTop, label, fonts, contentWidth });

  page.drawRectangle({
    x: contentX,
    y: y + 23.8,
    width: contentWidth,
    height: 9.6,
    color: COLOR_BLUE,
  });
  page.drawText(label.concentration, {
    x: contentX + 3,
    y: y + 26.9,
    size: 6.4,
    font: fonts.sofiaMedium,
    color: rgb(1, 1, 1),
  });

  page.drawRectangle({
    x: contentX,
    y: y + 13.8,
    width: contentWidth,
    height: 9.6,
    color: COLOR_ORANGE,
  });
  page.drawText(label.vialLine, {
    x: contentX + 3,
    y: y + 17.1,
    size: 6.2,
    font: fonts.sofiaMedium,
    color: rgb(1, 1, 1),
  });

  const discardText = 'DISCARD 28 DAYS AFTER FIRST USE';
  const discardBaseSize = 4.47;
  const discardBaseWidth = fonts.robotoCondensed.widthOfTextAtSize(discardText, discardBaseSize);
  const discardSize = (discardBaseSize * contentWidth) / discardBaseWidth;
  const discardWidth = fonts.robotoCondensed.widthOfTextAtSize(discardText, discardSize);
  page.drawText(discardText, {
    x: contentX + (contentWidth - discardWidth) / 2,
    y: y + 8.4,
    size: discardSize,
    font: fonts.robotoCondensed,
    color: COLOR_TEXT,
  });

  const bits = getCode128Bits(batchNumber);
  const barsWidth = (barcodeWidth - 2) * 0.85;
  const barsHeight = contentHeight;
  const barsX = barcodeX + (barcodeWidth - barsWidth) / 2 + 2;
  const barsY = contentBottom + (contentHeight - barsHeight) / 2;
  drawBarcodeBars(page, bits, barsX, barsY, barsWidth, barsHeight);
  let lgSize = 6.75;
  const lgMaxHeight = barsHeight - 2;
  const lgLineLength = fonts.typewriter.widthOfTextAtSize(batchNumber, lgSize);
  if (lgLineLength > lgMaxHeight) {
    lgSize = (lgSize * lgMaxHeight) / lgLineLength;
  }
  const lgWidth = fonts.typewriter.widthOfTextAtSize(batchNumber, lgSize);
  const lgX = barsX + barsWidth + 8;
  page.drawText(batchNumber, {
    x: lgX,
    y: barsY + (barsHeight - lgWidth) / 2,
    size: lgSize,
    font: fonts.typewriter,
    color: COLOR_TEXT,
    rotate: degrees(90),
  });

  const warningLines = [
    { text: 'FOR SUBCUTANEOUS USE ONLY', size: 4.6, color: COLOR_BLUE },
    { text: 'Refrigerate 2 C to 8 C (36 F to 46 F)', size: 3.9, color: COLOR_TEXT },
    { text: 'Protect from light. Compounded Drug', size: 3.9, color: COLOR_TEXT },
    { text: 'Do Not Freeze. Not for Resale.', size: 3.9, color: COLOR_TEXT },
    { text: 'Compounded by Logos Pharmacy', size: 3.9, color: COLOR_TEXT },
    { text: '7543 W Waters Ave Tampa, FL 33615', size: 3.9, color: COLOR_TEXT },
    { text: 'RX Questions? (813)886-2800', size: 3.9, color: COLOR_TEXT },
  ];
  const availableHeight = contentHeight;
  const colPadding = 1.4;
  const warningRight = warningX + warningWidth - colPadding;
  const warningStart = warningX + colPadding;
  const usableWidth = Math.max(8, warningRight - warningStart);
  const fullStep = usableWidth / warningLines.length;
  const step = fullStep * 0.5;
  const groupWidth = step * (warningLines.length - 1);
  const groupStart = warningStart + Math.max(0, (usableWidth - groupWidth) / 2);
  warningLines.forEach((line, idx) => {
    let size = line.size;
    const lineLength = fonts.robotoCondensed.widthOfTextAtSize(line.text, size);
    if (lineLength > availableHeight) {
      size = (size * availableHeight) / lineLength;
    }
    const centeredLineLength = fonts.robotoCondensed.widthOfTextAtSize(line.text, size);
    page.drawText(line.text, {
      x: groupStart + idx * step,
      y: contentBottom + (contentHeight - centeredLineLength) / 2,
      size,
      font: fonts.robotoCondensed,
      color: line.color,
      rotate: degrees(90),
    });
  });
}

async function embedLabelFonts(doc: PDFDocument): Promise<EmbeddedFonts> {
  const fallbackRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fallbackSemibold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fallbackTypewriter = await doc.embedFont(StandardFonts.Courier);
  const fallbackSerif = await doc.embedFont(StandardFonts.TimesRoman);
  let sofiaMedium = fallbackSemibold;
  let robotoCondensed = fallbackRegular;
  let typewriter = fallbackTypewriter;

  try {
    doc.registerFontkit(fontkit);
  } catch {
    // fallback without fontkit
  }

  try {
    const sofiaPath = await resolveExistingFile(SOFIA_MEDIUM_CANDIDATES);
    if (sofiaPath) {
      const sofiaBytes = await readFile(sofiaPath);
      sofiaMedium = await doc.embedFont(sofiaBytes);
    }
  } catch {
    sofiaMedium = fallbackSemibold;
  }

  try {
    const robotoPath = await resolveExistingFile(ROBOTO_CONDENSED_REGULAR_CANDIDATES);
    if (robotoPath) {
      const robotoBytes = await readFile(robotoPath);
      robotoCondensed = await doc.embedFont(robotoBytes);
    }
  } catch {
    robotoCondensed = fallbackRegular;
  }

  try {
    const typewriterPath = await resolveExistingFile(AMERICAN_TYPEWRITER_CANDIDATES);
    if (typewriterPath) {
      const typewriterBytes = await readFile(typewriterPath);
      typewriter = await doc.embedFont(typewriterBytes);
    }
  } catch {
    typewriter = fallbackTypewriter;
  }

  return {
    regular: fallbackRegular,
    robotoCondensed,
    sofiaMedium,
    typewriter,
    serif: fallbackSerif,
  };
}

async function resolveExistingFile(paths: string[]): Promise<string | null> {
  for (const candidate of paths) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // continue probing
    }
  }
  return null;
}

async function resolveOl950TemplatePath(): Promise<string | null> {
  const explicit = await resolveExistingFile(OL950_TEMPLATE_CANDIDATES);
  if (explicit) return explicit;

  const labelsDir = path.join(process.cwd(), 'assets', 'labels');
  try {
    const entries = await readdir(labelsDir);
    const match = entries.find((name) => /^ol950.*\.pdf$/i.test(name));
    if (!match) return null;
    return path.join(labelsDir, match);
  } catch {
    return null;
  }
}

async function tryEmbedOl950Template(doc: PDFDocument) {
  const templatePath = await resolveOl950TemplatePath();
  if (!templatePath) return null;
  try {
    const templateBytes = await readFile(templatePath);
    const [embedded] = await doc.embedPdf(templateBytes, [0]);
    return embedded ?? null;
  } catch {
    return null;
  }
}

async function tryEmbedLogosRxLogo(doc: PDFDocument): Promise<PDFImage | null> {
  const logoPath = await resolveExistingFile(LOGOSRX_LOGO_CANDIDATES);
  if (!logoPath) return null;

  try {
    const bytes = await readFile(logoPath);
    if (logoPath.toLowerCase().endsWith('.png')) {
      return await doc.embedPng(bytes);
    }
    return await doc.embedJpg(bytes);
  } catch {
    return null;
  }
}

async function tryEmbedProductTemplate(
  doc: PDFDocument,
  productId: number
): Promise<
  | PDFImage
  | ReturnType<Awaited<ReturnType<typeof doc.embedPdf>>[number] extends infer T ? () => T : never>
  | null
> {
  const baseDirs = [
    path.join(process.cwd(), 'assets', 'labels', 'templates'),
    path.join(process.cwd(), 'public', 'labels', 'templates'),
  ];
  for (const dir of baseDirs) {
    for (const ext of ['pdf', 'png', 'jpg']) {
      const candidate = path.join(dir, `${productId}.${ext}`);
      try {
        await access(candidate);
        const bytes = await readFile(candidate);
        if (ext === 'pdf') {
          const [embedded] = await doc.embedPdf(bytes, [0]);
          return embedded ?? null;
        }
        if (ext === 'png') {
          return await doc.embedPng(bytes);
        }
        return await doc.embedJpg(bytes);
      } catch {
        continue;
      }
    }
  }
  return null;
}

type TemplateOverlay = {
  page: PDFPage;
  x: number;
  y: number;
  batchNumber: string;
  budIsoDate: string;
  fonts: EmbeddedFonts;
  template: PDFImage | Awaited<ReturnType<typeof PDFDocument.prototype.embedPdf>>[number];
  yearColor: ReturnType<typeof rgb>;
};

function drawTemplateLabel({
  page,
  x,
  y,
  batchNumber,
  budIsoDate,
  fonts,
  template,
  yearColor: yearRgb,
}: TemplateOverlay): void {
  const fullWidth = LABEL_WIDTH;
  const fullHeight = LABEL_HEIGHT;
  const FRAME_MARGIN_Y = 7;

  if ('width' in template && 'height' in template && 'drawPage' in page) {
    page.drawPage(template as Awaited<ReturnType<typeof PDFDocument.prototype.embedPdf>>[number], {
      x,
      y,
      width: fullWidth,
      height: fullHeight,
    });
  } else {
    page.drawImage(template as PDFImage, {
      x,
      y,
      width: fullWidth,
      height: fullHeight,
    });
  }

  const brandWidth = 27;
  const warningWidth = 54;
  const barcodeWidth = 26;
  const contentWidth = fullWidth - brandWidth - warningWidth - barcodeWidth - 8;
  const contentX = x + brandWidth + 3;
  const barcodeX = contentX + contentWidth + 3;
  const warningX = barcodeX + barcodeWidth + 3;
  const top = y + fullHeight;
  const contentTop = top - FRAME_MARGIN_Y;
  const contentBottom = y + FRAME_MARGIN_Y;
  const contentHeight = contentTop - contentBottom;

  const { month, day, year } = parseBudDateParts(budIsoDate);
  const topLineY = contentTop - 4.8;
  page.drawText(`${month}-${day}-`, {
    x: contentX + 14,
    y: topLineY + 0.9,
    size: 5,
    font: fonts.robotoCondensed,
    color: COLOR_TEXT,
  });
  const datePrefix = fonts.robotoCondensed.widthOfTextAtSize(`${month}-${day}-`, 5);
  page.drawText(year, {
    x: contentX + 14 + datePrefix + 0.4,
    y: topLineY + 0.7,
    size: 7,
    font: fonts.robotoCondensed,
    color: yearRgb,
  });

  const bits = getCode128Bits(batchNumber);
  const barsWidth = (barcodeWidth - 2) * 0.85;
  const barsHeight = contentHeight;
  const barsX = barcodeX + (barcodeWidth - barsWidth) / 2 + 2;
  const barsY = contentBottom + (contentHeight - barsHeight) / 2;
  drawBarcodeBars(page, bits, barsX, barsY, barsWidth, barsHeight);

  let lgSize = 6.75;
  const lgMaxHeight = barsHeight - 2;
  const lgLineLength = fonts.typewriter.widthOfTextAtSize(batchNumber, lgSize);
  if (lgLineLength > lgMaxHeight) {
    lgSize = (lgSize * lgMaxHeight) / lgLineLength;
  }
  const lgWidth = fonts.typewriter.widthOfTextAtSize(batchNumber, lgSize);
  const lgX = barsX + barsWidth + 8;
  page.drawText(batchNumber, {
    x: lgX,
    y: barsY + (barsHeight - lgWidth) / 2,
    size: lgSize,
    font: fonts.typewriter,
    color: COLOR_TEXT,
    rotate: degrees(90),
  });
}

export async function generateVialLabelSheetPdf(input: VialLabelRequest): Promise<Buffer> {
  const parsed = parseProduct(input.productId);
  const doc = await PDFDocument.create();
  const page = doc.addPage([SHEET_WIDTH, SHEET_HEIGHT]);
  const fonts = await embedLabelFonts(doc);
  const ol950Template = SHOW_TEMPLATE_OVERLAY ? await tryEmbedOl950Template(doc) : null;
  const productTemplate = await tryEmbedProductTemplate(doc, input.productId);
  const logoImage = productTemplate ? null : await tryEmbedLogosRxLogo(doc);

  if (ol950Template) {
    page.drawPage(ol950Template, {
      x: 0,
      y: 0,
      width: SHEET_WIDTH,
      height: SHEET_HEIGHT,
    });
  }

  const safeQuantity = input.proofMode ? 1 : Math.max(1, Math.min(MAX_LABELS, input.quantity));
  const batchNumber = input.batchNumber.trim().toUpperCase();
  const yearRgb = input.yearColor ? hexToRgb(input.yearColor) : COLOR_BLUE;

  if (input.proofMode) {
    const x = (SHEET_WIDTH - LABEL_WIDTH) / 2;
    const y = (SHEET_HEIGHT - LABEL_HEIGHT) / 2;
    if (productTemplate) {
      drawTemplateLabel({
        page,
        x,
        y,
        batchNumber,
        budIsoDate: input.budIsoDate,
        fonts,
        template: productTemplate,
        yearColor: yearRgb,
      });
    } else {
      drawLabel({
        page,
        x,
        y,
        label: parsed,
        batchNumber,
        budIsoDate: input.budIsoDate,
        fonts,
        logoImage: logoImage ?? undefined,
        yearColor: yearRgb,
      });
    }
  } else {
    for (let i = 0; i < safeQuantity; i += 1) {
      const row = Math.floor(i / COLS);
      const col = i % COLS;
      const x = LEFT_MARGIN + col * (LABEL_WIDTH + H_GAP);
      const top = SHEET_HEIGHT - TOP_MARGIN - row * (LABEL_HEIGHT + V_GAP);
      const y = top - LABEL_HEIGHT;

      if (productTemplate) {
        drawTemplateLabel({
          page,
          x,
          y,
          batchNumber,
          budIsoDate: input.budIsoDate,
          fonts,
          template: productTemplate,
          yearColor: yearRgb,
        });
      } else {
        drawLabel({
          page,
          x,
          y,
          label: parsed,
          batchNumber,
          budIsoDate: input.budIsoDate,
          fonts,
          logoImage: logoImage ?? undefined,
          yearColor: yearRgb,
        });
      }
    }
  }

  const bytes = await doc.save();
  return Buffer.from(bytes);
}

export const VIAL_LABEL_SHEET_MAX = MAX_LABELS;
