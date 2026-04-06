export interface MatchSummary {
  total: number;
  matched: number;
  unmatched: number;
  matchRate: number;
}

/**
 * Build consistent matched/unmatched summary numbers for a scoped dataset.
 * `total` and `matched` should be from the same time window.
 */
export function buildMatchSummary(total: number, matched: number): MatchSummary {
  const safeTotal = Math.max(0, Number.isFinite(total) ? total : 0);
  const safeMatched = Math.min(Math.max(0, Number.isFinite(matched) ? matched : 0), safeTotal);
  const unmatched = safeTotal - safeMatched;
  const matchRate = safeTotal > 0 ? Math.round((safeMatched / safeTotal) * 100) : 0;

  return {
    total: safeTotal,
    matched: safeMatched,
    unmatched,
    matchRate,
  };
}
