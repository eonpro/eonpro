/**
 * Validation and sanitization of parsed lab output before persistence.
 * Ensures bounded, well-formed data; no partial writes on validation failure.
 * PHI: Do not log result values or patient identifiers.
 */

import type { QuestParsedResult, QuestParsedRow } from './quest-parser';
import { BadRequestError } from '@/domains/shared/errors';

/** Bounds for persistence (align with DB and display). */
const MAX_TEST_NAME = 500;
const MAX_VALUE = 100;
const MAX_UNIT = 50;
const MAX_REFERENCE_RANGE = 500;
const MAX_CATEGORY = 50;
const MAX_SPECIMEN_ID = 100;
/** Reject valueNumeric outside this range (parser/clinical sanity). */
const VALUE_NUMERIC_MIN = -1e6;
const VALUE_NUMERIC_MAX = 1e6;

/** Valid flag values from parser. */
const VALID_FLAGS = new Set<string>(['H', 'L']);

function trimToMax(s: string, max: number): string {
  const t = (s ?? '').trim();
  return t.length > max ? t.slice(0, max) : t;
}

function isValidDate(d: unknown): boolean {
  if (d == null) return true;
  if (!(d instanceof Date)) return false;
  return !isNaN(d.getTime());
}

/**
 * Validate and sanitize a single result row.
 * Returns sanitized row or throws BadRequestError (no partial writes).
 */
function validateRow(row: unknown, index: number): QuestParsedRow {
  if (row == null || typeof row !== 'object' || !('testName' in row) || !('value' in row)) {
    throw new BadRequestError(
      'Lab report validation failed: invalid result structure.',
      { cause: 'BLOODWORK_VALIDATION' }
    );
  }
  const r = row as Record<string, unknown>;
  const testName = trimToMax(String(r.testName ?? ''), MAX_TEST_NAME);
  const value = trimToMax(String(r.value ?? ''), MAX_VALUE);
  if (!testName || testName.length < 1) {
    throw new BadRequestError(
      'Lab report validation failed: missing or empty biomarker name.',
      { cause: 'BLOODWORK_VALIDATION' }
    );
  }
  if (!value || value.length < 1) {
    throw new BadRequestError(
      'Lab report validation failed: missing or empty value for a biomarker.',
      { cause: 'BLOODWORK_VALIDATION' }
    );
  }
  let valueNumeric: number | null = null;
  if (r.valueNumeric != null) {
    const n = Number(r.valueNumeric);
    if (!Number.isFinite(n)) {
      throw new BadRequestError(
        'Lab report validation failed: invalid numeric value for a biomarker.',
        { cause: 'BLOODWORK_VALIDATION' }
      );
    }
    if (n < VALUE_NUMERIC_MIN || n > VALUE_NUMERIC_MAX) {
      throw new BadRequestError(
        'Lab report validation failed: numeric value out of allowed range.',
        { cause: 'BLOODWORK_VALIDATION' }
      );
    }
    valueNumeric = n;
  }
  const unit = trimToMax(String(r.unit ?? ''), MAX_UNIT);
  const referenceRange = trimToMax(String(r.referenceRange ?? ''), MAX_REFERENCE_RANGE);
  let flag: string | null = null;
  if (r.flag != null && r.flag !== '') {
    const f = String(r.flag).trim().toUpperCase();
    if (VALID_FLAGS.has(f)) flag = f;
  }
  const category = trimToMax(String(r.category ?? 'other'), MAX_CATEGORY) || 'other';
  return {
    testName,
    value,
    valueNumeric,
    unit,
    referenceRange,
    flag,
    category,
  };
}

/**
 * Validate and sanitize full parsed result. Throws BadRequestError on failure; no partial writes.
 * Ensures: expected structure, bounded strings, valid dates, at least one result when results array present.
 */
export function validateQuestParsedResult(parsed: unknown): QuestParsedResult {
  if (parsed == null || typeof parsed !== 'object' || !('results' in parsed)) {
    throw new BadRequestError(
      'Lab report validation failed: invalid report structure.',
      { cause: 'BLOODWORK_VALIDATION' }
    );
  }
  const p = parsed as Record<string, unknown>;
  const resultsRaw = p.results;
  if (!Array.isArray(resultsRaw)) {
    throw new BadRequestError(
      'Lab report validation failed: results must be an array.',
      { cause: 'BLOODWORK_VALIDATION' }
    );
  }
  if (resultsRaw.length === 0) {
    throw new BadRequestError(
      'Lab report validation failed: no biomarker results found. Please use a valid Quest Diagnostics lab report.',
      { cause: 'BLOODWORK_VALIDATION' }
    );
  }
  const results: QuestParsedRow[] = [];
  for (let i = 0; i < resultsRaw.length; i++) {
    results.push(validateRow(resultsRaw[i], i));
  }
  let specimenId: string | undefined;
  if (p.specimenId != null && p.specimenId !== '') {
    specimenId = trimToMax(String(p.specimenId), MAX_SPECIMEN_ID) || undefined;
  }
  let collectedAt: Date | undefined;
  if (p.collectedAt != null) {
    if (!isValidDate(p.collectedAt)) {
      throw new BadRequestError(
        'Lab report validation failed: invalid collected date.',
        { cause: 'BLOODWORK_VALIDATION' }
      );
    }
    collectedAt = p.collectedAt as Date;
  }
  let reportedAt: Date | undefined;
  if (p.reportedAt != null) {
    if (!isValidDate(p.reportedAt)) {
      throw new BadRequestError(
        'Lab report validation failed: invalid reported date.',
        { cause: 'BLOODWORK_VALIDATION' }
      );
    }
    reportedAt = p.reportedAt as Date;
  }
  let fasting: boolean | undefined;
  if (typeof p.fasting === 'boolean') fasting = p.fasting;
  let parsedPatientName: QuestParsedResult['parsedPatientName'];
  if (p.parsedPatientName != null && typeof p.parsedPatientName === 'object' && 'lastName' in p.parsedPatientName && 'firstName' in p.parsedPatientName) {
    const n = p.parsedPatientName as { lastName: unknown; firstName: unknown };
    parsedPatientName = {
      lastName: String(n.lastName ?? '').trim().slice(0, 80),
      firstName: String(n.firstName ?? '').trim().slice(0, 80),
    };
  }
  return {
    specimenId,
    collectedAt,
    reportedAt,
    fasting,
    parsedPatientName,
    results,
  };
}
