/**
 * Cross-Clinic Data Leak Tests
 * ============================
 *
 * Verifies that the PrismaWithClinicFilter proxy correctly prevents
 * data from one clinic leaking to another. These are structural tests
 * that validate the tenant isolation mechanism itself.
 *
 * These tests do NOT require a database connection — they validate
 * the proxy behavior by checking the filter logic.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Import the extracted modules directly for focused testing
import { CLINIC_ISOLATED_MODELS, BASE_PRISMA_ALLOWLIST } from '@/lib/db/clinic-isolation-config';
import {
  clinicContextStorage,
  runWithClinicContext,
  withoutClinicFilter,
  getClinicContext,
} from '@/lib/db/clinic-context';

describe('Clinic context isolation', () => {
  it('runWithClinicContext sets and clears context correctly', () => {
    expect(getClinicContext()).toBeUndefined();

    runWithClinicContext(42, () => {
      expect(getClinicContext()).toBe(42);
    });

    expect(getClinicContext()).toBeUndefined();
  });

  it('nested runWithClinicContext does not leak outer context', () => {
    runWithClinicContext(1, () => {
      expect(getClinicContext()).toBe(1);

      runWithClinicContext(2, () => {
        expect(getClinicContext()).toBe(2);
      });

      expect(getClinicContext()).toBe(1);
    });
  });

  it('withoutClinicFilter allows undefined clinicId', async () => {
    await runWithClinicContext(1, async () => {
      expect(getClinicContext()).toBe(1);

      await withoutClinicFilter(async () => {
        expect(getClinicContext()).toBeUndefined();
      });

      expect(getClinicContext()).toBe(1);
    });
  });

  it('concurrent contexts do not interfere (simulated)', async () => {
    const results: number[] = [];

    await Promise.all([
      runWithClinicContext(100, async () => {
        await new Promise((r) => setTimeout(r, 10));
        results.push(getClinicContext()!);
      }),
      runWithClinicContext(200, async () => {
        await new Promise((r) => setTimeout(r, 5));
        results.push(getClinicContext()!);
      }),
    ]);

    expect(results).toContain(100);
    expect(results).toContain(200);
    expect(results).not.toContain(undefined);
  });
});

describe('CLINIC_ISOLATED_MODELS integrity', () => {
  it('all entries are lowercase', () => {
    for (const model of CLINIC_ISOLATED_MODELS) {
      expect(model).toBe(model.toLowerCase());
    }
  });

  it('has no duplicates', () => {
    const unique = new Set(CLINIC_ISOLATED_MODELS);
    expect(unique.size).toBe(CLINIC_ISOLATED_MODELS.length);
  });

  it('contains critical models that must always be isolated', () => {
    const criticalModels = [
      'patient',
      'order',
      'invoice',
      'payment',
      'subscription',
      'soapnote',
      'ticket',
      'provider',
      'appointment',
    ];

    for (const model of criticalModels) {
      expect(
        CLINIC_ISOLATED_MODELS.includes(model),
        `Critical model "${model}" must be in CLINIC_ISOLATED_MODELS`
      ).toBe(true);
    }
  });
});

describe('BASE_PRISMA_ALLOWLIST safety', () => {
  it('all entries are lowercase', () => {
    for (const model of BASE_PRISMA_ALLOWLIST) {
      expect(model).toBe(model.toLowerCase());
    }
  });

  it('has no duplicates', () => {
    const unique = new Set(BASE_PRISMA_ALLOWLIST);
    expect(unique.size).toBe(BASE_PRISMA_ALLOWLIST.length);
  });

  it('is strictly smaller than CLINIC_ISOLATED_MODELS', () => {
    expect(BASE_PRISMA_ALLOWLIST.length).toBeLessThan(CLINIC_ISOLATED_MODELS.length);
  });

  it('does not include high-risk models that should never bypass filtering', () => {
    const neverAllowlist = [
      'soapnote',
      'subscription',
      'ticket',
      'appointment',
      'labreport',
      'patientdocument',
    ];

    for (const model of neverAllowlist) {
      expect(
        BASE_PRISMA_ALLOWLIST.includes(model),
        `High-risk model "${model}" should not be in BASE_PRISMA_ALLOWLIST`
      ).toBe(false);
    }
  });

  it('allowlist size does not grow without review', () => {
    // If this fails, a model was added to BASE_PRISMA_ALLOWLIST.
    // Review whether the new model genuinely needs cross-tenant access.
    expect(BASE_PRISMA_ALLOWLIST.length).toBeLessThanOrEqual(36);
  });
});

describe('Async context does not leak across requests', () => {
  it('context is undefined outside runWithClinicContext', () => {
    expect(clinicContextStorage.getStore()).toBeUndefined();
    expect(getClinicContext()).toBeUndefined();
  });

  it('context set in one async chain does not appear in another', async () => {
    let contextInChain1: number | undefined;
    let contextInChain2: number | undefined;

    const chain1 = runWithClinicContext(999, async () => {
      await new Promise((r) => setTimeout(r, 20));
      contextInChain1 = getClinicContext();
    });

    const chain2 = (async () => {
      await new Promise((r) => setTimeout(r, 10));
      contextInChain2 = getClinicContext();
    })();

    await Promise.all([chain1, chain2]);

    expect(contextInChain1).toBe(999);
    expect(contextInChain2).toBeUndefined();
  });
});
