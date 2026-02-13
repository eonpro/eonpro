# Patient Portal – Smoke Test in Staging

This runbook verifies that when the patient’s session is expired (or token removed), every portal page shows a clear **session-expired** message and a **Log in** (or **Try again**) action instead of a blank screen.

---

## 1. Automated smoke test (Playwright)

### Prerequisites

- Staging URL and, if different from default, portal base path.
- A **patient** test user in staging (email + password).

### How to add the test patient in staging

You need a real patient user in your **staging database** with the same email/password you use for `TEST_PATIENT_EMAIL` and `TEST_PATIENT_PASSWORD` (e.g. `patient@example.com` / `YourPatientPassword123!`).

**Option A – Script (recommended)**  
Run the staging test-patient script against your **staging** database (so the user is created in the same DB your staging app uses):

```bash
# Point to staging DB (use your staging DATABASE_URL)
export DATABASE_URL="postgresql://..."   # your staging DB connection string

# Default: patient@example.com / YourPatientPassword123!
npx tsx scripts/create-staging-test-patient.ts

# Or set email/password to match your env vars
TEST_EMAIL=patient@example.com TEST_PASSWORD=YourPatientPassword123! npx tsx scripts/create-staging-test-patient.ts

# If you have multiple clinics, target one by name or subdomain
CLINIC_NAME=EONPRO npx tsx scripts/create-staging-test-patient.ts
```

The script creates (or updates) a **Patient** and a **User** with role `PATIENT` and that password. After it runs, you can log in at `https://staging.eonpro.io/login` (or your staging URL) with that email/password.

**Option B – Admin UI**  
If your staging app has an admin flow to create or invite patients, create a patient with the desired email and set their password (or use the invite flow), then use that email/password for the smoke test.

**Option C – WellMedR-only**  
If staging is only for the WellMedR clinic, use the WellMedR script instead:

```bash
TEST_EMAIL=patient@example.com TEST_PASSWORD=YourPatientPassword123! npx tsx scripts/create-wellmedr-test-patient.ts
```

### Run against staging

```bash
# Required: staging URL and patient credentials
export PLAYWRIGHT_BASE_URL=https://your-staging-domain.com
export TEST_PATIENT_EMAIL=patient@example.com
export TEST_PATIENT_PASSWORD=YourPatientPassword123!

# If your portal is at /patient-portal instead of /portal (use PATIENT_PORTAL_PATH for Playwright):
export PATIENT_PORTAL_PATH=/patient-portal

# Run only the patient-portal session-expired smoke tests (no local server)
npx playwright test tests/e2e/patient-portal-session-expired.e2e.ts --project=patient-portal-smoke
```

To run with a local dev server (e.g. against `http://localhost:3000`), omit `PLAYWRIGHT_BASE_URL` or set it to `http://localhost:3000`. The default config will start the app.

### What the test does

1. For each route (dashboard, progress, medications, documents, chat, appointments, billing, bloodwork, photos, health-score, care-plan, achievements, shipments, subscription):
   - Logs in as the patient (if not already on portal).
   - Navigates to that route.
   - Clears auth tokens from `localStorage`.
   - Reloads the page.
   - Asserts that the page shows either:
     - Text like “Your session has expired” / “session expired” / “Please log in again”, or
     - A “Log in” / “Log in again” / “Try again” link or button.

---

## 2. Manual smoke test (checklist)

Use this when you want to verify behavior by hand in staging.

### Setup

1. Open staging in a browser (e.g. `https://staging.example.com`).
2. Log in as a **patient** (use a test patient account).
3. Confirm you are in the patient portal (dashboard or similar).

### Steps (for each page)

For each of the following, do **A** then **B**:

| # | Page | Route (example) |
|---|------|------------------|
| 1 | Dashboard | `/portal` or `/patient-portal` |
| 2 | Progress | `…/progress` |
| 3 | Medications | `…/medications` |
| 4 | Documents | `…/documents` |
| 5 | Chat | `…/chat` |
| 6 | Appointments | `…/appointments` |
| 7 | Billing | `…/billing` |
| 8 | Bloodwork | `…/bloodwork` |
| 9 | Photos | `…/photos` |
| 10 | Health score | `…/health-score` |
| 11 | Care plan | `…/care-plan` |
| 12 | Achievements | `…/achievements` |
| 13 | Shipments | `…/shipments` |
| 14 | Subscription | `…/subscription` |

**A. Go to the page**  
Navigate to the page and wait until it has loaded (data or empty state).

**B. Expire session and reload**

- Open DevTools → Application (or Storage) → Local Storage → your staging origin.
- Remove: `auth-token`, `patient-token`, `access_token`, `refresh_token` (if present).
- Reload the page (F5 or Cmd+R).

**C. Check result**

- You should see an **amber/yellow** “session expired” (or similar) message.
- You should see a **“Log in”** link (or **“Try again”** where applicable).
- You should **not** see a blank content area with no message.

If any page shows a blank area with no session message and no Log in / Try again, note it and fix.

---

## 3. Optional: Settings and Achievements

- **Settings:** After session expiry, “Save profile” or “Change password” may return 401. The app should show the same session-expired message (and optionally a Log in link).
- **Achievements:** If the achievements request returns 401, the error state should show a “Log in” link next to “Try again”.

---

## 4. References

- Audit and 401 handling: `docs/PATIENT_PORTAL_READINESS_AUDIT.md`
- E2E test: `tests/e2e/patient-portal-session-expired.e2e.ts`
- Portal path config: `src/lib/config/patient-portal.ts` (`NEXT_PUBLIC_PATIENT_PORTAL_PATH`)
