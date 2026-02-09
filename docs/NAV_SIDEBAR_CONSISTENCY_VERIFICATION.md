# Platform-Wide Nav/Sidebar Consistency Verification

**Last verified:** 2026-02-08

This document confirms that the main admin-style sidebar (full vs reduced nav, role-based items) is driven by a single source of truth and applied consistently across the platform.

---

## Single Source of Truth

| Asset | Purpose |
|-------|---------|
| **`src/lib/nav/adminNav.ts`** | Defines `baseAdminNavConfig`, `getAdminNavConfig(role)`, and `getNonAdminNavConfig(userRole)`. All admin-style sidebars derive from these. |
| **`src/lib/auth/stored-role.ts`** | `getStoredUserRole(allowedRoles?)` reads role from `localStorage` so layouts can show the correct nav on first paint (no flash of wrong nav). |

---

## Layouts Using Shared Config (Verified)

| Route / entry | Layout / component | Nav source | Initial role |
|---------------|--------------------|------------|--------------|
| **`/`** (home) | `src/app/page.tsx` | Hardcoded list aligned with `baseAdminNavConfig` (includes Affiliates). | N/A (same for all roles that land here). |
| **`/admin/*`** | `src/app/admin/layout.tsx` | `getAdminNavConfig(userRole)` | From `useEffect` (admin-only layout). |
| **`/patients/*`** | `src/app/patients/layout.tsx` | `getAdminNavConfig` (admin/super_admin) or `getNonAdminNavConfig` (provider/staff/support). | `getStoredUserRole(ALLOWED_ROLES)` |
| **`/orders/*`** | `src/app/orders/layout.tsx` | Same as patients. | `getStoredUserRole(ALLOWED_ROLES)` |
| **`/intake-forms/*`** | `src/app/intake-forms/layout.tsx` | Same as patients. | `getStoredUserRole(ALLOWED_ROLES)` |
| **`/tickets/*`** | `src/app/tickets/layout.tsx` | Admin/super_admin: `getAdminNavConfig(userRole)` (first item overridden to Dashboard → `/admin`). Provider/staff/support: local `getNavItemsForNonAdminRole`. | `getStoredUserRole(TICKETS_ALLOWED_ROLES) ?? 'admin'` |
| **RoleBasedLayout (admin)** | `src/components/layouts/AdminLayout.tsx` | `getAdminNavConfig(role)` from `userData`; first item set to Dashboard → `/admin`. | From `userData?.role`. |

---

## Layouts Intentionally Different (Not Admin Sidebar)

| Route / entry | Notes |
|---------------|--------|
| **`/super-admin/*`** | `src/app/super-admin/layout.tsx` uses its own nav (Clinics, Providers, User Activity, etc.). Separate product surface; not the main admin sidebar. |
| **`/provider/*`** | Uses `ProviderLayout` and `roles.config` navigation (provider-specific paths). |
| **`/staff/*`**, **`/support/*`** | Same: role config–driven nav. |
| **Patient portal** | Own nav from `NAV_MODULES`; patient-facing. |
| **Affiliate dashboard** | Own nav; different product. |

---

## Consistency Rules

1. **Admin / super_admin**  
   Any layout that shows the “full” admin sidebar must use `getAdminNavConfig(role)` (with optional first-item override to Dashboard → `/admin` where needed). No hardcoded duplicate lists for admin.

2. **Provider / staff / support**  
   Layouts that show a “reduced” sidebar for these roles use either:
   - `getNonAdminNavConfig(userRole)` (for `/patients`, `/orders`, `/intake-forms`), or
   - Role-specific nav (e.g. tickets’ `getNavItemsForNonAdminRole`) where paths differ (e.g. `/provider/patients`).

3. **Initial role**  
   Where the sidebar depends on role and the layout is client-rendered, initial state should use `getStoredUserRole(allowedRoles)` (or role from `userData` in component layouts) so the correct nav shows on first paint.

4. **Adding/removing admin nav items**  
   Change only `src/lib/nav/adminNav.ts` (`baseAdminNavConfig` or `getAdminNavConfig` / `getNonAdminNavConfig`). Then:
   - App layouts that use `getAdminNavConfig` / `getNonAdminNavConfig` pick it up automatically.
   - Home page (`page.tsx`) nav list should be updated to match `baseAdminNavConfig` (e.g. when adding a new item).

---

## Quick Audit Commands

- **Find nav definitions:**  
  `grep -r "navItems\s*=\|getAdminNavConfig\|getNonAdminNavConfig\|getNavItemsForRole" src --include="*.tsx" --include="*.ts"`

- **Find uses of shared config:**  
  `grep -r "from '@/lib/nav/adminNav'\|from \"@/lib/nav/adminNav\"" src`

- **Find initial role usage:**  
  `grep -r "getStoredUserRole" src`

---

## Status

All admin-style sidebars that were updated now use the shared nav config and, where relevant, `getStoredUserRole` for initial role. The only remaining local nav lists are:

- **Home (`page.tsx`):** Kept in sync with `baseAdminNavConfig` (including Affiliates).
- **Tickets (non-admin):** `getNavItemsForNonAdminRole` for provider/staff/support (different paths).
- **Super-admin:** Separate app; own nav by design.

No other layout uses a hardcoded duplicate of the full admin nav.
