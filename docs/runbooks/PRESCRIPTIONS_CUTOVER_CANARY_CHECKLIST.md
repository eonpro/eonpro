# Prescriptions Cutover Canary Checklist

Use this checklist for the `POST /api/prescriptions` migration cutover (`PRESCRIPTIONS_CUTOVER_MODE`).

## Goal

Enable service-mode implementation safely for one clinic first, with immediate rollback if any regression appears.

## Preconditions

- [ ] `tests/unit/api/prescriptions.cutover-mode.test.ts` is passing.
- [ ] Route contract freeze confirmed (request/response/auth/tenant/idempotency unchanged).
- [ ] On-call owner assigned for rollout window.
- [ ] Rollback operator has permission to revert env flag quickly.

## Canary Configuration

- Target clinic: `__________`
- Start time (local): `__________`
- End of observation window: `__________`
- Flag value:
  - baseline: `PRESCRIPTIONS_CUTOVER_MODE=legacy`
  - canary: `PRESCRIPTIONS_CUTOVER_MODE=service`
  - clinic allowlist: `PRESCRIPTIONS_CUTOVER_CLINIC_IDS=<clinic_id>`

## Step-by-Step Rollout

1. Confirm baseline metrics (last 24h):
   - prescriptions success rate
   - 4xx/5xx rates for `/api/prescriptions`
   - duplicate block rate (`409`)
   - Lifefile 502 submission failures
2. Enable service mode for canary cohort only.
   - Set `PRESCRIPTIONS_CUTOVER_MODE=service`
   - Set `PRESCRIPTIONS_CUTOVER_CLINIC_IDS=<clinic_id>`
3. Run smoke checks:
   - successful provider prescription
   - sales-rep queueing flow
   - expected validation failure response
4. Monitor for at least 60 minutes.

## Monitoring Signals

- [ ] No increase in `/api/prescriptions` 5xx rate.
- [ ] No unexpected spike in `409 DUPLICATE_BLOCKED`.
- [ ] No increase in Lifefile submission failures (`502`).
- [ ] No tenant mismatch/cross-clinic incident.
- [ ] No unexpected change in refill/queue progression.

## Rollback Triggers (Immediate)

- Any auth/permission regression.
- Any tenant isolation regression.
- Sustained 5xx increase above baseline.
- Duplicate send/claim anomalies.
- Clinically significant workflow break reported by staff.

## Rollback Procedure

1. Set `PRESCRIPTIONS_CUTOVER_MODE=legacy`.
2. Clear `PRESCRIPTIONS_CUTOVER_CLINIC_IDS`.
3. Re-run smoke checks.
4. Notify stakeholders in incident channel.
5. Capture failure payload patterns and route logs.
6. Add regression test before next attempt.

## Post-Canary Exit Criteria

- [ ] Canary observation window complete with no rollback trigger.
- [ ] Incident count remains zero.
- [ ] Metrics within baseline variance.
- [ ] Approval granted for broader rollout.

