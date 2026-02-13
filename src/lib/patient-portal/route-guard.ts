/**
 * Patient portal route guard — resolve path to nav module and determine if access is allowed.
 * Used by layout to redirect when user lands on a disabled module URL (e.g. bookmark).
 */

import { NAV_MODULES } from './registry';
import type { NavModuleId } from './registry';

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
  return null;
}

/**
 * Returns true if the path is under the portal base and should be guarded (i.e. we might redirect).
 */
export function isPortalPath(pathname: string, basePath: string): boolean {
  return pathname === basePath || pathname.startsWith(basePath + '/');
}
