# Ticketing System — Feature Functionality Verification

**Feature:** Issue ticket creation, assignment to reps, and problem resolution tracking (Zendesk-like).  
**Verification date:** Feb 9, 2026.  
**Principal Engineer / QA Lead review.**

---

## A) ✅ Confirmed Working Flows

| Flow | Evidence |
|------|----------|
| **List tickets** | `GET /api/tickets` uses `withAuth`, builds `TicketListFilters` from query params, calls `ticketService.list()`. Clinic isolation in repository (`buildWhereClause`). No clinic context → empty list + warning (no data leak). Pagination (page, limit), sort, filters (status, priority, myTickets, isUnassigned, hasSlaBreach, search) work. |
| **Create ticket** | `POST /api/tickets` validates `title`, `description`, `clinicId`; builds `CreateTicketInput`; `ticketService.create()` runs in `prisma.$transaction` (ticket + activity + watcher). Assignee/team validated (user in clinic, team active). Returns 201 + ticket. |
| **Get ticket** | `GET /api/tickets/[id]` accepts numeric ID or ticket number (`TKT-000001`). Uses `ticketService.getById()` or `getByTicketNumber()`. Repository enforces clinic isolation; cross-clinic returns null → `NotFoundError`. `handleApiError` used. |
| **Update ticket** | `PATCH /api/tickets/[id]` maps body to `UpdateTicketInput`, calls `ticketService.update()`. Service enforces status transition rules (`VALID_STATUS_TRANSITIONS`), logs activities, uses transaction. |
| **Assign ticket** | `POST /api/tickets/[id]/assign` calls `ticketService.assign()`. Transaction: update ticket, create `TicketAssignment` when `assignedToId` is set, log activity, add assignee as watcher. **Unassign fixed:** no longer creates `TicketAssignment` with `assignedToId: 0` (FK violation). |
| **Resolve ticket** | `POST /api/tickets/[id]/resolve` validates disposition and resolution notes; supports `action: 'reopen'`. Service validates status transition, updates ticket + status history + activity in transaction. |
| **Comments** | `GET/POST /api/tickets/[id]/comments` use service; POST validates content, respects `isInternal` (patients cannot add internal). Activity logged in transaction. |
| **Status change** | `PATCH /api/tickets/[id]/status` validates status enum, calls `ticketService.changeStatus()` with transition rules and status history. |
| **Activity log** | `GET /api/tickets/[id]/activity` delegates to `ticketService.getActivities()` after access check. |
| **Watchers** | GET/POST/DELETE watchers routes use service; POST validates `userId`, DELETE uses query param `userId`. |
| **Bulk update** | `POST /api/tickets/bulk` validates `ticketIds` (max 100) and `updates`; merge operation supported. Service filters to accessible ticket IDs (clinic) and calls `ticketRepository.bulkUpdate()`. |
| **Stats** | `GET /api/tickets/stats` requires clinicId (or user’s clinic); service validates clinic access. Schema mismatch returns empty stats + warning. |
| **Frontend list** | Loading, error, warning states; 401/403 handled; refresh; filters and search; empty state. |
| **Frontend new ticket** | Form validation, `submitting` disables submit (double-submit protection); error banner; redirect on success. |
| **Frontend detail** | Loading/error; comment/status/assign/resolve/edit use local loading flags (double-submit protection); 401 → “Session expired”. |
| **Auth & layout** | Tickets layout checks `localStorage.user` and role (admin, super_admin, provider, staff, support); redirects to login if missing/invalid. ErrorBoundary with Sentry-friendly fallback. |
| **Clinic isolation** | Repository `buildWhereClause` and `findById`/`findByTicketNumber` enforce clinic; service `checkTicketAccess` and `getStats` enforce clinic; bulk update filters by accessible IDs. |
| **Patient role** | Service `checkTicketAccess`: patient can only view; must be creator or linked patient. Patients cannot add internal comments. |

---

## B) 🔴 Functional Bugs (with exact file paths)

| Bug | Location | Fix applied / required |
|-----|----------|-------------------------|
| **Unassign creates invalid TicketAssignment** | `src/domains/ticket/services/ticket.service.ts` (assign) | **Fixed.** Code previously did `assignedToId: data.assignedToId \|\| 0` and always created `TicketAssignment`. `TicketAssignment.assignedToId` is required and FK to `User`; no user id 0 → FK violation on unassign. **Fix:** Only create `TicketAssignment` when `data.assignedToId != null`. |
| **POST /api/tickets returned 500 for validation/forbidden** | `src/app/api/tickets/route.ts` (POST catch) | **Fixed.** Domain errors (e.g. `ValidationError`, `ForbiddenError`) were not passed through `handleApiError`, so clients received 500. **Fix:** Call `handleApiError(error, { route: 'POST /api/tickets' })` and return it when status is not 500; keep existing 503/schema/500 handling after. |

---

## C) 🟠 High-Risk Issues (could break under real usage)

| Issue | Location | Risk | Recommendation |
|-------|----------|------|----------------|
| **Ticket number race** | `src/domains/ticket/repositories/ticket.repository.ts` — `generateTicketNumber()` | Two concurrent creates can read same `count`, both get same number; second insert fails on `ticketNumber` unique. No silent duplicate; user sees error. | For high concurrency, use atomic counter (e.g. dedicated table with `increment`) or DB sequence. P2. |
| **Stats schema fallback shape** | `src/app/api/tickets/stats/route.ts` | On schema mismatch, fallback returns `open`, `inProgress`, `resolved`, `closed` while normal response uses `byStatus`, `byPriority`, etc. Clients that key off `stats.byStatus` may break. | Align fallback shape with `TicketStats` or document as “degraded” and have client handle missing keys. P2. |
| **Main GET /api/tickets no handleApiError** | `src/app/api/tickets/route.ts` (GET catch) | If `ticketService.list()` ever threw a domain error, it would be treated as 500. | **Fixed.** GET catch now returns `handleApiError(error, ...)` for non-DB, non-schema errors. |

