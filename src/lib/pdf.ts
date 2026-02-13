import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { logger } from '@/lib/logger';

// Default values - used as fallback if clinic-specific values not provided
const DEFAULT_PRACTICE_NAME =
  process.env.LIFEFILE_PRACTICE_NAME ?? 'APOLLO BASED HEALTH DBA EONMEDS';
const DEFAULT_PRACTICE_ADDRESS =
  process.env.LIFEFILE_PRACTICE_ADDRESS ?? '401 Jackson St Suite 2340-K23, Tampa, FL 33602';
const DEFAULT_PRACTICE_PHONE = process.env.LIFEFILE_PRACTICE_PHONE ?? '813-696-3459';
const DEFAULT_PRACTICE_FAX = process.env.LIFEFILE_PRACTICE_FAX ?? '813-537-8691';

// Medication-specific special instructions
const MEDICATION_SPECIAL_INSTRUCTIONS: Record<string, string[]> = {
  TIRZEPATIDE: [
    'PLEASE INCLUDE SUPPLIES.',
    '-Beyond Medical Necessary',
    '-This individual patient would benefit from Tirzepatide with Glycine to help with muscle loss and use compounded vials that offer flexible dosing for patients and lowest effective dose to minimize side effects and increase outcomes and compliance.',
    '- By submitting this prescription, you confirm that you have reviewed available drug product options and concluded that this compounded product is necessary for the patient receiving it.',
  ],
  SEMAGLUTIDE: [
    'PLEASE INCLUDE SUPPLIES.',
    '- Beyond Medical Necessary',
    '-This individual patient would benefit from Semaglutide with Glycine to help with muscle loss and use compounded vials that offer flexible dosing for patients and lowest effective dose to minimize side effects and increase outcomes and compliance.',
    '-By submitting this prescription, you confirm that you have reviewed available drug product options and concluded that this compounded product is necessary for the patient receiving it.',
  ],
  TESTOSTERONE: [
    'PLEASE INCLUDE SUPPLIES.',
    '-Beyond medical necessary',
    '-This individual patient will benefit from Testosterone with grapeseed oil due to allergic reactions to commercially available one and use compounded vials that offer flexible dosing for patients and lowest effective dose to minimize side effects and increase outcomes and compliance.',
    '-By submitting this prescription, you confirm that you have reviewed available drug product options and concluded that this compounded product is necessary for the patient receiving it.',
  ],
};

function getSpecialInstructions(medicationName: string): string[] {
  // Check for medication keywords in the name
  const upperMedName = medicationName.toUpperCase();

  for (const [medKey, instructions] of Object.entries(MEDICATION_SPECIAL_INSTRUCTIONS)) {
    if (upperMedName.includes(medKey)) {
      return instructions;
    }
  }

  // Default instructions if medication not found in special list
  return ['PLEASE INCLUDE SUPPLIES.'];
}

export type PrescriptionPdfData = {
  referenceId: string;
  date: string;
  // Clinic/Practice info - used in header and footer
  clinic?: {
    name?: string | null;
    address?: string | null;
    phone?: string | null;
    fax?: string | null;
  };
  provider: {
    name: string;
    npi: string;
    dea?: string | null;
    licenseNumber?: string | null;
    address1?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
    phone?: string | null;
    fax?: string | null;
  };
  patient: {
    firstName: string;
    lastName: string;
    phone: string;
    email?: string | null;
    dob: string;
    gender?: string;
    address1: string;
    address2?: string | null;
    city: string;
    state: string;
    zip: string;
  };
  // Support multiple prescriptions
  prescriptions?: Array<{
    medication: string;
    strength?: string;
    sig: string;
    quantity: string;
    refills: string;
    daysSupply: number;
  }>;
  // Legacy single prescription support
  rx?: {
    medication: string;
    strength?: string;
    sig: string;
    quantity: string;
    refills: string;
    daysSupply: number;
  };
  shipping: {
    methodLabel: string;
    addressLine1: string;
    addressLine2?: string | null;
    city: string;
    state: string;
    zip: string;
  };
  signatureDataUrl?: string | null;
};

