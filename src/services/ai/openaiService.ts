import OpenAI from 'openai';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { AppError, ApiResponse } from '@/types/common';
import { Patient, Provider, Order } from '@/types/models';
import { anonymizeObject, anonymizeName, logAnonymization } from '@/lib/security/phi-anonymization';
import {
  BECCA_SYSTEM_PROMPT,
  detectQueryCategory,
  buildKnowledgeContext,
  type QueryCategory,
} from './beccaKnowledgeBase';

// Environment configuration
const envSchema = z.object({
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_ORG_ID: z.string().optional(),
  // Use gpt-4o-mini for better rate limits and lower cost
  // Can be overridden with OPENAI_MODEL env var for higher quality
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),
  OPENAI_TEMPERATURE: z.coerce.number().default(0.7),
  OPENAI_MAX_TOKENS: z.coerce.number().default(4000),
});

let openaiClient: OpenAI | null = null;

/**
 * Check if model requires max_completion_tokens instead of max_tokens
 * Newer models (o1, o3, gpt-4o, gpt-5, etc.) use max_completion_tokens
 * Only older models like gpt-4-turbo, gpt-3.5-turbo use max_tokens
 */
function useMaxCompletionTokens(model: string): boolean {
  const modelLower = model.toLowerCase();

  // Models that DEFINITELY use old max_tokens parameter
  const usesMaxTokens =
    modelLower.includes('gpt-3.5') ||
    modelLower.includes('gpt-4-turbo') ||
    modelLower === 'gpt-4' ||
    modelLower.includes('gpt-4-0') || // gpt-4-0613, gpt-4-0314, etc.
    modelLower.includes('davinci') ||
    modelLower.includes('curie') ||
    modelLower.includes('babbage') ||
    modelLower.includes('ada');

  // If it's a known old model, use max_tokens; otherwise use max_completion_tokens
  // This ensures newer models (gpt-4o, gpt-4o-mini, gpt-5, o1, o3, etc.) use the new parameter
  return !usesMaxTokens;
}

/**
 * Get the correct token limit parameter for the model
 */
function getTokenLimitParam(
  model: string,
  maxTokens: number
): { max_tokens?: number; max_completion_tokens?: number } {
  if (useMaxCompletionTokens(model)) {
    return { max_completion_tokens: maxTokens };
  }
  return { max_tokens: maxTokens };
}

/**
 * Initialize OpenAI client lazily to prevent build-time failures
 */
function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    // Check for API key before parsing to give better error message
    if (!process.env.OPENAI_API_KEY) {
      logger.error('[OpenAI] CRITICAL: OPENAI_API_KEY environment variable is not set');
      throw new Error(
        'OpenAI API key is not configured. Please add OPENAI_API_KEY to environment variables.'
      );
    }

    try {
      const env = envSchema.parse({
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        OPENAI_ORG_ID: process.env.OPENAI_ORG_ID,
        OPENAI_MODEL: process.env.OPENAI_MODEL,
        OPENAI_TEMPERATURE: process.env.OPENAI_TEMPERATURE,
        OPENAI_MAX_TOKENS: process.env.OPENAI_MAX_TOKENS,
      });

      logger.info('[OpenAI] Initializing client', {
        model: env.OPENAI_MODEL,
        hasOrgId: !!env.OPENAI_ORG_ID,
        temperature: env.OPENAI_TEMPERATURE,
        maxTokens: env.OPENAI_MAX_TOKENS,
      });

      openaiClient = new OpenAI({
        apiKey: env.OPENAI_API_KEY,
        organization: env.OPENAI_ORG_ID,
        maxRetries: 3,
        timeout: 60000, // 60 seconds
      });
    } catch (error: unknown) {
      logger.error('[OpenAI] Failed to initialize client', { error: (error as any).message });
      throw new Error(`OpenAI configuration error: ${(error as any).message}`);
    }
  }
  return openaiClient;
}

/**
 * Rate limiting and usage tracking
 */
interface UsageMetrics {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost: number;
}

// Simple rate limiter - more permissive for serverless
// Note: On Vercel, each invocation may be a new instance, so this is best-effort
class RateLimiter {
  private requests: number[] = [];
  private readonly windowMs = 60000; // 1 minute
  private readonly maxRequests = 100; // Increased to 100 requests per minute

  async checkLimit(): Promise<void> {
    const now = Date.now();
    this.requests = this.requests.filter((time: number) => now - time < this.windowMs);

    if (this.requests.length >= this.maxRequests) {
      const oldestRequest = this.requests[0];
      const waitTime = this.windowMs - (now - oldestRequest);
      throw new Error(`Internal rate limit. Please wait ${Math.ceil(waitTime / 1000)} seconds.`);
    }

    this.requests.push(now);
  }
}

const rateLimiter = new RateLimiter();

/**
 * Retry helper with exponential backoff for OpenAI calls
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 1000
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      lastError = error as Error | null;

      // Only retry on rate limits (429) or server errors (5xx)
      const isRetryable =
        (error as any).status === 429 ||
        ((error as any).status >= 500 && (error as any).status < 600);

      if (!isRetryable || attempt === maxRetries) {
        throw error;
      }

      // Exponential backoff: 1s, 2s, 4s
      const delay = baseDelayMs * Math.pow(2, attempt);
      logger.warn(
        `[OpenAI] Rate limited, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Calculate estimated cost based on token usage
 */
function calculateCost(usage: UsageMetrics): number {
  // GPT-4 Turbo pricing (as of 2024)
  const inputCostPer1K = 0.01; // $0.01 per 1K input tokens
  const outputCostPer1K = 0.03; // $0.03 per 1K output tokens

  const inputCost = (usage.promptTokens / 1000) * inputCostPer1K;
  const outputCost = (usage.completionTokens / 1000) * outputCostPer1K;

  return parseFloat((inputCost + outputCost).toFixed(4));
}

/**
 * SOAP Note Generation from Intake Data
 */
export interface PreviousRxInfo {
  medName: string;
  strength: string;
  sig: string;
  dose: number | null;
  prescribedAt: string;
  providerName?: string;
}

export interface SOAPGenerationInput {
  intakeData: Record<string, unknown>;
  patientName: string;
  dateOfBirth?: string;
  chiefComplaint?: string;
  isRenewal?: boolean;
  previousPrescriptions?: PreviousRxInfo[];
  treatmentType?: string;
}

export interface SOAPNote {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  medicalNecessity?: string;
  metadata: {
    generatedAt: Date;
    intakeId?: string;
    usage?: UsageMetrics;
  };
}

