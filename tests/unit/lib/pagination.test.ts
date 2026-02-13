/**
 * Pagination module unit tests - enterprise-safe defaults, abuse prevention
 */

import { describe, it, expect } from 'vitest';
import {
  AGGREGATION_TAKE,
  AGGREGATION_TAKE_UI,
  AGGREGATION_TAKE_JOB,
  DEFAULT_TAKE,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  MAX_TAKE,
  normalizeTake,
  parseTakeFromParams,
  normalizePagination,
  withPagination,
  buildPrismaPagination,
  buildPrismaPaginationStringCursor,
  requireServiceAuthForJob,
} from '@/lib/pagination';

describe('pagination constants', () => {
  it('AGGREGATION_TAKE_UI is 500 (UI/API cap)', () => {
    expect(AGGREGATION_TAKE_UI).toBe(500);
  });
  it('AGGREGATION_TAKE_JOB is 5000 (internal jobs only)', () => {
    expect(AGGREGATION_TAKE_JOB).toBe(5000);
  });
  it('AGGREGATION_TAKE equals AGGREGATION_TAKE_UI (backward compat)', () => {
    expect(AGGREGATION_TAKE).toBe(500);
  });
  it('DEFAULT_TAKE is 25', () => {
    expect(DEFAULT_TAKE).toBe(25);
  });
  it('MAX_TAKE is 100 (abuse prevention)', () => {
    expect(MAX_TAKE).toBe(100);
  });
  it('DEFAULT_PAGE_SIZE is 20', () => {
    expect(DEFAULT_PAGE_SIZE).toBe(20);
  });
  it('MAX_PAGE_SIZE is 100', () => {
    expect(MAX_PAGE_SIZE).toBe(100);
  });
});

describe('normalizeTake', () => {
  it('returns DEFAULT_TAKE when undefined', () => {
    expect(normalizeTake()).toBe(25);
  });
  it('returns DEFAULT_TAKE when 0', () => {
    expect(normalizeTake(0)).toBe(25);
  });
  it('clamps to MAX_TAKE when excessive', () => {
    expect(normalizeTake(9999)).toBe(100);
  });
  it('returns valid take as-is within range', () => {
    expect(normalizeTake(50)).toBe(50);
  });
  it('clamps negative to DEFAULT_TAKE', () => {
    expect(normalizeTake(-5)).toBe(25);
  });
});

describe('normalizePagination', () => {
  it('returns default page and pageSize when empty', () => {
    const r = normalizePagination({});
    expect(r).toEqual({ take: 20, skip: 0, page: 1 });
  });
  it('clamps pageSize to MAX_PAGE_SIZE', () => {
    const r = normalizePagination({ pageSize: 500 });
    expect(r.take).toBe(100);
  });
  it('computes skip correctly for page 2', () => {
    const r = normalizePagination({ page: 2, pageSize: 20 });
    expect(r).toEqual({ take: 20, skip: 20, page: 2 });
  });
});

describe('withPagination', () => {
  it('returns take and skip for Prisma findMany', () => {
    const r = withPagination({ take: 25, skip: 50 });
    expect(r).toEqual({ take: 25, skip: 50 });
  });
});

describe('buildPrismaPagination (numeric cursor)', () => {
  it('returns take only when no cursor', () => {
    const r = buildPrismaPagination({ take: 30 });
    expect(r).toEqual({ take: 30 });
  });
  it('adds skip:1 and cursor when cursor provided', () => {
    const r = buildPrismaPagination({ take: 30, cursor: '123' });
    expect(r).toEqual({ take: 30, skip: 1, cursor: { id: 123 } });
  });
  it('handles numeric cursor', () => {
    const r = buildPrismaPagination({ take: 10, cursor: 456 });
    expect(r).toEqual({ take: 10, skip: 1, cursor: { id: 456 } });
  });
  it('ignores invalid cursor string', () => {
    const r = buildPrismaPagination({ take: 10, cursor: 'abc' });
    expect(r).toEqual({ take: 10 });
  });
});

describe('buildPrismaPaginationStringCursor', () => {
  it('returns take only when no cursor', () => {
    const r = buildPrismaPaginationStringCursor({ take: 30 });
    expect(r).toEqual({ take: 30 });
  });
  it('adds skip:1 and cursor when cursor provided', () => {
    const r = buildPrismaPaginationStringCursor({ take: 30, cursor: 'abc-123' });
    expect(r).toEqual({ take: 30, skip: 1, cursor: { id: 'abc-123' } });
  });
});

describe('parseTakeFromParams', () => {
  it('returns DEFAULT_TAKE when no params', () => {
    const params = new URLSearchParams();
    expect(parseTakeFromParams(params)).toBe(25);
  });
  it('parses take from query', () => {
    const params = new URLSearchParams({ take: '50' });
    expect(parseTakeFromParams(params)).toBe(50);
  });
  it('parses limit as fallback', () => {
    const params = new URLSearchParams({ limit: '75' });
    expect(parseTakeFromParams(params)).toBe(75);
  });
  it('clamps excessive take to MAX_TAKE', () => {
    const params = new URLSearchParams({ take: '9999' });
    expect(parseTakeFromParams(params)).toBe(100);
  });
});

describe('requireServiceAuthForJob', () => {
  it('returns AGGREGATION_TAKE_JOB when auth verified', () => {
    expect(requireServiceAuthForJob(true)).toBe(5000);
  });
  it('throws when auth not verified', () => {
    expect(() => requireServiceAuthForJob(false)).toThrow(
      'AGGREGATION_TAKE_JOB requires service auth'
    );
  });
});
