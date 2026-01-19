import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { promises as fs } from "fs";
import path from "path";
import type { Patient } from "@prisma/client";
import type { IntakeEntry, NormalizedIntake } from "@/lib/medlink/types";
import { logger } from '@/lib/logger';

const BACKGROUND = rgb(0.964, 0.956, 0.945);
const PRIMARY = rgb(0.090, 0.667, 0.482);
const TEXT = rgb(0.2, 0.2, 0.2);
const LIGHT_TEXT = rgb(0.4, 0.4, 0.4);

const LOGO_URL =
  process.env.INTAKE_PDF_LOGO_URL ??
  "https://static.wixstatic.com/media/c49a9b_3379db3991ba4ca48dcbb3a979570842~mv2.png";

type SectionFieldConfig = {
  id: string;
  label: string;
};

type SectionConfig = {
  title: string;
  fields: SectionFieldConfig[];
};

type PdfSection = {
  title: string;
  entries: { label: string; value: string }[];
};

const normalizeKey = (value?: string) => {
  if (!value) return "";
  // Keep the normalization consistent with intakeNormalizer.ts
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
};

const PDF_SECTION_CONFIG: SectionConfig[] = [
  {
    title: "Motivation & Consent",
    fields: [
      { id: "id-3fa4d158", label: "How would your life change by losing weight?" },
      { id: "id-f69d896b", label: "Terms of Use / Consents" },
      { id: "select-83c9e357", label: "State of Residence" },
      { id: "id-e48dcf94", label: "Marketing Consent" },
    ],
  },
  {
    title: "Vitals & Goals",
    fields: [
      { id: "id-cf20e7c9", label: "Ideal Weight" },
      { id: "id-703227a8", label: "Starting Weight" },
      { id: "id-3a7e6f11", label: "Height (feet)" },
      { id: "id-4a4a1f48", label: "Height (inches)" },
      { id: "bmi", label: "BMI" },
      { id: "lbs to lose", label: "Pounds to Lose" },
    ],
  },
  {
    title: "Lifestyle & Activity",
    fields: [
      { id: "id-74efb442", label: "Daily Physical Activity" },
      { id: "id-d560c374", label: "Alcohol Intake" },
    ],
  },
  {
    title: "Medical & Mental Health History",
    fields: [
      { id: "id-d79f4058", label: "Mental Health Diagnosis" },
      { id: "id-2835be1b", label: "Mental Health Details" },
      { id: "id-2ce042cd", label: "Chronic Illness" },
      { id: "id-481f7d3f", label: "Chronic Illness Details" },
      { id: "id-c6194df4", label: "Chronic Diseases History" },
      { id: "id-aa863a43", label: "Current Conditions" },
      { id: "id-49e5286f", label: "Family History" },
      { id: "id-88c19c78", label: "Medullary Thyroid Cancer History" },
      { id: "id-4bacb2db", label: "MEN Type-2 History" },
      { id: "id-eee84ce3", label: "Gastroparesis History" },
      { id: "id-22f7904b", label: "Type 2 Diabetes" },
      { id: "id-4dce53c7", label: "Pregnant or Breastfeeding" },
      { id: "id-ddff6d53", label: "Surgeries or Procedures" },
      { id: "mc-819b3225", label: "Blood Pressure" },
      { id: "id-c4320836", label: "Weight Loss Procedures" },
      { id: "id-3e6b8a5b", label: "Allergies" },
      { id: "id-04e1c88e", label: "List of Allergies" },
    ],
  },
  {
    title: "Medications & GLP-1 History",
    fields: [
      { id: "id-d2f1eaa4", label: "GLP-1 Medication History" },
      { id: "id-6a9fff95", label: "Side Effects When Starting Medication" },
      { id: "id-4b98a487", label: "Interested in Personalized Plan for Side Effects" },
      { id: "id-c5f1c21a", label: "Current GLP-1 Medication" },
      { id: "id-5001f3ff", label: "Semaglutide Dose" },
      { id: "id-9d592571", label: "Semaglutide Side Effects" },
      { id: "id-5e696841", label: "Semaglutide Success" },
      { id: "id-f38d521b", label: "Satisfied with Current GLP-1 Dose" },
      { id: "id-d95d25bd", label: "Current Medications/Supplements" },
      { id: "id-bc8ed703", label: "Medication/Supplement Details" },
      { id: "id-57f65753", label: "Tirzepatide Dose" },
      { id: "id-0fdd1b5a", label: "Tirzepatide Success" },
      { id: "id-709d58cb", label: "Tirzepatide Side Effects" },
    ],
  },
  {
    title: "Referral Source",
    fields: [
      { id: "id-345ac6b2", label: "How did you hear about us?" },
      { id: "utm_source", label: "UTM Source" },
      { id: "utm_medium", label: "UTM Medium" },
      { id: "utm_campaign", label: "UTM Campaign" },
      { id: "utm_content", label: "UTM Content" },
      { id: "utm_term", label: "UTM Term" },
      { id: "fbclid", label: "FBCLID" },
    ],
  },
];

