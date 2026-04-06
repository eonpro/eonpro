import type { QuestParsedResult } from './quest-parser';
import { extractBloodworkTextFromPdf, parseQuestText } from './quest-parser';
import { parseRythmText } from './rythm-parser';
import { parseAccessText } from './access-parser';

export type BloodworkVendor = 'quest' | 'rythm' | 'access';

export interface ParsedBloodworkDocument {
  vendor: BloodworkVendor;
  labName: string;
  parserVersion: string;
  parsed: QuestParsedResult;
}

const QUEST_VERSION = 'quest-2026-04';
const RYTHM_VERSION = 'rythm-2026-04';
const ACCESS_VERSION = 'access-2026-04';

export function parseBloodworkTextAuto(fullText: string): ParsedBloodworkDocument {
  const lower = fullText.toLowerCase();
  const looksLikeRythm =
    lower.includes('rythm') ||
    (lower.includes('performance range') && lower.includes('test') && lower.includes('value') && lower.includes('unit'));
  const looksLikeAccess =
    lower.includes('access medical labs') ||
    (lower.includes('out of range summary') && lower.includes('test name') && lower.includes('reference range'));

  if (looksLikeAccess) {
    return {
      vendor: 'access',
      labName: 'Access Medical Labs',
      parserVersion: ACCESS_VERSION,
      parsed: parseAccessText(fullText),
    };
  }

  if (looksLikeRythm) {
    return {
      vendor: 'rythm',
      labName: 'Rythm Health',
      parserVersion: RYTHM_VERSION,
      parsed: parseRythmText(fullText),
    };
  }

  return {
    vendor: 'quest',
    labName: 'Quest Diagnostics',
    parserVersion: QUEST_VERSION,
    parsed: parseQuestText(fullText),
  };
}

export async function parseBloodworkPdfAuto(buffer: Buffer): Promise<ParsedBloodworkDocument> {
  const text = await extractBloodworkTextFromPdf(buffer);
  return parseBloodworkTextAuto(text);
}
