# Production Readiness: Patient Portal & Enterprise Level

**Last updated:** February 7, 2026  
**Scope:** Patient portal, related layouts, and “no demo data / enterprise behavior” checklist.

---

## Is this production-ready at an enterprise level?

**Short answer:** The **patient portal** is now production-ready for enterprise use from a **data
and UX** perspective: no dummy/demo data, auth on all API calls, redirects when unauthenticated, and
empty states instead of fake content. The **broader platform** already follows enterprise patterns
(HIPAA-aware design, auth wrappers, transactions, observability plans). Remaining items are mostly
**operational** (tests, monitoring, runbooks) and **feature-complete** (e.g. real thumbnail URLs for
tutorials).

---

## Patient portal – production-ready checklist

| Area                         | Status | Notes                                                                                                                                                                                                                           |
| ---------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **No demo/dummy data**       | ✅     | Dashboard, medications, health score, subscription, settings, PatientLayout, ProviderLayout: demo/mock data removed. Empty states or API-only data.                                                                             |
| **Auth on all API calls**    | ✅     | getAuthHeaders() + credentials: 'include' on dashboard, progress, weight, water, exercise, sleep, nutrition, documents, photos (upload + create), tracking, chat, medications, health-score, subscription (billing), bloodwork. |
| **Unauthenticated handling** | ✅     | No user → redirect to login (dashboard, settings). No fake patient or P12345.                                                                                                                                                   |
| **patientId resolution**     | ✅     | From `user` in localStorage; /api/auth/me fallback for patient role. Same pattern on dashboard, documents, medications.                                                                                                         |
| **Subscription & billing**   | ✅     | Data from GET /api/patient-portal/billing (Stripe + local). Empty state when no subscription; manage billing uses customer-portal API with auth.                                                                                |
| **Camera (PWA)**             | ✅     | Explicit video.play(), safe-area padding so capture button not cut off.                                                                                                                                                         |
| **Data persistence**         | ✅     | Entries (weight, progress, photos, documents, chat, reminders) persist and display in portal and admin patient profile.                                                                                                         |

---

## Platform-level enterprise posture

| Area                        | Status     | Reference                                                                                      |
| --------------------------- | ---------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------- |
| **Auth & secrets**          | ✅         | withAuth / withClinicalAuth; no secrets in NEXT*PUBLIC*\*; demo tokens disabled in production. | Security rules, middleware                  |
| **PHI / HIPAA**             | ✅         | No PHI in logs; encryption patterns; audit logging.                                            | .cursor/rules, HIPAA docs                   |
| **Transactions**            | ✅         | Multi-step DB operations use Prisma transactions.                                              | Data-integrity rules                        |
| **Critical-path hardening** | ✅         | Login and key flows: main outcome first; secondary steps non-blocking.                         | GROWTH_AND_RELIABILITY.md                   |
| **Observability**           | Planned    | Sentry, structured logs, metrics, alerts.                                                      | OBSERVABILITY.md, GROWTH_AND_RELIABILITY.md |
| **Testing**                 | Partial    | Critical-path tests and coverage goals; CI.                                                    | TESTING_GUIDE.md                            |
| **Deploy & rollback**       | Documented | Build, smoke-check, rollback steps.                                                            | GROWTH_AND_RELIABILITY.md, runbooks         |

---

## Minor gaps (non-blocking)

- **Tutorials thumbnails:** Some entries use `/api/placeholder/400/225`. Replace with real asset
  URLs or a proper placeholder service when moving to production branding.
- **Stripe customer portal:** Depends on env and Stripe config. Subscription page shows a clear
  message if portal URL is not returned.
- **Operational:** Runbooks, 24/7 alerts, and full E2E coverage are the next steps for “enterprise
  operations,” not for considering the portal itself “production-ready.”

---

## Summary

- **Patient portal:** Production-ready from a data and UX standpoint: no demo data, auth everywhere,
  proper redirects and empty states, subscription/billing from real API.
- **Platform:** Enterprise patterns in place (auth, PHI, transactions, hardening). Observability and
  testing are the main follow-ups for full enterprise operations.

To treat the **whole product** as “enterprise production-ready” in the strictest sense, ensure: (1)
production env vars and Stripe (and any other integrations) are set, (2) Sentry/alerts are on in
production, (3) critical-path tests run in CI, and (4) runbooks and rollback are agreed with ops.

---

## Verification (post-deploy)

| Check                        | Result                                                                                                                                       |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **Unit tests**               | `tests/unit/patient-portal/enabled.test.ts` + `treatment-from-prescription.test.ts`: 26 tests pass.                                          |
| **Unauthenticated redirect** | Visiting `/portal` or `/portal/subscription` without a session redirects to `/login?redirect=%2Fportal&reason=no_session`. Verified locally. |
| **Production**               | If Vercel shows "Deployment Paused", test locally at `http://localhost:3001`. After deploy, re-verify at production URL.                     |
