/**
 * RxNorm + OpenFDA API Client
 *
 * Free government drug databases for medication lookup and interaction checking.
 * No API keys required for RxNorm. OpenFDA works without a key under 1K req/day.
 *
 * Only drug/allergy NAMES are sent — no PHI leaves the platform.
 */

import { logger } from '@/lib/logger';

const RXNORM_BASE = 'https://rxnav.nlm.nih.gov/REST';
const OPENFDA_BASE = 'https://api.fda.gov/drug';

export interface DrugResult {
  name: string;
  genericName?: string;
  rxcui?: string;
  brandNames?: string[];
  drugClass?: string;
}

export interface InteractionResult {
  drug1: string;
  drug2: string;
  severity: 'low' | 'moderate' | 'high';
  description: string;
  source: string;
}

// In-memory cache for drug search results (1hr TTL, avoids hammering gov APIs)
const searchCache = new Map<string, { data: DrugResult[]; expires: number }>();
const rxcuiCache = new Map<string, { data: string | null; expires: number }>();
const SEARCH_CACHE_TTL = 3600_000;
const RXCUI_CACHE_TTL = 86400_000;

async function fetchWithTimeout(url: string, timeoutMs = 5000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Search RxNorm for drug names matching a query.
 */
export async function searchDrugsRxNorm(query: string): Promise<DrugResult[]> {
  const cacheKey = `rx:${query.toLowerCase()}`;
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() < cached.expires) return cached.data;

  try {
    const res = await fetchWithTimeout(
      `${RXNORM_BASE}/drugs.json?name=${encodeURIComponent(query)}`
    );
    if (!res.ok) return [];
    const data = await res.json();

    const results: DrugResult[] = [];
    const seen = new Set<string>();

    const groups = data?.drugGroup?.conceptGroup ?? [];
    for (const group of groups) {
      for (const prop of group?.conceptProperties ?? []) {
        const name = prop.name ?? prop.synonym;
        if (!name) continue;
        const key = name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        results.push({
          name,
          rxcui: prop.rxcui,
          genericName: prop.name !== prop.synonym ? prop.synonym : undefined,
        });
      }
    }

    searchCache.set(cacheKey, { data: results.slice(0, 20), expires: Date.now() + SEARCH_CACHE_TTL });
    return results.slice(0, 20);
  } catch (err) {
    logger.warn('[rxnorm] Drug search failed', { query, error: err instanceof Error ? err.message : String(err) });
    return [];
  }
}

/**
 * Search OpenFDA for drug label data.
 */
export async function searchDrugsOpenFDA(query: string): Promise<DrugResult[]> {
  const cacheKey = `fda:${query.toLowerCase()}`;
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() < cached.expires) return cached.data;

  try {
    const res = await fetchWithTimeout(
      `${OPENFDA_BASE}/label.json?search=openfda.brand_name:"${encodeURIComponent(query)}"&limit=10`
    );
    if (!res.ok) return [];
    const data = await res.json();

    const results: DrugResult[] = [];
    const seen = new Set<string>();

    for (const result of data?.results ?? []) {
      const openfda = result?.openfda ?? {};
      const brandNames: string[] = openfda.brand_name ?? [];
      const genericNames: string[] = openfda.generic_name ?? [];
      const rxcuis: string[] = openfda.rxcui ?? [];
      const classes: string[] = openfda.pharm_class_epc ?? [];

      const name = brandNames[0] ?? genericNames[0];
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      results.push({
        name,
        genericName: genericNames[0],
        rxcui: rxcuis[0],
        brandNames: brandNames.length > 1 ? brandNames : undefined,
        drugClass: classes[0],
      });
    }

    searchCache.set(cacheKey, { data: results, expires: Date.now() + SEARCH_CACHE_TTL });
    return results;
  } catch (err) {
    logger.warn('[openfda] Drug search failed', { query, error: err instanceof Error ? err.message : String(err) });
    return [];
  }
}

/**
 * Combined drug search: RxNorm + OpenFDA, merged and deduplicated.
 */
export async function searchDrugs(query: string): Promise<DrugResult[]> {
  const [rxResults, fdaResults] = await Promise.all([
    searchDrugsRxNorm(query),
    searchDrugsOpenFDA(query),
  ]);

  const merged: DrugResult[] = [];
  const seen = new Set<string>();

  for (const r of [...rxResults, ...fdaResults]) {
    const key = r.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(r);
  }

  return merged.slice(0, 15);
}

/**
 * Resolve a medication name to an RxCUI identifier.
 */
export async function resolveRxCUI(medicationName: string): Promise<string | null> {
  const cacheKey = medicationName.toLowerCase().trim();
  const cached = rxcuiCache.get(cacheKey);
  if (cached && Date.now() < cached.expires) return cached.data;

  try {
    const res = await fetchWithTimeout(
      `${RXNORM_BASE}/rxcui.json?name=${encodeURIComponent(medicationName)}&search=2`
    );
    if (!res.ok) return null;
    const data = await res.json();
    const rxcui = data?.idGroup?.rxnormId?.[0] ?? null;
    rxcuiCache.set(cacheKey, { data: rxcui, expires: Date.now() + RXCUI_CACHE_TTL });
    return rxcui;
  } catch {
    return null;
  }
}

/**
 * Check drug-drug interactions via RxNorm Interaction API.
 */
export async function checkInteractions(rxcuis: string[]): Promise<InteractionResult[]> {
  if (rxcuis.length < 2) return [];

  try {
    const res = await fetchWithTimeout(
      `${RXNORM_BASE}/interaction/list.json?rxcuis=${rxcuis.join('+')}`,
      10000
    );
    if (!res.ok) return [];
    const data = await res.json();

    const results: InteractionResult[] = [];

    for (const group of data?.fullInteractionTypeGroup ?? []) {
      for (const type of group?.fullInteractionType ?? []) {
        for (const pair of type?.interactionPair ?? []) {
          const concepts = pair?.interactionConcept ?? [];
          if (concepts.length < 2) continue;

          const desc = pair?.description ?? '';
          const severity = inferSeverity(pair?.severity ?? desc);

          results.push({
            drug1: concepts[0]?.minConceptItem?.name ?? 'Unknown',
            drug2: concepts[1]?.minConceptItem?.name ?? 'Unknown',
            severity,
            description: desc,
            source: group?.sourceName ?? 'NLM',
          });
        }
      }
    }

    return results;
  } catch (err) {
    logger.warn('[rxnorm] Interaction check failed', { error: err instanceof Error ? err.message : String(err) });
    return [];
  }
}

function inferSeverity(text: string): 'low' | 'moderate' | 'high' {
  const lower = text.toLowerCase();
  if (lower.includes('high') || lower.includes('severe') || lower.includes('major') ||
      lower.includes('contraindicated') || lower.includes('serious')) return 'high';
  if (lower.includes('moderate') || lower.includes('significant')) return 'moderate';
  return 'low';
}
