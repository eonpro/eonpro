/**
 * Quest Diagnostics bloodwork PDF parser.
 * Structure-aware, accurate extraction of specimen metadata and test results
 * from Quest lab report PDFs (multi-page, table layout).
 * PHI: Do not log patient names, DOB, or result values.
 */

import { logger } from '@/lib/logger';

/** Units we expect in reference ranges (order matters for greedy match) */
const UNITS = [
  'Thousand/uL',
  'Million/uL',
  'mg/dL',
  'mmol/L',
  'U/L',
  'pg/mL',
  'ng/mL',
  'ng/dL',
  'g/dL',
  'mL/min/1.73m2',
  'mIU/mL',
];

/** Known Quest test names (exact or prefix) for reliable row detection. Uppercase, one per line. */
const QUEST_TEST_NAMES = new Set([
  'CHOLESTEROL, TOTAL',
  'HDL CHOLESTEROL',
  'TRIGLYCERIDES',
  'LDL-CHOLESTEROL',
  'LDL CHOLESTEROL',
  'CHOL/HDLC RATIO',
  'NON HDL CHOLESTEROL',
  'APOLIPOPROTEIN B',
  'APO B',
  'LIPOPROTEIN (A)',
  'LP(A)',
  'GLUCOSE',
  'UREA NITROGEN (BUN)',
  'BUN',
  'CREATININE',
  'EGFR',
  'eGFR',
  'BUN/CREATININE RATIO',
  'SODIUM',
  'POTASSIUM',
  'CHLORIDE',
  'CARBON DIOXIDE',
  'CALCIUM',
  'PROTEIN, TOTAL',
  'ALBUMIN',
  'GLOBULIN',
  'ALBUMIN/GLOBULIN RATIO',
  'BILIRUBIN, TOTAL',
  'ALKALINE PHOSPHATASE',
  'AST',
  'ALT',
  'T3, FREE',
  'T4, FREE',
  'TSH',
  'TESTOSTERONE, TOTAL, MS',
  'TESTOSTERONE, TOTAL',
  'TESTOSTERONE, FREE',
  'FSH',
  'LH',
  'PROLACTIN',
  'ESTRADIOL',
  'PSA, TOTAL',
  'PSA, FREE',
  'PSA, % FREE',
  'VITAMIN D',
  'VITAMIN B12',
  'FERRITIN',
  'IRON',
  'TIBC',
  'WHITE BLOOD CELL COUNT',
  'WBC',
  'RED BLOOD CELL COUNT',
  'RBC',
  'HEMOGLOBIN',
  'HEMATOCRIT',
  'PLATELET COUNT',
  'MCV',
  'MCH',
  'MCHC',
  'RDW',
  'MPV',
  'ABSOLUTE NEUTROPHILS',
  'ABSOLUTE LYMPHOCYTES',
  'ABSOLUTE MONOCYTES',
  'ABSOLUTE EOSINOPHILS',
  'ABSOLUTE BASOPHILS',
  'NEUTROPHILS',
  'LYMPHOCYTES',
  'MONOCYTES',
  'EOSINOPHILS',
  'BASOPHILS',
]);

