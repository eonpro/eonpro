/**
 * WellMedR Invoice Webhook — Portal Invite Wire-up Regression Test
 * ===================================================================
 *
 * Phase 1.1 (2026-05-03): The Airtable wellmedr-invoice webhook is the
 * canonical "mark invoice PAID" surface for WellMedR purchases. Before this
 * fix it never called `triggerPortalInviteOnPayment`, so patients who
 * landed via the Airtable path (most of them) never received a portal
 * invite — even though the Stripe Connect webhook's invite call was wired
 * correctly. The race between the two webhooks meant the bug was
 * intermittent enough to escape notice for months.
 *
 * Heavy route mocking would require patching 30+ dependencies (Stripe
 * Connect client, Prisma, S3 intake reader, refill scheduler, SOAP-note
 * automation, …) so this regression test instead asserts the wire-up by
 * inspecting the route source for the trigger import + call.
 *
 * Behavior coverage for the trigger itself (idempotency, channel selection,
 * Sentry tripwire) lives in `tests/unit/lib/portal-invite-service.test.ts`.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROUTE_PATH = join(
  process.cwd(),
  'src/app/api/webhooks/wellmedr-invoice/route.ts'
);

describe('wellmedr-invoice webhook — portal-invite wire-up (Phase 1.1)', () => {
  const source = readFileSync(ROUTE_PATH, 'utf-8');

  it('references the canonical portal-invite service module', () => {
    // Accept either static or dynamic import (route uses dynamic import to keep
    // the heavy SES/Twilio/PHI bundle out of the webhook cold-start path,
    // matching the pattern used by paymentMatchingService and InvoiceManager).
    const hasStaticImport =
      /import\s+\{[^}]*triggerPortalInviteOnPayment[^}]*\}\s+from\s+['"]@\/lib\/portal-invite\/service['"]/.test(
        source
      );
    const hasDynamicImport =
      /await\s+import\(\s*['"]@\/lib\/portal-invite\/service['"]\s*\)/.test(source);
    expect(hasStaticImport || hasDynamicImport).toBe(true);
  });

  it('calls triggerPortalInviteOnPayment with the verified patient id after invoice creation', () => {
    expect(source).toMatch(/triggerPortalInviteOnPayment\(\s*verifiedPatient\.id\s*\)/);
  });

  it('wraps the trigger in a non-throwing block (must never block the webhook response)', () => {
    // Either try/catch around the trigger call or .catch() on the returned promise.
    const triggerIndex = source.indexOf('triggerPortalInviteOnPayment(');
    expect(triggerIndex).toBeGreaterThan(-1);
    const surrounding = source.slice(Math.max(0, triggerIndex - 200), triggerIndex + 300);
    const isProtected = /try\s*\{[\s\S]*triggerPortalInviteOnPayment/.test(surrounding) ||
      /triggerPortalInviteOnPayment\([\s\S]*?\)\.catch\(/.test(surrounding);
    expect(isProtected).toBe(true);
  });
});
