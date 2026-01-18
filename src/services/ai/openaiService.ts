import OpenAI from 'openai';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { AppError, ApiResponse } from '@/types/common';
import { Patient, Provider, Order } from '@/types/models';
import { anonymizeObject, anonymizeName, logAnonymization } from '@/lib/security/phi-anonymization';

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
 * Initialize OpenAI client lazily to prevent build-time failures
 */
function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    const env = envSchema.parse({
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      OPENAI_ORG_ID: process.env.OPENAI_ORG_ID,
      OPENAI_MODEL: process.env.OPENAI_MODEL,
      OPENAI_TEMPERATURE: process.env.OPENAI_TEMPERATURE,
      OPENAI_MAX_TOKENS: process.env.OPENAI_MAX_TOKENS,
    });

    openaiClient = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
      organization: env.OPENAI_ORG_ID,
      maxRetries: 3,
      timeout: 60000, // 60 seconds
    });
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
      logger.warn(`[OpenAI] Rate limited, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, delay));
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
    chiefComplaint: input.chiefComplaint // Chief complaint is generally not PHI
  };
  
  // Log the anonymization for audit
  logAnonymization(
    0, // System-generated
    'SOAP note generation via OpenAI',
    'Patient intake data'
  );
  
  logger.info('Generating SOAP note with anonymized data', {
    originalPatient: input.patientName,
    anonymizedPatient: anonymizedInput.patientName
  });
  
  const client = getOpenAIClient();
  const env = envSchema.parse({
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
    OPENAI_TEMPERATURE: process.env.OPENAI_TEMPERATURE,
    OPENAI_MAX_TOKENS: process.env.OPENAI_MAX_TOKENS,
  });

  const systemPrompt = `You are a medical professional evaluating patients for weight loss medication eligibility, specifically GLP-1 agonists (semaglutide/tirzepatide).
Analyze the intake form data to determine if the patient is a suitable candidate for weight loss medication.
Focus on BMI, weight loss goals, medical history, contraindications, and previous medication experience.

CRITICAL: You must return your response in JSON format with ALL fields as plain text STRINGS (not objects or arrays):
{
  "subjective": "A single string containing patient's weight loss goals, motivation, symptoms, and medical history",
  "objective": "A single string containing BMI, weight measurements, vital signs, and physical activity level",
  "assessment": "A single string containing evaluation of candidacy for GLP-1 therapy and risk factors",
  "plan": "A single string containing recommended medication, dosing, titration, and follow-up schedule",
  "medicalNecessity": "A single string explaining why compounded GLP-1 with glycine is necessary"
}

DO NOT return nested objects or structured data within these fields. Each field must be a plain text string.`;

  const userPrompt = `Create a weight loss medication evaluation SOAP note for patient: ${anonymizedInput.patientName}
Date of Birth: ${anonymizedInput.dateOfBirth || 'Not provided'}

Intake Form Data:
${JSON.stringify(anonymizedInput.intakeData, null, 2)}

Generate a comprehensive SOAP note in JSON format that includes:

1. SUBJECTIVE: 
- Patient's weight loss motivation and goals (current weight, ideal weight, pounds to lose)
- Medical history relevant to weight management (chronic illnesses, sleep apnea, diabetes, etc.)
- Previous GLP-1 medication experience and side effects
- Activity level and lifestyle factors

2. OBJECTIVE:
- BMI calculation and classification
- Weight measurements (starting weight, ideal weight, pounds to lose)
- Vital signs (blood pressure if provided)
- Physical activity level
- Any contraindications noted (pregnancy, thyroid cancer, MEN-2, gastroparesis)

3. ASSESSMENT:
- Candidacy for GLP-1 therapy based on BMI and health conditions
- Risk stratification (contraindications, precautions)
- Comorbidities that may benefit from treatment (sleep apnea, pre-diabetes)
- Overall suitability for weight loss medication

4. PLAN:
- Recommended GLP-1 medication (semaglutide or tirzepatide) with specific dosing
- Titration schedule (start low, increase gradually)
- Monitoring requirements and side effect management
- Lifestyle modifications (diet, exercise recommendations)
- Follow-up schedule

5. MEDICAL NECESSITY:
- Explain why a compounded GLP-1 with glycine is medically necessary
- Include: need for customized dosing, patient-specific tolerability issues, improved stability with glycine
- Mention limitations of commercial products (fixed doses, pen delivery, excipient sensitivities)

Analyze the actual data provided and create clinically relevant recommendations. Return as valid JSON.`;

  try {
    logger.debug('[OpenAI] Generating SOAP note for patient:', { value: input.patientName });
    
    // Use retry wrapper for resilience against rate limits
    // 4 retries with exponential backoff: 3s, 6s, 12s, 24s (total ~45s max wait)
    const completion = await withRetry(async () => {
      return client.chat.completions.create({
        model: env.OPENAI_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: env.OPENAI_TEMPERATURE,
        max_tokens: env.OPENAI_MAX_TOKENS,
        response_format: { type: 'json_object' },
      });
    }, 4, 3000); // 4 retries, starting at 3 second delay

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

    logger.debug('[OpenAI] SOAP note generated successfully. Tokens used:', { value: usageMetrics.totalTokens });

    // Helper function to ensure fields are strings
    const ensureString = (field: unknown): string => {
      if (typeof field === 'string') return field;
      if (typeof field === 'object' && field !== null) {
        // If field is an object, convert it to a formatted string
        return Object.entries(field)
          .map(([key, value]) => {
            // Convert camelCase to Title Case
            const title = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
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
    logger.error('[OpenAI] Error generating SOAP note:', { error: errorMessage, status: error.status });
    
    // Handle specific OpenAI error codes
    if (error.status === 429) {
      throw new Error('OpenAI API is busy. Please wait 30 seconds and try again.');
    }
    if (error.status === 401) {
      throw new Error('Invalid OpenAI API key. Please contact support.');
    }
    if (error.status === 500 || error.status === 502 || error.status === 503) {
      throw new Error('OpenAI service is temporarily unavailable. Please try again in a few minutes.');
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

  const systemPrompt = `You are Becca AI, a medical assistant helping healthcare providers access patient information.
You have access to patient data and can answer questions about demographics, prescriptions, tracking information, and medical history.

IMPORTANT INSTRUCTIONS:
1. When asked about patient counts or statistics, provide the exact numbers from the data
2. When asked about a specific patient's information (like date of birth), provide the exact information if found
3. If a patient is not found by name, suggest checking the spelling or provide similar patients if available
4. Always be accurate, concise, and helpful
5. Format dates in a readable way (e.g., "March 15, 1990" instead of ISO format)
6. Calculate age from date of birth when relevant
7. Maintain HIPAA compliance and patient privacy at all times

Response Guidelines:
- For patient demographics: Provide name, DOB, age, gender, contact information
- For statistics: Give exact counts (e.g., "There are 42 patients in the system")
- For not found: Clearly state the patient wasn't found and suggest alternatives
- For tracking info: Provide tracking numbers with associated patient names
- For prescriptions: List medications with dosages and patient names`;

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
      contextDescription = `Patient Found:
Name: ${summary.name}
Date of Birth: ${summary.dateOfBirth || 'Not provided'}
Age: ${summary.age !== null ? summary.age + ' years old' : 'Unknown'}
Gender: ${summary.gender || 'Not specified'}
Phone: ${summary.phone || 'Not provided'}
Email: ${summary.email || 'Not provided'}
Address: ${summary.address}
Total Orders: ${summary.orderCount}
Total Documents: ${summary.documentCount}

Recent Orders: ${JSON.stringify((context.patient as any)?.orders || [], null, 2)}
Recent Documents: ${JSON.stringify((context.patient as any)?.documents || [], null, 2)}
SOAP Notes: ${JSON.stringify((context.patient as any)?.soapNotes || [], null, 2)}`;
    } else if (context.type === 'patient_not_found') {
      contextDescription = `Patient Not Found:
Searched for: ${context.searchedName}
${context.similarPatients ? `Similar patients found: ${JSON.stringify(context.similarPatients, null, 2)}` : 'No similar patients found'}`;
    } else if (context.statistics) {
      const stats = context.statistics as any;
      contextDescription = `Platform Statistics:
Total Patients: ${stats.totalPatients}
${stats.totalOrders ? `Total Orders: ${stats.totalOrders}` : ''}
${stats.totalProviders ? `Total Providers: ${stats.totalProviders}` : ''}
${stats.recentPatients ? `Recent Patients: ${JSON.stringify(stats.recentPatients, null, 2)}` : ''}`;
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
      max_tokens: 1000, // Shorter responses for queries
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

    logger.debug('[OpenAI] Query processed successfully. Tokens used:', { value: usageMetrics.totalTokens });

    return {
      answer,
      confidence: 0.95, // Can be calculated based on response
      usage: usageMetrics,
    };
  } catch (error: any) {
    // @ts-ignore
   
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[OpenAI] Error processing query:', error);
    
    throw new Error(`Failed to process query: ${errorMessage}`);
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
