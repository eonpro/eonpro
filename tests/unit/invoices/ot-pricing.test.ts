import { describe, it, expect } from 'vitest';
import {
  OT_PLATFORM_COMPENSATION_BPS,
  getOtShippingMethodSurchargeCents,
  getOtProductPrice,
} from '@/lib/invoices/ot-pricing';

describe('ot-pricing', () => {
  it('computes 10% platform fee in cents', () => {
    const gross = 100_000; // $1000
    const fee = Math.round((gross * OT_PLATFORM_COMPENSATION_BPS) / 10_000);
    expect(fee).toBe(10_000);
  });

  it('returns configured shipping surcharge for known method ids', () => {
    expect(getOtShippingMethodSurchargeCents(8233)).toBe(2000);
    expect(getOtShippingMethodSurchargeCents(999999)).toBe(0);
  });

  it('resolves product by medication key string', () => {
    const p = getOtProductPrice('203448972');
    expect(p?.name).toContain('TIRZEPATIDE');
    expect(getOtProductPrice('nonexistent')).toBeUndefined();
  });
});