/** Test name -> category for display grouping */
const TEST_CATEGORY_MAP: Record<string, string> = {
  'CHOLESTEROL, TOTAL': 'heart',
  'HDL CHOLESTEROL': 'heart',
  'TRIGLYCERIDES': 'heart',
  'LDL-CHOLESTEROL': 'heart',
  'LDL CHOLESTEROL': 'heart',
  'CHOL/HDLC RATIO': 'heart',
  'NON HDL CHOLESTEROL': 'heart',
  'APOLIPOPROTEIN B': 'heart',
  'APO B': 'heart',
  'LIPOPROTEIN (A)': 'heart',
  'LP(A)': 'heart',
  'GLUCOSE': 'metabolic',
  'UREA NITROGEN (BUN)': 'metabolic',
  'BUN': 'metabolic',
  'CREATININE': 'metabolic',
  'EGFR': 'metabolic',
  'eGFR': 'metabolic',
  'BUN/CREATININE RATIO': 'metabolic',
  'SODIUM': 'metabolic',
  'POTASSIUM': 'metabolic',
  'CHLORIDE': 'metabolic',
  'CARBON DIOXIDE': 'metabolic',
  'CALCIUM': 'metabolic',
  'PROTEIN, TOTAL': 'metabolic',
  'ALBUMIN': 'metabolic',
  'GLOBULIN': 'metabolic',
  'ALBUMIN/GLOBULIN RATIO': 'metabolic',
  'BILIRUBIN, TOTAL': 'liver',
  'ALKALINE PHOSPHATASE': 'liver',
  'AST': 'liver',
  'ALT': 'liver',
  'T3, FREE': 'hormones',
  'T4, FREE': 'hormones',
  'TSH': 'hormones',
  'TESTOSTERONE, TOTAL, MS': 'hormones',
  'TESTOSTERONE, TOTAL': 'hormones',
  'TESTOSTERONE, FREE': 'hormones',
  'FSH': 'hormones',
  'LH': 'hormones',
  'PROLACTIN': 'hormones',
  'ESTRADIOL': 'hormones',
  'PSA, TOTAL': 'hormones',
  'PSA, FREE': 'hormones',
  'PSA, % FREE': 'hormones',
  'VITAMIN D': 'nutrients',
  'VITAMIN B12': 'nutrients',
  'FERRITIN': 'nutrients',
  'IRON': 'nutrients',
  'TIBC': 'nutrients',
  'WHITE BLOOD CELL COUNT': 'blood',
  'WBC': 'blood',
  'RED BLOOD CELL COUNT': 'blood',
  'RBC': 'blood',
  'HEMOGLOBIN': 'blood',
  'HEMATOCRIT': 'blood',
  'PLATELET COUNT': 'blood',
  'MCV': 'blood',
  'MCH': 'blood',
  'MCHC': 'blood',
  'RDW': 'blood',
  'MPV': 'blood',
};

/** Patient name as it appears on the Quest report (for profile match check). Not logged. */
export interface ParsedPatientName {
  lastName: string;
  firstName: string;
}

export interface QuestParsedResult {
  specimenId?: string;
  collectedAt?: Date;
  reportedAt?: Date;
  fasting?: boolean;
  /** Name on the PDF (LAST, FIRST). Used only for server-side match with profile; never log. */
  parsedPatientName?: ParsedPatientName;
  results: QuestParsedRow[];
}

export interface QuestParsedRow {
  testName: string;
  value: string;
  valueNumeric: number | null;
  unit: string;
  referenceRange: string;
  flag: string | null;
  category: string;
}

const DATE_ONLY = /(\d{1,2})\/(\d{1,2})\/(\d{4})/;
const DATE_AND_TIME = /(\d{1,2})\/(\d{1,2})\/(\d{4})\s*\/\s*(\d{1,2}):(\d{2})\s*(EST|EDT|CST|CDT|PST|PDT|UTC)?/i;

function parseQuestDate(dateStr: string, timeStr?: string): Date | undefined {
  const withTime = dateStr.match(DATE_AND_TIME);
  if (withTime) {
    const [, month, day, year, h, min] = withTime;
    const d = new Date(
      parseInt(year, 10),
      parseInt(month, 10) - 1,
      parseInt(day, 10),
      parseInt(h, 10),
      parseInt(min, 10)
    );
    return isNaN(d.getTime()) ? undefined : d;
  }
  const dateMatch = dateStr.match(DATE_ONLY);
  if (!dateMatch) return undefined;
  const [, month, day, year] = dateMatch;
  const d = new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10));
  return isNaN(d.getTime()) ? undefined : d;
}

/** Value token: number, optional H/L, or <30 style. Quest puts abnormal values with H/L in Out Of Range column. */
const VALUE_REGEX = /^([<>]?\s*OR\s*=\s*)?[\d.]+(?:\s*[HL])?$|^[<>]\s*[\d.]+$/i;

function parseValueAndFlag(raw: string): { value: string; valueNumeric: number | null; flag: string | null } {
  const trimmed = (raw || '').trim();
  let flag: string | null = null;
  let valueStr = trimmed;
  const hlMatch = trimmed.match(/^(.+?)\s+([HL])\s*$/i);
  if (hlMatch) {
    valueStr = hlMatch[1].trim();
    flag = hlMatch[2].toUpperCase() as 'H' | 'L';
  }
  if (/^[<>]/.test(valueStr)) {
    return { value: valueStr, valueNumeric: null, flag };
  }
  const num = parseFloat(valueStr.replace(/[,]/g, ''));
  return {
    value: valueStr,
    valueNumeric: isNaN(num) ? null : num,
    flag,
  };
}

