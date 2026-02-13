/**
 * Affiliate Attribution Service
 *
 * Resolves which affiliate should receive credit for a conversion
 * based on configurable attribution models.
 *
 * Supports:
 * - First-click attribution (for new patients)
 * - Last-click attribution (for returning patients)
 * - Linear attribution (split evenly)
 * - Time-decay attribution (recent touches get more weight)
 * - Position-based attribution (40% first, 40% last, 20% middle)
 *
 * When no AffiliateRefCode exists for a code (e.g. from Airtable "Who recommended OT Mens Health to you?"),
 * use tagPatientWithReferralCodeOnly to tag the profile so it can be reconciled later.
 */

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

export interface AttributionResult {
  affiliateId: number;
  refCode: string;
  touchId: number;
  model: string;
  confidence: 'high' | 'medium' | 'low';
  weight: number; // 0-1, for split attribution
  allTouches?: TouchInfo[];
}

export interface TouchInfo {
  touchId: number;
  affiliateId: number;
  refCode: string;
  createdAt: Date;
  weight: number;
}

export interface AttributionRequest {
  clinicId: number;
  visitorFingerprint?: string;
  cookieId?: string;
  patientId?: number;
  isNewPatient: boolean;
}

/**
 * Get attribution configuration for a clinic
 */
async function getAttributionConfig(clinicId: number) {
  const config = await prisma.affiliateAttributionConfig.findUnique({
    where: { clinicId },
  });

  // Return defaults if no config exists
  return (
    config || {
      newPatientModel: 'FIRST_CLICK',
      returningPatientModel: 'LAST_CLICK',
      cookieWindowDays: 30,
      impressionWindowHours: 24,
      enableFingerprinting: true,
    }
  );
}

/**
 * Find all touches for a visitor within the attribution window
 */
async function findTouches(
  clinicId: number,
  visitorFingerprint?: string,
  cookieId?: string,
  windowDays: number = 30
): Promise<TouchInfo[]> {
  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - windowDays);

  // Build where clause based on available identifiers
  const identifierConditions: any[] = [];

  if (visitorFingerprint) {
    identifierConditions.push({ visitorFingerprint });
  }
  if (cookieId) {
    identifierConditions.push({ cookieId });
  }

  if (identifierConditions.length === 0) {
    return [];
  }

  const touches = await prisma.affiliateTouch.findMany({
    where: {
      clinicId,
      createdAt: { gte: windowStart },
      OR: identifierConditions,
    },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      affiliateId: true,
      refCode: true,
      createdAt: true,
    },
  });

  return touches.map((t: (typeof touches)[number]) => ({
    touchId: t.id,
    affiliateId: t.affiliateId,
    refCode: t.refCode,
    createdAt: t.createdAt,
    weight: 0, // Will be calculated based on model
  }));
}

/**
 * Apply first-click attribution
 */
function applyFirstClick(touches: TouchInfo[]): TouchInfo[] {
  if (touches.length === 0) return [];

  return touches.map((touch, index) => ({
    ...touch,
    weight: index === 0 ? 1 : 0,
  }));
}

/**
 * Apply last-click attribution
 */
function applyLastClick(touches: TouchInfo[]): TouchInfo[] {
  if (touches.length === 0) return [];

  return touches.map((touch, index) => ({
    ...touch,
    weight: index === touches.length - 1 ? 1 : 0,
  }));
}

/**
 * Apply linear attribution (split evenly)
 */
function applyLinear(touches: TouchInfo[]): TouchInfo[] {
  if (touches.length === 0) return [];

  const weight = 1 / touches.length;
  return touches.map((touch) => ({
    ...touch,
    weight,
  }));
}

/**
 * Apply time-decay attribution (more recent = more weight)
 * Uses exponential decay with half-life of 7 days
 */
function applyTimeDecay(touches: TouchInfo[]): TouchInfo[] {
  if (touches.length === 0) return [];

  const now = Date.now();
  const halfLife = 7 * 24 * 60 * 60 * 1000; // 7 days in ms

  // Calculate raw weights based on exponential decay
  const rawWeights = touches.map((touch) => {
    const age = now - touch.createdAt.getTime();
    return Math.pow(0.5, age / halfLife);
  });

  // Normalize weights to sum to 1
  const totalWeight = rawWeights.reduce((sum, w) => sum + w, 0);

  return touches.map((touch, index) => ({
    ...touch,
    weight: totalWeight > 0 ? rawWeights[index] / totalWeight : 0,
  }));
}

/**
 * Apply position-based attribution (40% first, 40% last, 20% middle)
 */
