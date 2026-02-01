/**
 * AI Sig (Directions) Generation Endpoint
 * 
 * Generates comprehensive prescription directions using AI based on:
 * - Medication details (name, form, strength)
 * - Patient context (GLP-1 naive, previous doses, conditions)
 * - Customization options (include storage, warnings, etc.)
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import OpenAI from 'openai';
import { withAuth } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import { MEDS } from '@/lib/medications';
import {
  getEnhancedTemplates,
  getDefaultStorage,
  getDefaultAdministration,
  STORAGE_PRESETS,
  ADMINISTRATION_PRESETS,
  WARNINGS_PRESETS,
  type EnhancedSigTemplate,
} from '@/lib/medications-enhanced';

// ============================================================================
// REQUEST SCHEMA
// ============================================================================

const GenerateSigRequestSchema = z.object({
  medicationKey: z.string(),
  medicationName: z.string().optional(),
  form: z.string().optional(),
  strength: z.string().optional(),
  
  // Patient context
  patientContext: z.object({
    isGlp1Naive: z.boolean().optional(),
    hasGIIssues: z.boolean().optional(),
    previousDose: z.string().optional(),
    previousMedication: z.string().optional(),
    conditions: z.array(z.string()).optional(),
    age: z.number().optional(),
    weight: z.number().optional(),
  }).optional(),
  
  // Generation options
  options: z.object({
    includeStorage: z.boolean().default(true),
    includeAdministration: z.boolean().default(true),
    includeWarnings: z.boolean().default(true),
    includeMissedDose: z.boolean().default(true),
    doseLevel: z.enum(['initiation', 'escalation', 'maintenance', 'custom']).optional(),
    customDose: z.string().optional(),
    style: z.enum(['concise', 'standard', 'comprehensive']).default('standard'),
  }).optional(),
});

type GenerateSigRequest = z.infer<typeof GenerateSigRequestSchema>;

// ============================================================================
// OPENAI CLIENT
// ============================================================================

let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not configured');
    }
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      maxRetries: 2,
      timeout: 30000,
    });
  }
  return openaiClient;
}

// ============================================================================
// SIG GENERATION LOGIC
// ============================================================================

async function generateSigWithAI(
  medication: { name: string; form: string; strength: string },
  patientContext: GenerateSigRequest['patientContext'],
  options: GenerateSigRequest['options']
): Promise<EnhancedSigTemplate> {
  const client = getOpenAIClient();
  
  const isGLP1 = medication.name.toLowerCase().includes('tirzepatide') || 
                 medication.name.toLowerCase().includes('semaglutide');
  const isTRT = medication.name.toLowerCase().includes('testosterone');
  const isPeptide = medication.name.toLowerCase().includes('sermorelin') ||
                    medication.name.toLowerCase().includes('bpc');
  
  // Build context-aware prompt
  const systemPrompt = `You are a clinical pharmacist assistant generating prescription directions (SIGs) for healthcare providers.

You must generate clear, accurate, patient-friendly prescription directions following these guidelines:

1. DIRECTIONS should be specific, actionable, and unambiguous
2. Include dosage, route, frequency, and timing
3. Use standard abbreviations only when appropriate (e.g., "mL", "mg")
4. Mention injection site rotation for injectables
5. Include storage requirements when relevant
6. Add warnings for serious side effects patients should monitor

${isGLP1 ? `
GLP-1 MEDICATION SPECIFIC:
- Always emphasize taking on the same day each week
- Mention food is optional (can take with or without)
- Include nausea management tips for new patients
- Storage: Refrigerate, can be at room temp up to 21 days
- Missed dose: Take within 4-5 days, otherwise skip
` : ''}

${isTRT ? `
TESTOSTERONE SPECIFIC:
- Specify intramuscular vs subcutaneous route clearly
- Include injection site rotation guidance
- Mention warming medication before injection
- Note monitoring requirements (hematocrit, PSA)
` : ''}

${isPeptide ? `
PEPTIDE SPECIFIC:
- Timing is crucial - usually bedtime on empty stomach
- Reconstitution instructions if applicable
- Storage: Must remain refrigerated
` : ''}

OUTPUT FORMAT (JSON):
{
  "label": "Brief descriptive label (e.g., 'Initiation - Week 1-4')",
  "sig": "Complete directions text",
  "quantity": "Recommended quantity",
  "refills": "Recommended refills (0-2)",
  "daysSupply": number,
  "storage": {
    "text": "Storage instructions",
    "temperature": "refrigerated|room-temperature",
    "specialInstructions": "Any special notes"
  },
  "administration": {
    "route": "Route description",
    "sites": ["Injection sites if applicable"],
    "timing": "When to take/inject",
    "foodInteraction": "Food requirements",
    "preparationSteps": ["Step 1", "Step 2"]
  },
  "warnings": {
    "commonSideEffects": ["Side effect 1", "Side effect 2"],
    "seriousSideEffects": ["Serious effect 1"],
    "emergencySymptoms": ["Seek help if..."]
  },
  "missedDose": "What to do if dose is missed"
}`;

  const userPrompt = `Generate prescription directions for:

MEDICATION: ${medication.name}
FORM: ${medication.form}
STRENGTH: ${medication.strength}

PATIENT CONTEXT:
${patientContext?.isGlp1Naive !== undefined ? `- GLP-1 Naive: ${patientContext.isGlp1Naive ? 'Yes (first time user)' : 'No (experienced)'}` : ''}
${patientContext?.previousDose ? `- Previous Dose: ${patientContext.previousDose}` : ''}
${patientContext?.previousMedication ? `- Previous Medication: ${patientContext.previousMedication}` : ''}
${patientContext?.hasGIIssues ? `- GI Sensitivity: Yes (be conservative with dosing)` : ''}
${patientContext?.conditions?.length ? `- Conditions: ${patientContext.conditions.join(', ')}` : ''}

DOSE LEVEL: ${options?.doseLevel || 'standard'}
${options?.customDose ? `CUSTOM DOSE: ${options.customDose}` : ''}

STYLE: ${options?.style || 'standard'} (${
  options?.style === 'concise' ? 'brief, essential info only' :
  options?.style === 'comprehensive' ? 'detailed with all sections' :
  'balanced detail'
})

INCLUDE:
- Storage instructions: ${options?.includeStorage !== false ? 'Yes' : 'No'}
- Administration details: ${options?.includeAdministration !== false ? 'Yes' : 'No'}  
- Warnings: ${options?.includeWarnings !== false ? 'Yes' : 'No'}
- Missed dose guidance: ${options?.includeMissedDose !== false ? 'Yes' : 'No'}

Return ONLY valid JSON matching the specified format.`;

  try {
    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      max_completion_tokens: 1500,
      response_format: { type: 'json_object' },
    });

    const content = completion.choices[0].message.content || '{}';
    const parsed = JSON.parse(content);

    // Ensure all required fields exist
    return {
      label: parsed.label || `${medication.name} - ${options?.doseLevel || 'Standard'}`,
      sig: parsed.sig || `Use ${medication.name} as directed.`,
      quantity: parsed.quantity || '1',
      refills: parsed.refills || '0',
      daysSupply: parsed.daysSupply || 30,
      storage: parsed.storage,
      administration: parsed.administration,
      warnings: parsed.warnings,
      missedDose: parsed.missedDose,
      phase: options?.doseLevel as EnhancedSigTemplate['phase'],
    };
  } catch (error: any) {
    logger.error('[AI Sig] Generation failed', { error: error.message });
    throw new Error(`Failed to generate sig: ${error.message}`);
  }
}

/**
 * Get a template-based sig without AI (fallback or for known medications)
 */