let cachedFont: Uint8Array | null = null;
let cachedLogo: Uint8Array | null = null;

async function loadFont(): Promise<Uint8Array> {
  if (cachedFont) return cachedFont;
  const fontPath = path.join(process.cwd(), "public", "fonts", "Sofia-Pro-Regular.ttf");
  cachedFont = await fs.readFile(fontPath);
  return cachedFont;
}

async function loadLogo(): Promise<Uint8Array | null> {
  if (cachedLogo) return cachedLogo;
  try {
    const res = await fetch(LOGO_URL);
    if (!res.ok) {
      throw new Error(`Logo fetch failed: ${res.status}`);
    }
    const arrayBuffer = await res.arrayBuffer();
    cachedLogo = new Uint8Array(arrayBuffer);
    return cachedLogo;
  } catch (err: any) {
    // @ts-ignore
   
    logger.warn("Intake PDF: failed to fetch logo", { error: err });
    cachedLogo = null;
    return null;
  }
}

export async function generateIntakePdf(intake: NormalizedIntake, patient: Patient) {
  logger.debug("[PDF] Starting generation for submission:", { submissionId: intake.submissionId });
  logger.debug("[PDF] Total answers received:", { count: intake.answers.length });
  
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const pageSize: [number, number] = [612, 792];
  let page = doc.addPage(pageSize);
  const { width, height } = page.getSize();
  const fontBytes = await loadFont();
  const font = await doc.embedFont(fontBytes);
  const boldFont = font;
  
  let pageCount = 1;
  logger.debug("[PDF] Page 1 created");

  const applyBackground = () => {
    page.drawRectangle({
      x: 0,
      y: 0,
      width,
      height,
      color: BACKGROUND,
    });
  };
  applyBackground();

  const logoBytes = await loadLogo();
  let logo: any = null;
  if (logoBytes) {
    logo = await doc.embedPng(logoBytes);
  }

  const margin = 48;
  let cursor = height - 60;
  const addPage = () => {
    page = doc.addPage(pageSize);
    applyBackground();
    cursor = height - 60;
    pageCount++;
    logger.debug(`[PDF] Page ${pageCount} created`);
  };

  if (logo) {
    const targetWidth = 140;
    const scale = targetWidth / logo.width;
    const targetHeight = logo.height * scale;
    page.drawImage(logo, {
      x: margin,
      y: cursor - targetHeight,
      width: targetWidth,
      height: targetHeight,
    });
    cursor -= targetHeight + 20;
  }

  drawText(page, font, "Medical Intake Summary", margin, cursor, 22, PRIMARY);
  cursor -= 10;
  drawText(
    page,
    font,
    `Submission ID: ${intake.submissionId}`,
    margin,
    cursor,
    10,
    LIGHT_TEXT
  );
  cursor -= 30;

  cursor = drawSectionCards(page, font, boldFont, cursor, margin, width - margin, [
    {
      title: "Patient Profile",
      entries: [
        { label: "Patient", value: `${patient.firstName} ${patient.lastName}` },
        { label: "DOB", value: formatDobForPdf(patient.dob) },
        { label: "Gender", value: formatGender(patient.gender) },
        { label: "Phone", value: patient.phone },
        { label: "Email", value: patient.email },
        { label: "Address", value: buildAddress(patient) },
      ],
    },
  ]);

  cursor -= 10;

  // Standardize text width for all sections
  const standardTextWidth = width - (margin * 2) - 200; // Consistent width for label + value columns
  const labelColumnWidth = 180; // Fixed width for labels
  const valueColumnX = margin + labelColumnWidth + 20; // X position for values
  
  const displaySections = buildDisplaySections(intake);
  logger.debug("[PDF] Sections to render:", displaySections.map((s: any) => `${s.title} (${s.entries.length} items)`));
  
  displaySections.forEach((section: any) => {
    const drawHeader = (suffix = "") => {
      drawText(
        page,
        boldFont,
        `${section.title.toUpperCase()}${suffix}`,
        margin,
        cursor,
        12,
        LIGHT_TEXT
      );
      cursor -= 8;
    };

    if (cursor < 140) {
      addPage();
    }
    drawHeader();

    section.entries.forEach((entry, index) => {
      // Format the value to ensure proper display
      const formattedValue = formatAnswerValue(entry.value || "—");
      const measureHeight = () =>
        renderWrappedText(
          page,
          font,
          formattedValue,
          valueColumnX,
          cursor - 18,
          10,
          TEXT,
          standardTextWidth,
          true
        );

      let valueHeight = measureHeight();
      let rowHeight = Math.max(28, valueHeight + 12);

      if (cursor - rowHeight - 12 < 80) {
        addPage();
        drawHeader(index === 0 ? "" : " (CONT.)");
        valueHeight = measureHeight();
        rowHeight = Math.max(28, valueHeight + 12);
      }

      cursor -= 2;

      page.drawRectangle({
        x: margin,
        y: cursor - rowHeight,
        width: width - margin * 2,
        height: rowHeight,
        color: rgb(1, 1, 1),
        opacity: 0.96,
      });
      // Use black color for all labels now (including BMI)
      const labelColor = TEXT; // Changed from conditional coloring
      // Handle label wrapping for long labels
      const labelLines = wrapText(font, entry.label || "", 10, 180); // Wrap labels at 180px width
      const labelHeight = labelLines.length * 14; // 10pt font + 4pt line spacing
      
      // Adjust row height if label needs more space
      const adjustedRowHeight = Math.max(rowHeight, labelHeight + valueHeight + 8);
      
      // Redraw rectangle if height changed
      if (adjustedRowHeight > rowHeight) {
        // Clear the previous rectangle
        page.drawRectangle({
          x: margin,
          y: cursor - adjustedRowHeight,
          width: width - margin * 2,
          height: adjustedRowHeight,
          color: rgb(1, 1, 1),
          opacity: 0.96,
        });
      }
      
      // Draw wrapped label
      if (labelLines && labelLines.length > 0) {
        labelLines.forEach((line, idx) => {
          drawText(page, font, line, margin + 10, cursor - 18 - (idx * 14), 10, labelColor);
        });
      }
      // Adjust value position based on label height
      const valueY = cursor - 18 - (labelLines && labelLines.length > 1 ? (labelLines.length - 1) * 14 : 0);
      renderWrappedText(page, font, formattedValue, valueColumnX, valueY, 10, TEXT, standardTextWidth);
      cursor -= (adjustedRowHeight || rowHeight) + 4;
    });

    cursor -= 12;
  });

  cursor -= 10;
  // Always put legal block on a new page if not enough space
  // Legal block needs about 280-300px height
  if (cursor < 350) {
    addPage();
  }
  cursor = drawLegalBlock(page, font, boldFont, cursor, margin, width - margin, intake);

  const pdfBytes = await doc.save();
  logger.debug(`[PDF] Generation complete: ${pageCount} pages, ${displaySections.length} sections`);
  return Buffer.from(pdfBytes);
}

