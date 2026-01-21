/**
 * Unified Intake Webhook Handler
 * 
 * This endpoint handles intake form submissions from multiple sources:
 *   - Heyflow forms
 *   - MedLink platform
 *   - WeightLossIntake platform
 *   - Internal forms
 * 
 * The source is determined by the `source` query parameter or by the presence
 * of specific headers.
 * 
 * Endpoints:
 *   POST /api/webhooks/intake?source=heyflow
 *   POST /api/webhooks/intake?source=medlink
 *   POST /api/webhooks/intake?source=weightlossintake
 *   POST /api/webhooks/intake?source=internal
 * 
 * Authentication:
 *   Uses the appropriate secret based on source:
 *   - HEYFLOW_WEBHOOK_SECRET / MEDLINK_WEBHOOK_SECRET
 *   - WEIGHTLOSSINTAKE_WEBHOOK_SECRET
 *   
 *   Accepts headers: x-webhook-secret, x-api-key, Authorization: Bearer
 */

import { NextRequest } from "next/server";
import { logger } from "@/lib/logger";
import { normalizeMedLinkPayload } from "@/lib/medlink/intakeNormalizer";
import { IntakeProcessor, IntakeSource } from "@/lib/webhooks/intake-processor";
import { logWebhookAttempt } from "@/lib/webhookLogger";
import { WebhookStatus } from "@prisma/client";
import * as Sentry from "@sentry/nextjs";

const ENDPOINT = "/api/webhooks/intake";

// Map sources to their secret environment variables
const SOURCE_SECRETS: Record<IntakeSource, string[]> = {
  heyflow: ['HEYFLOW_WEBHOOK_SECRET', 'MEDLINK_WEBHOOK_SECRET'],
  medlink: ['MEDLINK_WEBHOOK_SECRET', 'HEYFLOW_WEBHOOK_SECRET'],
  weightlossintake: ['WEIGHTLOSSINTAKE_WEBHOOK_SECRET'],
  eonpro: ['EONPRO_WEBHOOK_SECRET', 'MEDLINK_WEBHOOK_SECRET'],
  internal: ['INTERNAL_WEBHOOK_SECRET', 'MEDLINK_WEBHOOK_SECRET'],
};

// Map sources to their default clinic subdomains
const SOURCE_CLINICS: Record<IntakeSource, string | null> = {
  heyflow: null,  // Multi-clinic
  medlink: null,  // Multi-clinic
  weightlossintake: 'eonmeds',  // EONMEDS only
  eonpro: 'eonmeds',  // EONMEDS only
  internal: null,  // Clinic specified in payload
};

function detectSource(req: NextRequest): IntakeSource {
  // Check query parameter first
  const urlSource = req.nextUrl.searchParams.get('source');
  if (urlSource && ['heyflow', 'medlink', 'weightlossintake', 'eonpro', 'internal'].includes(urlSource)) {
    return urlSource as IntakeSource;
  }

  // Detect from headers
  if (req.headers.get('x-heyflow-secret') || req.headers.get('x-heyflow-signature')) {
    return 'heyflow';
  }
  if (req.headers.get('x-medlink-secret') || req.headers.get('x-medlink-signature')) {
    return 'medlink';
  }

  // Default to heyflow (most common)
  return 'heyflow';
}

