/**
 * PostgreSQL Trigram Similarity Search (server-only)
 *
 * Provides fuzzy patient search using pg_trgm's `word_similarity()` function.
 * This is a fallback for when the primary `contains`-based search returns no
 * results — it catches typos that even variant generation can't cover.
 *
 * Separated from search.ts to avoid pulling Prisma into client/edge bundles.
 *
 * Requires: CREATE EXTENSION IF NOT EXISTS pg_trgm; (already in migration)
 *
 * @module lib/utils/trigram-search
 */

import { Prisma } from '@prisma/client';
import { basePrisma } from '@/lib/db';
import { normalizeSearch } from './search';
import { logger } from '@/lib/logger';

interface TrigramSearchOptions {
  search: string;
  clinicId?: number;
  limit?: number;
  /** Minimum word_similarity threshold (0–1). Default 0.25 */
  threshold?: number;
}

interface TrigramMatch {
  id: number;
  similarity: number;
}

/**
 * Search patients by trigram similarity on searchIndex.
 * Returns patient IDs ranked by similarity score.
 *
 * Uses PostgreSQL's `word_similarity()` which is optimized for matching
 * individual words within longer strings (ideal for searchIndex which
 * contains "firstname lastname email phone patientid").
 *
 * @returns Array of {id, similarity} ordered by similarity descending
 */
export async function searchPatientsByTrigram(
  options: TrigramSearchOptions
): Promise<TrigramMatch[]> {
  const { search, clinicId, limit = 20, threshold = 0.25 } = options;

  const normalized = normalizeSearch(search);
  if (!normalized || normalized.length < 2) return [];

  try {
    const results = await basePrisma.$queryRaw<TrigramMatch[]>`
      SELECT id, word_similarity(${normalized}, "searchIndex") AS similarity
      FROM "Patient"
      WHERE "searchIndex" IS NOT NULL
        AND word_similarity(${normalized}, "searchIndex") > ${threshold}
        ${clinicId ? Prisma.sql`AND "clinicId" = ${clinicId}` : Prisma.empty}
      ORDER BY similarity DESC
      LIMIT ${limit}
    `;

    return results.map((r) => ({
      id: Number(r.id),
      similarity: Number(r.similarity),
    }));
  } catch (err) {
    logger.warn('[TRIGRAM-SEARCH] Trigram search failed, falling back to empty', {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

/**
 * Build a Prisma WHERE clause that matches patients found by trigram similarity.
 * Useful for composing with existing Prisma queries.
 *
 * @returns { id: { in: [...matchedIds] } } or empty object if no matches
 */
export async function buildTrigramFallbackWhere(
  options: TrigramSearchOptions
): Promise<{ id?: { in: number[] } }> {
  const matches = await searchPatientsByTrigram(options);
  if (matches.length === 0) return {};
  return { id: { in: matches.map((m) => m.id) } };
}
