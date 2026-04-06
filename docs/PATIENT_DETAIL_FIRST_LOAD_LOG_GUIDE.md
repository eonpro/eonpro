# Patient Detail First-Load Log Guide

**Last Updated:** 2026-04-04  
**Scope:** `/admin/patients/[id]` and shared `src/app/patients/[id]/page.tsx` server render path

## Goal

Use structured logs to quickly answer:

1. Is this a **cold/miss first load** that becomes fast on refresh?
2. Which segment is slow: **auth/session**, **core query/caching**, or **post-query render tasks**?

## Log Events to Filter

Filter for these event names:

- `[PATIENT-DETAIL] Phase 1 (cached)`
- `[PATIENT-DETAIL] Render ready`
- `Database error fetching patient core:`
- `Unexpected error in PatientDetailPage:`

## Useful Fields

From `[PATIENT-DETAIL] Phase 1 (cached)`:

- `patientId`
- `clinicId`
- `userId`
- `userRole`
- `redisReady`
- `cacheLikelyHit` (probe only; "likely" hit/miss indicator)
- `cacheProbeDurationMs`
- `authDurationMs`
- `durationMs` (core Phase 1 duration)

From `[PATIENT-DETAIL] Render ready`:

- `salesRepDurationMs`
- `avatarDurationMs`
- `totalDurationMs` (end-to-end server render timing)

## Fast Triage Queries (Vendor Neutral)

### 1) Find slow first-load candidates

Look for:

- `event = "[PATIENT-DETAIL] Phase 1 (cached)"`
- `cacheLikelyHit = false` OR `cacheLikelyHit = null`
- `durationMs > 6000` (or your p95 threshold)

### 2) Confirm warm refresh behavior

For the same `patientId` + `userId` within 1-2 minutes, compare two events:

- First event: `cacheLikelyHit=false` and high `durationMs` / `totalDurationMs`
- Second event: `cacheLikelyHit=true` and much lower durations

This pattern confirms "slow first request, fast refresh" due to warm cache/infra.

### 3) Identify bottleneck class

- **Auth bottleneck:** `authDurationMs` high, while Phase 1/query timings are normal.
- **Cache/DB bottleneck:** `durationMs` high in Phase 1.
- **Post-query bottleneck:** `durationMs` normal but `totalDurationMs` high; inspect `salesRepDurationMs`/`avatarDurationMs`.
- **Redis degradation:** `redisReady=true` with elevated `cacheProbeDurationMs` and unstable hit behavior.

## Suggested Alert Baselines

Create warnings when sustained over 5-10 minutes:

- `Phase 1 durationMs p95 > 4000ms`
- `Render totalDurationMs p95 > 7000ms`
- `Database error fetching patient core` rate > normal baseline

Tune thresholds by clinic traffic and deployment shape.

## Investigation Checklist

1. Verify whether slow events cluster after idle periods (cold-start signal).
2. Compare hit-rate trend (`cacheLikelyHit=true`) during incident vs baseline.
3. If misses are normal but DB still slow, inspect pool saturation and query plans.
4. If auth is slow, inspect cookie/JWT/session and clinic resolution path.
5. Keep logs PHI-safe: use IDs only; never add patient names, email, phone, DOB.