function drawText(page: any, font: any, text: string, x: number, y: number, size = 12, color = TEXT) {
  page.drawText(text, {
    x,
    y,
    size,
    font,
    color,
  });
}

function buildAddress(patient: Patient) {
  const lines: string[] = [];
  if (patient.address1) {
    lines.push(patient.address1);
  }
  if (patient.address2) {
    lines.push(patient.address2);
  }
  const cityState = [patient.city, patient.state].filter(Boolean).join(", ");
  const locality = [cityState, patient.zip].filter(Boolean).join(" ").trim();
  if (locality) {
    const normalized = lines.join(" ").toLowerCase();
    if (!normalized.includes(locality.toLowerCase())) {
      lines.push(locality);
    }
  }
  return lines.join("\n");
}

function drawSectionCards(
  page: any,
  font: any,
  boldFont: any,
  cursor: number,
  margin: number,
  maxWidth: number,
  sections: Array<{ title: string; entries: { label: string; value: string }[] }>
) {
  sections.forEach((section: any) => {
    cursor -= 6;
    drawText(page, boldFont, section.title, margin, cursor, 14, TEXT);
    cursor -= 8;
    cursor = drawCard(page, font, margin, cursor, maxWidth, section.entries);
    cursor -= 12;
  });
  return cursor;
}