function normalizeTestName(name: string): string {
  return name.toUpperCase().replace(/\s+/g, ' ').replace(/\s*\.\.\.\s*$/, '').trim();
}

function getCategory(testName: string): string {
  const key = normalizeTestName(testName);
  if (TEST_CATEGORY_MAP[key]) return TEST_CATEGORY_MAP[key];
  for (const [pattern, category] of Object.entries(TEST_CATEGORY_MAP)) {
    if (key.includes(pattern) || pattern.includes(key)) return category;
  }
  if (/CHOLESTEROL|HDL|LDL|TRIGLYCERIDE|LIPID|APO|LIPOPROTEIN/i.test(key)) return 'heart';
  if (/GLUCOSE|BUN|CREATININE|EGFR|SODIUM|POTASSIUM|ALBUMIN|BILIRUBIN|AST|ALT|ALKALINE|CARBON|CALCIUM|PROTEIN|GLOBULIN|CHLORIDE/i.test(key)) return 'metabolic';
  if (/TESTOSTERONE|ESTRADIOL|FSH|LH|TSH|T3|T4|PROLACTIN|PSA/i.test(key)) return 'hormones';
  if (/WBC|RBC|HEMOGLOBIN|HEMATOCRIT|PLATELET|MCV|MCH|NEUTROPHIL|LYMPHOCYTE|MONOCYTE|EOSINOPHIL|BASOPHIL/i.test(key)) return 'blood';
  if (/VITAMIN|FERRITIN|IRON|TIBC|B12/i.test(key)) return 'nutrients';
  return 'other';
}

/** True if s looks like a reference range (numbers, comparison, range, unit) */
function looksLikeReference(s: string): boolean {
  const t = s.trim();
  if (!t || /^SEE\s+NOTE|^Not\s+Reported/i.test(t)) return false;
  if (/^[\d.<>=\-–]+\s*-\s*[\d.<>=\-–]+/.test(t)) return true;
  if (/^[<>]\s*OR\s*=\s*[\d.]+/i.test(t)) return true;
  if (/^>\s*OR\s*=\s*[\d.]+/i.test(t)) return true;
  if (/^[<>]\s*[\d.]+/.test(t)) return true;
  if (/^[\d.]+/.test(t) && (/\s*(?:mg\/dL|mmol\/L|U\/L|pg\/mL|ng\/mL|g\/dL|%|Thousand\/uL|Million\/uL)\s*(?:\(calc\))?\s*$/i.test(t) || /\(calc\)\s*$/i.test(t))) return true;
  if (/^[\d.]+\s*-\s*[\d.]+/.test(t)) return true;
  return false;
}

