import { NextRequest, NextResponse } from "next/server";
import { normalizeMedLinkPayload } from "@/lib/medlink/intakeNormalizer";
import { logger } from '@/lib/logger';

/**
 * Webhook Test Endpoint
 * 
 * Allows partners to test their webhook integration without creating real patients.
 * Validates authentication, payload format, and field mapping.
 * 
 * POST /api/webhooks/test
 * 
 * Headers:
 *   - x-webhook-secret, x-api-key, or Authorization: Bearer
 * 
 * Returns validation results and what would be created.
 */

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();
  logger.info(`[WEBHOOK TEST ${requestId}] Test request received`);

  // === AUTHENTICATION ===
  const configuredSecret = process.env.WEIGHTLOSSINTAKE_WEBHOOK_SECRET;
  
  if (!configuredSecret) {
    return NextResponse.json({
      success: false,
      test: true,
      error: "Server not configured",
      code: "NO_SECRET_CONFIGURED",
      requestId,
    }, { status: 500 });
  }

  const providedSecret = 
    req.headers.get("x-webhook-secret") ||
    req.headers.get("x-api-key") ||
    req.headers.get("authorization")?.replace("Bearer ", "");

  // Check authentication
  const trimmedProvided = providedSecret?.trim();
  const trimmedConfigured = configuredSecret.trim();
  
  const authResult = {
    provided: !!providedSecret,
    valid: trimmedProvided === trimmedConfigured,
    headerUsed: req.headers.get("x-webhook-secret") ? "x-webhook-secret" :
                req.headers.get("x-api-key") ? "x-api-key" :
                req.headers.get("authorization") ? "Authorization" : "none",
  };

  if (!authResult.valid) {
    // Debug info to diagnose mismatch
    // Find first difference
    let firstDiffIndex = -1;
    const p = providedSecret || "";
    const c = configuredSecret;
    for (let i = 0; i < Math.max(p.length, c.length); i++) {
      if (p[i] !== c[i]) {
        firstDiffIndex = i;
        break;
      }
    }
    
    const debugInfo = {
      providedLength: providedSecret?.length || 0,
      configuredLength: configuredSecret.length,
      trimmedProvidedLength: trimmedProvided?.length || 0,
      trimmedConfiguredLength: trimmedConfigured.length,
      providedFirst5: providedSecret?.substring(0, 5) || "",
      configuredFirst5: configuredSecret.substring(0, 5),
      providedLast5: providedSecret?.slice(-5) || "",
      configuredLast5: configuredSecret.slice(-5),
      exactMatch: providedSecret === configuredSecret,
      trimmedMatch: trimmedProvided === trimmedConfigured,
      firstDifferenceAt: firstDiffIndex,
      providedCharAtDiff: firstDiffIndex >= 0 ? `'${p[firstDiffIndex]}' (code: ${p.charCodeAt(firstDiffIndex)})` : "N/A",
      configuredCharAtDiff: firstDiffIndex >= 0 ? `'${c[firstDiffIndex]}' (code: ${c.charCodeAt(firstDiffIndex)})` : "N/A",
      providedAround: firstDiffIndex >= 0 ? p.substring(Math.max(0, firstDiffIndex - 3), firstDiffIndex + 4) : "N/A",
      configuredAround: firstDiffIndex >= 0 ? c.substring(Math.max(0, firstDiffIndex - 3), firstDiffIndex + 4) : "N/A",
    };
    
    return NextResponse.json({
      success: false,
      test: true,
      error: "Authentication failed",
      code: "INVALID_SECRET",
      requestId,
      validation: {
        authentication: {
          status: "FAILED",
          secretProvided: authResult.provided,
          headerUsed: authResult.headerUsed,
          hint: "Check that your webhook secret matches exactly (case-sensitive)",
          debug: debugInfo,
        },
      },
    }, { status: 401 });
  }

  // === PARSE PAYLOAD ===
  let payload: Record<string, unknown> = {};
  let parseError: string | null = null;
  
  try {
    const text = await req.text();
    if (text) {
      payload = JSON.parse(text);
    }
  } catch (err) {
    parseError = err instanceof Error ? err.message : "Invalid JSON";
  }

  if (parseError) {
    return NextResponse.json({
      success: false,
      test: true,
      error: "Invalid JSON payload",
      code: "INVALID_JSON",
      requestId,
      validation: {
        authentication: { status: "PASSED" },
        payload: {
          status: "FAILED",
          error: parseError,
          hint: "Ensure your payload is valid JSON. Use a JSON validator.",
        },
      },
    }, { status: 400 });
  }

  // === NORMALIZE AND VALIDATE ===
  let normalized;
  let normalizationWarnings: string[] = [];
  
  try {
    normalized = normalizeMedLinkPayload(payload);
    
    // Check for missing/default fields
    if (normalized.patient.firstName === "Unknown") {
      normalizationWarnings.push("firstName: Not found, will default to 'Unknown'");
    }
    if (normalized.patient.lastName === "Unknown") {
      normalizationWarnings.push("lastName: Not found, will default to 'Unknown'");
    }
    if (normalized.patient.email === "unknown@example.com") {
      normalizationWarnings.push("email: Not found, will default to 'unknown@example.com'");
    }
    if (!normalized.patient.phone || normalized.patient.phone === "0000000000") {
      normalizationWarnings.push("phone: Not found or invalid");
    }
    if (!normalized.patient.dob || normalized.patient.dob === "1900-01-01") {
      normalizationWarnings.push("dateOfBirth: Not found or invalid format");
    }
    if (!normalized.patient.state) {
      normalizationWarnings.push("state: Not found");
    }
    
  } catch (err) {
    return NextResponse.json({
      success: false,
      test: true,
      error: "Normalization failed",
      code: "NORMALIZATION_ERROR",
      requestId,
      validation: {
        authentication: { status: "PASSED" },
        payload: { status: "PASSED" },
        normalization: {
          status: "FAILED",
          error: err instanceof Error ? err.message : "Unknown error",
        },
      },
    }, { status: 400 });
  }

  // === DETECT PAYLOAD FORMAT ===
  let detectedFormat = "unknown";
  if (payload.data && typeof payload.data === "object") {
    detectedFormat = "data_object";
  } else if (Array.isArray(payload.answers)) {
    detectedFormat = "answers_array";
  } else if (Array.isArray(payload.sections)) {
    detectedFormat = "sections_array";
  } else if (payload.responseId) {
    detectedFormat = "medlink_v2";
  } else if (Object.keys(payload).length === 0) {
    detectedFormat = "empty";
  } else {
    detectedFormat = "root_level_fields";
  }

  // === SUBMISSION TYPE ===
  const submissionType = String(payload.submissionType || (payload.data as any)?.submissionType || "complete").toLowerCase();
  const isPartial = submissionType === "partial";
  const qualified = String(payload.qualified || (payload.data as any)?.qualified || (isPartial ? "Pending" : "Yes"));

  // === BUILD RESPONSE ===
  const response = {
    success: true,
    test: true,
    requestId,
    message: "Webhook test successful! Your integration is configured correctly.",
    
    validation: {
      authentication: {
        status: "PASSED",
        headerUsed: authResult.headerUsed,
      },
      payload: {
        status: "PASSED",
        format: detectedFormat,
        keysFound: Object.keys(payload).slice(0, 20),
        submissionId: payload.submissionId || payload.submission_id || payload.responseId || payload.id || "auto-generated",
      },
      normalization: {
        status: normalizationWarnings.length === 0 ? "PASSED" : "PASSED_WITH_WARNINGS",
        warnings: normalizationWarnings.length > 0 ? normalizationWarnings : undefined,
      },
    },
    
    wouldCreate: {
      patient: {
        firstName: normalized.patient.firstName,
        lastName: normalized.patient.lastName,
        email: normalized.patient.email,
        phone: normalized.patient.phone,
        dateOfBirth: normalized.patient.dob,
        gender: normalized.patient.gender,
        address: [
          normalized.patient.address1,
          normalized.patient.address2,
          normalized.patient.city,
          normalized.patient.state,
          normalized.patient.zip,
        ].filter(Boolean).join(", ") || "Not provided",
      },
      tags: isPartial 
        ? ["weightlossintake", "eonmeds", "glp1", "partial-lead", "needs-followup"]
        : ["weightlossintake", "eonmeds", "glp1", "complete-intake"],
      submissionType,
      qualified,
      sectionsCount: normalized.sections.length,
      fieldsCount: normalized.answers.length,
    },
    
    hints: generateHints(normalized, normalizationWarnings, detectedFormat),
  };

  logger.info(`[WEBHOOK TEST ${requestId}] Test passed`, {
    format: detectedFormat,
    warnings: normalizationWarnings.length,
  });

  return NextResponse.json(response);
}

