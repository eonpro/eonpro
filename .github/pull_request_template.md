## Summary

- What changed:
- Why:
- Risk tier (`P0`/`P1`/`P2`):

## Route Contract Impact

- [ ] No API contract change
- [ ] API contract changed intentionally (documented below)

If changed, describe request/response/auth/tenant impact:

## Migration Safety Checklist

- [ ] Golden tests captured existing behavior before refactor
- [ ] Auth and permission semantics unchanged
- [ ] Tenant scoping semantics unchanged
- [ ] Idempotency/duplicate handling unchanged
- [ ] PHI-safe logging confirmed
- [ ] Feature flag added for cutover (if `P0`/`P1`)
- [ ] Rollback path documented

## Validation

- [ ] `npm run type-check`
- [ ] `npm run lint`
- [ ] `npm run test` (or targeted suite)
- [ ] `npm run check:architecture-boundaries`

## Rollout Plan

- Flag name:
- Initial cohort:
- Monitoring window:
- Rollback trigger:

## Notes for Reviewers

- Key files:
- Areas needing deep review:

