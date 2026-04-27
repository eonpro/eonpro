/**
 * Patient portal route guard — resolve path to nav module and determine if access is allowed.
 * Used by layout to redirect when user lands on a disabled module URL (e.g. bookmark).
 */

import { NAV_MODULES } from './registry';
import type { NavModuleId } from './registry';

/**
 * Legacy / alias path suffixes that don't have their own `NAV_MODULES` entry but
 * should still resolve to a module so the route guard doesn't misclassify them
 * as "unknown" (which redirects to portal home).
 *
 * `/subscription` is the legacy path that pre-dates the rename to `/billing`;
 * existing patient bookmarks, push-notification deep links, and the
 * `Support` tab removal (2026-04-22) leave this URL in the wild for a while.
 */
const PATH_SUFFIX_ALIASES: ReadonlyArray<{ suffix: string; moduleId: NavModuleId }> = [
  { suffix: '/subscription', moduleId: 'billing' },
];

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

  // No NAV_MODULES match — fall through to legacy alias map. Keep this
  // narrow + explicit so dead URLs don't silently 200 to a parent module.
  for (const alias of PATH_SUFFIX_ALIASES) {
    const full = basePath + alias.suffix;
    if (pathForMatch === full || pathForMatch.startsWith(full + '/')) {
      return alias.moduleId;
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