function applyPosition(touches: TouchInfo[]): TouchInfo[] {
  if (touches.length === 0) return [];
  if (touches.length === 1) return [{ ...touches[0], weight: 1 }];
  if (touches.length === 2) {
    return touches.map((touch, index) => ({
      ...touch,
      weight: 0.5,
    }));
  }

  const middleCount = touches.length - 2;
  const middleWeight = 0.2 / middleCount;

  return touches.map((touch, index) => {
    let weight: number;
    if (index === 0) {
      weight = 0.4;
    } else if (index === touches.length - 1) {
      weight = 0.4;
    } else {
      weight = middleWeight;
    }
    return { ...touch, weight };
  });
}

/**
 * Apply the specified attribution model
 */
function applyModel(touches: TouchInfo[], model: string): TouchInfo[] {
  switch (model) {
    case 'FIRST_CLICK':
      return applyFirstClick(touches);
    case 'LAST_CLICK':
      return applyLastClick(touches);
    case 'LINEAR':
      return applyLinear(touches);
    case 'TIME_DECAY':
      return applyTimeDecay(touches);
    case 'POSITION':
      return applyPosition(touches);
    default:
      return applyLastClick(touches);
  }
}

/**
 * Determine confidence level based on available data
 */
function determineConfidence(
  hasFingerprint: boolean,
  hasCookieId: boolean,
  touchCount: number
): 'high' | 'medium' | 'low' {
  if (hasFingerprint && hasCookieId && touchCount >= 1) {
    return 'high';
  }
  if ((hasFingerprint || hasCookieId) && touchCount >= 1) {
    return 'medium';
  }
  return 'low';
}

/**
 * Resolve attribution for a conversion
 */
