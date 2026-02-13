/**
 * Stored user shape (from login response, stored in localStorage).
 * Use for display/UI only; never use for authorization — server verifies on each request.
 */
export interface StoredUser {
  id?: number;
  email?: string;
  role?: string;
  clinicId?: number;
  firstName?: string;
  lastName?: string;
  [key: string]: unknown;
}

/**
 * Safely get the stored user object from localStorage.
 * DISPLAY/UI ONLY — do not use for authorization; server enforces auth on every API call.
 * Only call in browser (e.g. in useEffect or event handlers).
 */
export function getStoredUser(): StoredUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('user');
    if (!raw) return null;
    return JSON.parse(raw) as StoredUser;
  } catch {
    return null;
  }
}

/**
 * Client-side role from localStorage. Use in layout components to avoid
 * showing wrong nav (e.g. reduced vs full admin) until useEffect runs.
 * Only call in browser (e.g. in useState initializer).
 * DISPLAY ONLY — server enforces authorization on all API routes.
 *
 * @param allowedRoles - If provided, return role only when it's in this list
 */
export function getStoredUserRole(allowedRoles?: string[]): string | null {
  const user = getStoredUser();
  if (!user) return null;
  const role = (user.role || '').toLowerCase();
  if (!role) return null;
  if (allowedRoles && !allowedRoles.includes(role)) return null;
  return role;
}
