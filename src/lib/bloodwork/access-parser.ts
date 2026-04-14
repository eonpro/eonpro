/**
 * Access Medical Labs bloodwork PDF parser.
 * Parses multi-page table rows with columns: Test Name | Results | Reference Range | Units.
 */

import type { ParsedPatientName, QuestParsedResult, QuestParsedRow } from './quest-parser';
import { extractBloodworkTextFromPdf } from './quest-parser';

const ACCESS_UNITS = [
  'mg/dL',
  'IU/L',
  'ng/mL',
  'ng/dL',
  'pg/mL',
  'mmol/L',
  'mIU/mL',
  'mL/min/1.7',
  'x10E3/uL',
  'x10E6/uL',
  'g/dL',
  'fL',
  '%',
];

const UNIT_PATTERN =
  '(mg\\/dL|IU\\/L|ng\\/mL|ng\\/dL|pg\\/mL|mmol\\/L|mIU\\/mL|mL\\/min\\/1\\.7|x10E3\\/uL|x10E6\\/uL|g\\/dL|fL|%)';

function normalize(s: string): string {
  return (s || '').replace(/\s+/g, ' ').trim();
}

function toValue(resultRaw: string): {
  value: string;
  valueNumeric: number | null;
  flag: 'H' | 'L' | null;
} {
  const cleaned = normalize(resultRaw).replace(/\*/g, '');
  const m = cleaned.match(/^([<>]?\s*-?\d+(?:\.\d+)?)(?:\s*([HL]))?$/i);
  if (!m) {
    const n = Number.parseFloat(cleaned.replace(/[^\d.-]/g, ''));
    return {
      value: cleaned,
      valueNumeric: Number.isFinite(n) ? n : null,
      flag: /\bH\b/i.test(cleaned) ? 'H' : /\bL\b/i.test(cleaned) ? 'L' : null,
    };
  }
  const value = normalize(m[1] || cleaned);
  const n = Number.parseFloat(value.replace(/[^\d.-]/g, ''));
  const flag = (m[2]?.toUpperCase() as 'H' | 'L' | undefined) ?? null;
  return { value, valueNumeric: Number.isFinite(n) ? n : null, flag };
}

function parseRange(rangeRaw: string): { referenceRange: string; min?: number; max?: number } {
  const referenceRange = normalize(rangeRaw).replace(/\*/g, '');
  const m = referenceRange.match(/(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)/);
  if (!m) return { referenceRange };
  return { referenceRange, min: Number(m[1]), max: Number(m[2]) };
}

function deriveFlag(valueNumeric: number | null, min?: number, max?: number): 'H' | 'L' | null {
  if (valueNumeric == null) return null;
  if (min != null && valueNumeric < min) return 'L';
  if (max != null && valueNumeric > max) return 'H';
  return null;
}

function categoryFor(testName: string): QuestParsedRow['category'] {
  const t = testName.toUpperCase();
  if (/CHOLESTEROL|TRIGLYCERIDE|LDL|HDL|APOB|RATIO|CRP/.test(t)) return 'heart';
  if (
    /GLUCOSE|BUN|CREATININE|EGFR|SODIUM|POTASSIUM|CHLORIDE|CARBON DIOXIDE|PROTEIN|ALBUMIN|GLOBULIN|BILIRUBIN|ALKALINE/.test(
      t
    )
  )
    return 'metabolic';
  if (/TESTOSTERONE|ESTRADIOL|ESTROGEN|FSH|LH|PROLACTIN|PSA|T3|THYROID|SHBG/.test(t))
    return 'hormones';
  if (/WBC|RBC|HEMOGLOBIN|HEMATOCRIT|MCV|MCH|MCHC|RDW|PLATELETS/.test(t)) return 'blood';
  return 'other';
}

function parseName(lines: string[]): ParsedPatientName | undefined {
  for (const line of lines) {
    const m = line.match(/Patient:\s*([A-Z][A-Z '\-]+),\s*([A-Z][A-Z '\-]+)/i);
    if (!m) continue;
    return {
      lastName: normalize(m[1] || '').toUpperCase(),
      firstName: normalize(m[2] || '').toUpperCase(),
    };
  }
  return undefined;
}

