/**
 * Patient portal route guard — resolve path to nav module and determine if access is allowed.
 * Used by layout to redirect when user lands on a disabled module URL (e.g. bookmark).
 */

import { NAV_MODULES } from './registry';
import type { NavModuleId } from './registry';

/**
 * Legacy / alias path suffixes that should resolve to a canonical NAV_MODULES entry.
 *
 * NAV_MODULES is the single source of truth for nav. When a path is exposed under a
 * different suffix (legacy URL, post-merge redirect, etc.) but should still gate on the
 * same feature flag, register it here instead of mutating NAV_MODULES — that keeps the
 * nav UI clean while still letting the route guard resolve the alias to its owner module.
 *
 *   /portal/subscription  →  'billing'   (Support tab removal, 2026-04-22)
 */
const PATH_SUFFIX_ALIASES: Record<string, NavModuleId> = {
  '/subscription': 'billing',
};

/**
 * Resolves the current pathname to the owning nav module id (longest pathSuffix match).
 * e.g. /portal -> home, /portal/ -> home, /portal/appointments -> appointments, /portal/calculators/bmi -> calculators
 */
export function getNavModuleIdForPath(pathname: string, basePath: string): NavModuleId | null {
  const normalized = pathname.startsWith(basePath)
    ? pathname
    : basePath + pathname.replace(/^\//, '');
  if (!normalized.startsWith(basePath)) return null;
  // Treat trailing slash as base path (home)
  const normalizedTrimmed = normalized.replace(/\/$/, '') || normalized;
  const pathForMatch = normalizedTrimmed === basePath ? basePath : normalized;

  // Sort by pathSuffix length desc so /subscription matches before '' (home)
  const sorted = [...NAV_MODULES].sort(
    (a, b) => (b.pathSuffix?.length ?? 0) - (a.pathSuffix?.length ?? 0)
  );

  for (const m of sorted) {
    const full = basePath + m.pathSuffix;
    if (pathForMatch === full || (m.pathSuffix && pathForMatch.startsWith(full + '/'))) {
      return m.id;
    }
  }

  /**
   * Final-pass alias check: paths not in NAV_MODULES but explicitly mapped to a module.
   * Allows legacy URLs to keep gating against the right feature flag without polluting nav.
   */
  for (const [aliasSuffix, moduleId] of Object.entries(PATH_SUFFIX_ALIASES)) {
    const aliasFull = basePath + aliasSuffix;
    if (pathForMatch === aliasFull || pathForMatch.startsWith(aliasFull + '/')) {
      return moduleId;
    }
  }

  return null;
}

/**
 * Returns true if the path is under the portal base and should be guarded (i.e. we might redirect).
 */
export function isPortalPath(pathname: string, basePath: string): boolean {
  return pathname === basePath || pathname.startsWith(basePath + '/');
}