/** Extract unit from reference string */
function extractUnit(ref: string): string {
  for (const u of UNITS) {
    if (new RegExp(u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(ref)) return u;
  }
  const m = ref.match(/(mg\/dL|mmol\/L|U\/L|pg\/mL|ng\/mL|g\/dL|%|Thousand\/uL|Million\/uL)/i);
  return m ? m[1] : '';
}

/** Check if token is a known Quest test name (exact or starts with) */
function isKnownTestName(token: string): boolean {
  const n = normalizeTestName(token);
  if (QUEST_TEST_NAMES.has(n)) return true;
  for (const known of QUEST_TEST_NAMES) {
    if (n === known || n.startsWith(known + ' ') || (known.length > 4 && n.includes(known))) return true;
  }
  return false;
}

/**
 * Get best test name from start of parts: exact match or join tokens until we match.
 * Quest columns: "CHOLESTEROL, TOTAL" can be one token or "CHOLESTEROL," + "TOTAL".
 */
function consumeTestName(parts: string[]): { name: string; rest: string[] } {
  if (parts.length === 0) return { name: '', rest: [] };
  const first = normalizeTestName(parts[0]);
  if (QUEST_TEST_NAMES.has(first)) return { name: first, rest: parts.slice(1) };
  for (let k = 2; k <= Math.min(parts.length, 5); k++) {
    const joined = parts.slice(0, k).join(' ');
    const n = normalizeTestName(joined);
    if (QUEST_TEST_NAMES.has(n)) return { name: n, rest: parts.slice(k) };
  }
  if (isKnownTestName(parts[0])) return { name: first, rest: parts.slice(1) };
  return { name: first, rest: parts.slice(1) };
}

/** Check if token looks like a numeric value (with optional H/L) */
function isValueToken(token: string): boolean {
  return VALUE_REGEX.test(token) || /^[\d.]+$/.test(token) || /^[\d.]+\s*[HL]\s*$/i.test(token);
}

/**
 * Parse Quest-style PDF text with structure-aware logic:
 * - Extract specimen block (Specimen, Collected, Reported, Fasting)
 * - Parse result table: Test Name | In Range | Out Of Range | Reference Range
 * - Handle multi-space or tab column separation
 * - Use known test names for reliability
 */
export function parseQuestText(fullText: string): QuestParsedResult {
  const lines = fullText.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const result: QuestParsedResult = { results: [] };
  let specimenId: string | undefined;
  let collectedAt: Date | undefined;
  let reportedAt: Date | undefined;
  let fasting: boolean | undefined;
  let parsedPatientName: ParsedPatientName | undefined;

  // --- Patient name (Quest: "Patient Name: LAST, FIRST" or "LAST, FIRST" in header) ---
  const patientNameLine = /Patient\s+Name:?\s*(.+)/i;
  const lastFirstComma = /^([A-Za-z\-\'\s]+),\s*([A-Za-z\-\'\s]+)$/;
  const notNameLike = /^\s*(Specimen|Collected|Reported|Test\s+Name|Reference|Page\s+\d|Quest|Report\s+Status|SEE\s+NOTE|\d)/i;
  for (let i = 0; i < Math.min(lines.length, 60); i++) {
    const line = lines[i];
    if (notNameLike.test(line) || /\d{2}\/\d{2}\/\d{4}/.test(line)) continue;
    const labelMatch = line.match(patientNameLine);
    const namePart = (labelMatch ? labelMatch[1].trim() : line.trim()).replace(/\s+/g, ' ');
    if (!lastFirstComma.test(namePart)) continue;
    const m = namePart.match(lastFirstComma);
    if (!m) continue;
    const last = m[1].trim().toUpperCase().replace(/\s+/g, ' ');
    const first = m[2].trim().toUpperCase().replace(/\s+/g, ' ');
    if (last.length >= 2 && first.length >= 2 && last.length <= 80 && first.length <= 80 && !/\d/.test(last) && !/\d/.test(first)) {
      parsedPatientName = { lastName: last, firstName: first };
      break;
    }
  }
  result.parsedPatientName = parsedPatientName;

  // --- Metadata ---
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const spec = line.match(/Specimen:?\s*([A-Z0-9]+)/i);
    if (spec) specimenId = spec[1];
    const coll = line.match(/Collected:?\s*([\d\/\s:]+\s*(?:EST|EDT|CST|CDT|PST|PDT)?)/i);
    if (coll) collectedAt = parseQuestDate(coll[1]);
    const rep = line.match(/Reported:?\s*([\d\/\s:]+\s*(?:EST|EDT|CST|CDT|PST|PDT)?)/i);
    if (rep) reportedAt = parseQuestDate(rep[1]);
    const rec = line.match(/Received:?\s*([\d\/\s:]+\s*(?:EST|EDT|CST|CDT|PST|PDT)?)/i);
    if (rec && !reportedAt) reportedAt = parseQuestDate(rec[1]);
    if (/Fasting:?\s*([YN])\b/i.test(line)) {
      const m = line.match(/Fasting:?\s*([YN])/i);
      if (m) fasting = m[1].toUpperCase() === 'Y';
    }
    if (/FASTING:?\s*NO\b/i.test(line)) fasting = false;
    if (/FASTING:?\s*YES\b/i.test(line)) fasting = true;
  }
  result.specimenId = specimenId;
  result.collectedAt = collectedAt ?? undefined;
  result.reportedAt = reportedAt ?? undefined;
  result.fasting = fasting;

  // --- Result rows: table columns often separated by 2+ spaces or tabs ---
  const skipLine = (line: string): boolean =>
    /^(Test Name|In Range|Out Of Range|Reference Range|Lab)\s*$/i.test(line) ||
    /PAGE\s+\d+\s+OF\s+\d+/i.test(line) ||
    /Quest Diagnostics|Report Status|CLIENT SERVICES|Disclaimer|trademark/i.test(line) ||
    /^COMMENTS\s*\/\s*FASTING/i.test(line) ||
    line.length < 2;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (skipLine(line)) continue;

    const parts = line.split(/\s{2,}|\t/).map((p) => p.trim()).filter(Boolean);
    if (parts.length < 2) continue;

    const { name: testNameFromParts, rest: restAfterName } = consumeTestName(parts);
    const firstNorm = testNameFromParts || normalizeTestName(parts[0]);
    const isKnownTest = testNameFromParts.length > 0 && (QUEST_TEST_NAMES.has(firstNorm) || isKnownTestName(parts[0]));

    if (isKnownTest && restAfterName.length >= 1) {
      let valueToken: string | null = null;
      let refToken: string | null = null;
      for (let k = 0; k < restAfterName.length; k++) {
        if (isValueToken(restAfterName[k])) {
          valueToken = restAfterName[k];
          if (k + 1 < restAfterName.length && looksLikeReference(restAfterName[k + 1])) refToken = restAfterName[k + 1];
          break;
        }
      }
      if (!valueToken && restAfterName.length >= 1 && isValueToken(restAfterName[restAfterName.length - 1])) valueToken = restAfterName[restAfterName.length - 1];
      if (!valueToken && restAfterName.length >= 2 && isValueToken(restAfterName[restAfterName.length - 2])) valueToken = restAfterName[restAfterName.length - 2];
      if (!refToken && restAfterName.length >= 1 && looksLikeReference(restAfterName[restAfterName.length - 1])) refToken = restAfterName[restAfterName.length - 1];
      if (!refToken && restAfterName.length >= 2 && looksLikeReference(restAfterName[restAfterName.length - 2])) refToken = restAfterName[restAfterName.length - 2];

      if (valueToken) {
        const { value, valueNumeric, flag } = parseValueAndFlag(valueToken);
        const referenceRange = refToken ?? '';
        const unit = extractUnit(referenceRange);
        result.results.push({
          testName: firstNorm,
          value,
          valueNumeric,
          unit,
          referenceRange,
          flag,
          category: getCategory(firstNorm),
        });
        continue;
      }
    }

    // Same line: "TEST NAME  value  ref" (value and ref adjacent at end)
    if (parts.length >= 3 && isValueToken(last)) {
      const ref = looksLikeReference(secondLast) ? secondLast : last;
      const valuePart = looksLikeReference(secondLast) ? last : secondLast;
      if (!isValueToken(valuePart)) continue;
      const testName = parts.slice(0, looksLikeReference(secondLast) ? -2 : -1).join(' ').trim();
      if (testName.length < 2) continue;
      const { value, valueNumeric, flag } = parseValueAndFlag(valuePart);
      const referenceRange = looksLikeReference(secondLast) ? secondLast : '';
      const unit = extractUnit(referenceRange);
      result.results.push({
        testName: normalizeTestName(testName),
        value,
        valueNumeric,
        unit,
        referenceRange,
        flag,
        category: getCategory(testName),
      });
    }
  }

  // --- Fallback: regex for "NAME  value  ref" on one line (2+ spaces between columns) ---
  const oneLine = /^([A-Z0-9][A-Z0-9\s\/,\-\.\(\)]+?)\s{2,}([\d.<>=]+(?:\s*[HL])?)\s{2,}(.+)$/i;
  for (const line of lines) {
    if (skipLine(line)) continue;
    const m = line.match(oneLine);
    if (!m) continue;
    const [, name, valuePart, refPart] = m;
    const nameNorm = normalizeTestName((name ?? '').trim());
    if (nameNorm.length < 2) continue;
    if (!looksLikeReference(refPart) && !/[\d.<>=\-–]/.test(refPart)) continue;
    const { value, valueNumeric, flag } = parseValueAndFlag(valuePart);
    const referenceRange = refPart.trim();
    const unit = extractUnit(referenceRange);
    const existing = result.results.find((r) => normalizeTestName(r.testName) === nameNorm);
    if (!existing) {
      result.results.push({
        testName: nameNorm,
        value,
        valueNumeric,
        unit,
        referenceRange,
        flag,
        category: getCategory(nameNorm),
      });
    }
  }

  // --- Fallback: single-space split — ref at end (number + unit), then value, rest = test name ---
  for (const line of lines) {
    if (skipLine(line)) continue;
    const tokens = line.split(/\s+/);
    if (tokens.length < 3) continue;
    let refStart = -1;
    for (let i = tokens.length - 1; i >= 0; i--) {
      const t = tokens.slice(i).join(' ');
      if (looksLikeReference(t) || extractUnit(t)) {
        refStart = i;
        break;
      }
    }
    if (refStart <= 0) continue;
    const valueIdx = refStart - 1;
    const valuePart = tokens[valueIdx];
    if (!isValueToken(valuePart)) continue;
    const namePart = tokens.slice(0, valueIdx).join(' ');
    const nameNorm = normalizeTestName(namePart);
    if (nameNorm.length < 2) continue;
    const existing = result.results.find((r) => normalizeTestName(r.testName) === nameNorm);
    if (existing) continue;
    const referenceRange = tokens.slice(refStart).join(' ');
    if (!looksLikeReference(referenceRange) && !extractUnit(referenceRange)) continue;
    const { value, valueNumeric, flag } = parseValueAndFlag(valuePart);
    const unit = extractUnit(referenceRange);
    result.results.push({
      testName: nameNorm,
      value,
      valueNumeric,
      unit,
      referenceRange,
      flag,
      category: getCategory(nameNorm),
    });
  }

  // --- Next-line value: if current line is only a known test name, value/ref may be on next line ---
  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i];
    if (skipLine(line)) continue;
    const nameNorm = normalizeTestName(line);
    if (!QUEST_TEST_NAMES.has(nameNorm) && !isKnownTestName(line)) continue;
    const nextLine = lines[i + 1];
    const nextParts = nextLine.split(/\s{2,}|\t/).map((p) => p.trim()).filter(Boolean);
    if (nextParts.length < 1) continue;
    const already = result.results.some((r) => normalizeTestName(r.testName) === nameNorm);
    if (already) continue;
    const valueToken = nextParts.find((p) => isValueToken(p));
    const refToken = nextParts.find((p) => looksLikeReference(p));
    if (valueToken) {
      const { value, valueNumeric, flag } = parseValueAndFlag(valueToken);
      const referenceRange = refToken ?? '';
      const unit = extractUnit(referenceRange);
      result.results.push({
        testName: nameNorm,
        value,
        valueNumeric,
        unit,
        referenceRange,
        flag,
        category: getCategory(nameNorm),
      });
    }
  }

  // Dedupe by normalized test name (keep first occurrence)
  const seen = new Set<string>();
  result.results = result.results.filter((r) => {
    const key = normalizeTestName(r.testName);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return result;
}

/**
 * Extract text from PDF buffer and parse as Quest report.
 */
export async function parseQuestBloodworkPdf(buffer: Buffer): Promise<QuestParsedResult> {
  let PDFParse: any;
  try {
    const mod = await import('pdf-parse');
    PDFParse = mod.PDFParse ?? mod.default?.PDFParse ?? mod.default;
  } catch (e) {
    logger.error('Failed to load pdf-parse', { error: (e as Error).message });
    throw new Error('PDF parsing library not available');
  }
  if (!PDFParse) {
    throw new Error('PDF parsing library not available');
  }

  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    const text = typeof result === 'string' ? result : (result?.text ?? '');
    await parser.destroy?.();
    if (!text || text.length < 100) {
      throw new Error('PDF produced no or too little text. Ensure the file is a Quest Diagnostics lab report (not a scan/image-only PDF).');
    }
    return parseQuestText(text);
  } catch (e) {
    await parser.destroy?.().catch(() => {});
    const msg = e instanceof Error ? e.message : 'Unknown error';
    logger.error('Quest PDF parse failed', { error: msg });
    throw new Error(
      msg.includes('PDF') ? msg : 'Failed to read PDF. Ensure the file is a valid Quest Diagnostics lab report (text-based PDF).'
    );
  }
}
