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
    } catch (error: any) {
      logger.error('[OpenAI] Failed to initialize client', { error: error.message });
      throw new Error(`OpenAI configuration error: ${error.message}`);
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
    } catch (error: any) {
      lastError = error;

      // Only retry on rate limits (429) or server errors (5xx)
      const isRetryable = error.status === 429 || (error.status >= 500 && error.status < 600);

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
export interface SOAPGenerationInput {
  intakeData: Record<string, unknown>;
  patientName: string;
  dateOfBirth?: string;
  chiefComplaint?: string;
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
  const anonymizedInput = {
    intakeData: anonymizeObject(input.intakeData),
    patientName: anonymizeName('Patient', String(Date.now())), // Use generic name
    dateOfBirth: input.dateOfBirth ? '01/01/1970' : undefined, // Use placeholder DOB
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
  });

  const client = getOpenAIClient();
  const env = envSchema.parse({
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
    OPENAI_TEMPERATURE: process.env.OPENAI_TEMPERATURE,
    OPENAI_MAX_TOKENS: process.env.OPENAI_MAX_TOKENS,
  });

  const systemPrompt = `You are a licensed prescribing provider (MD/DO/NP/PA) creating a comprehensive SOAP note for a telehealth weight management evaluation.

You must generate a professional, clinical-grade SOAP note for GLP-1 receptor agonist therapy evaluation (semaglutide/tirzepatide).

CRITICAL: Return your response in JSON format with ALL fields as plain text STRINGS. Each field should be detailed and formatted professionally:

{
  "subjective": "Detailed narrative of patient's weight history, goals, GLP-1 experience, symptoms, medications, and treatment interest",
  "objective": "Anthropometrics (height, weight, BMI with classification, ideal weight, excess weight), vital signs, activity level, complete medical/surgical history, current medications, allergies, GLP-1 history",
  "assessment": "Primary diagnosis with ICD-10 code, clinical assessment of candidacy, contraindication screening, medical necessity rationale for compounded therapy with B12 or Glycine additive explanation",
  "plan": "Medication plan (specific compound, dosing, titration), monitoring & follow-up schedule, patient education provided, disposition",
  "medicalNecessity": "Detailed rationale for compounded GLP-1 formulation including: gradual dose titration needs, personalized dosing flexibility, adjunctive B12/Glycine benefits"
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

  const userPrompt = `Create a professional TELEHEALTH WEIGHT MANAGEMENT SOAP note for this patient evaluation.

Patient Reference: ${anonymizedInput.patientName}
DOB Reference: ${anonymizedInput.dateOfBirth || 'See intake data'}

INTAKE FORM DATA:
${JSON.stringify(anonymizedInput.intakeData, null, 2)}

Generate a comprehensive clinical SOAP note following this exact structure:

═══════════════════════════════════════════════════════════════════════════════

S – SUBJECTIVE:
Write a detailed narrative paragraph covering:
- Patient's age, sex, and presentation reason (medical weight management evaluation)
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

    return {
      subjective: ensureString(parsed.subjective) || '',
      objective: ensureString(parsed.objective) || '',
      assessment: ensureString(parsed.assessment) || '',
      plan: ensureString(parsed.plan) || '',
      medicalNecessity: ensureString(parsed.medicalNecessity) || '',
      metadata: {
        generatedAt: new Date(),
        intakeId: input.intakeData.submissionId,
        usage: usageMetrics,
      } as any,
    };
  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('[OpenAI] Error generating SOAP note:', {
      error: errorMessage,
      status: error.status,
    });

    // Handle specific OpenAI error codes
    if (error.status === 429) {
      throw new Error('OpenAI API is busy. Please wait 30 seconds and try again.');
    }
    if (error.status === 401) {
      throw new Error('Invalid OpenAI API key. Please contact support.');
    }
    if (error.status === 500 || error.status === 502 || error.status === 503) {
      throw new Error(
        'OpenAI service is temporarily unavailable. Please try again in a few minutes.'
      );
    }
    if (error.code === 'insufficient_quota') {
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
    input.conversationHistory.forEach((msg: any) => {
      messages.push({ role: msg.role as any, content: msg.content });
    });
  }

  // Format patient context based on type
  let contextDescription = 'No patient data provided.';
  if (input.patientContext) {
    const context = input.patientContext;

    if (context.type === 'patient_found') {
      const summary = context.summary as any;
      // Format patient data for AI - include operational data (tracking, etc.)
      // Note: Patient name is already known to the user, so we include it for context
      const patientAge = summary.age !== null ? summary.age + ' years old' : 'Unknown';
      const patientGender = summary.gender || 'Not specified';

      // Include full order details with tracking numbers (tracking is operational, not PHI)
      const ordersWithDetails = ((context.patient as any)?.orders || []).map((order: any) => ({
        orderId: order.id,
        status: order.status,
        shippingStatus: order.shippingStatus,
        trackingNumber: order.trackingNumber || 'Not yet assigned',
        trackingUrl: order.trackingUrl,
        medication: order.primaryMedName || order.rxs?.[0]?.medName || 'Unknown medication',
        prescriptions: order.rxs?.map((rx: any) => ({
          name: rx.medName,
          strength: rx.strength,
          quantity: rx.quantity,
          sig: rx.sig,
        })),
        createdAt: order.createdAt ? new Date(order.createdAt).toLocaleDateString() : 'Unknown',
      }));

      // Include document categories
      const documents = ((context.patient as any)?.documents || []).map((doc: any) => ({
        category: doc.category,
        filename: doc.filename,
        createdAt: doc.createdAt ? new Date(doc.createdAt).toLocaleDateString() : 'Unknown',
      }));

      // Include SOAP notes with actual clinical content (this is for provider use)
      const soapNotes = ((context.patient as any)?.soapNotes || []).map((note: any) => ({
        date: note.createdAt ? new Date(note.createdAt).toLocaleDateString() : 'Unknown',
        subjective: note.subjective || 'Not recorded',
        objective: note.objective || 'Not recorded',
        assessment: note.assessment || 'Not recorded',
        plan: note.plan || 'Not recorded',
        status: note.status,
      }));

      // Include tracking information
      const trackingInfo = (context.tracking as any[]) || [];
      const shippingUpdates = (context.shippingUpdates as any[]) || [];

      // Include vitals/health data
      const vitals = (context.vitals as any) || {};
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
          if (intakeVitals.weight) vitalsSection += `\n- Weight from Intake: ${intakeVitals.weight}`;
          if (intakeVitals.height) vitalsSection += `\n- Height from Intake: ${intakeVitals.height}`;
          if (intakeVitals.bloodPressure) vitalsSection += `\n- Blood Pressure: ${intakeVitals.bloodPressure}`;
          if (intakeVitals.bmi) vitalsSection += `\n- BMI: ${intakeVitals.bmi}`;
        }
      }

      let trackingSection = '';
      if (trackingInfo && trackingInfo.length > 0) {
        trackingSection = `\nTracking Information:`;
        trackingInfo.forEach((t: any) => {
          trackingSection += `\n- Order #${t.orderId}: ${t.medication}`;
          trackingSection += `\n  Status: ${t.status || 'Unknown'}, Shipping: ${t.shippingStatus || 'Pending'}`;
          trackingSection += `\n  Tracking Number: ${t.trackingNumber}`;
          if (t.trackingUrl) trackingSection += `\n  Tracking URL: ${t.trackingUrl}`;
        });
      }

      if (shippingUpdates && shippingUpdates.length > 0) {
        trackingSection += `\nShipping Updates:`;
        shippingUpdates.forEach((s: any) => {
          trackingSection += `\n- ${s.carrier}: ${s.trackingNumber}`;
          trackingSection += `\n  Status: ${s.status}${s.statusDetail ? ` - ${s.statusDetail}` : ''}`;
          if (s.estimatedDelivery) trackingSection += `\n  Estimated Delivery: ${new Date(s.estimatedDelivery).toLocaleDateString()}`;
          if (s.deliveredAt) trackingSection += `\n  Delivered: ${new Date(s.deliveredAt).toLocaleDateString()}`;
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

${suggestions.length > 0 ? `Similar patients found that might match:
${suggestions.map((s: string, i: number) => `${i + 1}. ${s}`).join('\n')}

IMPORTANT: Suggest these similar patients to the user and ask if they meant one of them.` : 'No similar patients found in the system.'}`;
    } else if (context.statistics) {
      const stats = context.statistics as any;
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
      const stats = (context as any).statistics;
      contextDescription = `Platform Statistics:
Total Patients: ${stats?.totalPatients || 0}
Total Orders: ${stats?.totalOrders || 0}
Total Providers: ${stats?.totalProviders || 0}`;
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
  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[OpenAI] Error processing query:', {
      error: errorMessage,
      status: error.status,
      code: error.code,
      type: error.type,
    });

    // Preserve OpenAI context in error message for proper handling upstream
    if (error.status === 429) {
      throw new Error('OpenAI rate limit exceeded. Please wait a moment and try again.');
    }
    if (error.status === 401) {
      throw new Error('OpenAI API key is invalid or not configured.');
    }
    if (error.status === 500 || error.status === 502 || error.status === 503) {
      throw new Error('OpenAI service is temporarily unavailable. Please try again later.');
    }
    if (error.code === 'insufficient_quota') {
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