export async function generateSOAPNote(input: SOAPGenerationInput): Promise<SOAPNote> {
  await rateLimiter.checkLimit();

  // CRITICAL: Anonymize PHI before sending to OpenAI
  // OpenAI does not have a BAA for HIPAA compliance
  // Use a CONSISTENT placeholder name that we can find-and-replace after generation
  const PLACEHOLDER_NAME = 'PATIENT_NAME_PLACEHOLDER';
  const PLACEHOLDER_AGE = 'PATIENT_AGE_PLACEHOLDER';

  // Calculate real patient age from DOB for post-processing
  let realAge: number | null = null;
  if (input.dateOfBirth) {
    const dob = new Date(input.dateOfBirth);
    const today = new Date();
    realAge = Math.floor((today.getTime() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
  }

  const anonymizedInput = {
    intakeData: anonymizeObject(input.intakeData),
    patientName: PLACEHOLDER_NAME, // Consistent placeholder we can replace
    patientAge: PLACEHOLDER_AGE, // Explicit age placeholder
    dateOfBirth: '01/01/1990', // Use placeholder DOB (AI needs something to calculate from)
    chiefComplaint: input.chiefComplaint, // Chief complaint is generally not PHI
  };

  // Log the anonymization for audit
  logAnonymization(
    0, // System-generated
    'SOAP note generation via OpenAI',
    'Patient intake data'
  );

  logger.info('Generating SOAP note with anonymized data', {
    originalPatient: input.patientName,
    anonymizedPatient: anonymizedInput.patientName,
    realAge,
  });

  const client = getOpenAIClient();
  const env = envSchema.parse({
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
    OPENAI_TEMPERATURE: process.env.OPENAI_TEMPERATURE,
    OPENAI_MAX_TOKENS: process.env.OPENAI_MAX_TOKENS,
  });

  const isPeptideTherapy = input.treatmentType === 'peptides';
  const isRenewal =
    input.isRenewal && input.previousPrescriptions && input.previousPrescriptions.length > 0;
  const prevRx = isRenewal ? input.previousPrescriptions![0] : null;

  const selectedAddons = Array.isArray(input.intakeData?.selectedAddons)
    ? input.intakeData.selectedAddons
    : [];
  const hasEliteBundle = selectedAddons.includes('elite_bundle');

  // Peptide therapy (sermorelin, BPC-157, etc.) uses a completely different prompt
  if (isPeptideTherapy) {
    return generatePeptideSOAPNote(
      anonymizedInput,
      input,
      PLACEHOLDER_NAME,
      PLACEHOLDER_AGE,
      realAge,
      client,
      env
    );
  }

  // Determine if patient is at maximum dose (no further titration possible)
  const prevDose = prevRx?.dose ?? null;
  const prevMedLower = (prevRx?.medName || '').toLowerCase();
  const isTirzepatide = prevMedLower.includes('tirzepatide');
  const isSemaglutide = prevMedLower.includes('semaglutide');
  const isAtMaxDose =
    isRenewal &&
    prevDose !== null &&
    ((isTirzepatide && prevDose >= 15) || (isSemaglutide && prevDose >= 2.4));
  const doseAction = isAtMaxDose ? 'maintenance' : 'titration';

  const baseSystemPrompt = `You are a licensed prescribing provider (MD/DO/NP/PA) creating a comprehensive SOAP note for a telehealth weight management ${isRenewal ? 'follow-up / renewal visit' : 'evaluation'}.

You must generate a professional, clinical-grade SOAP note for GLP-1 receptor agonist therapy ${isRenewal ? (isAtMaxDose ? 'maintenance at maximum therapeutic dose' : 'continuation and dose titration') : 'evaluation'} (semaglutide/tirzepatide).
${
  isRenewal && isAtMaxDose
    ? `
IMPORTANT — MAXIMUM DOSE REACHED:
The patient is currently at the MAXIMUM weekly dose for their medication:
${isTirzepatide ? '• Tirzepatide maximum weekly dose: 15mg' : ''}${isSemaglutide ? '• Semaglutide maximum weekly dose: 2.4mg' : ''}
• Current dose: ${prevDose}mg
DO NOT recommend titrating up. The plan should MAINTAIN the current dose.
Rationale should focus on continued efficacy at maximum dose and ongoing monitoring.
`
    : ''
}${
    hasEliteBundle
      ? `
ADJUNCTIVE THERAPY — ELITE BUNDLE (NAD+, Sermorelin, B12):
The patient has been prescribed the Elite Bundle add-on alongside their GLP-1 therapy. The Assessment and Plan sections MUST include clinical justification for stacking these adjunctive therapies with GLP-1 treatment:

• NAD+ (Nicotinamide Adenine Dinucleotide): Supports mitochondrial energy production and cellular metabolism during caloric deficit. GLP-1 therapy reduces caloric intake, and NAD+ supplementation helps maintain cellular energy homeostasis, reduces fatigue associated with weight loss, and supports metabolic adaptation. Evidence suggests NAD+ precursors enhance fat oxidation and improve insulin sensitivity, complementing the metabolic benefits of GLP-1 agonists.

• Sermorelin (Growth Hormone Releasing Peptide): Stimulates endogenous growth hormone secretion, promoting lean body mass preservation during GLP-1-mediated weight loss. Patients on GLP-1 therapy can lose both fat and lean mass; sermorelin helps shift body composition toward fat loss while maintaining muscle. Additionally supports improved sleep quality, recovery, and overall metabolic rate — critical during active weight management.

• Cyanocobalamin (B12): Essential cofactor for energy metabolism, neurological function, and red blood cell formation. GLP-1 agonists can reduce nutrient absorption due to delayed gastric emptying and decreased food intake. B12 supplementation mitigates the risk of deficiency, supports energy levels during caloric restriction, and complements the metabolic optimization achieved by GLP-1 therapy.

Include in the Assessment: "The combination of GLP-1 receptor agonist therapy with adjunctive NAD+, Sermorelin, and B12 provides a comprehensive metabolic optimization approach — addressing weight reduction (GLP-1), cellular energy and fat oxidation (NAD+), lean mass preservation and hormonal support (Sermorelin), and nutritional repletion (B12)."

Include in the Plan: Prescribe the Elite Bundle (NAD+, Sermorelin, Cyanocobalamin B12) as adjunctive therapy to the GLP-1 regimen.
`
      : ''
  }
CRITICAL: Return your response in JSON format with ALL fields as plain text STRINGS. Each field should be detailed and formatted professionally:

{
  "subjective": "${isRenewal ? 'Narrative of follow-up visit: tolerability of current dose, side effects, weight progress, adherence' + (isAtMaxDose ? ', and continued benefit at maximum dose' : ', and readiness for dose titration') : "Detailed narrative of patient's weight history, goals, GLP-1 experience, symptoms, medications, and treatment interest"}",
  "objective": "Anthropometrics (height, weight, BMI with classification, ideal weight, excess weight), vital signs, activity level, complete medical/surgical history, current medications, allergies, GLP-1 history${isRenewal ? ', current prescription details, treatment duration' : ''}",
  "assessment": "Primary diagnosis with ICD-10 code, ${isRenewal ? (isAtMaxDose ? 'treatment response at maximum dose, tolerability evaluation, rationale for maintenance therapy' : 'treatment response assessment, tolerability evaluation, dose titration rationale') : 'clinical assessment of candidacy, contraindication screening, medical necessity rationale for compounded therapy with B12 or Glycine additive explanation'}",
  "plan": "${isRenewal ? (isAtMaxDose ? 'Maintain current maximum dose, monitoring schedule, continued therapy plan' : 'Dose titration plan (from current dose to next dose), specific new prescription details, monitoring schedule') : 'Medication plan (specific compound, dosing, titration), monitoring & follow-up schedule, patient education provided, disposition'}",
  "medicalNecessity": "${isRenewal ? (isAtMaxDose ? 'Rationale for continued therapy at maximum therapeutic dose including sustained clinical benefit, weight management progress, and maintenance protocol' : 'Rationale for continued therapy and dose escalation including treatment response, clinical benefit, and titration protocol adherence') : 'Detailed rationale for compounded GLP-1 formulation including: gradual dose titration needs, personalized dosing flexibility, adjunctive B12/Glycine benefits'}"
}

BMI Classifications:
- BMI 25-29.9: Overweight
- BMI 30-34.9: Class I Obesity
- BMI 35-39.9: Class II Obesity
- BMI ≥40: Class III (Severe) Obesity

ICD-10 Codes to use:
- E66.01 – Morbid obesity due to excess calories (BMI ≥40 or BMI ≥35 with comorbidities)
- E66.09 – Other obesity due to excess calories (BMI 30-34.9)
- E66.9 – Obesity, unspecified
- Z68.30-Z68.45 – BMI codes by range

DO NOT return nested objects. Each field must be a comprehensive plain text string.`;

  const renewalPrescriptionContext = isRenewal
    ? `
═══════════════════════════════════════════════════════════════════════════════
PREVIOUS PRESCRIPTION HISTORY (from actual prescriptions sent):
${input
  .previousPrescriptions!.map(
    (rx, i) => `
Prescription ${i + 1}:
• Medication: ${rx.medName}
• Strength: ${rx.strength}
• Dose: ${rx.dose !== null ? rx.dose + 'mg' : 'See sig'}
• Sig (Directions): ${rx.sig}
• Prescribed: ${rx.prescribedAt}
${rx.providerName ? `• Provider: ${rx.providerName}` : ''}
`
  )
  .join('')}
═══════════════════════════════════════════════════════════════════════════════`
    : '';

  const systemPrompt = baseSystemPrompt;

  const userPrompt = isRenewal
    ? `Create a professional TELEHEALTH WEIGHT MANAGEMENT FOLLOW-UP / RENEWAL SOAP note for this returning patient.

This is a RENEWAL visit — the patient has been on GLP-1 therapy and is returning for continued treatment ${isAtMaxDose ? 'at MAXIMUM therapeutic dose (maintain current dose, do NOT titrate up)' : 'with dose titration'}.

IMPORTANT: Use these EXACT placeholders in your response - they will be replaced with real data:
- For patient name, use exactly: ${PLACEHOLDER_NAME}
- For patient age, use exactly: ${PLACEHOLDER_AGE}

Patient Reference: ${PLACEHOLDER_NAME}
Patient Age: ${PLACEHOLDER_AGE}
DOB Reference: ${anonymizedInput.dateOfBirth || 'See intake data'}
${renewalPrescriptionContext}

INTAKE FORM DATA (from original intake):
${JSON.stringify(anonymizedInput.intakeData, null, 2)}

Generate a comprehensive RENEWAL/FOLLOW-UP SOAP note following this structure:

═══════════════════════════════════════════════════════════════════════════════

S – SUBJECTIVE:
Write a detailed narrative paragraph covering:
- Start with: "${PLACEHOLDER_NAME}, a ${PLACEHOLDER_AGE}-year-old [sex from intake], presents for follow-up evaluation of weight management."
- This is a RENEWAL/FOLLOW-UP visit — reference that patient has been on GLP-1 therapy
- Reference the previous prescription: ${prevRx ? `was prescribed ${prevRx.medName} at ${prevRx.dose !== null ? prevRx.dose + 'mg' : prevRx.strength}` : 'has been on GLP-1 therapy'}
- Reports tolerating current dose well (or note any reported side effects from intake)
- Weight loss progress since starting therapy
- Adherence to medication regimen
- Continued motivation for weight management
- Denies new contraindications: gastroparesis, pancreatitis, thyroid malignancy, MEN-2
- No new medical concerns or medication changes
${isAtMaxDose ? '- Currently at maximum therapeutic dose and reports continued benefit\n- Interested in maintaining current regimen' : '- Ready for dose titration per protocol'}

═══════════════════════════════════════════════════════════════════════════════

O – OBJECTIVE:
Format with bullet points and sections:

Anthropometrics:
• Height: [from intake]
• Weight: [from intake] lbs
• BMI: [calculate] kg/m² ([Classification])
• Ideal Body Weight: [calculate] lbs
• Excess Weight: ~[calculate] lbs

Current GLP-1 Therapy:
• Medication: ${prevRx?.medName || '[from prescription history]'}
• Current Dose: ${prevRx?.dose !== null ? prevRx?.dose + 'mg' : prevRx?.strength || '[from prescription history]'}
• Directions: ${prevRx?.sig || '[from prescription history]'}

Vital Signs (Self-Reported):
• Blood Pressure: [if provided or "Stable" if not specified]

Treatment Tolerability:
• GI side effects: [assess from intake data - nausea, constipation, etc.]
• Injection site reactions: None reported
• Overall tolerance: Good

Medical History (unchanged from initial evaluation):
• [reference key items from intake]

Medications:
• [list current medications including GLP-1]

Allergies:
• [list or "No known drug allergies (NKDA)"]

═══════════════════════════════════════════════════════════════════════════════

A – ASSESSMENT:

Primary Diagnosis:
• [ICD-10 code] – [Diagnosis description] (BMI [X] kg/m²)

Treatment Response:
• Patient has been on ${prevRx?.medName || 'GLP-1 therapy'} at ${prevRx?.dose !== null ? prevRx?.dose + 'mg' : prevRx?.strength || 'current dose'}
• Tolerating current dose well with no significant adverse effects
• Continued clinical indication for pharmacologic weight management
${
  isAtMaxDose
    ? `• Patient is at MAXIMUM therapeutic dose (${prevDose}mg weekly) — no further titration indicated
• Recommend maintaining current dose for continued weight management benefit`
    : '• Patient meets criteria for dose titration per standard protocol'
}

${
  isAtMaxDose
    ? `Maintenance Therapy Rationale:
• Patient has reached maximum recommended weekly dose for ${isTirzepatide ? 'tirzepatide (15mg)' : isSemaglutide ? 'semaglutide (2.4mg)' : 'current medication'}
• Current dose is well-tolerated with demonstrated clinical benefit
• Continued therapy at this dose is appropriate for sustained weight management
• No further dose escalation is indicated per prescribing guidelines`
    : `Dose Titration Rationale:
• Current dose has been tolerated — appropriate to advance to next dose level per titration protocol
• Gradual dose escalation improves efficacy while maintaining tolerability
• Continued compounded formulation allows precise dosing flexibility`
}

No new contraindications identified. Patient remains an appropriate candidate for continued GLP-1 therapy.

═══════════════════════════════════════════════════════════════════════════════

P – PLAN:

${
  isAtMaxDose
    ? `Maintenance Therapy:
• Continue current dose: ${prevRx?.dose !== null ? prevRx?.dose + 'mg' : prevRx?.strength || '[current dose]'} ${prevRx?.medName || ''} — MAXIMUM dose reached
• DO NOT titrate up — patient is at maximum recommended weekly dose
• Continue compounded formulation with Vitamin B12 or Glycine per pharmacy standards`
    : `Dose Titration:
• Previous dose: ${prevRx?.dose !== null ? prevRx?.dose + 'mg' : prevRx?.strength || '[current dose]'} ${prevRx?.medName || ''}
• Titrate UP to next dose per protocol
• Continue compounded formulation with Vitamin B12 or Glycine per pharmacy standards`
}

Monitoring & Follow-Up:
• Monitor weight, BMI, appetite, and tolerance ${isAtMaxDose ? 'at current maximum dose' : 'at increased dose'}
• Assess for ${isAtMaxDose ? 'ongoing' : 'dose-related'} side effects (nausea, constipation, reflux)
• Reinforce hydration, protein intake, and lifestyle adherence
• Follow-up evaluation in 4 weeks or sooner if adverse symptoms occur

Patient Education:
${
  isAtMaxDose
    ? `• Reviewed continued expectations at maximum therapeutic dose
• Discussed long-term maintenance approach and importance of adherence
• Counseled on signs/symptoms requiring medical attention
• Reinforced that medication is adjunct to diet and activity`
    : `• Reviewed expected effects at higher dose
• Discussed gradual titration approach and timeline
• Counseled on signs/symptoms requiring medical attention
• Reinforced that medication is adjunct to diet and activity`
}

Disposition:
• Patient remains an appropriate candidate for continued medically supervised weight loss
• ${isAtMaxDose ? 'Maintenance dose renewal approved pending pharmacy processing' : 'Dose titration approved pending pharmacy processing'}
• Next follow-up scheduled per protocol

═══════════════════════════════════════════════════════════════════════════════

Return as valid JSON with keys: subjective, objective, assessment, plan, medicalNecessity`
    : `Create a professional TELEHEALTH WEIGHT MANAGEMENT SOAP note for this patient evaluation.

IMPORTANT: Use these EXACT placeholders in your response - they will be replaced with real data:
- For patient name, use exactly: ${PLACEHOLDER_NAME}
- For patient age, use exactly: ${PLACEHOLDER_AGE}

Patient Reference: ${PLACEHOLDER_NAME}
Patient Age: ${PLACEHOLDER_AGE}
DOB Reference: ${anonymizedInput.dateOfBirth || 'See intake data'}

INTAKE FORM DATA:
${JSON.stringify(anonymizedInput.intakeData, null, 2)}

Generate a comprehensive clinical SOAP note following this exact structure:

═══════════════════════════════════════════════════════════════════════════════

S – SUBJECTIVE:
Write a detailed narrative paragraph covering:
- Start with: "${PLACEHOLDER_NAME}, a ${PLACEHOLDER_AGE}-year-old [sex from intake], presents for..."
- Long-standing struggle with excess body weight
- Difficulty achieving sustained weight loss through lifestyle measures alone
- Interest in medically supervised weight loss and personalized compounded GLP-1 therapy
- Prior GLP-1 experience (naïve or experienced, any adverse reactions)
- Activity level description
- Denial statements for contraindications: gastroparesis, pancreatitis, thyroid malignancy, MEN-2
- Medical history denials/confirmations: diabetes, CKD, GI disorders, mental health, bariatric surgery
- Medication allergies
- Patient's stated goals (weight reduction, metabolic health improvement)
- Consent to telehealth treatment and interest in compounded medication options

═══════════════════════════════════════════════════════════════════════════════

O – OBJECTIVE:
Format with bullet points and sections:

Anthropometrics:
• Height: [from intake]
• Weight: [from intake] lbs
• BMI: [calculate] kg/m² ([Classification])
• Ideal Body Weight: [calculate ~106 + 6 per inch over 5ft for men, 100 + 5 for women] lbs
• Excess Weight: ~[calculate] lbs

Vital Signs (Self-Reported):
• Blood Pressure: [if provided or "Normal" if not specified]

Activity Level:
• [from intake - sedentary/moderately active/very active]

Medical History:
• Diabetes mellitus: [Yes/No]
• Gastroparesis: [Yes/No]
• Pancreatitis: [Yes/No]
• Thyroid cancer or MEN-2: [Yes/No]
• Chronic conditions: [list or "No chronic medical conditions reported"]
• Digestive disorders: [Yes/No]
• Chronic kidney disease: [Yes/No]
• Psychiatric diagnoses: [Yes/No]

Surgical History:
• [list or "Denies prior surgeries"]

Medications:
• [list current medications or "None reported"]

Allergies:
• [list or "No known drug allergies (NKDA)"]

GLP-1 History:
• [GLP-1 naïve OR currently taking X at Y dose]
• Prior adverse reactions: [list or "None"]

═══════════════════════════════════════════════════════════════════════════════

A – ASSESSMENT:

Primary Diagnosis:
• [ICD-10 code] – [Diagnosis description] (BMI [X] kg/m²)

Clinical Assessment:
The patient meets clinical criteria for pharmacologic weight management based on:
• BMI ≥30 kg/m² OR BMI ≥27 with weight-related comorbidity
• Failure to achieve sustained weight loss through lifestyle measures alone
• Presence of excess adiposity posing increased cardiometabolic risk

The patient has no contraindications to GLP-1 receptor agonist therapy, including:
• No history of medullary thyroid carcinoma or MEN-2
• No pancreatitis or gastroparesis
• No severe renal disease
• No known hypersensitivity

Medical Necessity Rationale for Compounded Therapy:
A compounded GLP-1 formulation is medically appropriate for this patient to allow:
• Gradual dose titration to improve tolerability [if GLP-1 naïve or switching]
• Personalized dosing flexibility
• Adjunctive inclusion of Vitamin B12 or Glycine to support metabolic health

Rationale for B12 or Glycine Additive:
• Vitamin B12: Supports energy metabolism, neurological function, reduces fatigue
• Glycine: Supports GI tolerance, insulin sensitivity, reduces nausea, improves adherence

═══════════════════════════════════════════════════════════════════════════════

P – PLAN:

Medication Plan:
• Initiate compounded GLP-1 receptor agonist therapy ([semaglutide OR tirzepatide]-based compound)
• Include Vitamin B12 or Glycine per pharmacy formulation standards
• Start at [specific starting dose] with gradual titration per protocol

Monitoring & Follow-Up:
• Monitor weight, BMI, appetite, and tolerance
• Assess for common side effects (nausea, constipation, reflux)
• Reinforce hydration, protein intake, and lifestyle adherence
• Follow-up evaluation in 4 weeks or sooner if adverse symptoms occur

Patient Education:
• Reviewed mechanism of GLP-1 therapy
• Discussed risks, benefits, alternatives, and expected outcomes
• Counseled on signs/symptoms requiring medical attention
• Reinforced that medication is adjunct to diet and activity

Disposition:
• Patient is an appropriate candidate for medically supervised weight loss with compounded GLP-1 therapy
• Prescription approved pending pharmacy processing

═══════════════════════════════════════════════════════════════════════════════

Return as valid JSON with keys: subjective, objective, assessment, plan, medicalNecessity`;

  try {
    logger.debug('[OpenAI] Generating SOAP note for patient:', { value: input.patientName });

    // Use retry wrapper for resilience against rate limits
    // 4 retries with exponential backoff: 3s, 6s, 12s, 24s (total ~45s max wait)
    const completion = await withRetry(
      async () => {
        return client.chat.completions.create({
          model: env.OPENAI_MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: env.OPENAI_TEMPERATURE,
          ...getTokenLimitParam(env.OPENAI_MODEL, env.OPENAI_MAX_TOKENS),
          response_format: { type: 'json_object' },
        });
      },
      4,
      3000
    ); // 4 retries, starting at 3 second delay

    const usage = completion.usage;
    const usageMetrics: UsageMetrics = {
      promptTokens: usage?.prompt_tokens || 0,
      completionTokens: usage?.completion_tokens || 0,
      totalTokens: usage?.total_tokens || 0,
      estimatedCost: 0,
    };
    usageMetrics.estimatedCost = calculateCost(usageMetrics);

    // Parse the structured response
    const content = completion.choices[0].message.content || '{}';
    const parsed = JSON.parse(content);

    logger.debug('[OpenAI] SOAP note generated successfully. Tokens used:', {
      value: usageMetrics.totalTokens,
    });

    // Helper function to ensure fields are strings
    const ensureString = (field: unknown): string => {
      if (typeof field === 'string') return field;
      if (typeof field === 'object' && field !== null) {
        // If field is an object, convert it to a formatted string
        return Object.entries(field)
          .map(([key, value]) => {
            // Convert camelCase to Title Case
            const title = key.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase());
            return `${title}: ${value}`;
          })
          .join('\n');
      }
      return field?.toString() || '';
    };

    // POST-PROCESS: Replace placeholders with REAL patient data
    // This is CRITICAL - without this, AI-hallucinated names would appear in medical records!
    const replacePatientPlaceholders = (text: string): string => {
      let result = text;

      // Replace name placeholder with real patient name
      result = result.replace(new RegExp(PLACEHOLDER_NAME, 'gi'), input.patientName);

      // Replace age placeholder with real calculated age
      if (realAge !== null) {
        result = result.replace(new RegExp(PLACEHOLDER_AGE, 'gi'), String(realAge));
      }

      // SAFETY: Also catch common AI hallucinations - generic names the AI might use
      // if it ignores our placeholder instructions
      const commonHallucinatedNames = [
        'Lisa',
        'John',
        'Jane',
        'Patient',
        'Mr.',
        'Mrs.',
        'Ms.',
        'the patient',
        'This patient',
        'The individual',
      ];

      // Extract patient first name for targeted replacement
      const patientFirstName = input.patientName.split(' ')[0];

      // Only replace at the START of subjective narratives to avoid over-replacement
      // Pattern: "Name, a XX-year-old" at the start of text
      const nameAgePattern = /^([A-Z][a-z]+),?\s+a\s+(\d{1,3})-year-old/i;
      const match = result.match(nameAgePattern);
      if (match) {
        const foundName = match[1];
        const foundAge = match[2];

        // If the found name is NOT our patient's name, replace it
        if (foundName.toLowerCase() !== patientFirstName.toLowerCase()) {
          logger.warn('[SOAP] Detected AI-hallucinated name, replacing', {
            hallucinated: foundName,
            correct: patientFirstName,
          });
          result = result.replace(
            nameAgePattern,
            `${patientFirstName}, a ${realAge !== null ? realAge : foundAge}-year-old`
          );
        }
        // If the age is wrong but name is right, fix the age
        else if (realAge !== null && foundAge !== String(realAge)) {
          logger.warn('[SOAP] Detected wrong age, correcting', {
            wrong: foundAge,
            correct: realAge,
          });
          result = result.replace(nameAgePattern, `${foundName}, a ${realAge}-year-old`);
        }
      }

      return result;
    };

    logger.info('[SOAP] Post-processing to inject real patient data', {
      patientName: input.patientName,
      age: realAge,
    });

    return {
      subjective: replacePatientPlaceholders(ensureString(parsed.subjective) || ''),
      objective: replacePatientPlaceholders(ensureString(parsed.objective) || ''),
      assessment: replacePatientPlaceholders(ensureString(parsed.assessment) || ''),
      plan: replacePatientPlaceholders(ensureString(parsed.plan) || ''),
      medicalNecessity: replacePatientPlaceholders(ensureString(parsed.medicalNecessity) || ''),
      metadata: {
        generatedAt: new Date(),
        intakeId: input.intakeData.submissionId as string | undefined,
        usage: usageMetrics,
      },
    };
  } catch (error: unknown) {
    const err = error as { message?: string; status?: number; code?: string };
    const errorMessage = err.message || String(error);
    logger.error('[OpenAI] Error generating SOAP note:', {
      error: errorMessage,
      status: err.status,
    });

    // Handle specific OpenAI error codes
    if (err.status === 429) {
      throw new Error('OpenAI API is busy. Please wait 30 seconds and try again.');
    }
    if (err.status === 401) {
      throw new Error('Invalid OpenAI API key. Please contact support.');
    }
    if (err.status === 500 || err.status === 502 || err.status === 503) {
      throw new Error(
        'OpenAI service is temporarily unavailable. Please try again in a few minutes.'
      );
    }
    if (err.code === 'insufficient_quota') {
      throw new Error('OpenAI quota exceeded. Please contact support to upgrade the plan.');
    }

    // Check if it's our internal rate limiter
    if (errorMessage.includes('Internal rate limit')) {
      throw new Error(errorMessage);
    }

    throw new Error(`Failed to generate SOAP note: ${errorMessage}`);
  }
}

/**
 * Generate SOAP note for peptide therapy (sermorelin, BPC-157, etc.)
 * Separate from GLP-1 weight management to produce clinically accurate notes.
 */
async function generatePeptideSOAPNote(
  anonymizedInput: {
    intakeData: Record<string, unknown>;
    patientName: string;
    patientAge: string;
    dateOfBirth: string;
    chiefComplaint?: string;
  },
  originalInput: SOAPGenerationInput,
  PLACEHOLDER_NAME: string,
  PLACEHOLDER_AGE: string,
  realAge: number | null,
  client: OpenAI,
  env: { OPENAI_MODEL: string; OPENAI_TEMPERATURE: number; OPENAI_MAX_TOKENS: number }
): Promise<SOAPNote> {
  const systemPrompt = `You are a licensed prescribing provider (MD/DO/NP/PA) creating a comprehensive SOAP note for a telehealth peptide therapy evaluation.

You must generate a professional, clinical-grade SOAP note for peptide therapy evaluation (sermorelin/growth hormone secretagogue therapy).

CRITICAL: Return your response in JSON format with ALL fields as plain text STRINGS. Each field should be detailed and formatted professionally:

{
  "subjective": "Detailed narrative of patient's symptoms, wellness goals, peptide therapy interest, previous peptide experience, current medications, and treatment expectations",
  "objective": "Anthropometrics (height, weight, BMI), vital signs, activity level, complete medical/surgical history, current medications, allergies, relevant lab work, peptide therapy history",
  "assessment": "Clinical assessment of candidacy for peptide therapy, symptom evaluation, contraindication screening, medical necessity rationale for sermorelin or selected peptide",
  "plan": "Peptide prescription plan (specific compound, dosing, administration), monitoring schedule, lab work orders, follow-up plan, patient education",
  "medicalNecessity": "Detailed rationale for peptide therapy including: symptom-based clinical indication, age-related hormone decline, expected therapeutic benefits, why this specific peptide is appropriate"
}

Common Peptide Therapy Indications:
- Growth hormone deficiency symptoms (fatigue, decreased muscle mass, increased body fat, poor sleep, slow recovery)
- Age-related decline in growth hormone production
- Performance and recovery optimization
- Anti-aging and cellular regeneration
- Immune function support

Sermorelin-Specific Information:
- Growth hormone releasing hormone (GHRH) analog
- Stimulates natural GH production from pituitary
- Typical starting dose: 200-300 mcg/day subcutaneous injection at bedtime
- Contraindications: active malignancy, pregnancy/nursing, hypersensitivity
- Monitor: IGF-1 levels, CBC, metabolic panel

DO NOT return nested objects. Each field must be a comprehensive plain text string.
DO NOT reference GLP-1, semaglutide, tirzepatide, or weight loss medications — this is peptide therapy, not weight management.`;

  const userPrompt = `Create a professional TELEHEALTH PEPTIDE THERAPY EVALUATION SOAP note for this patient.

IMPORTANT: Use these EXACT placeholders in your response - they will be replaced with real data:
- For patient name, use exactly: ${PLACEHOLDER_NAME}
- For patient age, use exactly: ${PLACEHOLDER_AGE}

Patient Reference: ${PLACEHOLDER_NAME}
Patient Age: ${PLACEHOLDER_AGE}
DOB Reference: ${anonymizedInput.dateOfBirth || 'See intake data'}

INTAKE FORM DATA:
${JSON.stringify(anonymizedInput.intakeData, null, 2)}

Generate a comprehensive clinical SOAP note following this exact structure:

═══════════════════════════════════════════════════════════════════════════════

S – SUBJECTIVE:
Write a detailed narrative paragraph covering:
- Start with: "${PLACEHOLDER_NAME}, a ${PLACEHOLDER_AGE}-year-old [sex from intake], presents for evaluation of peptide therapy."
- Current symptoms the patient is experiencing (fatigue, decreased energy, poor recovery, sleep issues, etc.)
- Interest in peptide therapy (sermorelin or whichever peptide they selected)
- Goals for therapy (anti-aging, performance, recovery, muscle preservation, etc.)
- Previous peptide experience (if any)
- Activity level and lifestyle factors
- Current medications and supplements
- Relevant medical history
- Denial statements for contraindications: active cancer, pregnancy, known hypersensitivity to GHRH analogs
- Patient's stated goals and expectations
- Consent to telehealth treatment

═══════════════════════════════════════════════════════════════════════════════

O – OBJECTIVE:
Format with bullet points and sections:

Anthropometrics:
• Height: [from intake]
• Weight: [from intake] lbs
• BMI: [calculate] kg/m² ([Classification])

Vital Signs (Self-Reported):
• Blood Pressure: [if provided or "Normal" if not specified]

Activity Level:
• [from intake]

Medical History:
• [list relevant conditions or "No significant medical history reported"]

Surgical History:
• [list or "Denies prior surgeries"]

Medications:
• [list current medications or "None reported"]

Allergies:
• [list or "No known drug allergies (NKDA)"]

Relevant Lab Work:
• [if provided from intake or "Baseline labs to be ordered"]

Peptide Therapy History:
• [Previous peptide use or "No prior peptide therapy"]

═══════════════════════════════════════════════════════════════════════════════

A – ASSESSMENT:

Clinical Assessment:
The patient presents for evaluation of peptide therapy based on reported symptoms consistent with:
• [Relevant symptoms from intake - fatigue, decreased muscle mass, poor recovery, etc.]
• Age-related decline in growth hormone production
• Clinical indication for growth hormone secretagogue therapy

The patient has no contraindications to peptide therapy, including:
• No active malignancy or history of cancer requiring active treatment
• Not pregnant or nursing
• No known hypersensitivity to GHRH analogs
• No uncontrolled diabetes

Medical Necessity Rationale:
Peptide therapy (sermorelin) is medically appropriate for this patient to:
• Address symptoms of age-related growth hormone decline
• Support natural GH production through pituitary stimulation
• [Specific goals from intake: recovery, anti-aging, performance, etc.]

═══════════════════════════════════════════════════════════════════════════════

P – PLAN:

Medication Plan:
• Initiate sermorelin [or selected peptide] therapy
• Starting dose: [appropriate starting dose based on patient profile]
• Administration: Subcutaneous injection at bedtime
• Duration: Initial 3-month trial with reassessment

Monitoring & Follow-Up:
• Order baseline labs: IGF-1, CBC, CMP, thyroid panel
• Reassess symptoms and lab values at 6-8 weeks
• Monitor for side effects (injection site reactions, headache, flushing)
• Follow-up evaluation in 4-6 weeks or sooner if adverse symptoms occur

Patient Education:
• Reviewed mechanism of peptide therapy (GHRH stimulation of natural GH production)
• Discussed expected timeline for results (4-12 weeks for noticeable improvement)
• Counseled on proper injection technique, storage, and administration timing
• Advised on complementary lifestyle factors (sleep hygiene, exercise, nutrition)
• Reviewed potential side effects and when to seek medical attention

Disposition:
• Patient is an appropriate candidate for peptide therapy based on clinical evaluation
• Prescription approved pending pharmacy processing

═══════════════════════════════════════════════════════════════════════════════

Return as valid JSON with keys: subjective, objective, assessment, plan, medicalNecessity`;

  try {
    const completion = await withRetry(
      async () => {
        return client.chat.completions.create({
          model: env.OPENAI_MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: env.OPENAI_TEMPERATURE,
          ...getTokenLimitParam(env.OPENAI_MODEL, env.OPENAI_MAX_TOKENS),
          response_format: { type: 'json_object' },
        });
      },
      4,
      3000
    );

    const usage = completion.usage;
    const usageMetrics: UsageMetrics = {
      promptTokens: usage?.prompt_tokens || 0,
      completionTokens: usage?.completion_tokens || 0,
      totalTokens: usage?.total_tokens || 0,
      estimatedCost: 0,
    };
    usageMetrics.estimatedCost = calculateCost(usageMetrics);

    const content = completion.choices[0].message.content || '{}';
    const parsed = JSON.parse(content);

    const ensureString = (field: unknown): string => {
      if (typeof field === 'string') return field;
      if (typeof field === 'object' && field !== null) {
        return Object.entries(field)
          .map(([key, value]) => {
            const title = key.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase());
            return `${title}: ${value}`;
          })
          .join('\n');
      }
      return field?.toString() || '';
    };

    const replacePatientPlaceholders = (text: string): string => {
      let result = text;
      result = result.replace(new RegExp(PLACEHOLDER_NAME, 'gi'), originalInput.patientName);
      if (realAge !== null) {
        result = result.replace(new RegExp(PLACEHOLDER_AGE, 'gi'), String(realAge));
      }
      const patientFirstName = originalInput.patientName.split(' ')[0];
      const nameAgePattern = /^([A-Z][a-z]+),?\s+a\s+(\d{1,3})-year-old/i;
      const match = result.match(nameAgePattern);
      if (match) {
        const foundName = match[1];
        const foundAge = match[2];
        if (foundName.toLowerCase() !== patientFirstName.toLowerCase()) {
          result = result.replace(
            nameAgePattern,
            `${patientFirstName}, a ${realAge !== null ? realAge : foundAge}-year-old`
          );
        } else if (realAge !== null && foundAge !== String(realAge)) {
          result = result.replace(nameAgePattern, `${foundName}, a ${realAge}-year-old`);
        }
      }
      return result;
    };

    logger.info('[SOAP] Post-processing peptide therapy SOAP to inject real patient data', {
      patientName: originalInput.patientName,
      age: realAge,
    });

    return {
      subjective: replacePatientPlaceholders(ensureString(parsed.subjective) || ''),
      objective: replacePatientPlaceholders(ensureString(parsed.objective) || ''),
      assessment: replacePatientPlaceholders(ensureString(parsed.assessment) || ''),
      plan: replacePatientPlaceholders(ensureString(parsed.plan) || ''),
      medicalNecessity: replacePatientPlaceholders(ensureString(parsed.medicalNecessity) || ''),
      metadata: {
        generatedAt: new Date(),
        intakeId: originalInput.intakeData.submissionId as string | undefined,
        usage: usageMetrics,
      },
    };
  } catch (error: unknown) {
    const err = error as { message?: string; status?: number; code?: string };
    const errorMessage = err.message || String(error);
    logger.error('[OpenAI] Error generating peptide therapy SOAP note:', {
      error: errorMessage,
      status: err.status,
    });

    if (err.status === 429) {
      throw new Error('OpenAI API is busy. Please wait 30 seconds and try again.');
    }
    if (err.status === 401) {
      throw new Error('Invalid OpenAI API key. Please contact support.');
    }
    if (err.status === 500 || err.status === 502 || err.status === 503) {
      throw new Error(
        'OpenAI service is temporarily unavailable. Please try again in a few minutes.'
      );
    }
    if (err.code === 'insufficient_quota') {
      throw new Error('OpenAI quota exceeded. Please contact support to upgrade the plan.');
    }
    throw new Error(`Failed to generate peptide therapy SOAP note: ${errorMessage}`);
  }
}

