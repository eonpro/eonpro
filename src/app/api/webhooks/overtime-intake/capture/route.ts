/**
 * Payload Capture Endpoint for Heyflow Schema Discovery
 * =====================================================
 *
 * This endpoint captures and logs the raw payload from Heyflow
 * to help identify all field names being sent.
 *
 * Use this temporarily to discover the exact field schema for each treatment.
 *
 * @module api/webhooks/overtime-intake/capture
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

export async function POST(req: NextRequest) {
  const requestId = `capture-${Date.now()}`;

  try {
    const text = await req.text();
    let payload: Record<string, unknown> = {};

    try {
      payload = JSON.parse(text);
    } catch {
      logger.warn(`[CAPTURE ${requestId}] Failed to parse JSON`);
    }

    // Log ALL keys in the payload
    const allKeys = Object.keys(payload);

    // Categorize keys by likely field type
    const nameKeys = allKeys.filter((k) => k.toLowerCase().includes('name'));
    const emailKeys = allKeys.filter((k) => k.toLowerCase().includes('email'));
    const phoneKeys = allKeys.filter((k) => k.toLowerCase().includes('phone'));
    const dobKeys = allKeys.filter(
      (k) => k.toLowerCase().includes('dob') || k.toLowerCase().includes('birth')
    );
    const stateKeys = allKeys.filter((k) => k.toLowerCase().includes('state'));
    const addressKeys = allKeys.filter((k) => k.toLowerCase().includes('address'));
    const medicalKeys = allKeys.filter(
      (k) =>
        k.toLowerCase().includes('medication') ||
        k.toLowerCase().includes('allerg') ||
        k.toLowerCase().includes('condition') ||
        k.toLowerCase().includes('medical')
    );

    // Log detailed schema info
    logger.info(`[CAPTURE ${requestId}] ===== HEYFLOW PAYLOAD SCHEMA =====`);
    logger.info(`[CAPTURE ${requestId}] Total keys: ${allKeys.length}`);
    logger.info(`[CAPTURE ${requestId}] All keys: ${JSON.stringify(allKeys)}`);

    logger.info(`[CAPTURE ${requestId}] --- KEY CATEGORIES ---`);
    logger.info(`[CAPTURE ${requestId}] Name keys: ${JSON.stringify(nameKeys)}`);
    logger.info(`[CAPTURE ${requestId}] Email keys: ${JSON.stringify(emailKeys)}`);
    logger.info(`[CAPTURE ${requestId}] Phone keys: ${JSON.stringify(phoneKeys)}`);
    logger.info(`[CAPTURE ${requestId}] DOB keys: ${JSON.stringify(dobKeys)}`);
    logger.info(`[CAPTURE ${requestId}] State keys: ${JSON.stringify(stateKeys)}`);
    logger.info(`[CAPTURE ${requestId}] Address keys: ${JSON.stringify(addressKeys)}`);
    logger.info(`[CAPTURE ${requestId}] Medical keys: ${JSON.stringify(medicalKeys)}`);

    // Log sample values (first 100 chars)
    logger.info(`[CAPTURE ${requestId}] --- SAMPLE VALUES ---`);
    for (const key of allKeys.slice(0, 40)) {
      const value = payload[key];
      const valueStr =
        typeof value === 'string' ? value.slice(0, 100) : JSON.stringify(value)?.slice(0, 100);
      logger.info(`[CAPTURE ${requestId}] "${key}": ${valueStr}`);
    }

    // Detect treatment type
    const treatmentIndicators = {
      weight_loss: ['weight', 'glp', 'semaglutide', 'tirzepatide', 'bmi'],
      testosterone: ['trt', 'testosterone', 'hormone'],
      peptides: ['peptide', 'bpc', 'tb-500'],
      nad_plus: ['nad', 'energy', 'mitochondr'],
      better_sex: ['ed', 'erectile', 'libido', 'sex'],
      bloodwork: ['lab', 'blood', 'panel'],
    };

    const textContent = JSON.stringify(payload).toLowerCase();
    let detectedType = 'unknown';
    for (const [type, indicators] of Object.entries(treatmentIndicators)) {
      if (indicators.some((ind) => textContent.includes(ind))) {
        detectedType = type;
        break;
      }
    }

    logger.info(`[CAPTURE ${requestId}] Detected treatment type: ${detectedType}`);

    return NextResponse.json({
      success: true,
      requestId,
      message: 'Payload captured - check server logs for schema details',
      summary: {
        totalKeys: allKeys.length,
        detectedTreatmentType: detectedType,
        keyCategories: {
          name: nameKeys,
          email: emailKeys,
          phone: phoneKeys,
          dob: dobKeys,
          state: stateKeys,
          address: addressKeys,
          medical: medicalKeys.slice(0, 10),
        },
        allKeys: allKeys,
      },
    });
  } catch (error) {
    logger.error(`[CAPTURE ${requestId}] Error`, { error });
    return NextResponse.json({ error: 'Failed to capture' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'ready',
    endpoint: '/api/webhooks/overtime-intake/capture',
    method: 'POST',
    description: 'Send Heyflow payload here to discover field schema',
  });
}
