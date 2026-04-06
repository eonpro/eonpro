# Route Migration Playbook (No-Break)

This playbook is the standard for migrating high-risk routes to a uniform architecture without breaking platform behavior.

## Purpose

- Preserve production behavior while improving architecture consistency.
- Reduce blast radius by migrating one route at a time.
- Enforce reversible, observable rollout for P0 endpoints.

## Route Risk Tiers

- `P0`: Payments, prescriptions, webhooks, auth, tenant enforcement.
- `P1`: Core clinical/admin workflows not on direct payment path.
- `P2`: Low-risk internal or read-only endpoints.

## Required Workflow

1. Freeze route contract (input, output, auth, tenant behavior).
2. Write golden tests for current behavior before refactor.
3. Refactor internals only (route becomes transport + auth + validation).
4. Use feature flag for cutover.
5. Run canary rollout and monitor.
6. Keep instant rollback path until stability window is complete.

## Contract Freeze Checklist

Do not change during phase 1:

- Endpoint path and HTTP methods.
- Request schema (body/query/path params).
- Response schema and status codes.
- Auth role checks and permission checks.
- Tenant scoping behavior.
- Idempotency key shape and duplicate handling.
- Retry/ack behavior (especially webhooks and cron endpoints).

## Golden Test Matrix (Minimum)

- Happy path.
- Validation failure.
- Auth failure.
- Permission failure.
- Tenant mismatch/cross-clinic denial.
- Duplicate/idempotency path.
- External dependency failure path.
- Transient DB failure path where applicable.
- PHI-safe logging assertion for sensitive flows.

For webhook routes, also include:

- Invalid signature.
- Valid signature with duplicate event.
- Unresolved clinic handling.
- Failure still acknowledging per existing route contract.

## Refactor Pattern

Use this structure for migrated route handlers:

1. Auth wrapper.
2. Request validation.
3. Authorization and tenant resolution.
4. Single service command execution.
5. Centralized error mapping.

Target pattern:

`route.ts -> auth wrapper -> validator -> service.execute() -> error mapper`

## Cutover Requirements

- Introduce a route-specific feature flag:
  - Example: `FF_PRESCRIPTIONS_SERVICE_CUTOVER`.
- Start at 0% traffic.
- For P0 routes, use canary rollout by clinic cohort.
- Keep old path callable until post-cutover verification passes.

## Rollback Criteria

Immediately rollback if any occur:

- Auth/tenant regression.
- Duplicate side effects (billing/order/refill).
- Significant increase in error rate or latency.
- Reconciliation drift.
- PHI or compliance incident.

Rollback action:

1. Disable cutover feature flag.
2. Keep new code for diagnostics only.
3. Add a regression test for the failure mode before retry.

## Monitoring During Rollout

Track at minimum:

- Route error rate (4xx/5xx split).
- p95 latency.
- Duplicate suppression/idempotency hit rate.
- Queue backlog growth for async flows.
- Reconciliation mismatch for payment paths.
- Tenant isolation incident count.

## CI Expectations for Route Migration PRs

- Type-check must pass.
- Lint must pass.
- Required route tests must pass.
- Boundary checks must run.
- No direct runtime contract changes unless explicitly approved.

## PR Checklist (Copy/Paste)

- [ ] Route contract unchanged (request/response/auth/tenant/idempotency).
- [ ] Golden tests added or updated before refactor.
- [ ] Route logic thinned to transport/auth/validation only.
- [ ] Business logic moved into service module(s).
- [ ] Feature flag added for cutover and rollback.
- [ ] Monitoring hooks/dashboards validated for this route.
- [ ] Rollout and rollback plan documented in PR description.