---

## D) 🟡 Edge Cases / Gaps

| Item | Details |
|------|--------|
| **Idempotency** | Create ticket and comment POST have no idempotency key. Duplicate submit (e.g. double-click after fix) can create two tickets/comments. Mitigated by frontend disable-on-submit; not safe against replay. |
| **Category/priority enums** | POST accepts any string for category/priority; invalid enum would fail in Prisma. API could validate against allowed enums and return 400 with clear message. |
| **PATCH [id] body validation** | PATCH ticket does not validate enum values for status/category/priority; invalid value surfaces as DB/Prisma error. |
| **TicketMerge commentsTransferred** | Service merge uses `updateMany` to move comments then records counts; schema has `commentsTransferred`/`attachmentsTransferred`. Verified present in schema; logic consistent. |
| **Patient list** | `findById` includes `patient` with id, firstName, lastName, patientId, email, phone. Patient may contain PHI; ensure no PHI in logs (repository logs IDs only — OK). |
| **Internal APIs** | `/api/internal/tickets/*` exist (worklog, sla, escalate, comments). Not exercised in this verification; same patterns (auth, service, errors) should be verified if used. |

---

## E) 🟢 What Is Solid

- **Transactions:** Create ticket (ticket + activity + watcher), update (ticket + activities), assign (update + assignment record + activity + watcher), resolve (ticket + activity + status history), merge (comments/attachments + merge record + close source + activities), comment (comment + activity) all use `prisma.$transaction`.
- **Status transitions:** Explicit `VALID_STATUS_TRANSITIONS`; service rejects invalid transitions with `ValidationError`.
- **Authorization:** Service `checkTicketAccess()` enforces clinic and patient view/action limits; repository enforces clinic on list/find.
- **Error handling:** Most routes use `handleApiError`; `reportTicketError` used for Sentry context (route, ticketId, clinicId, userId, operation). No PHI in logs (IDs only).
- **API consistency:** [id], assign, resolve, comments, status, activity, watchers, bulk use `handleApiError`. GET list and POST create now have domain error handling (POST fixed).
- **Graceful degradation:** GET list has schema-mismatch detection and fallback query; on full failure returns empty list + warning. POST create returns 503 with message on schema mismatch. Stats returns empty stats + warning on schema error.
- **Frontend:** Loading/error/empty and per-action loading flags (comment, status, assign, resolve, edit); layout auth and role check; ErrorBoundary.
- **Observability:** Logger and Sentry tagging (feature: tickets, route, ticketId, clinicId, userId, operation).

---

## F) 📋 Required Fixes (P0 / P1 / P2 with effort)

| Priority | Fix | Effort | Status |
|----------|-----|--------|--------|
| **P0** | Unassign: do not create TicketAssignment when assignedToId is null (FK violation) | S | **Done** |
| **P1** | POST /api/tickets: return 400/403 for domain errors via handleApiError | S | **Done** |
| **P2** | GET /api/tickets: use handleApiError in catch before schema/503/500 | S | **Done** |
| **P2** | Align stats schema-fallback response shape with TicketStats or document | S | Optional |
| **P2** | Ticket number generation: atomic counter or sequence to avoid unique violation under concurrency | M | Optional |

---

## G) 🧪 Feature Verification Checklist

### Manual

- [ ] List tickets as admin (with clinic); empty list when no clinic selected (warning shown).
- [ ] Create ticket (title, description, category, priority, assignee); redirect to detail; ticket appears in list.
- [ ] Open ticket by ID and by ticket number (e.g. TKT-000001).
- [ ] Assign ticket to user; unassign (set to “Unassigned”); no 500/FK error.
- [ ] Add comment (internal and non-internal); resolve with disposition and notes; reopen.
- [ ] Change status via dropdown; invalid transition (if UI allows) should show error.
- [ ] Bulk update (e.g. status for multiple tickets); merge two tickets.
- [ ] As patient (if supported): view only own/relevant tickets; cannot add internal note.
- [ ] Stats dashboard: numbers and fallback when migration pending.

### Automated

- [ ] `tests/unit/api/tickets-route.test.ts`: auth 401, response shape (existing).
- [ ] `tests/unit/domains/ticket/services/ticket.service.test.ts`: create, get, update, assign, resolve, list (existing).
- [x] Add test: assign with `assignedToId: null` does not create TicketAssignment and does not throw. (`ticket.service.test.ts` — assign describe)
- [x] Add test: POST /api/tickets with invalid assignee returns 422 (handleApiError). (`tickets-route.test.ts` — POST describe)

---

## H) 🚦 Feature Readiness Verdict

**Verdict: PRODUCTION READY (with manual checklist)**

- **Rationale:** Core flows (list, create, get, update, assign, resolve, comments, status, watchers, bulk) are implemented with transactions, clinic isolation, status rules, and error reporting. P0/P1 fixed (unassign, POST handleApiError). P2 GET handleApiError done; regression tests added (assign with null, POST ValidationError → 422). Remaining risks: ticket number race (optional atomic counter), stats fallback shape; edge cases (idempotency, enum validation) are acceptable.
- **Conditions for production:** (1) Run manual checklist above. (2) Deploy with monitoring on ticket routes and Sentry “tickets” feature. (3) P2 GET handleApiError and regression tests are done; optional: stats shape and atomic ticket number.
---

*End of verification report.*