export async function resolveAttribution(
  request: AttributionRequest
): Promise<AttributionResult | null> {
  const { clinicId, visitorFingerprint, cookieId, isNewPatient } = request;

  try {
    // Get clinic's attribution configuration
    const config = await getAttributionConfig(clinicId);

    // Select the appropriate model based on patient status
    const model = isNewPatient ? config.newPatientModel : config.returningPatientModel;

    // Find all touches for this visitor
    const touches = await findTouches(
      clinicId,
      visitorFingerprint,
      cookieId,
      config.cookieWindowDays
    );

    if (touches.length === 0) {
      logger.info('[Attribution] No touches found for visitor', {
        clinicId,
        hasFingerprint: !!visitorFingerprint,
        hasCookieId: !!cookieId,
      });
      return null;
    }

    // Apply the attribution model
    const weightedTouches = applyModel(touches, model);

    // Find the winning touch (highest weight)
    const winningTouch = weightedTouches.reduce((prev, current) =>
      current.weight > prev.weight ? current : prev
    );

    const confidence = determineConfidence(!!visitorFingerprint, !!cookieId, touches.length);

    logger.info('[Attribution] Resolved attribution', {
      clinicId,
      model,
      touchCount: touches.length,
      winningAffiliateId: winningTouch.affiliateId,
      confidence,
    });

    return {
      affiliateId: winningTouch.affiliateId,
      refCode: winningTouch.refCode,
      touchId: winningTouch.touchId,
      model,
      confidence,
      weight: winningTouch.weight,
      allTouches: weightedTouches,
    };
  } catch (error) {
    logger.error('[Attribution] Failed to resolve attribution', {
      clinicId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return null;
  }
}

/**
 * Get attribution for a patient by their ID
 * Uses the patient's stored attribution data
 */
export async function getPatientAttribution(patientId: number): Promise<AttributionResult | null> {
  try {
    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      select: {
        clinicId: true,
        attributionAffiliateId: true,
        attributionRefCode: true,
        attributionFirstTouchAt: true,
      },
    });

    if (!patient || !patient.attributionAffiliateId) {
      return null;
    }

    return {
      affiliateId: patient.attributionAffiliateId,
      refCode: patient.attributionRefCode || '',
      touchId: 0, // Not tracked at patient level
      model: 'STORED',
      confidence: 'high',
      weight: 1,
    };
  } catch (error) {
    logger.error('[Attribution] Failed to get patient attribution', {
      patientId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return null;
  }
}

/**
 * Mark a touch as converted (linked to a patient)
 */
export async function markTouchConverted(touchId: number, patientId: number): Promise<void> {
  try {
    await prisma.affiliateTouch.update({
      where: { id: touchId },
      data: {
        convertedPatientId: patientId,
        convertedAt: new Date(),
      },
    });

    logger.info('[Attribution] Touch marked as converted', {
      touchId,
      patientId,
    });
  } catch (error) {
    logger.error('[Attribution] Failed to mark touch as converted', {
      touchId,
      patientId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Set attribution on a patient record
 */
export async function setPatientAttribution(
  patientId: number,
  attribution: AttributionResult
): Promise<void> {
  try {
    await prisma.patient.update({
      where: { id: patientId },
      data: {
        attributionAffiliateId: attribution.affiliateId,
        attributionRefCode: attribution.refCode,
        attributionFirstTouchAt: new Date(),
      },
    });

    // Mark the touch as converted
    if (attribution.touchId) {
      await markTouchConverted(attribution.touchId, patientId);
    }

    logger.info('[Attribution] Patient attribution set', {
      patientId,
      affiliateId: attribution.affiliateId,
      refCode: attribution.refCode,
    });
  } catch (error) {
    logger.error('[Attribution] Failed to set patient attribution', {
      patientId,
      attribution,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Check if a patient is new or returning
 */
export async function isNewPatient(patientId: number): Promise<boolean> {
  try {
    const paymentCount = await prisma.payment.count({
      where: {
        patientId,
        status: 'COMPLETED',
      },
    });

    return paymentCount === 0;
  } catch {
    return true; // Assume new if check fails
  }
}

/**
 * Attribution failure reasons - for structured error reporting
 */
export type AttributionFailureReason =
  | 'CODE_NOT_FOUND'
  | 'CODE_INACTIVE'
  | 'AFFILIATE_INACTIVE'
  | 'CLINIC_MISMATCH'
  | 'PATIENT_NOT_FOUND'
  | 'DATABASE_ERROR'
  | 'ALREADY_ATTRIBUTED';

/**
 * Extended attribution result with failure information
 */
export interface AttributionResultExtended extends AttributionResult {
  success: boolean;
  failureReason?: AttributionFailureReason;
  failureMessage?: string;
  touchCreated?: boolean;
}

/**
 * Attribute a patient from intake form promo/affiliate code
 *
 * This is called when a patient submits an intake form with a promo code.
 * It bridges the legacy influencer system to the modern affiliate system.
 *
 * @param patientId - The patient ID to attribute
 * @param promoCode - The promo/affiliate code from the intake form
 * @param clinicId - The clinic ID (required for ref code lookup)
 * @param source - The intake source (heyflow, medlink, etc.)
 * @returns The attribution result or null if no matching affiliate found
 */
export async function attributeFromIntake(
  patientId: number,
  promoCode: string,
  clinicId: number,
  source: string = 'intake'
): Promise<AttributionResult | null> {
  const result = await attributeFromIntakeExtended(patientId, promoCode, clinicId, source);
  return result.success ? result : null;
}

/**
 * Tag a patient with a referral/promo code when no AffiliateRefCode exists yet.
 * Used for intake sources (e.g. Airtable "Who recommended OT Mens Health to you?") so we can
 * reconcile later when the code is created. Does not set attributionAffiliateId; only
 * attributionRefCode and tag. Does not create AffiliateTouch.
 *
 * Skips if patient already has attributionAffiliateId (first-wins). Otherwise updates
 * attributionRefCode and adds affiliate:CODE tag.
 */
export async function tagPatientWithReferralCodeOnly(
  patientId: number,
  promoCode: string,
  _clinicId: number
): Promise<boolean> {
  const normalizedCode = promoCode.trim().toUpperCase();
  if (!normalizedCode) return false;

  try {
    const existing = await prisma.patient.findUnique({
      where: { id: patientId },
      select: { id: true, attributionAffiliateId: true, attributionRefCode: true, tags: true },
    });
    if (!existing) {
      logger.warn('[Attribution] tagPatientWithReferralCodeOnly: patient not found', { patientId });
      return false;
    }
    // Do not overwrite if patient is already attributed to an affiliate
    if (existing.attributionAffiliateId != null) {
      logger.debug('[Attribution] tagPatientWithReferralCodeOnly: patient already has affiliate, skip', {
        patientId,
        attributionAffiliateId: existing.attributionAffiliateId,
      });
      return false;
    }

    const existingTags = Array.isArray(existing.tags) ? (existing.tags as string[]) : [];
    const affiliateTag = `affiliate:${normalizedCode}`;
    const hasTag = existingTags.includes(affiliateTag);

    await prisma.patient.update({
      where: { id: patientId },
      data: {
        attributionRefCode: normalizedCode,
        attributionFirstTouchAt: new Date(),
        ...(hasTag ? {} : { tags: { push: affiliateTag } }),
      },
    });

    logger.info('[Attribution] Tagged patient with referral code (no affiliate yet)', {
      patientId,
      refCode: normalizedCode,
    });
    return true;
  } catch (err) {
    const code = promoCode.trim().toUpperCase();
    logger.error('[Attribution] tagPatientWithReferralCodeOnly failed', {
      patientId,
      promoCode: code,
      error: err instanceof Error ? err.message : 'Unknown',
    });
    return false;
  }
}

/**
 * Extended version of attributeFromIntake with detailed error reporting
 *
 * Returns structured information about why attribution failed, which is
 * useful for diagnostics and debugging.
 */
export async function attributeFromIntakeExtended(
  patientId: number,
  promoCode: string,
  clinicId: number,
  source: string = 'intake'
): Promise<AttributionResultExtended> {
  const normalizedCode = promoCode.trim().toUpperCase();

  // Log the attribution attempt for debugging
  logger.info('[Attribution] Starting intake attribution', {
    patientId,
    promoCode: normalizedCode,
    clinicId,
    source,
  });

  try {
    // Check if patient exists and get current attribution
    const existingPatient = await prisma.patient.findUnique({
      where: { id: patientId },
      select: {
        id: true,
        clinicId: true,
        attributionAffiliateId: true,
        tags: true,
      },
    });

    if (!existingPatient) {
      logger.warn('[Attribution] Patient not found', { patientId });
      return {
        affiliateId: 0,
        refCode: normalizedCode,
        touchId: 0,
        model: 'ERROR',
        confidence: 'low',
        weight: 0,
        success: false,
        failureReason: 'PATIENT_NOT_FOUND',
        failureMessage: `Patient ID ${patientId} not found`,
        touchCreated: false,
      };
    }

    const hasExistingAttribution = !!existingPatient.attributionAffiliateId;

    // Look up the ref code in the modern affiliate system
    // First, try to find in the same clinic
    let refCode = await prisma.affiliateRefCode.findFirst({
      where: {
        refCode: normalizedCode,
        clinicId,
        isActive: true,
      },
      include: {
        affiliate: {
          select: {
            id: true,
            status: true,
            displayName: true,
          },
        },
        clinic: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // If not found in clinic, check if code exists in any clinic (for better error messaging)
    if (!refCode) {
      const codeInOtherClinic = await prisma.affiliateRefCode.findFirst({
        where: {
          refCode: normalizedCode,
          isActive: true,
        },
        include: {
          clinic: {
            select: { id: true, name: true },
          },
        },
      });

      if (codeInOtherClinic) {
        logger.warn('[Attribution] Code found but in different clinic', {
          code: normalizedCode,
          requestedClinicId: clinicId,
          codeClinicId: codeInOtherClinic.clinicId,
          codeClinicName: codeInOtherClinic.clinic.name,
        });
        return {
          affiliateId: 0,
          refCode: normalizedCode,
          touchId: 0,
          model: 'ERROR',
          confidence: 'low',
          weight: 0,
          success: false,
          failureReason: 'CLINIC_MISMATCH',
          failureMessage: `Code "${normalizedCode}" exists but belongs to clinic "${codeInOtherClinic.clinic.name}" (ID: ${codeInOtherClinic.clinicId}), not clinic ID ${clinicId}`,
          touchCreated: false,
        };
      }

      // Check if code exists but is inactive
      const inactiveCode = await prisma.affiliateRefCode.findFirst({
        where: {
          refCode: normalizedCode,
          clinicId,
          isActive: false,
        },
      });

      if (inactiveCode) {
        logger.warn('[Attribution] Code found but is inactive', {
          code: normalizedCode,
          clinicId,
        });
        return {
          affiliateId: 0,
          refCode: normalizedCode,
          touchId: 0,
          model: 'ERROR',
          confidence: 'low',
          weight: 0,
          success: false,
          failureReason: 'CODE_INACTIVE',
          failureMessage: `Code "${normalizedCode}" exists but is inactive`,
          touchCreated: false,
        };
      }

      // Code doesn't exist at all
      logger.info('[Attribution] No affiliate ref code found for intake', {
        code: normalizedCode,
        clinicId,
        suggestion: 'Check if code needs to be migrated from legacy Influencer system',
      });
      return {
        affiliateId: 0,
        refCode: normalizedCode,
        touchId: 0,
        model: 'ERROR',
        confidence: 'low',
        weight: 0,
        success: false,
        failureReason: 'CODE_NOT_FOUND',
        failureMessage: `Code "${normalizedCode}" not found in AffiliateRefCode table for clinic ${clinicId}. May need migration from legacy Influencer system.`,
        touchCreated: false,
      };
    }

    if (refCode.affiliate.status !== 'ACTIVE') {
      logger.warn('[Attribution] Affiliate not active, skipping attribution', {
        code: normalizedCode,
        affiliateId: refCode.affiliateId,
        affiliateName: refCode.affiliate.displayName,
        status: refCode.affiliate.status,
      });
      return {
        affiliateId: refCode.affiliateId,
        refCode: normalizedCode,
        touchId: 0,
        model: 'ERROR',
        confidence: 'low',
        weight: 0,
        success: false,
        failureReason: 'AFFILIATE_INACTIVE',
        failureMessage: `Affiliate "${refCode.affiliate.displayName}" (ID: ${refCode.affiliateId}) has status "${refCode.affiliate.status}"`,
        touchCreated: false,
      };
    }

    // ALWAYS create an AffiliateTouch record for tracking "uses"
    // This tracks the code usage even if patient already has attribution
    const touch = await prisma.affiliateTouch.create({
      data: {
        clinicId,
        affiliateId: refCode.affiliateId,
        refCode: normalizedCode,
        touchType: 'POSTBACK', // Direct conversion from intake form
        landingPage: `/intake/${source}`,
        utmSource: source,
        utmMedium: 'intake_form',
        utmCampaign: 'promo_code',
        convertedPatientId: patientId,
        convertedAt: hasExistingAttribution ? null : new Date(), // Only mark converted if new attribution
        // Generate a fingerprint for deduplication
        visitorFingerprint: `intake-${patientId}-${Date.now()}`,
      },
    });

    logger.info('[Attribution] Created affiliate touch for intake', {
      patientId,
      affiliateId: refCode.affiliateId,
      affiliateName: refCode.affiliate.displayName,
      refCode: normalizedCode,
      touchId: touch.id,
      hasExistingAttribution,
    });

    // Only update patient attribution if they don't already have one
    if (!hasExistingAttribution) {
      // Check if tag already exists to avoid duplicates
      const existingTags = Array.isArray(existingPatient.tags)
        ? (existingPatient.tags as string[])
        : [];
      const affiliateTag = `affiliate:${normalizedCode}`;
      const shouldAddTag = !existingTags.includes(affiliateTag);

      await prisma.patient.update({
        where: { id: patientId },
        data: {
          attributionAffiliateId: refCode.affiliateId,
          attributionRefCode: normalizedCode,
          attributionFirstTouchAt: new Date(),
          // Only add tag if not already present
          ...(shouldAddTag ? { tags: { push: affiliateTag } } : {}),
        },
      });

      // Increment the affiliate's lifetime conversions
      await prisma.affiliate.update({
        where: { id: refCode.affiliateId },
        data: {
          lifetimeConversions: { increment: 1 },
        },
      });

      logger.info('[Attribution] Successfully attributed patient from intake', {
        patientId,
        affiliateId: refCode.affiliateId,
        affiliateName: refCode.affiliate.displayName,
        refCode: normalizedCode,
        touchId: touch.id,
        source,
      });

      return {
        affiliateId: refCode.affiliateId,
        refCode: normalizedCode,
        touchId: touch.id,
        model: 'INTAKE_DIRECT',
        confidence: 'high',
        weight: 1,
        success: true,
        touchCreated: true,
      };
    } else {
      logger.info(
        '[Attribution] Patient already has attribution, touch tracked but attribution unchanged',
        {
          patientId,
          existingAffiliateId: existingPatient.attributionAffiliateId,
          newCode: normalizedCode,
          touchId: touch.id,
        }
      );

      return {
        affiliateId: refCode.affiliateId,
        refCode: normalizedCode,
        touchId: touch.id,
        model: 'INTAKE_TOUCH_ONLY',
        confidence: 'high',
        weight: 1,
        success: true,
        failureReason: 'ALREADY_ATTRIBUTED',
        failureMessage: `Patient already attributed to affiliate ID ${existingPatient.attributionAffiliateId}. Touch recorded but attribution not changed.`,
        touchCreated: true,
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[Attribution] Failed to attribute from intake', {
      patientId,
      promoCode: normalizedCode,
      clinicId,
      source,
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    });
    return {
      affiliateId: 0,
      refCode: normalizedCode,
      touchId: 0,
      model: 'ERROR',
      confidence: 'low',
      weight: 0,
      success: false,
      failureReason: 'DATABASE_ERROR',
      failureMessage: `Database error: ${errorMessage}`,
      touchCreated: false,
    };
  }
}