function parseDateTime(input: string): Date | undefined {
  const t = normalize(input);
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export function parseAccessText(fullText: string): QuestParsedResult {
  const lines = fullText
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const parsedPatientName = parseName(lines);
  let specimenId: string | undefined;
  let collectedAt: Date | undefined;
  let reportedAt: Date | undefined;
  let fasting: boolean | undefined;

  for (const line of lines) {
    if (!specimenId) {
      const spec = line.match(/Acct#\s*([A-Za-z0-9]+)/i) || line.match(/Chart#\s*([A-Za-z0-9]+)/i);
      if (spec) specimenId = normalize(spec[1] || '');
    }
    if (fasting == null) {
      const f = line.match(/Fasting:\s*([YN])/i);
      if (f) fasting = (f[1] || '').toUpperCase() === 'Y';
    }
    if (!collectedAt) {
      const c = line.match(/Coll\. Date:\s*([0-9/]+)\s+Coll\. Time:\s*([0-9:]+)/i);
      if (c) collectedAt = parseDateTime(`${c[1]} ${c[2]}`);
    }
    if (!reportedAt) {
      const r = line.match(/Print Date:\s*([0-9/]+)\s+Print Time:\s*([0-9:]+)/i);
      if (r) reportedAt = parseDateTime(`${r[1]} ${r[2]}`);
    }
  }

  const singleSpaceRowRegex = new RegExp(
    `^(.+?)\\s+([<>]?\\d+(?:\\.\\d+)?)(?:\\s*([HL]))?\\s+([><]?\\s*\\d+(?:\\.\\d+)?(?:\\s*-\\s*[><]?\\s*\\d+(?:\\.\\d+)?)?)\\s+${UNIT_PATTERN}(?:\\s+\\*\\d+)?$`,
    'i'
  );

  const rows: QuestParsedRow[] = [];
  for (const line of lines) {
    const normalized = normalize(line);
    if (!normalized) continue;
    if (
      /^(\*+|Report Status|Test Name|Results|Reference Range|Units|OUT OF RANGE SUMMARY|Comp\.|Lipid Panel|CBC|PSA|Roche|reported:|Final Report|END OF REPORT|COMMENTS:|Patient:|Client:|Address|Phys:|Acc#|Chart#|DOB|Age|Sex|City:|State:|Zip:|Page:)/i.test(
        normalized
      )
    ) {
      continue;
    }

    let testName = '';
    let resultRaw = '';
    let referenceRaw = '';
    let unitRaw = '';
    const parts = normalized
      .split(/\s{2,}|\t/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length >= 4) {
      testName = normalize(parts[0] || '');
      resultRaw = normalize(parts[1] || '');
      referenceRaw = normalize(parts[2] || '');
      unitRaw = normalize(parts[3] || '');
    }
    if (
      !testName ||
      !resultRaw ||
      !referenceRaw ||
      !unitRaw ||
      !ACCESS_UNITS.some((u) => unitRaw.toLowerCase().includes(u.toLowerCase()))
    ) {
      const m = normalized.match(singleSpaceRowRegex);
      if (!m) continue;
      testName = normalize(m[1] || '');
      resultRaw = normalize(`${m[2] || ''}${m[3] ? ` ${m[3]}` : ''}`);
      referenceRaw = normalize(m[4] || '');
      unitRaw = normalize(m[5] || '');
    }

    const { value, valueNumeric, flag: explicitFlag } = toValue(resultRaw);
    const range = parseRange(referenceRaw);
    const derived = deriveFlag(valueNumeric, range.min, range.max);
    const flag = explicitFlag ?? derived;

    rows.push({
      testName,
      value,
      valueNumeric,
      unit: unitRaw,
      referenceRange: range.referenceRange,
      flag,
      category: categoryFor(testName),
    });
  }

  const deduped = new Map<string, QuestParsedRow>();
  for (const row of rows) {
    const key = row.testName.toUpperCase();
    const existing = deduped.get(key);
    if (!existing) {
      deduped.set(key, row);
      continue;
    }
    const score = (r: QuestParsedRow) => (r.flag ? 2 : 0) + (r.valueNumeric != null ? 1 : 0);
    if (score(row) > score(existing)) deduped.set(key, row);
  }

  return {
    specimenId,
    collectedAt,
    reportedAt,
    fasting,
    parsedPatientName,
    results: Array.from(deduped.values()),
  };
}

export async function parseAccessBloodworkPdf(buffer: Buffer): Promise<QuestParsedResult> {
  const text = await extractBloodworkTextFromPdf(buffer);
  return parseAccessText(text);
}
