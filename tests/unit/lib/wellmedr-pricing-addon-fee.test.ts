import { describe, expect, it } from 'vitest';
import { shouldEmitAddonPharmacyFee } from '@/lib/invoices/wellmedr-pricing';

describe('shouldEmitAddonPharmacyFee', () => {
  const eliteIds5mL = ['204754029', '203666651', '203449111'];
  const eliteIds10mL = ['203194055', '203666651', '203449111'];

  it('emits elite_bundle when the three Elite meds are not all on the Rx', () => {
    expect(shouldEmitAddonPharmacyFee('elite_bundle', [])).toBe(true);
    expect(shouldEmitAddonPharmacyFee('elite_bundle', ['204754029'])).toBe(true);
    expect(shouldEmitAddonPharmacyFee('elite_bundle', ['203194055'])).toBe(true);
  });

  it('suppresses elite_bundle when all three meds are on the Rx (5mL NAD+)', () => {
    expect(shouldEmitAddonPharmacyFee('elite_bundle', eliteIds5mL)).toBe(false);
  });

  it('suppresses elite_bundle when all three meds are on the Rx (10mL NAD+)', () => {
    expect(shouldEmitAddonPharmacyFee('elite_bundle', eliteIds10mL)).toBe(false);
  });

  it('emits individual addon fee only when that product is not already itemized', () => {
    expect(shouldEmitAddonPharmacyFee('nad_plus', [])).toBe(true);
    expect(shouldEmitAddonPharmacyFee('nad_plus', ['204754029'])).toBe(false);
    expect(shouldEmitAddonPharmacyFee('nad_plus', ['203194055'])).toBe(false);
    expect(shouldEmitAddonPharmacyFee('sermorelin', ['203666651'])).toBe(false);
    expect(shouldEmitAddonPharmacyFee('b12', ['203449111'])).toBe(false);
  });
});