/**
 * Patient Query Assistant
 */
export interface PatientQueryInput {
  query: string;
  patientContext?: Record<string, unknown>;
  conversationHistory?: Array<{ role: string; content: string }>;
}

export interface QueryResponse {
  answer: string;
  citations?: string[];
  confidence: number;
  usage?: UsageMetrics;
}

export async function queryPatientData(input: PatientQueryInput): Promise<QueryResponse> {
  await rateLimiter.checkLimit();

  const client = getOpenAIClient();
  const env = envSchema.parse({
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
    OPENAI_TEMPERATURE: 0.3, // Lower temperature for factual queries
    OPENAI_MAX_TOKENS: process.env.OPENAI_MAX_TOKENS,
  });

  // Detect query category and build appropriate knowledge context
  const queryCategory = detectQueryCategory(input.query);
  const knowledgeContext = buildKnowledgeContext(queryCategory);

  logger.debug('[BeccaAI] Query categorized', {
    query: input.query.substring(0, 50),
    category: queryCategory,
  });

  // Build the system prompt with relevant knowledge context
  const systemPrompt = `${BECCA_SYSTEM_PROMPT}

## RELEVANT KNOWLEDGE FOR THIS QUERY
Category: ${queryCategory}

${knowledgeContext}

ADDITIONAL INSTRUCTIONS FOR PATIENT DATA QUERIES:
- When asked about patient counts or statistics, provide the exact numbers from the data
- When asked about a specific patient's information, provide the exact information if found
- If a patient is not found by name, ALWAYS suggest similar patients if any were found
- If similar patients exist, list them and ask "Did you mean one of these?"
- Never just say "not found" without offering alternatives or suggestions
- Format dates in a readable way (e.g., "March 15, 1990")
- Calculate age from date of birth when relevant
- All patient data is scoped to the user's clinic only

FORMATTING REMINDER - CRITICAL:
- DO NOT use any markdown formatting (no ##, **, *, _, etc.)
- Use plain text with simple dashes (-) for bullets
- Use numbers (1. 2. 3.) for numbered lists
- Keep responses clean and readable without special formatting`;

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
  ];

  // Add conversation history if provided
  if (input.conversationHistory && input.conversationHistory.length > 0) {
    input.conversationHistory.forEach((msg) => {
      const role = msg.role as 'user' | 'assistant' | 'system';
      messages.push({ role, content: msg.content });
    });
  }

  // Format patient context based on type
  let contextDescription = 'No patient data provided.';
  if (input.patientContext) {
    const context = input.patientContext;

    if (context.type === 'patient_found') {
      // Type definitions for context data
      interface PatientSummary {
        patientId: number;
        name: string;
        age: number | null;
        gender: string;
        orderCount: number;
        documentCount: number;
      }
      interface OrderData {
        id: number;
        status: string | null;
        shippingStatus: string | null;
        trackingNumber: string | null;
        trackingUrl: string | null;
        primaryMedName: string | null;
        rxs?: Array<{ medName: string; strength: string; quantity: string; sig: string }>;
        createdAt: Date;
      }
      interface DocumentData {
        category: string;
        filename: string;
        createdAt: Date;
      }
      interface SoapNoteData {
        subjective: string;
        objective: string;
        assessment: string;
        plan: string;
        status: string;
        createdAt: Date;
      }
      interface TrackingInfo {
        orderId: number;
        medication: string;
        status: string | null;
        shippingStatus: string | null;
        trackingNumber: string;
        trackingUrl: string | null;
      }
      interface ShippingUpdate {
        carrier: string;
        trackingNumber: string;
        status: string;
        statusDetail?: string;
        estimatedDelivery?: Date;
        deliveredAt?: Date;
      }
      interface PatientContext {
        orders?: OrderData[];
        documents?: DocumentData[];
        soapNotes?: SoapNoteData[];
      }

      const summary = context.summary as PatientSummary;
      // Format patient data for AI - include operational data (tracking, etc.)
      // Note: Patient name is already known to the user, so we include it for context
      const patientAge = summary.age !== null ? summary.age + ' years old' : 'Unknown';
      const patientGender = summary.gender || 'Not specified';

      const patientCtx = context.patient as PatientContext | undefined;

      // Include full order details with tracking numbers (tracking is operational, not PHI)
      const ordersWithDetails = (patientCtx?.orders || []).map((order) => ({
        orderId: order.id,
        status: order.status,
        shippingStatus: order.shippingStatus,
        trackingNumber: order.trackingNumber || 'Not yet assigned',
        trackingUrl: order.trackingUrl,
        medication: order.primaryMedName || order.rxs?.[0]?.medName || 'Unknown medication',
        prescriptions: order.rxs?.map((rx) => ({
          name: rx.medName,
          strength: rx.strength,
          quantity: rx.quantity,
          sig: rx.sig,
        })),
        createdAt: order.createdAt ? new Date(order.createdAt).toLocaleDateString() : 'Unknown',
      }));

      // Include document categories
      const documents = (patientCtx?.documents || []).map((doc) => ({
        category: doc.category,
        filename: doc.filename,
        createdAt: doc.createdAt ? new Date(doc.createdAt).toLocaleDateString() : 'Unknown',
      }));

      // Include SOAP notes with actual clinical content (this is for provider use)
      const soapNotes = (patientCtx?.soapNotes || []).map((note) => ({
        date: note.createdAt ? new Date(note.createdAt).toLocaleDateString() : 'Unknown',
        subjective: note.subjective || 'Not recorded',
        objective: note.objective || 'Not recorded',
        assessment: note.assessment || 'Not recorded',
        plan: note.plan || 'Not recorded',
        status: note.status,
      }));

      // Include tracking information
      const trackingInfo = (context.tracking as TrackingInfo[] | undefined) || [];
      const shippingUpdates = (context.shippingUpdates as ShippingUpdate[] | undefined) || [];

      // Include vitals/health data
      interface VitalsData {
        latestWeight?: {
          weight: number;
          unit: string;
          recordedAt: Date;
        };
        fromIntake?: {
          weight?: string;
          height?: string;
          bloodPressure?: string;
          bmi?: string;
        };
      }
      const vitals = (context.vitals as VitalsData | undefined) || {};
      const latestWeight = vitals?.latestWeight;
      const intakeVitals = vitals?.fromIntake;

      // Build comprehensive context description
      let vitalsSection = '';
      if (latestWeight || intakeVitals) {
        vitalsSection = `\nVitals and Health Data:`;
        if (latestWeight) {
          vitalsSection += `\n- Latest Recorded Weight: ${latestWeight.weight} ${latestWeight.unit} (recorded ${new Date(latestWeight.recordedAt).toLocaleDateString()})`;
        }
        if (intakeVitals) {
          if (intakeVitals.weight)
            vitalsSection += `\n- Weight from Intake: ${intakeVitals.weight}`;
          if (intakeVitals.height)
            vitalsSection += `\n- Height from Intake: ${intakeVitals.height}`;
          if (intakeVitals.bloodPressure)
            vitalsSection += `\n- Blood Pressure: ${intakeVitals.bloodPressure}`;
          if (intakeVitals.bmi) vitalsSection += `\n- BMI: ${intakeVitals.bmi}`;
        }
      }

      let trackingSection = '';
      if (trackingInfo && trackingInfo.length > 0) {
        trackingSection = `\nTracking Information:`;
        trackingInfo.forEach((t) => {
          trackingSection += `\n- Order #${t.orderId}: ${t.medication}`;
          trackingSection += `\n  Status: ${t.status || 'Unknown'}, Shipping: ${t.shippingStatus || 'Pending'}`;
          trackingSection += `\n  Tracking Number: ${t.trackingNumber}`;
          if (t.trackingUrl) trackingSection += `\n  Tracking URL: ${t.trackingUrl}`;
        });
      }

      if (shippingUpdates && shippingUpdates.length > 0) {
        trackingSection += `\nShipping Updates:`;
        shippingUpdates.forEach((s) => {
          trackingSection += `\n- ${s.carrier}: ${s.trackingNumber}`;
          trackingSection += `\n  Status: ${s.status}${s.statusDetail ? ` - ${s.statusDetail}` : ''}`;
          if (s.estimatedDelivery)
            trackingSection += `\n  Estimated Delivery: ${new Date(s.estimatedDelivery).toLocaleDateString()}`;
          if (s.deliveredAt)
            trackingSection += `\n  Delivered: ${new Date(s.deliveredAt).toLocaleDateString()}`;
        });
      }

      contextDescription = `Patient Found: ${summary.name}
Patient ID: ${summary.patientId}
Age: ${patientAge}
Gender: ${patientGender}
Total Orders: ${summary.orderCount}
Total Documents: ${summary.documentCount}
${vitalsSection}
${trackingSection}

Recent Orders (${ordersWithDetails.length}):
${JSON.stringify(ordersWithDetails, null, 2)}

Documents (${documents.length}):
${JSON.stringify(documents, null, 2)}

SOAP Notes (${soapNotes.length}):
${JSON.stringify(soapNotes, null, 2)}`;
    } else if (context.type === 'patient_not_found') {
      // Include similar patient names so AI can suggest them
      const suggestions = (context.suggestions as string[]) || [];
      const searchedName = context.searchedName || 'unknown';
      const message = context.message || 'Patient not found';

      contextDescription = `Patient Not Found:
Searched for: "${searchedName}"
Result: ${message}

${
  suggestions.length > 0
    ? `Similar patients found that might match:
${suggestions.map((s: string, i: number) => `${i + 1}. ${s}`).join('\n')}

IMPORTANT: Suggest these similar patients to the user and ask if they meant one of them.`
    : 'No similar patients found in the system.'
}`;
    } else if (context.statistics) {
      interface Statistics {
        totalPatients: number;
        totalOrders?: number;
        totalProviders?: number;
      }
      const stats = context.statistics as Statistics;
      // HIPAA: Only send aggregate statistics, no individual patient data
      contextDescription = `Platform Statistics:
Total Patients: ${stats.totalPatients}
${stats.totalOrders ? `Total Orders: ${stats.totalOrders}` : ''}
${stats.totalProviders ? `Total Providers: ${stats.totalProviders}` : ''}`;
    } else if (context.type === 'tracking_search') {
      contextDescription = `Tracking Information:
${JSON.stringify(context.results, null, 2)}`;
    } else if (context.type === 'prescription_search') {
      contextDescription = `Prescription Information:
${JSON.stringify(context.results, null, 2)}`;
    } else if (context.type === 'activity_summary') {
      contextDescription = `Today's Activity:
New Patients Today: ${context.todayPatients}
Pending Orders: ${context.pendingOrders}
Recent Intakes: ${context.recentIntakes}`;
    } else if (context.type === 'general_info') {
      interface GeneralInfoContext {
        type: 'general_info';
        statistics?: { totalPatients?: number; totalOrders?: number; totalProviders?: number };
      }
      const generalCtx = context as unknown as GeneralInfoContext;
      contextDescription = `Platform Statistics:
Total Patients: ${generalCtx.statistics?.totalPatients || 0}
Total Orders: ${generalCtx.statistics?.totalOrders || 0}
Total Providers: ${generalCtx.statistics?.totalProviders || 0}`;
    } else if (context.type === 'knowledge_query') {
      // Knowledge-based query - no patient data needed
      contextDescription = `This is a clinical/operational knowledge question.
Query Category: ${context.category}
${context.message}

Answer this question using your knowledge base about GLP-1 medications,
dosing protocols, clinical guidelines, SOAP notes, prescription SIGs,
and platform operations. No patient data search was performed.`;
    } else {
      contextDescription = JSON.stringify(input.patientContext, null, 2);
    }
  }

  // Add current query with context
  const userMessage = `Query: ${input.query}

Available Data:
${contextDescription}

Please provide a clear, accurate answer based on the available information. If asked for counts or statistics, provide the exact numbers.`;

  messages.push({ role: 'user', content: userMessage });

  try {
    logger.debug('[OpenAI] Processing patient query:', { value: input.query });

    const completion = await client.chat.completions.create({
      model: env.OPENAI_MODEL,
      messages,
      temperature: env.OPENAI_TEMPERATURE,
      ...getTokenLimitParam(env.OPENAI_MODEL, 1000), // Shorter responses for queries
    });

    const usage = completion.usage;
    const usageMetrics: UsageMetrics = {
      promptTokens: usage?.prompt_tokens || 0,
      completionTokens: usage?.completion_tokens || 0,
      totalTokens: usage?.total_tokens || 0,
      estimatedCost: 0,
    };
    usageMetrics.estimatedCost = calculateCost(usageMetrics);

    const answer = completion.choices[0].message.content || 'Unable to process query';

    logger.debug('[OpenAI] Query processed successfully. Tokens used:', {
      value: usageMetrics.totalTokens,
    });

    return {
      answer,
      confidence: 0.95, // Can be calculated based on response
      usage: usageMetrics,
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[OpenAI] Error processing query:', {
      error: errorMessage,
      status: (error as any).status,
      code: (error as any).code,
      type: (error as any).type,
    });

    // Preserve OpenAI context in error message for proper handling upstream
    if ((error as any).status === 429) {
      throw new Error('OpenAI rate limit exceeded. Please wait a moment and try again.');
    }
    if ((error as any).status === 401) {
      throw new Error('OpenAI API key is invalid or not configured.');
    }
    if (
      (error as any).status === 500 ||
      (error as any).status === 502 ||
      (error as any).status === 503
    ) {
      throw new Error('OpenAI service is temporarily unavailable. Please try again later.');
    }
    if ((error as any).code === 'insufficient_quota') {
      throw new Error('OpenAI quota exceeded. Please contact support.');
    }

    // Include OpenAI in message so route handler can identify the source
    throw new Error(`OpenAI query failed: ${errorMessage}`);
  }
}

