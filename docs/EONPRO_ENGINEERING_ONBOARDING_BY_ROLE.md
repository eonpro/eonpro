# EONPro Engineering Onboarding by Role

This guide provides role-specific onboarding paths so engineers can become productive quickly and safely.

Primary deep reference:

- `docs/EONPRO_ENGINEERING_MANUAL.md`

---

## 1) Backend Engineer Track

### Week 1 Focus

- Read:
  - `docs/EONPRO_ENGINEERING_MANUAL.md`
  - `docs/ROUTE_MIGRATION_PLAYBOOK.md`
  - `docs/runbooks/PRESCRIPTIONS_CUTOVER_CANARY_CHECKLIST.md`
- Trace critical API paths:
  - `src/app/api/prescriptions/route.ts`
  - `src/app/api/stripe/webhook/route.ts`
  - `src/app/api/provider/prescription-queue/route.ts`
- Review tenant/auth foundations:
  - `src/lib/auth/middleware.ts`
  - `src/lib/db/clinic-context.ts`
  - `src/lib/db/prisma-with-clinic-filter.ts`

### First Safe Contribution

- Add or improve tests on an existing route guard path.
- Avoid first-change edits in Stripe webhook or prescriptions business logic unless paired.

### Backend Rules of Engagement

- Keep route contracts stable.
- Enforce tenant predicates (especially for raw SQL).
- Keep PHI out of logs.
- Use feature flags + canary for P0 behavior changes.

---

## 2) Frontend Engineer Track

### Week 1 Focus

- Understand app routing and client/server component split in `src/app`.
- Review key operational surfaces:
  - admin dashboards and provider queue pages
  - patient profile and portal billing views
- Read API consumption patterns and auth state handling:
  - `src/lib/api/fetch.ts`
  - `src/lib/stores/authStore.ts`

### First Safe Contribution

- UI improvements or non-critical UX fixes with no API contract changes.
- Add/strengthen component-level tests in stable modules.

### Frontend Rules of Engagement

- Preserve navigation/auth assumptions already in place.
- Do not introduce client-side secret handling.
- Coordinate with backend before changing request/response assumptions.

---

## 3) Platform / SRE Engineer Track

### Week 1 Focus

- Read:
  - `.github/workflows/ci.yml`
  - `vercel.json`
  - `docs/CI_AND_PRE_DEPLOY.md`
  - `docs/DEPLOYMENT_AND_ROLLBACK_RUNBOOK.md`
- Review runtime controls:
  - readiness/health endpoints
  - Redis guardrails
  - queue + DLQ processing

### First Safe Contribution

- Improve observability, deployment checks, or runbook clarity.
- Keep rollout controls non-breaking before enabling hard-fail gates.

### Platform Rules of Engagement

- Prefer warn-mode baselining before strict CI enforcement.
- Maintain immediate rollback commands for critical rollouts.
- Validate canary cohorts before widening blast radius.

---

## 4) QA / Test Engineer Track

### Week 1 Focus

- Review critical-path tests:
  - prescriptions
  - payments/webhooks
  - tenant isolation/auth
- Map expected business outcomes for P0 flows.

### First Safe Contribution

- Add regression test for a known incident class.
- Expand contract parity tests for canary-routed endpoints.

### QA Rules of Engagement

- Prioritize production incident classes over synthetic breadth.
- Ensure tests validate both happy path and rollback/error semantics.

---

## 5) 30-60-90 Day Onboarding Milestones

### Day 30

- Understand one full end-to-end critical workflow.
- Contribute at least one merged change with tests.

### Day 60

- Own a scoped module or runbook area.
- Participate in one canary rollout review.

### Day 90

- Independently lead a low-risk migration using playbook standards.
- Contribute to architecture consistency and quality-gate improvements.

---

## 6) Common Commands

- Install and verify:
  - `npm ci`
  - `npm run type-check`
  - `npm run lint`
  - `npm run test`
- Targeted cutover tests:
  - `npx vitest run tests/unit/api/prescriptions.cutover-mode.test.ts`

---

## 7) Escalation and Ownership

When unsure, escalate early on:

- tenant isolation concerns
- payment/prescription side-effect risks
- PHI handling uncertainty
- rollout/rollback readiness

Default high-risk reviewers should include platform + domain owner for affected flow.