function authenticate(req: NextRequest, source: IntakeSource): { valid: boolean; method?: string; error?: string } {
  const secretEnvVars = SOURCE_SECRETS[source];
  
  // Get all possible secrets for this source
  const validSecrets = secretEnvVars
    .map(envVar => process.env[envVar])
    .filter(Boolean);

  if (validSecrets.length === 0) {
    logger.warn(`[INTAKE WEBHOOK] No secret configured for source: ${source}`);
    return { valid: true, method: 'no-secret-configured' };
  }

  // Check all possible auth headers
  const authHeaders = {
    'x-webhook-secret': req.headers.get('x-webhook-secret'),
    'x-heyflow-secret': req.headers.get('x-heyflow-secret'),
    'x-medlink-secret': req.headers.get('x-medlink-secret'),
    'x-api-key': req.headers.get('x-api-key'),
    'authorization': req.headers.get('authorization'),
  };

  for (const [header, value] of Object.entries(authHeaders)) {
    if (!value) continue;
    
    for (const secret of validSecrets) {
      if (value === secret || value === `Bearer ${secret}`) {
        return { valid: true, method: header };
      }
    }
  }

  return {
    valid: false,
    error: `Authentication failed. Headers present: ${Object.keys(authHeaders).filter(k => authHeaders[k as keyof typeof authHeaders]).join(', ')}`,
  };
}

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();
  const startTime = Date.now();
  let webhookLogData: any = {
    endpoint: ENDPOINT,
    request: req,
    status: WebhookStatus.ERROR,
    statusCode: 500,
  };

  try {
    // Step 1: Detect source
    const source = detectSource(req);
    logger.info(`[INTAKE WEBHOOK ${requestId}] Received ${source} webhook`);

    // Step 2: Authenticate
    const authResult = authenticate(req, source);
    if (!authResult.valid) {
      logger.warn(`[INTAKE WEBHOOK ${requestId}] Auth failed: ${authResult.error}`);
      webhookLogData.status = WebhookStatus.INVALID_AUTH;
      webhookLogData.statusCode = 401;
      webhookLogData.errorMessage = authResult.error;
      await logWebhookAttempt(webhookLogData);
      
      return Response.json({
        error: 'Unauthorized',
        requestId,
        details: authResult.error,
      }, { status: 401 });
    }
    
    logger.debug(`[INTAKE WEBHOOK ${requestId}] Authenticated via: ${authResult.method}`);

    // Step 3: Parse payload
    let payload: Record<string, unknown>;
    try {
      payload = await req.json();
      webhookLogData.payload = payload;
    } catch (parseError: any) {
      logger.error(`[INTAKE WEBHOOK ${requestId}] JSON parse error:`, parseError);
      webhookLogData.status = WebhookStatus.INVALID_PAYLOAD;
      webhookLogData.statusCode = 400;
      webhookLogData.errorMessage = 'Invalid JSON payload';
      await logWebhookAttempt(webhookLogData);
      
      return Response.json({
        error: 'Invalid JSON payload',
        requestId,
      }, { status: 400 });
    }

    // Step 4: Normalize payload
    let normalized;
    try {
      normalized = normalizeMedLinkPayload(payload);
      logger.debug(`[INTAKE WEBHOOK ${requestId}] Normalized: ${normalized.patient.firstName} ${normalized.patient.lastName}`);
    } catch (normalizeError: any) {
      logger.error(`[INTAKE WEBHOOK ${requestId}] Normalization error:`, normalizeError);
      webhookLogData.status = WebhookStatus.PROCESSING_ERROR;
      webhookLogData.statusCode = 422;
      webhookLogData.errorMessage = `Normalization failed: ${normalizeError.message}`;
      await logWebhookAttempt(webhookLogData);
      
      Sentry.captureException(normalizeError, { extra: { payload, requestId } });
      
      return Response.json({
        error: 'Failed to normalize payload',
        requestId,
        details: normalizeError.message,
      }, { status: 422 });
    }

    // Step 5: Extract options from payload
    const isPartial = String(payload.submissionType || '').toLowerCase() === 'partial';
    const promoCodeEntry = normalized.answers?.find(
      (entry: any) =>
        entry.label?.toLowerCase().includes('promo') ||
        entry.label?.toLowerCase().includes('referral') ||
        entry.id === 'promo_code' ||
        entry.id === 'promoCode'
    );

    // Step 6: Process intake
    const processor = new IntakeProcessor({ source, requestId });
    const result = await processor.process(normalized, {
      clinicSubdomain: SOURCE_CLINICS[source] || undefined,
      clinicId: payload.clinicId as number | undefined,
      isPartialSubmission: isPartial,
      generateSoapNote: !isPartial,
      tags: source === 'weightlossintake' ? ['glp1', 'eonmeds'] : [],
      promoCode: promoCodeEntry?.value as string | undefined,
    });

    // Step 7: Log success and return
    const processingTimeMs = Date.now() - startTime;
    
    webhookLogData.status = WebhookStatus.SUCCESS;
    webhookLogData.statusCode = 200;
    webhookLogData.responseData = result;
    webhookLogData.processingTimeMs = processingTimeMs;
    await logWebhookAttempt(webhookLogData);

    logger.info(`[INTAKE WEBHOOK ${requestId}] SUCCESS in ${processingTimeMs}ms`);

    return Response.json({
      requestId,
      source,
      ...result,
      success: true, // Place last to ensure it's not overwritten by result
    }, { status: 200 });

  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`[INTAKE WEBHOOK ${requestId}] Unexpected error:`, error);
    
    Sentry.captureException(error, { extra: { requestId } });
    
    webhookLogData.status = WebhookStatus.ERROR;
    webhookLogData.statusCode = 500;
    webhookLogData.errorMessage = errorMessage;
    webhookLogData.processingTimeMs = Date.now() - startTime;
    await logWebhookAttempt(webhookLogData);

    return Response.json({
      error: 'Internal server error',
      requestId,
      details: errorMessage,
    }, { status: 500 });
  }
}

// Health check
export async function GET(req: NextRequest) {
  const stats = await import("@/lib/webhookLogger").then(m =>
    m.getWebhookStats(ENDPOINT, 7)
  );

  return Response.json({
    endpoint: ENDPOINT,
    status: 'active',
    supportedSources: ['heyflow', 'medlink', 'weightlossintake', 'eonpro', 'internal'],
    stats,
    timestamp: new Date().toISOString(),
  });
}