function drawCard(
  page: any,
  font: any,
  margin: number,
  cursor: number,
  maxWidth: number,
  entries: { label: string; value: string }[]
) {
  const cardPadding = 14;
  // Use consistent text width across all rendering
  const textWidth = maxWidth - margin - 36; // Adjusted for card padding
  const entryHeights = entries.map((entry: any) => {
    const valueHeight = renderWrappedText(
      page,
      font,
      entry.value || "—",
      margin + 12,
      cursor,
      12,
      TEXT,
      textWidth,
      true
    );
    return Math.max(28, valueHeight + 10);
  });
  const entryHeight = entryHeights.reduce((sum, h) => sum + h, 0) + cardPadding * 2;

  page.drawRectangle({
    x: margin,
    y: cursor - entryHeight,
    width: maxWidth - margin,
    height: entryHeight,
    color: rgb(1, 1, 1),
    borderColor: PRIMARY,
    borderWidth: 1,
    opacity: 0.98,
    borderOpacity: 0.2,
  });

  let innerCursor = cursor - cardPadding - 12;
  entries.forEach((entry, index) => {
    drawText(page, font, entry.label.toUpperCase(), margin + 12, innerCursor, 9, LIGHT_TEXT);
    // Parse and format the value for better display
    const formattedValue = entry.label === "Address" ? entry.value : formatAnswerValue(entry.value || "—");
    renderWrappedText(page, font, formattedValue, margin + 12, innerCursor - 12, 12, TEXT, textWidth);
    innerCursor -= entryHeights[index];
  });

  return cursor - entryHeight;
}