// Generate helpful hints based on the validation results
function generateHints(
  normalized: any, 
  warnings: string[], 
  format: string
): string[] {
  const hints: string[] = [];
  
  if (format === "empty") {
    hints.push("💡 Your payload is empty. Add patient data in the 'data' object.");
    hints.push("Example: { \"data\": { \"firstName\": \"John\", \"lastName\": \"Doe\" } }");
  }
  
  if (warnings.length > 0) {
    hints.push("⚠️ Some fields weren't found. Check the field mapping documentation.");
  }
  
  if (normalized.patient.firstName === "Unknown" && normalized.patient.lastName === "Unknown") {
    hints.push("🔍 No name fields found. Try: firstName, first_name, or id-b1679347 (MedLink)");
  }
  
  if (normalized.patient.email === "unknown@example.com") {
    hints.push("📧 No email found. Try: email, email_address, or id-62de7872 (MedLink)");
  }
  
  if (!normalized.patient.phone || normalized.patient.phone === "0000000000") {
    hints.push("📱 No phone found. Try: phone, phone_number, or phone-input-id-cc54007b (MedLink)");
  }
  
  if (format === "data_object") {
    hints.push("✅ Using recommended 'data' object format");
  }
  
  if (warnings.length === 0) {
    hints.push("🎉 Perfect! All required fields were found.");
  }
  
  return hints;
}

// GET - Return documentation
export async function GET() {
  return NextResponse.json({
    endpoint: "/api/webhooks/test",
    description: "Test your webhook integration without creating real patients",
    documentation: "https://app.eonpro.io/docs/webhooks",
    usage: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-secret": "YOUR_SECRET_KEY"
      },
      body: {
        submissionId: "test-123",
        data: {
          firstName: "Test",
          lastName: "Patient",
          email: "test@example.com",
          phone: "3051234567"
        }
      }
    },
    response: {
      success: "boolean - whether the test passed",
      test: "boolean - always true for test endpoint",
      validation: "object - detailed validation results",
      wouldCreate: "object - what patient would be created",
      hints: "array - helpful suggestions for improvement"
    }
  });
}
