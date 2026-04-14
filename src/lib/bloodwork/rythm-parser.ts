/**
 * Rythm Health bloodwork PDF parser.
 * Parses tabular rows: Test | Value | Unit | Range | Performance Range.
 */

import type { ParsedPatientName, QuestParsedResult, QuestParsedRow } from './quest-parser';
import { extractBloodworkTextFromPdf } from './quest-parser';

const RYTHM_CATEGORY_RULES: Array<{ pattern: RegExp; category: QuestParsedRow['category'] }> = [
  { pattern: /(CHOLESTEROL|TRIGLYCERIDE|APOB|LDL|HDL|HS-CRP|RATIO)/i, category: 'heart' },
  { pattern: /(GLUCOSE|ALBUMIN|CREATININE|REMNANT)/i, category: 'metabolic' },
  {
    pattern: /(TESTOSTERONE|ESTROGEN|ESTRADIOL|SHBG|TSH|THYROID|FREE T3|VITAMIN D)/i,
    category: 'hormones',
  },
];

function normalizeName(name: string): string {
  return name
    .replace(/\s+/g, ' ')
    .replace(/^[\u2022\u2023\u25CF\u25CB\u25E6\u00B7]\s*/, '')
    .trim();
}

function getCategory(testName: string): QuestParsedRow['category'] {
  for (const rule of RYTHM_CATEGORY_RULES) {
    if (rule.pattern.test(testName)) return rule.category;
  }
  return 'other';
}

function parseDate(raw: string): Date | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function parseName(lines: string[]): ParsedPatientName | undefined {
  for (let i = 0; i < lines.length - 1; i++) {
    if (/^NAME$/i.test(lines[i])) {
      const full = normalizeName(lines[i + 1] || '');
      if (!full) continue;
      const parts = full.split(' ').filter(Boolean);
      if (parts.length < 2) continue;
      const lastName = parts[parts.length - 1]!;
      const firstName = parts.slice(0, -1).join(' ');
      return { firstName: firstName.toUpperCase(), lastName: lastName.toUpperCase() };
    }
  }
  return undefined;
}

function parseRange(range: string): { min?: number; max?: number } {
  const m = range.match(/(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)/);
  if (!m) return {};
  return { min: Number(m[1]), max: Number(m[2]) };
}

function toValue(raw: string): { value: string; valueNumeric: number | null } {
  const value = raw.trim();
  const n = Number.parseFloat(value.replace(/[^\d.-]/g, ''));
  return { value, valueNumeric: Number.isFinite(n) ? n : null };
}

function computeFlag(valueNumeric: number | null, range: string): 'H' | 'L' | null {
  if (valueNumeric == null) return null;
  const { min, max } = parseRange(range);
  if (min != null && valueNumeric < min) return 'L';
  if (max != null && valueNumeric > max) return 'H';
  return null;
}

function looksLikeResultLine(line: string): boolean {
  const lower = line.toLowerCase();
  if (
    lower.includes('test value unit range') ||
    lower.startsWith('name') ||
    lower.startsWith('order id') ||
    lower.startsWith('reported') ||
    lower.startsWith('collected') ||
    lower.startsWith('performance range') ||
    lower.startsWith('lab') ||
    lower.startsWith('provider') ||
    lower.startsWith('comments')
  ) {
    return false;
  }
  return true;
}

function parseResultFromLine(line: string): QuestParsedRow | null {
  const clean = normalizeName(line);
  if (!clean || !looksLikeResultLine(clean)) return null;

  const parts = clean
    .split(/\s{2,}|\t/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length >= 4) {
    const [rawTest, rawValue, rawUnit, rawRange] = parts;
    if (!rawTest || !rawValue || !rawUnit || !rawRange) return null;
    const testName = normalizeName(rawTest);
    const { value, valueNumeric } = toValue(rawValue);
    const referenceRange = normalizeName(rawRange);
    const flag = computeFlag(valueNumeric, referenceRange);
    return {
      testName,
      value,
      valueNumeric,
      unit: normalizeName(rawUnit),
      referenceRange,
      flag,
      category: getCategory(testName),
    };
  }

  // Fallback for OCR/flattened rows with single spaces:
  // "Thyroid Stimulating Hormone 1.70 uIU/mL 0.45 - 4.5 0.5 - 2.5"
  const singleLine = clean.match(
    /^(.+?)\s+([<>]?\d+(?:\.\d+)?)\s+([A-Za-z%/]+)\s+([<>]?\d+(?:\.\d+)?\s*-\s*[<>]?\d+(?:\.\d+)?|[<>]\s*(?:OR\s*=\s*)?\d+(?:\.\d+)?)\s*(?:([<>]?\d+(?:\.\d+)?\s*-\s*[<>]?\d+(?:\.\d+)?|[<>]\s*(?:OR\s*=\s*)?\d+(?:\.\d+)?))?$/
  );
  if (!singleLine) return null;
  const testName = normalizeName(singleLine[1] || '');
  const valueRaw = normalizeName(singleLine[2] || '');
  const unit = normalizeName(singleLine[3] || '');
  const range = normalizeName(singleLine[4] || '');
  if (!testName || !valueRaw || !unit || !range) return null;
  const { value, valueNumeric } = toValue(valueRaw);
  const flag = computeFlag(valueNumeric, range);
  return {
    testName,
    value,
    valueNumeric,
    unit,
    referenceRange: range,
    flag,
    category: getCategory(testName),
  };
}

export function parseRythmText(fullText: string): QuestParsedResult {
  const lines = fullText
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const parsedPatientName = parseName(lines);
  let collectedAt: Date | undefined;
  let reportedAt: Date | undefined;
  let specimenId: string | undefined;
  let fasting: boolean | undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (/^ORDER ID$/i.test(line)) specimenId = normalizeName(lines[i + 1] || '');
    if (/^COLLECTED$/i.test(line)) collectedAt = parseDate(lines[i + 1] || '');
    if (/^REPORTED$/i.test(line)) reportedAt = parseDate(lines[i + 1] || '');
    if (/^FASTING$/i.test(line)) fasting = /yes/i.test(lines[i + 1] || '');
  }

  const results: QuestParsedRow[] = [];
  for (const line of lines) {
    const parsedRow = parseResultFromLine(line);
    if (parsedRow) {
      results.push(parsedRow);
    }
  }

  return {
    specimenId: specimenId || undefined,
    collectedAt,
    reportedAt,
    fasting,
    parsedPatientName,
    results,
  };
}

export async function parseRythmBloodworkPdf(buffer: Buffer): Promise<QuestParsedResult> {
  const text = await extractBloodworkTextFromPdf(buffer);
  return parseRythmText(text);
}
