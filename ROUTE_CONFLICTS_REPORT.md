# API Route Conflicts Analysis Report

**Generated:** February 4, 2026  
**Total Routes Scanned:** 431  
**Exact Duplicates:** 0  
**Pattern Conflicts:** 20

## Summary

No exact duplicate routes were found. However, 20 potential pattern conflicts were identified where dynamic routes (`[id]`) coexist with static routes at the same level. In Next.js, static routes take precedence over dynamic routes, which means these conflicts are handled correctly but may cause confusion.

## Critical Conflicts

These are the most problematic conflicts where common action names could be mistaken for IDs:

### 1. `/api/users/[id]` vs `/api/users/create`
- **Dynamic:** `src/app/api/users/[id]/route.ts`
- **Static:** `src/app/api/users/create/route.ts`
- **Issue:** The word "create" will never be treated as an ID (correct behavior, but worth noting)

### 2. `/api/tickets/[id]` vs `/api/tickets/stats`
- **Dynamic:** `src/app/api/tickets/[id]/route.ts`
- **Static:** `src/app/api/tickets/stats/route.ts`
- **Issue:** "stats" will match the static route, not the dynamic one

### 3. `/api/tickets/[id]` vs `/api/tickets/bulk`
- **Dynamic:** `src/app/api/tickets/[id]/route.ts`
- **Static:** `src/app/api/tickets/bulk/route.ts`
- **Issue:** "bulk" will match the static route, not the dynamic one

### 4. `/api/soap-notes/[id]` vs `/api/soap-notes/list`
- **Dynamic:** `src/app/api/soap-notes/[id]/route.ts`
- **Static:** `src/app/api/soap-notes/list/route.ts`
- **Issue:** "list" will match the static route, not the dynamic one

### 5. `/api/orders/[id]` vs `/api/orders/list`
- **Dynamic:** `src/app/api/orders/[id]/route.ts`
- **Static:** `src/app/api/orders/list/route.ts`
- **Issue:** "list" will match the static route, not the dynamic one

### 6. `/api/provider/prescription-queue/[invoiceId]` vs `/api/provider/prescription-queue/count`
- **Dynamic:** `src/app/api/provider/prescription-queue/[invoiceId]/route.ts`
- **Static:** `src/app/api/provider/prescription-queue/count/route.ts`
- **Issue:** "count" will match the static route, not the dynamic one

## Other Potential Conflicts

These conflicts are less critical but still worth reviewing:

### `/api/soap-notes/[id]` vs `/api/soap-notes/generate`
- **Dynamic:** `src/app/api/soap-notes/[id]/route.ts`
- **Static:** `src/app/api/soap-notes/generate/route.ts`

### `/api/providers/[id]` vs multiple static routes:
- `/api/providers/verify`
- `/api/providers/me`
- `/api/providers/debug`

### `/api/patients/[id]` vs:
- `/api/patients/merge`
- `/api/patients/protected`

### `/api/v2/invoices/[id]` vs `/api/v2/invoices/summary`

### `/api/super-admin/affiliates/[id]` vs:
- `/api/super-admin/affiliates/diagnostics`
- `/api/super-admin/affiliates/analytics`

### `/api/admin/affiliates/[id]` vs:
- `/api/admin/affiliates/reports`
- `/api/admin/affiliates/leaderboard`
- `/api/admin/affiliates/code-performance`
- `/api/admin/affiliates/fraud-queue`
- `/api/admin/affiliates/applications`

## Recommendations

1. **These conflicts are generally safe** - Next.js correctly prioritizes static routes over dynamic ones, so the behavior is correct.

2. **Consider using route prefixes** for actions to avoid confusion:
   - Instead of `/api/users/create`, use `/api/users/actions/create`
   - Instead of `/api/tickets/stats`, use `/api/tickets/actions/stats`

3. **Document route patterns** - Make sure your API documentation clearly states which routes are static vs dynamic.

4. **Validate IDs** - Ensure your dynamic route handlers validate that IDs are actually valid IDs (e.g., UUIDs, numeric IDs) and not action names.

5. **Consider route groups** - For complex APIs, consider using Next.js route groups to organize routes better.

## Similar Routes in Different Folders

These routes have similar patterns but are in different folders. They're not conflicts but could be confusing:

### Affiliates Routes
- `/api/admin/affiliates/[id]` - Admin-level affiliate management
- `/api/super-admin/affiliates/[id]` - Super-admin-level affiliate management
- **Note:** These serve different purposes and are correctly separated by role

### Clinics Routes
- `/api/admin/clinics/[id]` - Admin-level clinic management
- `/api/super-admin/clinics/[id]` - Super-admin-level clinic management
- **Note:** These serve different purposes and are correctly separated by role

### Invoice Routes
Multiple invoice routes with `[id]` pattern:
- `/api/invoices/[id]/sync` - Invoice synchronization
- `/api/v2/invoices/[id]` - V2 API invoice endpoint
- `/api/v2/invoices/[id]/actions` - V2 API invoice actions
- `/api/stripe/invoices/[id]` - Stripe-specific invoice endpoint
- **Note:** These are intentionally separated by version/context

### Users Routes
Multiple user-related routes:
- `/api/users` - General user routes
- `/api/admin/clinic/users` - Admin clinic user management
- `/api/internal/users` - Internal user routes
- `/api/super-admin/clinics/[id]/users` - Super-admin clinic users
- `/api/super-admin/clinics/[id]/users/[userId]` - Specific user in clinic
- **Note:** These are correctly separated by context and role

## Notes

- All conflicts follow Next.js routing precedence rules correctly
- No exact duplicate routes were found
- Nested routes (like `/api/tickets/[id]/status`) are correctly handled and not flagged as conflicts
- Routes with similar names in different folders (admin vs super-admin) are intentional and serve different purposes
