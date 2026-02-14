/**
 * Affiliate Attribution Service Tests
 *
 * Tests the full patient tagging / attribution flow:
 * 1. Intake form with promo code → patient gets tagged with affiliateId
 * 2. Tag-only flow when no AffiliateRefCode exists yet
 * 3. First-wins rule (existing attribution is never overwritten)
 * 4. Touch record creation for tracking "uses"
 * 5. Lifetime conversion counter increment
 * 6. All failure modes (code not found, inactive, clinic mismatch, etc.)
 * 7. Multi-touch attribution models (first-click, last-click, linear, time-decay, position)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks – vi.hoisted ensures these are available when vi.mock factories run
// ---------------------------------------------------------------------------
const { mockPrisma, mockLogger } = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    mockPrisma: {
      affiliateRefCode: { findFirst: fn() },
      affiliateTouch: { findMany: fn(), create: fn(), update: fn() },
      affiliateAttributionConfig: { findUnique: fn() },
      affiliate: { findUnique: fn(), update: fn() },
      patient: { findUnique: fn(), update: fn(), count: fn() },
      payment: { count: fn() },
    },
    mockLogger: { info: fn(), warn: fn(), error: fn(), debug: fn() },
  };
});

vi.mock('@/lib/db', () => ({ prisma: mockPrisma }));
vi.mock('@/lib/logger', () => ({ logger: mockLogger }));

// Import after mocks
import {
  attributeFromIntake,
  attributeFromIntakeExtended,
  tagPatientWithReferralCodeOnly,
  resolveAttribution,
  setPatientAttribution,
  markTouchConverted,
  getPatientAttribution,
  isNewPatient,
} from '@/services/affiliate/attributionService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeRefCode(overrides: Record<string, unknown> = {}) {
  return {
    id: 10,
    refCode: 'PARTNER1',
    affiliateId: 100,
    clinicId: 1,
    isActive: true,
    createdAt: new Date(),
    affiliate: { id: 100, status: 'ACTIVE', displayName: 'Partner One' },
    clinic: { id: 1, name: 'Test Clinic' },
    ...overrides,
  };
}

function makePatient(overrides: Record<string, unknown> = {}) {
  return {
    id: 500,
    clinicId: 1,
    attributionAffiliateId: null,
    attributionRefCode: null,
    tags: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// attributeFromIntake / attributeFromIntakeExtended
// ---------------------------------------------------------------------------
describe('attributeFromIntake', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Happy path: patient is successfully attributed
  // -------------------------------------------------------------------------
  it('should attribute a new patient when a valid active ref code exists', async () => {
    mockPrisma.patient.findUnique.mockResolvedValue(makePatient());
    mockPrisma.affiliateRefCode.findFirst
      .mockResolvedValueOnce(makeRefCode()) // first call: by clinic
      .mockResolvedValueOnce(null); // second call: inactive check (unreachable)
    mockPrisma.affiliateTouch.create.mockResolvedValue({ id: 999 });
    mockPrisma.patient.update.mockResolvedValue({});
    mockPrisma.affiliate.update.mockResolvedValue({});

    const result = await attributeFromIntake(500, 'partner1', 1, 'heyflow');

    // Should return a valid attribution
    expect(result).not.toBeNull();
    expect(result!.affiliateId).toBe(100);
    expect(result!.refCode).toBe('PARTNER1'); // normalized to uppercase
    expect(result!.model).toBe('INTAKE_DIRECT');
    expect(result!.confidence).toBe('high');

    // Touch should be created
    expect(mockPrisma.affiliateTouch.create).toHaveBeenCalledOnce();
    const touchData = mockPrisma.affiliateTouch.create.mock.calls[0][0].data;
    expect(touchData.clinicId).toBe(1);
    expect(touchData.affiliateId).toBe(100);
    expect(touchData.refCode).toBe('PARTNER1');
    expect(touchData.touchType).toBe('POSTBACK');

    // Patient should be updated with attribution
    expect(mockPrisma.patient.update).toHaveBeenCalledOnce();
    const patientUpdate = mockPrisma.patient.update.mock.calls[0][0].data;
    expect(patientUpdate.attributionAffiliateId).toBe(100);
    expect(patientUpdate.attributionRefCode).toBe('PARTNER1');

    // Affiliate lifetime conversions should be incremented
    expect(mockPrisma.affiliate.update).toHaveBeenCalledOnce();
    const affiliateUpdate = mockPrisma.affiliate.update.mock.calls[0][0].data;
    expect(affiliateUpdate.lifetimeConversions).toEqual({ increment: 1 });
  });

  // -------------------------------------------------------------------------
  // Code normalisation (whitespace + uppercase)
  // -------------------------------------------------------------------------
  it('should normalize promo code to uppercase and trimmed', async () => {
    mockPrisma.patient.findUnique.mockResolvedValue(makePatient());
    mockPrisma.affiliateRefCode.findFirst.mockResolvedValueOnce(makeRefCode());
    mockPrisma.affiliateTouch.create.mockResolvedValue({ id: 1000 });
    mockPrisma.patient.update.mockResolvedValue({});
    mockPrisma.affiliate.update.mockResolvedValue({});

    await attributeFromIntake(500, '  partner1  ', 1);

    // Ref code lookup should use normalized code
    expect(mockPrisma.affiliateRefCode.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ refCode: 'PARTNER1' }),
      })
    );
  });

  // -------------------------------------------------------------------------
  // First-wins rule: existing attribution is NOT overwritten
  // -------------------------------------------------------------------------
  it('should NOT overwrite existing attribution (first-wins)', async () => {
    const alreadyAttributed = makePatient({
      attributionAffiliateId: 200, // already attributed
    });
    mockPrisma.patient.findUnique.mockResolvedValue(alreadyAttributed);
    mockPrisma.affiliateRefCode.findFirst.mockResolvedValueOnce(makeRefCode());
    mockPrisma.affiliateTouch.create.mockResolvedValue({ id: 1001 });

    const result = await attributeFromIntakeExtended(500, 'partner1', 1);

    // Success but model is INTAKE_TOUCH_ONLY (touch recorded, attribution unchanged)
    expect(result.success).toBe(true);
    expect(result.model).toBe('INTAKE_TOUCH_ONLY');
    expect(result.failureReason).toBe('ALREADY_ATTRIBUTED');

    // Touch should still be created (code usage tracking)
    expect(mockPrisma.affiliateTouch.create).toHaveBeenCalledOnce();
    // Patient attribution should NOT be updated
    expect(mockPrisma.patient.update).not.toHaveBeenCalled();
    // Lifetime conversions should NOT be incremented
    expect(mockPrisma.affiliate.update).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Failure: code not found
  // -------------------------------------------------------------------------
  it('should return CODE_NOT_FOUND when ref code does not exist', async () => {
    mockPrisma.patient.findUnique.mockResolvedValue(makePatient());
    // All three findFirst calls return null (by-clinic, other-clinic, inactive)
    mockPrisma.affiliateRefCode.findFirst.mockResolvedValue(null);

    const result = await attributeFromIntakeExtended(500, 'NONEXISTENT', 1);

    expect(result.success).toBe(false);
    expect(result.failureReason).toBe('CODE_NOT_FOUND');
    expect(mockPrisma.affiliateTouch.create).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Failure: code inactive
  // -------------------------------------------------------------------------
  it('should return CODE_INACTIVE when ref code is inactive', async () => {
    mockPrisma.patient.findUnique.mockResolvedValue(makePatient());
    // First call: active code not found
    mockPrisma.affiliateRefCode.findFirst
      .mockResolvedValueOnce(null) // active code lookup
      .mockResolvedValueOnce(null) // other clinic lookup
      .mockResolvedValueOnce({ id: 11, refCode: 'OLDCODE', isActive: false }); // inactive lookup

    const result = await attributeFromIntakeExtended(500, 'OLDCODE', 1);

    expect(result.success).toBe(false);
    expect(result.failureReason).toBe('CODE_INACTIVE');
  });

  // -------------------------------------------------------------------------
  // Failure: code belongs to another clinic
  // -------------------------------------------------------------------------
  it('should return CLINIC_MISMATCH when code belongs to different clinic', async () => {
    mockPrisma.patient.findUnique.mockResolvedValue(makePatient());
    mockPrisma.affiliateRefCode.findFirst
      .mockResolvedValueOnce(null) // not found in requested clinic
      .mockResolvedValueOnce({
        // found in another clinic
        id: 12,
        clinicId: 99,
        clinic: { id: 99, name: 'Other Clinic' },
      });

    const result = await attributeFromIntakeExtended(500, 'OTHERCLINIC', 1);

    expect(result.success).toBe(false);
    expect(result.failureReason).toBe('CLINIC_MISMATCH');
  });

  // -------------------------------------------------------------------------
  // Failure: affiliate is not active
  // -------------------------------------------------------------------------
  it('should return AFFILIATE_INACTIVE when affiliate status is not ACTIVE', async () => {
    mockPrisma.patient.findUnique.mockResolvedValue(makePatient());
    mockPrisma.affiliateRefCode.findFirst.mockResolvedValueOnce(
      makeRefCode({ affiliate: { id: 100, status: 'SUSPENDED', displayName: 'Suspended Aff' } })
    );

    const result = await attributeFromIntakeExtended(500, 'PARTNER1', 1);

    expect(result.success).toBe(false);
    expect(result.failureReason).toBe('AFFILIATE_INACTIVE');
    expect(mockPrisma.affiliateTouch.create).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Failure: patient not found
  // -------------------------------------------------------------------------
  it('should return PATIENT_NOT_FOUND when patient does not exist', async () => {
    mockPrisma.patient.findUnique.mockResolvedValue(null);

    const result = await attributeFromIntakeExtended(999, 'PARTNER1', 1);

    expect(result.success).toBe(false);
    expect(result.failureReason).toBe('PATIENT_NOT_FOUND');
  });

  // -------------------------------------------------------------------------
  // Tag deduplication: affiliate: tag not added twice
  // -------------------------------------------------------------------------
  it('should not add duplicate affiliate: tag', async () => {
    const patientWithTag = makePatient({ tags: ['affiliate:PARTNER1'] });
    mockPrisma.patient.findUnique.mockResolvedValue(patientWithTag);
    mockPrisma.affiliateRefCode.findFirst.mockResolvedValueOnce(makeRefCode());
    mockPrisma.affiliateTouch.create.mockResolvedValue({ id: 1002 });
    mockPrisma.patient.update.mockResolvedValue({});
    mockPrisma.affiliate.update.mockResolvedValue({});

    await attributeFromIntake(500, 'PARTNER1', 1);

    // patient.update should NOT include tags push
    const updateData = mockPrisma.patient.update.mock.calls[0][0].data;
    expect(updateData.tags).toBeUndefined(); // no push because tag already exists
  });

  // -------------------------------------------------------------------------
  // Database error handling
  // -------------------------------------------------------------------------
  it('should return DATABASE_ERROR on unexpected errors', async () => {
    mockPrisma.patient.findUnique.mockRejectedValue(new Error('Connection refused'));

    const result = await attributeFromIntakeExtended(500, 'PARTNER1', 1);

    expect(result.success).toBe(false);
    expect(result.failureReason).toBe('DATABASE_ERROR');
  });
});

// ---------------------------------------------------------------------------
// tagPatientWithReferralCodeOnly
// ---------------------------------------------------------------------------
describe('tagPatientWithReferralCodeOnly', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should tag patient with ref code and affiliate: tag when no affiliate exists', async () => {
    mockPrisma.patient.findUnique.mockResolvedValue(makePatient());
    mockPrisma.patient.update.mockResolvedValue({});

    const success = await tagPatientWithReferralCodeOnly(500, 'PROMO123', 1);

    expect(success).toBe(true);
    expect(mockPrisma.patient.update).toHaveBeenCalledOnce();
    const data = mockPrisma.patient.update.mock.calls[0][0].data;
    expect(data.attributionRefCode).toBe('PROMO123');
    expect(data.tags).toEqual({ push: 'affiliate:PROMO123' });
    // Should NOT set attributionAffiliateId
    expect(data.attributionAffiliateId).toBeUndefined();
  });

  it('should NOT overwrite if patient already has an affiliate attribution', async () => {
    mockPrisma.patient.findUnique.mockResolvedValue(
      makePatient({ attributionAffiliateId: 100 })
    );

    const success = await tagPatientWithReferralCodeOnly(500, 'PROMO123', 1);

    expect(success).toBe(false);
    expect(mockPrisma.patient.update).not.toHaveBeenCalled();
  });

  it('should return false for empty promo code', async () => {
    const success = await tagPatientWithReferralCodeOnly(500, '   ', 1);

    expect(success).toBe(false);
    expect(mockPrisma.patient.findUnique).not.toHaveBeenCalled();
  });

  it('should not add duplicate tag', async () => {
    mockPrisma.patient.findUnique.mockResolvedValue(
      makePatient({ tags: ['affiliate:PROMO123'] })
    );
    mockPrisma.patient.update.mockResolvedValue({});

    await tagPatientWithReferralCodeOnly(500, 'PROMO123', 1);

    const data = mockPrisma.patient.update.mock.calls[0][0].data;
    // tags push should NOT be present because tag already exists
    expect(data.tags).toBeUndefined();
  });

  it('should return false if patient does not exist', async () => {
    mockPrisma.patient.findUnique.mockResolvedValue(null);

    const success = await tagPatientWithReferralCodeOnly(999, 'PROMO123', 1);

    expect(success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Multi-touch attribution models
// ---------------------------------------------------------------------------
describe('resolveAttribution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const baseTouches = [
    {
      id: 1,
      affiliateId: 100,
      refCode: 'FIRST',
      createdAt: new Date('2026-01-01'),
    },
    {
      id: 2,
      affiliateId: 200,
      refCode: 'MIDDLE',
      createdAt: new Date('2026-01-05'),
    },
    {
      id: 3,
      affiliateId: 300,
      refCode: 'LAST',
      createdAt: new Date('2026-01-10'),
    },
  ];

  it('should return null when no touches exist', async () => {
    mockPrisma.affiliateAttributionConfig.findUnique.mockResolvedValue(null);
    mockPrisma.affiliateTouch.findMany.mockResolvedValue([]);

    const result = await resolveAttribution({
      clinicId: 1,
      visitorFingerprint: 'fp123',
      cookieId: 'ck123',
      isNewPatient: true,
    });

    expect(result).toBeNull();
  });

  it('FIRST_CLICK model should give 100% weight to first touch', async () => {
    mockPrisma.affiliateAttributionConfig.findUnique.mockResolvedValue({
      newPatientModel: 'FIRST_CLICK',
      returningPatientModel: 'LAST_CLICK',
      cookieWindowDays: 30,
      impressionWindowHours: 24,
      enableFingerprinting: true,
    });
    mockPrisma.affiliateTouch.findMany.mockResolvedValue(baseTouches);

    const result = await resolveAttribution({
      clinicId: 1,
      visitorFingerprint: 'fp123',
      isNewPatient: true,
    });

    expect(result).not.toBeNull();
    expect(result!.affiliateId).toBe(100); // First touch
    expect(result!.refCode).toBe('FIRST');
    expect(result!.weight).toBe(1);
    expect(result!.model).toBe('FIRST_CLICK');
  });

  it('LAST_CLICK model should give 100% weight to last touch', async () => {
    mockPrisma.affiliateAttributionConfig.findUnique.mockResolvedValue({
      newPatientModel: 'FIRST_CLICK',
      returningPatientModel: 'LAST_CLICK',
      cookieWindowDays: 30,
      impressionWindowHours: 24,
      enableFingerprinting: true,
    });
    mockPrisma.affiliateTouch.findMany.mockResolvedValue(baseTouches);

    const result = await resolveAttribution({
      clinicId: 1,
      visitorFingerprint: 'fp123',
      isNewPatient: false, // returning patient → LAST_CLICK
    });

    expect(result).not.toBeNull();
    expect(result!.affiliateId).toBe(300); // Last touch
    expect(result!.refCode).toBe('LAST');
    expect(result!.weight).toBe(1);
  });

  it('LINEAR model should split weight equally across all touches', async () => {
    mockPrisma.affiliateAttributionConfig.findUnique.mockResolvedValue({
      newPatientModel: 'LINEAR',
      returningPatientModel: 'LINEAR',
      cookieWindowDays: 30,
      impressionWindowHours: 24,
      enableFingerprinting: true,
    });
    mockPrisma.affiliateTouch.findMany.mockResolvedValue(baseTouches);

    const result = await resolveAttribution({
      clinicId: 1,
      visitorFingerprint: 'fp123',
      isNewPatient: true,
    });

    expect(result).not.toBeNull();
    // With equal weights, any touch could win; check the allTouches
    const weights = result!.allTouches!.map((t) => t.weight);
    expect(weights).toEqual([1 / 3, 1 / 3, 1 / 3]);
  });

  it('POSITION model should give 40% first, 40% last, 20% middle', async () => {
    mockPrisma.affiliateAttributionConfig.findUnique.mockResolvedValue({
      newPatientModel: 'POSITION',
      returningPatientModel: 'POSITION',
      cookieWindowDays: 30,
      impressionWindowHours: 24,
      enableFingerprinting: true,
    });
    mockPrisma.affiliateTouch.findMany.mockResolvedValue(baseTouches);

    const result = await resolveAttribution({
      clinicId: 1,
      visitorFingerprint: 'fp123',
      isNewPatient: true,
    });

    expect(result).not.toBeNull();
    const weights = result!.allTouches!.map((t) => t.weight);
    expect(weights[0]).toBeCloseTo(0.4); // first
    expect(weights[1]).toBeCloseTo(0.2); // middle
    expect(weights[2]).toBeCloseTo(0.4); // last
  });

  it('POSITION with 2 touches should give 50/50', async () => {
    mockPrisma.affiliateAttributionConfig.findUnique.mockResolvedValue({
      newPatientModel: 'POSITION',
      returningPatientModel: 'POSITION',
      cookieWindowDays: 30,
      impressionWindowHours: 24,
      enableFingerprinting: true,
    });
    mockPrisma.affiliateTouch.findMany.mockResolvedValue(baseTouches.slice(0, 2));

    const result = await resolveAttribution({
      clinicId: 1,
      visitorFingerprint: 'fp123',
      isNewPatient: true,
    });

    expect(result).not.toBeNull();
    const weights = result!.allTouches!.map((t) => t.weight);
    expect(weights).toEqual([0.5, 0.5]);
  });

  it('should use default config when no clinic config exists', async () => {
    mockPrisma.affiliateAttributionConfig.findUnique.mockResolvedValue(null);
    mockPrisma.affiliateTouch.findMany.mockResolvedValue([baseTouches[0]]);

    const result = await resolveAttribution({
      clinicId: 1,
      visitorFingerprint: 'fp123',
      isNewPatient: true,
    });

    // Default for new patients = FIRST_CLICK
    expect(result).not.toBeNull();
    expect(result!.model).toBe('FIRST_CLICK');
  });

  it('should return null when no identifier is provided', async () => {
    mockPrisma.affiliateAttributionConfig.findUnique.mockResolvedValue(null);

    const result = await resolveAttribution({
      clinicId: 1,
      // no fingerprint, no cookieId
      isNewPatient: true,
    });

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------
describe('getPatientAttribution', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should return stored attribution for attributed patient', async () => {
    mockPrisma.patient.findUnique.mockResolvedValue({
      clinicId: 1,
      attributionAffiliateId: 100,
      attributionRefCode: 'PARTNER1',
      attributionFirstTouchAt: new Date(),
    });

    const result = await getPatientAttribution(500);

    expect(result).not.toBeNull();
    expect(result!.affiliateId).toBe(100);
    expect(result!.refCode).toBe('PARTNER1');
    expect(result!.model).toBe('STORED');
    expect(result!.confidence).toBe('high');
  });

  it('should return null for patient without attribution', async () => {
    mockPrisma.patient.findUnique.mockResolvedValue({
      clinicId: 1,
      attributionAffiliateId: null,
      attributionRefCode: null,
      attributionFirstTouchAt: null,
    });

    const result = await getPatientAttribution(500);
    expect(result).toBeNull();
  });

  it('should return null for non-existent patient', async () => {
    mockPrisma.patient.findUnique.mockResolvedValue(null);
    const result = await getPatientAttribution(999);
    expect(result).toBeNull();
  });
});

describe('markTouchConverted', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should update touch with convertedPatientId and convertedAt', async () => {
    mockPrisma.affiliateTouch.update.mockResolvedValue({});

    await markTouchConverted(999, 500);

    expect(mockPrisma.affiliateTouch.update).toHaveBeenCalledWith({
      where: { id: 999 },
      data: {
        convertedPatientId: 500,
        convertedAt: expect.any(Date),
      },
    });
  });

  it('should not throw on update failure', async () => {
    mockPrisma.affiliateTouch.update.mockRejectedValue(new Error('DB error'));

    // Should not throw
    await expect(markTouchConverted(999, 500)).resolves.toBeUndefined();
  });
});

describe('setPatientAttribution', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should update patient and mark touch converted', async () => {
    mockPrisma.patient.update.mockResolvedValue({});
    mockPrisma.affiliateTouch.update.mockResolvedValue({});

    await setPatientAttribution(500, {
      affiliateId: 100,
      refCode: 'PARTNER1',
      touchId: 999,
      model: 'FIRST_CLICK',
      confidence: 'high',
      weight: 1,
    });

    expect(mockPrisma.patient.update).toHaveBeenCalledWith({
      where: { id: 500 },
      data: {
        attributionAffiliateId: 100,
        attributionRefCode: 'PARTNER1',
        attributionFirstTouchAt: expect.any(Date),
      },
    });

    expect(mockPrisma.affiliateTouch.update).toHaveBeenCalledWith({
      where: { id: 999 },
      data: {
        convertedPatientId: 500,
        convertedAt: expect.any(Date),
      },
    });
  });

  it('should not call markTouchConverted if touchId is 0', async () => {
    mockPrisma.patient.update.mockResolvedValue({});

    await setPatientAttribution(500, {
      affiliateId: 100,
      refCode: 'PARTNER1',
      touchId: 0,
      model: 'STORED',
      confidence: 'high',
      weight: 1,
    });

    expect(mockPrisma.patient.update).toHaveBeenCalledOnce();
    expect(mockPrisma.affiliateTouch.update).not.toHaveBeenCalled();
  });
});

describe('isNewPatient', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should return true for patient with 0 completed payments', async () => {
    mockPrisma.payment.count.mockResolvedValue(0);
    expect(await isNewPatient(500)).toBe(true);
  });

  it('should return false for patient with completed payments', async () => {
    mockPrisma.payment.count.mockResolvedValue(3);
    expect(await isNewPatient(500)).toBe(false);
  });

  it('should return true on error (safe default)', async () => {
    mockPrisma.payment.count.mockRejectedValue(new Error('DB error'));
    expect(await isNewPatient(500)).toBe(true);
  });
});
