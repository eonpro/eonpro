/**
 * Client-side role from localStorage. Use in layout components to avoid
 * showing wrong nav (e.g. reduced vs full admin) until useEffect runs.
 * Only call in browser (e.g. in useState initializer).
 *
 * @param allowedRoles - If provided, return role only when it's in this list
 */
export function getStoredUserRole(allowedRoles?: string[]): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const user = localStorage.getItem('user');
    if (!user) return null;
    const parsed = JSON.parse(user);
    const role = (parsed.role || '').toLowerCase();
    if (!role) return null;
    if (allowedRoles && !allowedRoles.includes(role)) return null;
    return role;
  } catch {
    return null;
  }
}
