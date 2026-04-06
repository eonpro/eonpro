# EONPro Engineering Manual

This document is the technical and architectural reference for engineers working on EONPro.
It is intended as the primary onboarding and operational manual.

---

## 1. Platform Overview

EONPro is a multi-tenant healthcare platform used to manage:

- patient intake and profile data
- prescription workflows and pharmacy transmission
- subscriptions, billing, and payment reconciliation
- provider operations and queue-based clinical review
- clinic-specific configurations and integrations

Core technical stack:

- Framework: Next.js App Router
- Runtime: Node.js 20.x
- Language: TypeScript
- ORM/DB access: Prisma
- Primary DB: PostgreSQL
- Cache/session/queues: Upstash Redis
- Hosting: Vercel (serverless + cron jobs)

Top-level source layout:

- `src/app`: pages and API route handlers
- `src/domains`: domain-layer services/repositories (partial adoption)
- `src/lib`: shared infrastructure (auth, db, cache, security, integrations)
- `src/services`: business services (billing, refill, stripe, notifications, etc.)
- `prisma`: schema and migrations
- `tests`: unit/integration/e2e tests
- `docs`: runbooks, audits, operational references

---

## 2. Architectural Style

EONPro currently uses a hybrid architecture:

- **Route-centric orchestration** for many critical endpoints (webhooks, prescriptions, admin flows)
- **Domain-layer pattern** in selected areas (notably patient domain)
- **Shared infrastructure layer** in `src/lib` for cross-cutting concerns

Current architectural target (in progress):

`route handler -> auth/tenant gate -> validation -> service command -> repository/db -> response mapper`

Migration strategy is feature-flagged and no-break:

- legacy path remains default
- service cutovers are clinic-scoped canaries
- strict rollback capability is maintained

---

## 3. Runtime Request Lifecycle

Typical protected API flow:

1. Edge middleware in `src/middleware.ts` applies security headers and route-level controls.
2. Clinic resolution middleware (`src/lib/middleware/clinic.ts`) resolves tenant context.
3. Route auth wrappers (`withAuth`, `withClinicalAuth`, `withProviderAuth`) validate identity and role.
4. Request context is bound (tenant/user context).
5. Business logic executes in route/service.
6. Data access occurs through Prisma delegates (tenant-scoped for isolated models).
7. Response is returned with centralized logging/error handling conventions.

Critical flow example:

- `POST /api/prescriptions`
  - validates role and payload
  - resolves provider + clinic eligibility
  - creates patient/order/rx records transactionally
  - submits to Lifefile after DB commit
  - updates refill/billing side effects

---

## 4. Multi-Tenancy Model

Tenant = clinic. Isolation is enforced by multiple layers:

- request-time clinic resolution (subdomain/cookie/header context)
- auth-context clinic binding
- `AsyncLocalStorage` clinic context propagation
- Prisma clinic filters for isolated models
- explicit clinic predicates in raw SQL paths

Important behavior:

- Missing/invalid tenant context should fail closed for tenant-sensitive operations.
- Cross-clinic access should return not-found/forbidden behavior rather than leak existence.
- Raw SQL requires explicit clinic filtering (Prisma tenant wrappers do not protect raw SQL automatically).

---

## 5. Data Architecture

Database is PostgreSQL with large schema surface. Core entities include:

- Tenant and access: `Clinic`, `User`, `Provider`
- Clinical core: `Patient`, `Order`, `Rx`, `SOAPNote`, `Appointment`
- Billing core: `Invoice`, `Payment`, `Subscription`, `PaymentReconciliation`
- Workflow support: `RefillQueue`, `WebhookLog`, `Notification`, `EmailLog`
- Documents/labs: `PatientDocument`, `LabReport`, related lab result models

PHI handling:

- Sensitive fields are encrypted at application layer.
- Hash fields are used for deterministic matching where needed.
- Logging must never include raw PHI.

---

## 6. Security and Compliance

Security posture is healthcare-focused (HIPAA-aware):

- JWT-based auth with role checks
- RBAC permission checks
- PHI encryption utilities in security layer
- audit logging for sensitive operations
- strict header controls in middleware
- no secrets in client-exposed environment variables

Developer requirements:

- never log PHI directly
- always enforce tenant context for tenant-scoped records
- use approved auth wrappers for API routes

---

## 7. Reliability and Resilience

Main resilience controls:

- circuit breakers for external dependencies
- Redis guardrails and fallback behavior
- dead-letter and retry queues
- webhook idempotency records
- cron health monitoring and alerting

Key design pattern:

- External side effects happen after transactional persistence when possible.
- Failures are captured with retry/manual reconciliation paths (rather than silent drops).

---

## 8. Integrations

Primary integrations:

- Stripe (payments, invoices, subscriptions, webhooks)
- Lifefile (prescription transmission, inbound status webhooks)
- Twilio (SMS/chat)
- AWS (S3, SES, KMS)
- Zoom (telehealth)
- Additional clinic-specific integrations configured via clinic settings

Integration safety requirements:

- verify signatures and auth on inbound webhooks
- enforce tenant attribution before writes
- maintain idempotency for repeated events

---

## 9. Background Processing

Background execution is Vercel-cron driven:

- cron routes scheduled in `vercel.json`
- health monitor and queue processors
- payment/reconciliation jobs
- tenant-iterated cron helpers for multi-clinic execution

Queueing:

- Redis-backed queue for recoverable failures
- DLQ-style persistence for manual follow-up

---

## 10. Caching Strategy

Caching layers:

- L1 in-process caches for hot paths
- L2 Redis cache for shared state
- per-feature cache keys/namespaces

Cache safety:

- tenant-aware cache keys are required
- cache invalidation occurs on key write/update paths
- degraded cache state should not break core clinical/billing flows

---

## 11. Observability and Logging

Observability stack:

- structured application logs
- Sentry for errors/tracing
- operational runbooks in `docs/runbooks`
- health/readiness endpoints for platform status

Logging guidelines:

- include request/route/tenant IDs
- avoid PHI
- include explicit error class and fallback action where possible

---

## 12. Deployment Model

Production deployment is Vercel-based:

- immutable deployments + alias switching
- environment variables scoped per environment
- cron jobs managed by `vercel.json`
- CI quality gates in `.github/workflows/ci.yml`

Canary rollout pattern for risky changes:

- feature-flagged cutover
- clinic-scoped allowlist for tenant-by-tenant rollout
- monitor + rollback commands predefined in runbooks

---

## 13. Testing Strategy

Test layers:

- unit: domain logic, middleware, adapters
- integration: API and workflow behavior
- e2e: user-facing critical paths

Critical path expectations:

- prescriptions, payments, auth, tenant isolation need high confidence tests
- no `describe.skip` on critical routes
- add regression tests for every production incident fixed

---

## 14. Current High-Risk Areas (Engineer Awareness)

These areas have highest blast radius and need careful review/testing:

- `src/app/api/stripe/webhook/route.ts`
- `src/app/api/prescriptions/route.ts`
- `src/app/api/provider/prescription-queue/route.ts`
- tenant-sensitive raw SQL routes
- shared auth/tenant middleware layers

For these files:

- prefer small, reversible changes
- preserve response and idempotency contracts
- gate rollouts behind feature flags

---

## 15. New Engineer Onboarding Checklist

Week 1 minimum:

1. Read this manual fully.
2. Read:
  - `docs/ROUTE_MIGRATION_PLAYBOOK.md`
  - `docs/runbooks/PRESCRIPTIONS_CUTOVER_CANARY_CHECKLIST.md`
  - `docs/CI_AND_PRE_DEPLOY.md`
3. Run locally:
  - `npm ci`
  - `npm run type-check`
  - `npm run lint`
  - `npm run test`
4. Trace one end-to-end request:
  - `/api/prescriptions` from route to side effects
5. Pair on one low-risk PR before touching P0 flows.

---

## 16. Engineering Change Rules (Operational)

When changing critical routes:

- freeze request/response contract first
- add/extend golden tests
- use feature flags for behavior switches
- canary by clinic before global rollout
- define rollback before deployment

When changing tenant/data/security behavior:

- include explicit tenant isolation test
- include PHI-safe logging review
- update runbook/docs in same PR

---

## 17. Useful References

- CI pipeline: `.github/workflows/ci.yml`
- Main architecture audit docs: `docs/TECHNICAL_DUE_DILIGENCE_REPORT.md`, `docs/ARCHITECTURE_AUDIT_2026-03-22.md`
- Route migration process: `docs/ROUTE_MIGRATION_PLAYBOOK.md`
- Prescription canary runbook: `docs/runbooks/PRESCRIPTIONS_CUTOVER_CANARY_CHECKLIST.md`
- Prisma schema: `prisma/schema`

---

## 18. Manual Ownership

This manual should be updated when any of the following changes:

- auth/tenant enforcement model
- billing or prescription critical flows
- deployment/canary/rollback process
- primary integration patterns
- CI quality gate expectations

Recommended owner: Platform Engineering.