export async function generatePrescriptionPDF(data: PrescriptionPdfData) {
  const doc = await PDFDocument.create();
  const regularFont = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

  // Use clinic-specific values or fall back to defaults
  const PRACTICE_NAME = data.clinic?.name || DEFAULT_PRACTICE_NAME;
  const PRACTICE_ADDRESS = data.clinic?.address || DEFAULT_PRACTICE_ADDRESS;
  const PRACTICE_PHONE = data.clinic?.phone || DEFAULT_PRACTICE_PHONE;
  const PRACTICE_FAX = data.clinic?.fax || DEFAULT_PRACTICE_FAX;

  // Normalize prescriptions array
  const prescriptions = data.prescriptions || (data.rx ? [data.rx] : []);
  if (prescriptions.length === 0) {
    throw new Error('No prescriptions provided');
  }

  // Helper functions
  const drawText = (
    page: any,
    text: string,
    x: number,
    y: number,
    opts: { size?: number; bold?: boolean; color?: any } = {}
  ) => {
    page.drawText(text ?? '', {
      x,
      y,
      size: opts.size ?? 10,
      font: opts.bold ? boldFont : regularFont,
      color: opts.color ?? rgb(0, 0, 0),
    });
  };

  const drawLine = (page: any, y: number, margin = 65) => {
    page.drawLine({
      start: { x: margin, y },
      end: { x: 547, y },
      thickness: 1,
      color: rgb(0, 0, 0),
    });
  };

  const drawRow = (
    page: any,
    entries: Array<{ label: string; value?: string; width?: number }>,
    startX: number,
    startY: number,
    defaultWidth = 150
  ) => {
    let x = startX;
    entries.forEach(({ label, value, width }) => {
      drawText(page, `${label}:`, x, startY, { bold: true, size: 10 });
      if (value) {
        const labelWidth = boldFont.widthOfTextAtSize(`${label}:`, 10);
        drawText(page, value, x + labelWidth + 5, startY, { size: 10 });
      }
      x += width ?? defaultWidth;
    });
  };

  const wrapText = (
    text: string,
    maxWidth: number,
    font: typeof regularFont,
    size: number
  ): string[] => {
    const words = (text ?? '').split(' ');
    const lines: string[] = [];
    let current = '';

    words.forEach((word: any) => {
      const testLine = current ? `${current} ${word}` : word;
      const width = font.widthOfTextAtSize(testLine, size);
      if (width > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = testLine;
      }
    });

    if (current) lines.push(current);
    return lines;
  };

  // Helper function to draw signature on page
  const drawSignatureOnPage = async (page: any, xPos: number, yPos: number) => {
    if (data.signatureDataUrl) {
      try {
        const prefix = 'data:image/png;base64,';
        const base64 = data.signatureDataUrl.startsWith(prefix)
          ? data.signatureDataUrl.replace(prefix, '')
          : data.signatureDataUrl;
        const sigBytes = Buffer.from(base64, 'base64');
        const sigImage = await doc.embedPng(sigBytes);

        page.drawImage(sigImage, {
          x: xPos,
          y: yPos,
          width: 150,
          height: 50,
        });
      } catch (err: any) {
        // @ts-ignore

        logger.error('Failed to embed signature image:', err);
      }
    }
  };

  // Create pages and fit multiple prescriptions per page when possible
  let currentPage = doc.addPage([612, 792]);
  let { height } = currentPage.getSize();
  const margin = 65;
  let cursor = height - 80;
  let currentPageNumber = 1;
  let isNewPage = true;
  let previousPage: any = null;

  for (let rxIndex = 0; rxIndex < prescriptions.length; rxIndex++) {
    const rx = prescriptions[rxIndex];

    // Check if we need a new page (if cursor is too low)
    if (rxIndex > 0 && cursor < 300) {
      // Add signature to the bottom of the current page before creating a new one
      await drawSignatureOnPage(currentPage, margin + 350, 50);

      previousPage = currentPage;
      currentPageNumber++;
      currentPage = doc.addPage([612, 792]);
      cursor = height - 80;
      isNewPage = true;

      // Add page indicator on new pages
      if (prescriptions.length > 1) {
        drawText(currentPage, `PAGE ${currentPageNumber}`, 450, height - 40, {
          size: 11,
          bold: true,
          color: rgb(0, 0, 0),
        });
      }
    }

    // Only show full header info on first page
    if (currentPageNumber === 1 && rxIndex === 0) {
      // Header Section - Practice name on its own line
      drawText(currentPage, PRACTICE_NAME.toUpperCase(), margin, cursor, { size: 16, bold: true });
      cursor -= 18;

      // Right side header info - moved to separate rows to avoid overlap
      const rightX = 380;
      drawText(currentPage, PRACTICE_ADDRESS, margin, cursor, { size: 10 });
      drawText(
        currentPage,
        `State Lic.: ${data.provider.licenseNumber ?? 'ME117105'}`,
        rightX,
        cursor,
        { size: 10 }
      );
      cursor -= 14;

      drawText(currentPage, `Phone: ${PRACTICE_PHONE}`, margin, cursor, { size: 10 });
      drawText(currentPage, `NPI: ${data.provider.npi}`, rightX, cursor, { size: 10 });
      cursor -= 14;

      drawText(currentPage, `Fax: ${PRACTICE_FAX}`, margin, cursor, { size: 10 });
      drawText(currentPage, `DEA: ${data.provider.dea ?? 'FC4080127'}`, rightX, cursor, {
        size: 10,
      });
      cursor -= 14;

      drawText(currentPage, '', margin, cursor, { size: 10 });
      drawText(currentPage, `Date: ${data.date}`, rightX, cursor, { size: 10 });

      cursor -= 30;
      drawLine(currentPage, cursor);
      cursor -= 25;

      // PRESCRIBER INFORMATION
      drawText(currentPage, 'PRESCRIBER INFORMATION:', margin, cursor, { bold: true, size: 11 });
      cursor -= 18;

      drawRow(
        currentPage,
        [
          { label: 'NAME', value: data.provider.name.toUpperCase(), width: 180 },
          { label: 'NPI', value: data.provider.npi, width: 120 },
          { label: 'DEA', value: data.provider.dea ?? 'FC4080127', width: 120 },
          { label: 'LICENSE#', value: data.provider.licenseNumber ?? 'ME117105' },
        ],
        margin,
        cursor,
        120
      );
      cursor -= 18;

      drawRow(
        currentPage,
        [{ label: 'ADDRESS', value: data.provider.address1 ?? PRACTICE_ADDRESS, width: 400 }],
        margin,
        cursor
      );
      cursor -= 18;

      drawRow(
        currentPage,
        [
          { label: 'PHONE', value: data.provider.phone ?? PRACTICE_PHONE, width: 200 },
          { label: 'FAX', value: data.provider.fax ?? PRACTICE_FAX },
        ],
        margin,
        cursor
      );

      cursor -= 25;
      drawLine(currentPage, cursor);
      cursor -= 25;

      // ELECTRONIC PRESCRIPTION ORDER
      drawText(currentPage, 'ELECTRONIC PRESCRIPTION ORDER', margin, cursor, {
        bold: true,
        size: 11,
      });
      cursor -= 18;

      drawRow(
        currentPage,
        [
          { label: 'FIRST NAME', value: data.patient.firstName, width: 150 },
          { label: 'LAST NAME', value: data.patient.lastName, width: 150 },
          { label: 'DOB', value: data.patient.dob, width: 120 },
        ],
        margin,
        cursor
      );
      cursor -= 18;

      drawRow(
        currentPage,
        [
          { label: 'PHONE', value: data.patient.phone, width: 200 },
          { label: 'EMAIL', value: data.patient.email ?? '', width: 250 },
        ],
        margin,
        cursor
      );
      cursor -= 18;

      drawRow(
        currentPage,
        [
          {
            label: 'ADDRESS',
            value:
              data.patient.address1 + (data.patient.address2 ? `, ${data.patient.address2}` : ''),
            width: 400,
          },
        ],
        margin,
        cursor
      );
      cursor -= 18;

      drawRow(
        currentPage,
        [
          { label: 'CITY', value: data.patient.city, width: 150 },
          { label: 'STATE', value: data.patient.state, width: 80 },
          { label: 'ZIP', value: data.patient.zip, width: 120 },
          { label: 'GENDER', value: data.patient.gender ?? '—' },
        ],
        margin,
        cursor,
        120
      );

      cursor -= 25;
      drawLine(currentPage, cursor);
      cursor -= 25;
    } else if (currentPageNumber > 1 && isNewPage) {
      // For additional pages, show simplified header (moved up by 50px)
      cursor += 50;
      drawText(currentPage, 'ELECTRONIC PRESCRIPTION ORDER - CONTINUED', margin, cursor, {
        bold: true,
        size: 12,
      });
      cursor -= 18;
      drawText(
        currentPage,
        `Patient: ${data.patient.firstName} ${data.patient.lastName} (DOB: ${data.patient.dob})`,
        margin,
        cursor,
        { size: 10 }
      );
      cursor -= 25;
      drawLine(currentPage, cursor);
      cursor -= 25;
      isNewPage = false;
    }

    // PRESCRIPTION DETAILS for this specific medication
    const rxNumber = prescriptions.length > 1 ? `#${rxIndex + 1} ` : '#1 ';
    drawText(currentPage, `${rxNumber}${rx.medication}`, margin, cursor, { bold: true, size: 12 });
    cursor -= 18;

    // STRENGTH on its own line
    drawRow(
      currentPage,
      [{ label: 'STRENGTH', value: rx.strength ?? '—', width: 400 }],
      margin,
      cursor
    );
    cursor -= 18;

    // QUANTITY, REFILLS, and DAYS SUPPLY on next line
    drawRow(
      currentPage,
      [
        { label: 'QUANTITY', value: rx.quantity, width: 120 },
        { label: 'REFILLS', value: rx.refills, width: 120 },
        { label: 'DAYS SUPPLY', value: `${rx.daysSupply}`, width: 120 },
      ],
      margin,
      cursor,
      140
    );
    cursor -= 18;

    // SIG with proper wrapping
    drawText(currentPage, 'DIRECTIONS (SIG):', margin, cursor, { bold: true, size: 10 });
    const sigText = rx.sig || 'Take as directed';
    const sigLines = wrapText(sigText, 380, regularFont, 10);

    // Limit to first 3 lines if too long, add ellipsis
    const displayLines = sigLines.slice(0, 3);
    if (sigLines.length > 3) {
      displayLines[2] = displayLines[2] + '...';
    }

    displayLines.forEach((line, index) => {
      drawText(currentPage, line, margin + 110, cursor - index * 12, { size: 10 });
    });
    cursor -= Math.max(18, displayLines.length * 12 + 6);

    // Add Special Instructions for EACH medication
    cursor -= 20;
    drawText(currentPage, 'Special Instructions:', margin, cursor, { bold: true, size: 10 });
    cursor -= 14;

    const specialInstructions = getSpecialInstructions(rx.medication);
    specialInstructions.forEach((instruction: any) => {
      // Wrap long instruction lines
      const instructionLines = wrapText(instruction, 470, regularFont, 9);
      instructionLines.forEach((line: any) => {
        drawText(currentPage, line, margin, cursor, { size: 9 });
        cursor -= 12;
      });
    });

    // Add separator between medications if there's another one coming
    if (rxIndex < prescriptions.length - 1) {
      cursor -= 15;
      drawLine(currentPage, cursor);
      cursor -= 15;
    }

    // Show SHIP TO only once at the end
    if (rxIndex === prescriptions.length - 1) {
      cursor -= 25;

      // SHIP TO
      drawText(currentPage, 'SHIP TO:', margin, cursor, { bold: true, size: 10 });
      const shipAddress = [
        data.shipping.addressLine1,
        data.shipping.addressLine2,
        `${data.shipping.city}, ${data.shipping.state} ${data.shipping.zip}`,
      ]
        .filter(Boolean)
        .join(', ');
      drawText(currentPage, shipAddress, margin + 65, cursor, { size: 10 });
      cursor -= 18;

      drawRow(
        currentPage,
        [
          { label: 'DELIVERY TYPE', value: data.shipping.methodLabel, width: 200 },
          { label: 'DATE WRITTEN', value: data.date },
        ],
        margin,
        cursor
      );
    }
  }

  // Add footer at the end (after all prescriptions)
  cursor -= 10;

  // Add signature to bottom of last page
  await drawSignatureOnPage(currentPage, margin, cursor - 50);
  cursor -= 60;

  // Footer Information
  drawText(
    currentPage,
    `Submitted electronically by prescriber: ${data.provider.name.toUpperCase()}`,
    margin,
    cursor,
    { size: 10 }
  );
  cursor -= 14;
  drawText(currentPage, `Practice: ${PRACTICE_NAME}`, margin, cursor, { size: 10 });
  cursor -= 14;
  drawText(currentPage, `Address: ${PRACTICE_ADDRESS}`, margin, cursor, { size: 10 });
  cursor -= 14;
  drawText(currentPage, `Phone: ${PRACTICE_PHONE}`, margin, cursor, { size: 10 });

  cursor -= 20;
  drawText(currentPage, `Order #: ${data.referenceId}`, margin, cursor, { bold: true, size: 11 });

  const out = await doc.save();
  return Buffer.from(out).toString('base64');
}
