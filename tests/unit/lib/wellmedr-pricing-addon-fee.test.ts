import { describe, expect, it } from 'vitest';
import { shouldEmitAddonPharmacyFee } from '@/lib/invoices/wellmedr-pricing';

describe('shouldEmitAddonPharmacyFee', () => {
  const eliteIds = ['204754029', '203666651', '203449111'];

  it('emits elite_bundle when the three Elite meds are not all on the Rx', () => {
    expect(shouldEmitAddonPharmacyFee('elite_bundle', [])).toBe(true);
    expect(shouldEmitAddonPharmacyFee('elite_bundle', ['204754029'])).toBe(true);
    expect(shouldEmitAddonPharmacyFee('elite_bundle', eliteIds)).toBe(false);
  });

  it('emits individual addon fee only when that product is not already itemized', () => {
    expect(shouldEmitAddonPharmacyFee('nad_plus', [])).toBe(true);
    expect(shouldEmitAddonPharmacyFee('nad_plus', ['204754029'])).toBe(false);
    expect(shouldEmitAddonPharmacyFee('sermorelin', ['203666651'])).toBe(false);
    expect(shouldEmitAddonPharmacyFee('b12', ['203449111'])).toBe(false);
  });
});