function getTemplateSig(
  medicationKey: string,
  doseLevel?: string
): EnhancedSigTemplate | null {
  const templates = getEnhancedTemplates(medicationKey);
  if (!templates || templates.length === 0) return null;
  
  // Find matching template by phase
  if (doseLevel) {
    const match = templates.find(t => t.phase === doseLevel);
    if (match) return match;
  }
  
  // Return first template as default
  return templates[0];
}

// ============================================================================
// API HANDLERS
// ============================================================================

async function handleGenerateSig(req: NextRequest) {
  try {
    const body = await req.json();
    const validated = GenerateSigRequestSchema.parse(body);
    
    const { medicationKey, patientContext, options } = validated;
    
    // Get medication info
    const med = MEDS[medicationKey];
    if (!med) {
      return NextResponse.json(
        { error: 'Medication not found', medicationKey },
        { status: 404 }
      );
    }
    
    const medication = {
      name: validated.medicationName || med.name,
      form: validated.form || med.form,
      strength: validated.strength || med.strength,
    };
    
    // Check if we have enhanced templates for this medication
    const existingTemplates = getEnhancedTemplates(medicationKey);
    
    // Try template-based first for known medications
    if (existingTemplates && existingTemplates.length > 0 && !options?.style) {
      const template = getTemplateSig(medicationKey, options?.doseLevel);
      if (template) {
        logger.info('[AI Sig] Using pre-defined template', { medicationKey, phase: template.phase });
        return NextResponse.json({
          success: true,
          source: 'template',
          sig: template,
          availableTemplates: existingTemplates.map(t => ({
            label: t.label,
            phase: t.phase,
            targetDose: t.targetDose,
          })),
        });
      }
    }
    
    // Generate with AI
    logger.info('[AI Sig] Generating with AI', { medication: medication.name, options });
    const generatedSig = await generateSigWithAI(medication, patientContext, options);
    
    return NextResponse.json({
      success: true,
      source: 'ai',
      sig: generatedSig,
      availableTemplates: existingTemplates?.map(t => ({
        label: t.label,
        phase: t.phase,
        targetDose: t.targetDose,
      })),
    });
    
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Invalid request', details: error.errors },
        { status: 400 }
      );
    }
    
    logger.error('[AI Sig] Error', { error: error.message });
    return NextResponse.json(
      { error: error.message || 'Failed to generate sig' },
      { status: 500 }
    );
  }
}

/**
 * GET - Get available templates for a medication
 */
async function handleGetTemplates(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const medicationKey = searchParams.get('medicationKey');
  
  if (!medicationKey) {
    return NextResponse.json(
      { error: 'medicationKey is required' },
      { status: 400 }
    );
  }
  
  const med = MEDS[medicationKey];
  if (!med) {
    return NextResponse.json(
      { error: 'Medication not found' },
      { status: 404 }
    );
  }
  
  const templates = getEnhancedTemplates(medicationKey);
  const defaultStorage = getDefaultStorage(med.form);
  const defaultAdmin = getDefaultAdministration(med.form);
  
  return NextResponse.json({
    success: true,
    medication: {
      name: med.name,
      form: med.form,
      strength: med.strength,
    },
    templates: templates || [],
    defaults: {
      storage: defaultStorage,
      administration: defaultAdmin,
    },
  });
}

// ============================================================================
// EXPORTS
// ============================================================================

export const POST = withAuth(handleGenerateSig, { roles: ['provider', 'admin', 'super_admin'] });
export const GET = withAuth(handleGetTemplates, { roles: ['provider', 'admin', 'super_admin'] });