function wrapText(font: any, text: string, size: number, maxWidth: number) {
  const sanitized = (text ?? "").toString().replace(/\r/g, "");
  const paragraphs = sanitized.split("\n");
  const lines: string[] = [];
  paragraphs.forEach((paragraph: any) => {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let current = "";
    words.forEach((word: any) => {
      const candidate = current ? `${current} ${word}` : word;
      const width = font.widthOfTextAtSize(candidate, size);
      if (width > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    });
    if (current) {
      lines.push(current);
    } else if (lines.length === 0) {
      lines.push("");
    }
  });
  return lines.length > 0 ? lines : [""];
}

function renderWrappedText(
  page: any,
  font: any,
  text: string,
  x: number,
  startY: number,
  size: number,
  color: any,
  maxWidth: number,
  calculateOnly = false
) {
  const lines = wrapText(font, text || "—", size, maxWidth);
  const lineHeight = size + 4;
  if (!calculateOnly) {
    lines.forEach((line, idx) => {
      const y = startY - idx * lineHeight;
      page.drawText(line, {
        x,
        y,
        size,
        font,
        color,
      });
    });
  }
  return lines.length * lineHeight;
}

function buildDisplaySections(intake: NormalizedIntake): PdfSection[] {
  const answerMap = new Map<string, IntakeEntry>();
  const answersList: IntakeEntry[] = [];
  const unmatchedFields: string[] = [];
  
  intake.answers.forEach((entry: any) => {
    const normalizedId = normalizeKey(entry.id);
    answerMap.set(normalizedId, entry);
    answersList.push(entry);
  });

  const used = new Set<string>();
  const sections: PdfSection[] = [];

  // First, try to match fields to predefined sections
  PDF_SECTION_CONFIG.forEach((sectionConfig: any) => {
    const entries = sectionConfig.fields
      .map((field: any) => {
        const normalizedId = normalizeKey(field.id);
        const directMatch = answerMap.get(normalizedId);
        if (directMatch && directMatch.value) {
          used.add(normalizeKey(directMatch.id));
          return { label: field.label ?? directMatch.label, value: formatAnswerValue(directMatch.value) };
        }
        const labelKey = normalizeKey(field.label ?? "");
        if (labelKey) {
          const labelMatch = answersList.find(
            (entry: any) =>
              entry.value &&
              entry.label &&
              normalizeKey(entry.label).includes(labelKey) &&
              !used.has(normalizeKey(entry.id))
          );
          if (labelMatch) {
            used.add(normalizeKey(labelMatch.id));
            return { label: field.label ?? labelMatch.label, value: formatAnswerValue(labelMatch.value) };
          }
        }
        return null;
      })
      .filter(Boolean) as PdfSection["entries"];

    if (entries.length > 0) {
      sections.push({
        title: sectionConfig.title,
        entries,
      });
    }
  });

  // Fields to exclude from Additional Responses
  const excludeFromAdditional = [
    'address [country]',
    'address [state]', 
    'address [city]',
    'address [street]',
    'address [house]',
    'address [state_code]',
    'address [latitude]',
    'address [longitude]'
  ];
  
  // Categorize remaining fields into medical and non-medical
  const medicalEntries: PdfSection["entries"] = [];
  const otherEntries: PdfSection["entries"] = [];
  
  // Keywords that indicate medical fields
  const medicalKeywords = [
    'medical', 'health', 'medication', 'drug', 'allerg', 'condition', 'disease', 
    'illness', 'surgery', 'procedure', 'treatment', 'therapy', 'diagnosis', 
    'symptom', 'pain', 'blood', 'pressure', 'diabetes', 'cancer', 'weight',
    'bmi', 'dose', 'glp', 'semaglutide', 'tirzepatide', 'ozempic', 'wegovy',
    'pregnant', 'breastfeed', 'thyroid', 'gastroparesis', 'men type', 'side effect',
    'chronic', 'acute', 'history', 'family', 'genetic', 'hereditary'
  ];
  
  intake.answers
    .filter((entry: any) => {
      // Skip if already used
      if (!entry.value || used.has(normalizeKey(entry.id))) return false;
      
      // Skip unwanted address subfields
      const labelLower = entry.label?.toLowerCase() || '';
      if (excludeFromAdditional.some((exclude: any) => labelLower.includes(exclude.toLowerCase()))) {
        return false;
      }
      
      return true;
    })
    .forEach((entry: any) => {
      unmatchedFields.push(`${entry.id}: ${entry.label}`);
      
      // Clean up label
      let displayLabel = entry.label;
      if (displayLabel?.toLowerCase().includes('address [zip]')) {
        displayLabel = 'Zip Code';
      }
      
      const formattedEntry = {
        label: displayLabel || entry.id,
        value: formatAnswerValue(entry.value),
      };
      
      // Check if this is a medical field
      const labelLower = (entry.label || entry.id || '').toLowerCase();
      const isMedical = medicalKeywords.some((keyword: any) => labelLower.includes(keyword));
      
      if (isMedical) {
        medicalEntries.push(formattedEntry);
      } else {
        otherEntries.push(formattedEntry);
      }
    });

  // Add medical fields section if there are any
  if (medicalEntries.length > 0) {
    logger.debug(`[PDF] Additional medical fields found:`, { count: medicalEntries.length });
    sections.push({
      title: "Additional Medical Information",
      entries: medicalEntries,
    });
  }
  
  // Add other responses if there are any
  if (otherEntries.length > 0) {
    logger.debug(`[PDF] Other unmatched fields:`, { count: otherEntries.length });
    sections.push({
      title: "Additional Responses",
      entries: otherEntries,
    });
  }
  
  if (unmatchedFields.length > 0) {
    logger.debug(`[PDF] All unmatched fields:`, { value: unmatchedFields });
  }

  return sections;
}

function drawLegalBlock(
  page: any,
  font: any,
  boldFont: any,
  cursor: number,
  margin: number,
  maxWidth: number,
  intake: NormalizedIntake
) {
  const LEGAL_TEXT = [
    "Privacy Policy & HIPAA Compliance: I understand my health data is stored securely in accordance with HIPAA regulations and will be used solely for treatment coordination. I acknowledge that my protected health information (PHI) will be shared only with authorized healthcare providers and pharmacy partners involved in my care.",
    "Weight-Loss Treatment Consent: I authorize EONMEDS and its affiliated medical professionals to review my intake form, laboratory results, vital signs, and medical history to determine candidacy for GLP-1 receptor agonists and adjunct therapies. I understand that treatment recommendations are based on medical evaluation and may be modified or discontinued based on clinical response.",
    "Telehealth Services Agreement: I consent to receive healthcare services via telehealth technology and understand that these services are subject to the same standards of care as in-person visits. I acknowledge that technical issues may occasionally affect service delivery and that alternative arrangements will be made when necessary.",
    "Financial Responsibility & Cancellation Policy: I understand that cancellations or rescheduling within 24 hours of scheduled appointments may incur fees up to the full consultation cost. I acknowledge responsibility for all charges not covered by insurance and agree to the payment terms outlined in the financial agreement.",
    "Informed Consent & Risk Acknowledgment: I have been informed of the potential risks, benefits, and alternatives to GLP-1 therapy. I understand that individual results may vary and that no specific outcome is guaranteed. I agree to report any adverse effects immediately to my healthcare provider.",
  ];
  
  // Start from top of page if we just added a new page
  const pageHeight = 792; // Standard letter page height
  if (cursor > pageHeight - 100) {
    cursor = pageHeight - 60;
  }

  const blockPadding = 14;
  const blockWidth = maxWidth - margin;
  // Calculate actual height needed for all text
  const bodyHeight = LEGAL_TEXT.reduce((acc, line) => {
    const wrapHeight = renderWrappedText(
      page,
      font,
      `• ${line}`,
      margin + blockPadding,
      cursor,
      8,
      TEXT,
      blockWidth - blockPadding * 2,
      true
    );
    return acc + wrapHeight + 5;
  }, 0);
  const blockHeight = bodyHeight + blockPadding * 2 + 120; // Extra space for header and signature
  page.drawRectangle({
    x: margin,
    y: cursor - blockHeight,
    width: blockWidth,
    height: blockHeight,
    color: rgb(1, 1, 1),
    borderColor: PRIMARY,
    borderWidth: 1,
    opacity: 0.96,
  });

  let innerCursor = cursor - 24;
  // Use subtle gray background for header instead of mint green
  const headerBg = rgb(0.95, 0.95, 0.95);
  page.drawRectangle({
    x: margin,
    y: innerCursor - 4,
    width: blockWidth,
    height: 20,
    color: headerBg,
    opacity: 0.1,
  });
  drawText(page, boldFont, "Legal Disclosures & Consents", margin + blockPadding, innerCursor, 12, PRIMARY);
  innerCursor -= 24;

  LEGAL_TEXT.forEach((line: any) => {
    const usedHeight = renderWrappedText(
      page,
      font,
      `• ${line}`,
      margin + blockPadding,
      innerCursor,
      8,
      TEXT,
      blockWidth - blockPadding * 2
    );
    innerCursor -= usedHeight + 5;
  });

  // Check if we have enough space for the signature stamp (need 75px)
  if (innerCursor - 75 < 40) {
    // Not enough space, the block is too tall for the page
    logger.warn("[PDF] Legal block may be cut off - consider adding another page");
  }
  innerCursor -= 6;
  drawStamp(page, font, margin + blockPadding, innerCursor, intake);

  return cursor - blockHeight;
}

function drawStamp(page: any, font: any, x: number, cursor: number, intake: NormalizedIntake) {
  const stampHeight = 75;
  const stampWidth = 280;
  page.drawRectangle({
    x,
    y: cursor - stampHeight,
    width: stampWidth,
    height: stampHeight,
    borderColor: PRIMARY,
    borderWidth: 1.5,
    color: rgb(1, 1, 1),
  });

  drawText(page, font, "Digitally signed by", x + 12, cursor - 16, 9, LIGHT_TEXT);
  drawText(page, font, intake.patient.firstName + " " + intake.patient.lastName, x + 12, cursor - 30, 12, TEXT);
  drawText(
    page,
    font,
    new Date(intake.submittedAt).toLocaleString(),
    x + 12,
    cursor - 44,
    10,
    TEXT
  );
  // Add submission ID as unique identifier
  drawText(
    page,
    font,
    `Submission ID: ${intake.submissionId}`,
    x + 12,
    cursor - 58,
    8,
    LIGHT_TEXT
  );
}

function formatDobForPdf(dob?: string | null) {
  if (!dob) return "—";
  const trimmed = dob.trim();
  if (!trimmed) return "—";
  if (trimmed.includes("/")) return trimmed;
  const parts = trimmed.split("-");
  if (parts.length === 3) {
    const [year, month, day] = parts;
    if (year && month && day) {
      return `${month.padStart(2, "0")}/${day.padStart(2, "0")}/${year}`;
    }
  }
  return trimmed;
}

function formatGender(gender?: string | null) {
  if (!gender) return "—";
  const g = gender.toLowerCase().trim();
  if (g === 'f' || g === 'female' || g === 'woman') return "Female";
  if (g === 'm' || g === 'male' || g === 'man') return "Male";
  return gender;
}

function formatAnswerValue(value: string): string {
  if (!value) return "—";
  
  // Clean up any encoding issues and common corruptions
  let cleanValue = value
    .replace(/Enj8ying/gi, "Enjoying") // Fix specific corruption
    .replace(/weigh\w*ying/gi, "weight? Enjoying") // Fix weight corruption pattern
    .replace(/\u00e2\u0080\u0099/g, "'")
    .replace(/\u00e2\u0080\u009c/g, '"')
    .replace(/\u00e2\u0080\u009d/g, '"')
    .replace(/\u00e2\u0080\u0093/g, '-')
    .replace(/\u00e2\u0080\u0094/g, '--')
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove control characters
    .trim();
  
  // Try to parse JSON values
  try {
    const parsed = JSON.parse(cleanValue);
    if (typeof parsed === 'object' && parsed !== null) {
      // Handle checkbox/boolean values
      if ('checked' in parsed) {
        return parsed.checked ? "Yes" : "No";
      }
      // Handle arrays
      if (Array.isArray(parsed)) {
        return parsed.filter((item: any) => item && item !== "None of the above").join(", ") || "None";
      }
      // Handle other objects - stringify nicely
      return Object.entries(parsed)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ");
    }
  } catch {
    // Not JSON, use as-is
  }
  
  // Clean up common patterns - use [X] for checked boxes for better PDF compatibility
  if (cleanValue === "true" || cleanValue === "True" || cleanValue === "TRUE") return "[X] Yes";
  if (cleanValue === "false" || cleanValue === "False" || cleanValue === "FALSE") return "[ ] No";
  
  // Final cleanup for display
  return cleanValue
    .replace(/\s+/g, ' ') // Normalize whitespace
    .replace(/([a-z])([A-Z])/g, '$1 $2'); // Add space between camelCase
}
