# Enterprise Readiness Roadmap

**Last updated:** February 8, 2026  
**Source:** Principal Architect maturity assessment  
**Current classification:** Growth-Stage (65/100)  
**Goal:** Enterprise-Grade (80+)

---

## Executive Summary

The codebase is **Growth-Stage**: production-capable with multi-tenant isolation, PHI encryption, HIPAA-aware patterns, and solid structure (domains, services, auth). To reach Enterprise-Grade we need consistent error handling, stronger type safety, systematic HIPAA audit coverage, idempotency on critical mutations, and formal runbooks.

---

## Completed (Feb 2026)

| Item | Description |
|------|-------------|
| **Safe JSON parse** | `safeParseJsonString()` in `src/lib/utils/safe-json.ts`; all patient-portal and WeightTracker localStorage parsing uses it to avoid runtime crashes from malformed data. |
| **Startup validation** | `src/instrumentation.ts` runs `runStartupValidation()` once in production when the Node server starts. Schema validator blocks on critical errors unless `ALLOW_SCHEMA_ERRORS=true`. |
| **Logger type** | `LogContext` is `Record<string, unknown>` (no `any`); JSDoc states no PHI (use IDs only). |
| **TypeScript strategy** | Documented: CI must run `npm run type-check` and fail on errors; fix `any` in phases; consider re-enabling type-check in Next build later. |
| **API error handling** | Convention doc and 25+ routes migrated: refill-queue, clinic/*, rx-queue, shipment-schedule (list, POST), routing/queue, patients/[id]/documents (GET, download), admin/registration-codes, admin/sales-reps (GET, bulk-reassign GET/POST, [id]/patients GET), admin/webhooks (GET, POST, PUT, DELETE), admin/settings (GET), **admin/shipment-schedule/patient/[patientId]** (GET), **admin/shipment-schedule/[id]** (GET, PATCH, DELETE), **admin/affiliates/code-performance** (GET), **admin/sync-stripe-profiles** (POST). Document list/download and service-layer patient read have HIPAA audit. |
| **Runbook** | `docs/DEPLOYMENT_AND_ROLLBACK_RUNBOOK.md` – pre-deploy, deploy (Vercel/Docker), rollback (app and app+DB), failure isolation. |

---

## Prioritized Backlog

### 1. Standardize API error handling (High)

- **Goal:** Every API route uses `handleApiError` (or equivalent) and returns a consistent error shape: `{ error, code, statusCode, timestamp, requestId?, errors? }`.
- **Actions:**
  - Use `handleApiError` in all route `catch` blocks. See `src/domains/shared/errors/handler.ts` and `.cursor/rules/04-api-routes.mdc`.
  - Add convention to API route standards doc; optionally add ESLint rule or codeowners check for new routes.
- **Reference:** `src/app/api/patients/route.ts` (withClinicalAuth + Zod + handleApiError). **Convention:** `docs/API_ERROR_HANDLING_CONVENTION.md`. **Migrations:** refill-queue, clinic/*, rx-queue, shipment-schedule (list, patient/[patientId], [id] GET/PATCH/DELETE), routing/queue, patients/[id]/documents (GET, download), admin/registration-codes, admin/sales-reps (GET, bulk-reassign, [id]/patients), admin/webhooks, admin/settings, admin/affiliates/code-performance, admin/sync-stripe-profiles use `handleApiError` and domain errors. Document list and download have HIPAA audit; single-patient read is audited via `patient.service` `logPHIAccess`.

### 2. Reduce `any` and type escape hatches (High)

- **Goal:** No new `any` in critical paths; reduce backlog in lib → services → API routes.
- **Actions:** Fix in batches; prefer `unknown` and type guards over `as any`; remove `@ts-ignore` where feasible. CI type-check must pass.

### 3. Idempotency on critical mutations (Medium)

- **Goal:** Orders, refills, and other critical writes accept idempotency keys and deduplicate.
- **Reference:** Payment and invoice flows already use idempotency (`src/services/stripe/paymentService.ts`, `src/app/api/stripe/invoices/route.ts`).

### 4. HIPAA audit coverage (High for compliance)

- **Goal:** Every PHI read/write path logs via `hipaaAudit.log()`.
- **Actions:** Audit routes that touch patient/repository PHI; add audit calls where missing; add a checklist or test to prevent regression. **Sample:** `GET /api/patients/[id]/documents` now calls `auditLog(..., DOCUMENT_VIEW, action: 'list_documents')` after a successful list.

### 5. API contracts (Medium)

- **Goal:** OpenAPI (or similar) for v2 and critical webhooks; validate or generate from spec to prevent contract drift.

### 6. Runbooks (Medium)

- **Goal:** Deployment, rollback, and failure-isolation runbooks; test rollback in staging.
- **Done:** `docs/DEPLOYMENT_AND_ROLLBACK_RUNBOOK.md` – pre-deploy checklist, Vercel/Docker deploy, app-only and app+DB rollback, failure isolation; references CI_AND_PRE_DEPLOY, MIGRATION_ROLLBACK, DISASTER_RECOVERY.

---

## TypeScript Strategy (Phased)

1. **CI gate:** `npm run type-check` runs in CI and fails the pipeline on type errors. Do not rely only on `next build` (next.config uses `ignoreBuildErrors: true` to avoid Vercel OOM).
2. **Phase 2:** Fix `any` / `@ts-ignore` in batches (lib → services → API routes). Target: no new `any` in critical paths.
3. **Phase 3:** Optionally re-enable type-check in Next build when error count is manageable.

---

## Environment and Startup

| Variable | Purpose |
|----------|---------|
| `SKIP_SCHEMA_VALIDATION=true` | Skip database schema validation at startup (not recommended in production). |
| `ALLOW_SCHEMA_ERRORS=true` | In production, do not block startup on critical schema errors (override default fail-fast). |
| `BLOCK_ON_SCHEMA_ERROR=true` | Legacy; in production, block on critical schema errors (now default unless ALLOW_SCHEMA_ERRORS is set). |

---

## Effort Estimates

- **Full roadmap to Enterprise tier:** 12–18 weeks (2–3 engineers).
- **High-impact subset** (TS, error handling, HIPAA audit, idempotency): ~6–8 weeks.

---

## Related Docs

- `docs/API_ERROR_HANDLING_CONVENTION.md` – Standard error shape and how to use handleApiError
- `.cursor/rules/04-api-routes.mdc` – API route standards and error handling
- `docs/HIPAA_COMPLIANCE_EVIDENCE.md` – HIPAA controls and evidence
- `src/domains/shared/errors/` – AppError hierarchy and handleApiError
