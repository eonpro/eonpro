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
  return config || {
    newPatientModel: 'FIRST_CLICK',
    returningPatientModel: 'LAST_CLICK',
    cookieWindowDays: 30,
    impressionWindowHours: 24,
    enableFingerprinting: true,
  };
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

  return touches.map((t: typeof touches[number]) => ({
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
  return touches.map(touch => ({
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
  const rawWeights = touches.map(touch => {
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
    const model = isNewPatient
      ? config.newPatientModel
      : config.returningPatientModel;

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

    const confidence = determineConfidence(
      !!visitorFingerprint,
      !!cookieId,
      touches.length
    );

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
export async function getPatientAttribution(
  patientId: number
): Promise<AttributionResult | null> {
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
export async function markTouchConverted(
  touchId: number,
  patientId: number
): Promise<void> {
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
  const normalizedCode = promoCode.trim().toUpperCase();

  try {
    // Check if patient already has attribution
    const existingPatient = await prisma.patient.findUnique({
      where: { id: patientId },
      select: { attributionAffiliateId: true },
    });

    if (existingPatient?.attributionAffiliateId) {
      logger.info('[Attribution] Patient already has attribution, skipping', {
        patientId,
        existingAffiliateId: existingPatient.attributionAffiliateId,
        newCode: normalizedCode,
      });
      return null;
    }

    // Look up the ref code in the modern affiliate system
    const refCode = await prisma.affiliateRefCode.findFirst({
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
      },
    });

    if (!refCode) {
      logger.info('[Attribution] No affiliate ref code found for intake', {
        code: normalizedCode,
        clinicId,
      });
      return null;
    }

    if (refCode.affiliate.status !== 'ACTIVE') {
      logger.warn('[Attribution] Affiliate not active, skipping attribution', {
        code: normalizedCode,
        affiliateId: refCode.affiliateId,
        status: refCode.affiliate.status,
      });
      return null;
    }

    // Create an AffiliateTouch record for tracking
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
        convertedAt: new Date(),
        // Generate a fingerprint for deduplication
        visitorFingerprint: `intake-${patientId}-${Date.now()}`,
      },
    });

    // Update patient with attribution data
    await prisma.patient.update({
      where: { id: patientId },
      data: {
        attributionAffiliateId: refCode.affiliateId,
        attributionRefCode: normalizedCode,
        attributionFirstTouchAt: new Date(),
        // Also add affiliate tag
        tags: {
          push: `affiliate:${normalizedCode}`,
        },
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
    };
  } catch (error) {
    logger.error('[Attribution] Failed to attribute from intake', {
      patientId,
      promoCode: normalizedCode,
      clinicId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return null;
  }
}