/**
 * Prompt Templates for specific use cases
 */
export const PromptTemplates = {
  /**
   * Extract structured data from unstructured intake text
   */
  extractIntakeData: (text: string) => `
Extract the following information from the intake form text:
- Patient Name
- Date of Birth
- Chief Complaint
- Medical History
- Current Medications
- Allergies
- Vital Signs (if available)

Text:
${text}

Return as structured JSON.
`,

  /**
   * Generate medication instructions
   */
  generateSIG: (medication: string, condition: string) => `
Generate clear patient instructions (SIG) for:
Medication: ${medication}
Condition: ${condition}

Provide dosage, frequency, route, and any special instructions.
`,

  /**
   * Summarize patient history
   */
  summarizeHistory: (history: any[]) => `
Provide a concise summary of the patient's medical history including:
- Key diagnoses
- Previous treatments
- Relevant procedures
- Important medications

History: ${JSON.stringify(history, null, 2)}
`,
};

/**
 * Export usage tracking for monitoring
 */
export async function getUsageStats(): Promise<{
  requestsThisMinute: number;
  estimatedCostToday: number;
}> {
  // This would typically query a database for actual usage
  return {
    requestsThisMinute: rateLimiter['requests'].length,
    estimatedCostToday: 0, // Implement actual tracking
  };
}

/**
 * Generate a brief clinical summary for drug interaction / allergy cross-check results.
 * Uses gpt-4o-mini for speed and cost. No PHI is included — only drug/allergy names.
 */
export async function generateClinicalSummary(prompt: string): Promise<string> {
  const client = getOpenAIClient();
  const env = envSchema.parse({
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_ORG_ID: process.env.OPENAI_ORG_ID,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
    OPENAI_TEMPERATURE: process.env.OPENAI_TEMPERATURE,
    OPENAI_MAX_TOKENS: process.env.OPENAI_MAX_TOKENS,
  });

  const model = 'gpt-4o-mini';
  const response = await client.chat.completions.create({
    model,
    messages: [
      {
        role: 'system',
        content:
          'You are a clinical pharmacist assistant. Provide brief, accurate drug interaction and allergy safety summaries for healthcare providers. Be concise (2-3 sentences). Do not include disclaimers.',
      },
      { role: 'user', content: prompt },
    ],
    temperature: 0.3,
    ...getTokenLimitParam(model, 300),
  });

  return response.choices[0]?.message?.content?.trim() ?? '';
}
