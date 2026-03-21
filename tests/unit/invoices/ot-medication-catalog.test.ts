import { describe, it, expect } from 'vitest';
import {
  OT_RETAIL_PACKAGES,
  filterOtRetailPackages,
  formatOtRetailUsd,
  exportOtRetailPackagesCsv,
  getOtRetailPackagePriceCents,
  getOtRetailPackageById,
} from '@/lib/invoices/ot-retail-packages';
import {
  OT_MEDICATION_PRICING_CATALOG,
  filterOtMedicationCatalog,
  formatOtCatalogUsd,
  exportOtMedicationCatalogCsv,
} from '@/lib/invoices/ot-medication-catalog';

describe('ot-retail-packages', () => {
  it('has one row per calculator compound', () => {
    expect(OT_RETAIL_PACKAGES.length).toBe(34);
  });

  it('matches calculator tier math for ac()-style SKUs (enclomiphene 25mg)', () => {
    const p = getOtRetailPackageById('enclo25');
    expect(p).toBeDefined();
    expect(getOtRetailPackagePriceCents(p!, 3)).toBe(64_900);
    expect(getOtRetailPackagePriceCents(p!, 6)).toBe(125_900);
    expect(getOtRetailPackagePriceCents(p!, 12)).toBe(244_200);
    expect(getOtRetailPackagePriceCents(p!, 1)).toBeNull();
  });

  it('respects max duration for research vials', () => {
    const t = getOtRetailPackageById('tesaipa')!;
    expect(getOtRetailPackagePriceCents(t, 3)).toBe(99_900);
    expect(getOtRetailPackagePriceCents(t, 6)).toBeNull();
  });

  it('formats USD for display', () => {
    expect(formatOtRetailUsd(64_900)).toBe('$649.00');
    expect(formatOtRetailUsd(null)).toBe('—');
    expect(formatOtRetailUsd(undefined)).toBe('—');
  });

  it('filters by search string', () => {
    const q = filterOtRetailPackages(OT_RETAIL_PACKAGES, 'enclomiphene');
    expect(q.length).toBeGreaterThanOrEqual(2);
    expect(q.some((r) => r.id === 'enclo25')).toBe(true);
  });

  it('exports CSV with duration columns', () => {
    const csv = exportOtRetailPackagesCsv([OT_RETAIL_PACKAGES[0]]);
    expect(csv).toContain('1mo_usd');
    expect(csv).toContain('hw');
  });
});

describe('ot-medication-catalog re-exports', () => {
  it('aliases catalog array to retail packages', () => {
    expect(OT_MEDICATION_PRICING_CATALOG).toBe(OT_RETAIL_PACKAGES);
  });

  it('formatOtCatalogUsd matches retail formatter', () => {
    expect(formatOtCatalogUsd(1000)).toBe(formatOtRetailUsd(1000));
  });

  it('filterOtMedicationCatalog delegates to retail filter', () => {
    expect(filterOtMedicationCatalog(OT_MEDICATION_PRICING_CATALOG, 'tirz').map((r) => r.id)).toEqual(['tirz']);
  });

  it('exportOtMedicationCatalogCsv matches retail export', () => {
    const row = OT_RETAIL_PACKAGES[0];
    expect(exportOtMedicationCatalogCsv([row])).toBe(exportOtRetailPackagesCsv([row]));
  });
});
