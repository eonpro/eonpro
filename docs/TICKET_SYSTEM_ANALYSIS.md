# Ticket System – Line-by-Line Analysis: Holes & Functionality Gaps

This document analyzes the enterprise ticketing feature end-to-end (UI, API, domain, data) and lists **holes**, **functionality gaps**, and **inconsistencies**.

---

## Table of Contents

1. [Summary & Severity Legend](#summary--severity-legend)
2. [List Page (Frontend)](#1-list-page-frontend)
3. [New Ticket Page (Frontend)](#2-new-ticket-page-frontend)
4. [Ticket Detail Page (Frontend)](#3-ticket-detail-page-frontend)
5. [Tickets Layout](#4-tickets-layout)
6. [GET/POST /api/tickets](#5-getpost-apitickets)
7. [GET/PATCH/DELETE /api/tickets/[id]](#6-getpatchdelete-apiticketsid)
8. [Comments, Status, Resolve, Assign, Activity APIs](#7-comments-status-resolve-assign-activity-apis)
9. [Domain Layer (Service & Repository)](#8-domain-layer-service--repository)
10. [Schema & Data](#9-schema--data)
11. [Security & Multi-Tenant](#10-security--multi-tenant)
12. [Recommended Fixes (Priority Order)](#11-recommended-fixes-priority-order)

---

## Summary & Severity Legend

| Severity | Meaning |
|----------|--------|
| **Critical** | Data leak, auth bypass, or broken core flow |
| **High** | Feature promised in UI/API but not implemented or wrong |
| **Medium** | Inconsistency, missing validation, or poor UX |
| **Low** | Nice-to-have, edge case, or tech debt |

**Critical:** 3 · **High:** 9 · **Medium:** 12 · **Low:** 7

---

## 0. Additional Findings (Line-by-Line Verification)

| # | Issue | Severity | File:Line | Details |
|---|--------|----------|-----------|---------|
| 0.1 | **Assignee dropdown always empty** | Critical | `src/app/api/users/route.ts:39-41`, `src/app/tickets/new/page.tsx:127` | New Ticket page calls `GET /api/users?role=staff,admin,provider,support&limit=100`. The API does `where.role = role` (single string). No user has role `"staff,admin,provider,support"`, so **Assign To** always returns 0 users. API must accept multiple roles (e.g. `role=staff&role=admin` or split comma and use `{ in: roles }`). |
| 0.2 | **Assign route catch does not call reportTicketError** | Low | `src/app/api/tickets/[id]/assign/route.ts:65-66` | Catch block only calls `handleApiError`; other ticket routes also call `reportTicketError` for consistency and error tracking. |
| 0.3 | **Repository clinicId when null** | Note | `src/domains/ticket/repositories/ticket.repository.ts:69-72` | `buildWhereClause` sets `where.clinicId = userContext.clinicId` when not super_admin. If `clinicId` is null, Prisma filters by `clinicId: null` (only tickets with no clinic). The **list route** never uses this; it builds its own `whereClause` and omits clinic when `user.clinicId` is falsy → leak is in the route, not the repository. |

---

## 1. List Page (Frontend)

**File:** `src/app/tickets/page.tsx`

| # | Issue | Severity | Details |
|---|--------|-----------|---------|
| 1.1 | **Filters not applied by API** | High | UI sends `myTickets`, `isUnassigned`, `hasSlaBreach`, and multiple `status` / `priority` in the URL. `GET /api/tickets` only reads single `status` and `priority` via `searchParams.get()` and **ignores** `myTickets`, `isUnassigned`, and `hasSlaBreach`. So "Assigned to me", "Unassigned", and "SLA Breached" do nothing. |
| 1.2 | **List API doesn’t return SLA or lastActivityAt** | High | List response `select` does not include `lastActivityAt` or `sla` (or relation to `TicketSLA`). Frontend type and UI expect `ticket.sla?.breached` and `lastActivityAt`. SLA breached badge and sort-by-activity cannot work correctly. |
| 1.3 | **Status filter list incomplete** | Low | Filter panel shows NEW, OPEN, IN_PROGRESS, PENDING_CUSTOMER, ON_HOLD, ESCALATED, RESOLVED. It omits PENDING, PENDING_INTERNAL, CLOSED, CANCELLED, REOPENED (some are in `STATUS_COLORS`). Inconsistent with schema. |
| 1.4 | **Priority filter omits P5_PLANNING** | Low | Quick filters use P0–P4; P5_PLANNING exists in schema and labels but not in filter list. |
| 1.5 | **Pagination uses router.push** | Medium | Prev/Next use `router.push()` (same as the original “New Ticket” issue). If client router is unreliable in this layout, pagination might appear to do nothing. Consider `window.location.href` or `<Link>` for consistency. |
| 1.6 | **Row click uses router.push** | Medium | Ticket row click uses `router.push(\`/tickets/${ticket.id}\`)`. Same navigation concern as above; detail might not open. |
| 1.7 | **No 403 handling** | Low | On 401 the page sets “Session expired”. On 403 there is no specific message; user sees generic “Failed to fetch tickets”. |
| 1.8 | **Error state has no retry** | Low | Error banner has no “Retry” button; user must refresh or change filters. |

---

## 2. New Ticket Page (Frontend)

**File:** `src/app/tickets/new/page.tsx`

| # | Issue | Severity | Details |
|---|--------|-----------|---------|
| 2.1 | **Assignee list not clinic-scoped** | High | “Assign To” is populated from `GET /api/users?role=staff,admin,provider,support&limit=100`. That API does **not** filter by clinic. Users from other clinics can be assigned, causing confusion or cross-tenant assignment. |
| 2.2 | **Patient search may not be clinic-scoped** | High | Patient search calls `GET /api/patients?search=...`. If that route does not enforce clinic context for the current user, search could return patients from other clinics (PHI leak). |
| 2.3 | **Success uses router.push** | Medium | On create success: `router.push(\`/tickets/${data.ticket.id}\`)`. Same client-router risk; user might stay on form. |
| 2.4 | **Back/Cancel use router.push** | Medium | “Back” and “Cancel” use `router.push('/tickets')`. Same as above. |
| 2.5 | **Order ID is free text** | Medium | Form has `orderId` in state and payload; UI does not show an order selector (only patient search). If there is an order picker elsewhere, it’s not wired here; otherwise orderId is effectively unused or error-prone. |
| 2.6 | **Tags sent but create path may not persist** | Low | Tags are sent as comma-separated and passed to POST. POST handler does set `createData.tags = body.tags` when present; schema has `tags String[]`. So tags should persist; worth confirming API and DB behavior. |
| 2.7 | **No loading state for users** | Low | Users are fetched in useEffect; Assign To can render empty briefly with no spinner. |
| 2.8 | **getAuthHeaders not in dependency array** | Low | `fetchUsers` useEffect has `[]` deps; `getAuthHeaders` is used inside. Linter may warn; functionally usually fine. |

---

## 3. Ticket Detail Page (Frontend)

**File:** `src/app/tickets/[id]/page.tsx`

| # | Issue | Severity | Details |
|---|--------|-----------|---------|
| 3.1 | **Resolve button is a stub** | High | “Resolve” opens `alert('Resolve modal coming soon')`. No modal, no call to `POST /api/tickets/[id]/resolve`. Resolution flow is unimplemented in UI. |
| 3.2 | **Edit button does nothing useful** | High | “Edit” does `router.push(\`/tickets/${ticketId}?mode=edit\`)`. There is **no** `mode=edit` handling in the detail page and **no** separate edit page. Query param is ignored; user stays on same view. |
| 3.3 | **No way to change status from detail** | High | Status is displayed but there is no dropdown or actions to call `PATCH /api/tickets/[id]/status`. Only resolve (stub) exists. |
| 3.4 | **No way to assign from detail** | High | “Assigned To” is shown in sidebar but there is no “Assign” / “Reassign” control calling `POST /api/tickets/[id]/assign`. |
| 3.5 | **Comment API field name mismatch** | Medium | UI sends `content` and `isInternal`; API expects `content` and `isInternal` and service/repo map `content` → `comment` in DB. Response comment object has DB field `comment`. UI displays `comment.comment`—correct. But if API ever returned a different shape, UI would break. |
| 3.6 | **Related links may be wrong** | Medium | Patient link: `href={\`/patients/${ticket.patient.id}\`}`. Order link: `href={\`/orders/${ticket.order.id}\`}`. These paths may not be the correct app routes (e.g. might be under `/admin/patients`, `/admin/orders`). Need to match app routing. |
| 3.7 | **Back to list uses router.push** | Medium | “Back to Tickets” uses `router.push('/tickets')`. Same navigation concern as list/detail. |
| 3.8 | **Comment error uses alert()** | Low | On add-comment failure the code uses `alert(...)`. Inconsistent with rest of app (inline error state). |
| 3.9 | **Watchers not manageable** | Low | Watchers are displayed but there is no “Add watcher” or “Remove me” from UI. |
| 3.10 | **Activity pagination not exposed** | Low | Activity API supports limit/offset; UI fetches once with default limit. No “Load more” or pagination. |

---

## 4. Tickets Layout

**File:** `src/app/tickets/layout.tsx`

| # | Issue | Severity | Details |
|---|--------|-----------|---------|
| 4.1 | **Patient role cannot access /tickets** | Medium | `TICKETS_ALLOWED_ROLES = ['admin', 'super_admin', 'provider', 'staff', 'support']`. Patient is **not** included. So patients are redirected to login if they open `/tickets`, even though the domain and API allow patient access for “own” tickets. If product intent is for patients to see their tickets, layout should allow patient and rely on API for scope. |
| 4.2 | **Sidebar nav uses full page load** | Low | Sidebar uses `window.location.href = item.path`, so every nav is a full reload. Consistent but different from SPA behavior. |
| 4.3 | **User from localStorage only** | Low | Role and user come from `localStorage.getItem('user')`. If token is valid but localStorage is cleared, user may be sent to login. |

---

## 5. GET/POST /api/tickets

**File:** `src/app/api/tickets/route.ts`

| # | Issue | Severity | Details |
|---|--------|-----------|---------|
| 5.1 | **Clinic filter missing when user has no clinicId** | Critical | **Lines 86-90:** `if (user.role !== 'super_admin' && user.clinicId) { whereClause.clinicId = user.clinicId; }`. If the user is **not** super_admin and `user.clinicId` is null/undefined (e.g. some support or cross-clinic roles), **no** clinic filter is applied and the query returns **all** tickets. **Data leak.** |
| 5.2 | **List ignores multi-value and quick filters** | High | API uses `searchParams.get('status')` and `searchParams.get('priority')` (single value). Frontend sends multiple with `params.append('status', s)`. Only the first value is used. `myTickets`, `isUnassigned`, and `hasSlaBreach` are never read. |
| 5.3 | **List response missing lastActivityAt and sla** | High | `select` does not include `lastActivityAt` or `sla` (or join to TicketSLA). List cannot show SLA breach or sort by last activity correctly. |
| 5.4 | **POST does not use ticket service** | High | Create is implemented with `prisma.$transaction` and `tx.ticket.create` directly. It does **not** use `ticketService.create()`. So: no “CREATED” activity log, no auto-add creator as watcher, no service-layer validation of assignee/team. Behavior diverges from domain design. |
| 5.5 | **Basic create fallback uses wrong enums** | Medium | On schema mismatch fallback, create uses `priority: 'MEDIUM'` and `status: 'OPEN'`. Schema may expect `P3_MEDIUM` and `NEW`; can cause enum errors or inconsistency. |
| 5.6 | **Ticket number race condition** | Low | Ticket number is `prefix + (ticketCount + 1)`. Under high concurrency two tickets could get the same count. Prefer a serializable transaction or a dedicated counter/sequence. |

---

## 6. GET/PATCH/DELETE /api/tickets/[id]

**File:** `src/app/api/tickets/[id]/route.ts`

| # | Issue | Severity | Details |
|---|--------|-----------|---------|
| 6.1 | **GET supports ticket number; list does not** | Low | GET accepts either numeric id or ticket number (e.g. `TKT-000001`). List and detail URLs use numeric id only. No deep link or search by ticket number in list. |
| 6.2 | **PATCH and DELETE use ticketId only** | Low | PATCH/DELETE require numeric id; they do not accept ticket number. Inconsistent with GET. |

---

## 7. Comments, Status, Resolve, Assign, Activity APIs

| # | Issue | Severity | Details |
|---|--------|-----------|---------|
| 7.1 | **Resolve route doesn’t call reportTicketError** | Low | Other ticket routes call `reportTicketError` in catch; resolve route only uses `handleApiError`. Error tracking for resolve is less consistent. |
| 7.2 | **Activity API doesn’t call reportTicketError** | Low | Same as above for activity GET. |

---

## 8. Domain Layer (Service & Repository)

**Files:** `src/domains/ticket/services/ticket.service.ts`, `src/domains/ticket/repositories/ticket.repository.ts`

| # | Issue | Severity | Details |
|---|--------|-----------|---------|
| 8.1 | **List API does not use ticketService.list()** | High | List is implemented in the route with raw Prisma. The service and repository support rich filters (`TicketListFilters`: myTickets, isUnassigned, hasSlaBreach, multiple status/priority, etc.). Route does not use them; filtering and consistency suffer. |
| 8.2 | **getStats TODOs** | Low | `getStats` returns `byCategory: {}`, `overdue: 0`, `avgResolutionTime: 0`, `avgFirstResponseTime: 0` with TODOs. Stats are incomplete. |
| 8.3 | **assign allows assignedToId 0** | Low | In assignment log, `assignedToId: data.assignedToId || 0` is used for unassign. Storing 0 in TicketAssignment.assignedToId may conflict with a real user id 0 if it ever exists. Prefer null for “unassigned”. |

---

## 9. Schema & Data

**File:** `prisma/schema.prisma`

| # | Issue | Severity | Details |
|---|--------|-----------|---------|
| 9.1 | **Ticket.clinicId nullable** | Medium | `clinicId Int?` allows tickets with no clinic. List and create assume clinic-scoped behavior. If clinicId is null, list filter and create validation need explicit handling. |
| 9.2 | **Ticket number uniqueness** | Low | `ticketNumber String @unique` is global. Two clinics could theoretically generate same number (e.g. TKT-000001) if prefix is not clinic-specific. Current code uses clinic subdomain prefix; ensure it’s always set and unique enough. |

---

## 10. Security & Multi-Tenant

| # | Issue | Severity | Details |
|---|--------|-----------|---------|
| 10.1 | **List returns all tickets when clinicId missing** | Critical | Same as 5.1: non–super_admin users without clinicId get no clinic filter → all tickets. Must enforce clinic or explicit “no access” when clinicId is missing. |
| 10.2 | **New ticket user list is global** | High | Same as 2.1: assignee dropdown is not clinic-scoped → cross-clinic assignment and possible info disclosure. |
| 10.3 | **Patient search must be clinic-scoped** | High | Same as 2.2: if `/api/patients` is not scoped to the current user’s clinic, patient search on new ticket can leak PHI. |

---

## 11. Recommended Fixes (Priority Order)

### Critical (do first)

1. **GET /api/tickets – enforce clinic for non–super_admin**  
   When `user.role !== 'super_admin'`, if `user.clinicId` is null/undefined, return 403 or empty list with a clear message instead of returning all tickets. Do not run the list query without a clinic filter for these users.

2. **GET /api/users – support multiple roles for Assign To**  
   New Ticket page calls `/api/users?role=staff,admin,provider,support`. The API treats `role` as a single value, so no user matches and the assignee dropdown is always empty. Parse `role` as comma-separated and use `where.role = { in: validRoles }` (and optionally filter by clinicId for ticket assignment).

### High

3. **GET /api/tickets – support list filters**  
   Read `myTickets`, `isUnassigned`, `hasSlaBreach` and multiple `status`/`priority` from query params and pass them into `ticketService.list()` (or equivalent) so the list API uses the same filters the UI sends.

4. **GET /api/tickets – include lastActivityAt and sla**  
   Add `lastActivityAt` and `sla` (with breached/computed fields if needed) to the list response so the list page can show SLA and sort by activity.

5. **POST /api/tickets – use ticketService.create()**  
   Replace the inline Prisma create with a call to `ticketService.create()` so creation is consistent (activity log, watchers, validation). Adjust payload (e.g. clinicId, assignee, team) to match `CreateTicketInput`.

6. **New ticket – clinic-scoped assignee list**  
   After fixing multiple roles (item 2), add clinic filter to `GET /api/users` (e.g. `?clinicId=` from current context) or use `/api/clinics/[id]/users` so “Assign To” only shows users for the current clinic.

7. **New ticket – clinic-scoped patient search**  
   Ensure `GET /api/patients` used by the new ticket page is scoped to the current user’s clinic (or to a clinic selected in context).

8. **Detail page – implement Resolve**  
   Add a resolve modal (or inline form) that collects disposition and resolution notes and calls `POST /api/tickets/[id]/resolve`. Remove the “coming soon” alert.

9. **Detail page – implement Edit**  
   Either add `?mode=edit` handling on the detail page (inline edit) or add a dedicated edit page/route and wire “Edit” to it. Use PATCH and optionally status/assign APIs as needed.

10. **Detail page – status and assign actions**  
   Add UI to change status (dropdown or buttons) and to assign/reassign, calling `PATCH /api/tickets/[id]/status` and `POST /api/tickets/[id]/assign`.

### Medium

11. **List/detail navigation**  
    Where navigation still uses `router.push` and users report “nothing happens”, use `<Link>` or `window.location.href` for “New Ticket”, “Back”, row click, and pagination so behavior matches the fix already applied to the New Ticket link.

12. **List – filter list completeness**  
    Align status and priority filter options with schema (e.g. include PENDING_INTERNAL, CLOSED, CANCELLED, REOPENED, P5_PLANNING) or document why some are omitted.

13. **New ticket – order selection**  
    Either add an order search/selector (clinic-scoped) and wire it to `orderId`, or remove orderId from the form and API payload if not used.

14. **Layout – patient access**  
    If patients should see their own tickets, add `patient` to `TICKETS_ALLOWED_ROLES` and ensure list/detail APIs and UI only show tickets the patient is allowed to see.

15. **Related links on detail**  
    Set patient and order links to the correct app routes (e.g. `/admin/patients/[id]`, `/admin/orders/[id]` or the appropriate base path).

### Low

16. **Error handling and UX**  
    Add retry on list error; replace comment `alert()` with inline error state; optionally add 403-specific message on list.

17. **Resolve/assign/activity routes**  
    Call `reportTicketError` in catch blocks for consistency with other ticket routes.

18. **Ticket number generation**  
    Harden with a serializable transaction or a dedicated sequence/counter to avoid duplicates under concurrency.

19. **Stats and repository**  
    Implement or stub `byCategory`, `overdue`, and resolution/first-response averages in stats; avoid storing 0 for “unassigned” in assignment history if schema allows null.

---

## Implementation Status (as of 2026-02-09)

Already implemented in codebase (analysis may predate these):

- **Critical #1:** GET /api/tickets returns 403 when non–super_admin has no clinicId.
- **High #3–4:** GET /api/tickets uses ticketService.list() with myTickets, isUnassigned, hasSlaBreach, multi status/priority; fallback select includes lastActivityAt and sla.
- **High #5:** POST /api/tickets uses ticketService.create() with CreateTicketInput.
- **High #6:** New ticket page sends clinicId and multiple role params; GET /api/users supports comma-separated roles and clinicId.
- **High #8–10:** Detail page has Resolve modal (calls resolve API), Edit (PATCH), status dropdown, and assign control.
- **Low #17:** reportTicketError added to assign, resolve, and activity routes.

- **Low #16 (partial):** List page: 403-specific message and "Try again" button in error state. Detail page: comment failure shows inline error instead of `alert()`; comment error clears when user types. Order related link changed to `/admin/orders` (no order detail route exists).

Remaining from recommended fixes: list/detail navigation (router.push vs Link), filter list completeness, order selector on new ticket, layout patient access, ticket number race hardening, stats TODOs.

---

## 12. Areas That Affect Functionality (Cross-Cutting)

These can break tickets or other features when misconfigured or when auth/context is missing.

| Area | Impact | Mitigation |
|------|--------|------------|
| **Clinic middleware** (`src/middleware/clinic.ts`) | When `NEXT_PUBLIC_ENABLE_MULTI_CLINIC=true`, any `/api/*` request (except PUBLIC_ROUTES) gets **400** if `resolveClinic()` returns null (no cookie, no clinic in JWT, no header). That blocks tickets list/create before the handler runs. | `/api/tickets` added to PUBLIC_ROUTES so middleware skips clinic resolution; tickets handler still returns empty list when user has no clinicId. |
| **JWT `clinicId`** | Login sets `clinicId` (activeClinicId) in token. If token has no clinicId, non–super_admin users get empty ticket list (by design). | Ensure login always sets `clinicId` for non–super_admin when a clinic is selected; tickets GET returns empty list + optional warning instead of 403. |
| **Client-side navigation** | In tickets layout, `router.push()` sometimes does not trigger a visible navigation (layout uses full-page nav for sidebar). | List/detail/new ticket pages use `window.location.href` for: New Ticket, Create first ticket, row click, Back, Cancel, Apply/Clear filters, search submit, pagination, Edit toggle, Save edit redirect, success redirect after create. |
| **GET /api/clinic/list** | Returns **403** when non–super_admin has no clinicId. Clinic switcher or any UI that calls this will fail. | Either ensure JWT has clinicId after login, or change this route to return empty list / 200 with null when no clinic. |
| **GET /api/clinic/current** | Returns **404** when user has no clinicId. Dashboard or layout that fetches “current clinic” can break. | Same as above: ensure clinic in token or degrade gracefully. |
| **Admin clinic routes** | Many `/api/admin/clinic/*` routes return 400/403 when `!user.clinicId`. Intentional for clinic-scoped admin. | No change; ensure admin users have clinicId in token. |

---

## Document Info

- **Generated:** 2026-02-09  
- **Scope:** Tickets list, new ticket, ticket detail, layout, `/api/tickets` and `/api/tickets/[id]` (and sub-routes), ticket domain service/repository, and schema.  
- **Not covered:** Internal tickets API, bulk APIs, watchers API, SLA/internal escalation implementation, or e2e tests.  
- **Last updated:** 2026-02-09 — 403 + Retry on list; comment inline error; order link to /admin/orders; implementation status.
