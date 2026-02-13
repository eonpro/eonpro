/**
 * AI Scribe - SOAP Note Generation from Transcripts
 *
 * Converts telehealth session transcripts into structured SOAP notes
 * using OpenAI GPT-4 for medical documentation
 */

import OpenAI from 'openai';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/db';
import { TranscriptionSegment } from './transcription.service';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Get the model from env or default
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

/**
 * Check if model requires max_completion_tokens instead of max_tokens
 */
function useMaxCompletionTokens(model: string): boolean {
  const modelLower = model.toLowerCase();
  return (
    modelLower.startsWith('o1') ||
    modelLower.startsWith('o3') ||
    modelLower.includes('o1-') ||
    modelLower.includes('o3-') ||
    (modelLower.includes('gpt-4o') && !modelLower.includes('gpt-4o-mini'))
  );
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

export interface GenerateSOAPFromTranscriptInput {
  transcript: string;
  segments: TranscriptionSegment[];
  patientId: number;
  providerId: number;
  appointmentId?: number;
  visitType?: string;
  chiefComplaint?: string;
  patientContext?: {
    name: string;
    dob: string;
    currentMedications?: string[];
    allergies?: string[];
    conditions?: string[];
    recentVitals?: {
      weight?: number;
      bloodPressure?: string;
      heartRate?: number;
    };
  };
}

export interface GeneratedSOAPNote {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  medicalNecessity?: string;
  icdCodes?: string[];
  cptCodes?: string[];
  followUpRecommendation?: string;
  metadata: {
    transcriptDuration: number;
    wordCount: number;
    generatedAt: Date;
    model: string;
    promptTokens?: number;
    completionTokens?: number;
    estimatedCost?: number;
  };
}

const SOAP_GENERATION_PROMPT = `You are a medical documentation specialist helping to create SOAP notes from telehealth consultation transcripts.

Analyze the following transcript from a medical consultation and generate a comprehensive SOAP note.

Guidelines:
1. SUBJECTIVE: Extract the patient's reported symptoms, concerns, history, and any relevant information they shared. Use direct quotes when appropriate.

2. OBJECTIVE: Document any vitals mentioned, observable findings discussed, test results reviewed, current medications, and relevant physical examination findings mentioned during the call.

3. ASSESSMENT: Provide clinical impressions based on the conversation, include relevant ICD-10 codes if diagnosis is clear, note any differential diagnoses discussed.

4. PLAN: Document the treatment plan discussed, including:
   - Medication changes (new prescriptions, dose adjustments, discontinuations)
   - Follow-up recommendations
   - Tests or labs ordered
   - Referrals made
   - Patient education provided
   - Return visit timing

5. Also provide:
   - Medical Necessity statement for the visit
   - Suggested ICD-10 codes
   - Suggested CPT codes for the encounter
   - Follow-up recommendation

Important:
- Be thorough but concise
- Use medical terminology appropriately
- Note if any information is unclear or missing from the transcript
- Do not fabricate information not present in the transcript
- Mark uncertain findings with appropriate language (e.g., "Patient reports...", "According to patient...")

Return the response as a JSON object with the following structure:
{
  "subjective": "string",
  "objective": "string", 
  "assessment": "string",
  "plan": "string",
  "medicalNecessity": "string",
  "icdCodes": ["string"],
  "cptCodes": ["string"],
  "followUpRecommendation": "string"
}`;

/**
 * Generate SOAP note from transcript using GPT-4
 */
export async function generateSOAPFromTranscript(
  input: GenerateSOAPFromTranscriptInput
): Promise<GeneratedSOAPNote> {
  const startTime = Date.now();

  try {
    // Build context message
    let contextMessage = '';
    if (input.patientContext) {
      contextMessage = `
PATIENT CONTEXT:
- Name: ${input.patientContext.name}
- DOB: ${input.patientContext.dob}
${input.patientContext.currentMedications?.length ? `- Current Medications: ${input.patientContext.currentMedications.join(', ')}` : ''}
${input.patientContext.allergies?.length ? `- Allergies: ${input.patientContext.allergies.join(', ')}` : ''}
${input.patientContext.conditions?.length ? `- Medical Conditions: ${input.patientContext.conditions.join(', ')}` : ''}
${input.patientContext.recentVitals ? `- Recent Vitals: Weight ${input.patientContext.recentVitals.weight || 'N/A'} lbs, BP ${input.patientContext.recentVitals.bloodPressure || 'N/A'}, HR ${input.patientContext.recentVitals.heartRate || 'N/A'}` : ''}
`;
    }

    const visitInfo = input.visitType ? `\nVISIT TYPE: ${input.visitType}` : '';

    const chiefComplaintInfo = input.chiefComplaint
      ? `\nCHIEF COMPLAINT: ${input.chiefComplaint}`
      : '';

    const userMessage = `${contextMessage}${visitInfo}${chiefComplaintInfo}

TRANSCRIPT:
${input.transcript}`;

    const modelToUse = process.env.OPENAI_MODEL || 'gpt-4-turbo-preview';
    const response = await openai.chat.completions.create({
      model: modelToUse,
      messages: [
        {
          role: 'system',
          content: SOAP_GENERATION_PROMPT,
        },
        {
          role: 'user',
          content: userMessage,
        },
      ],
      temperature: 0.3, // Lower temperature for more consistent medical documentation
      ...getTokenLimitParam(modelToUse, 4000),
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI');
    }

    const parsed = JSON.parse(content);

    // Calculate costs (approximate)
    const promptTokens = response.usage?.prompt_tokens || 0;
    const completionTokens = response.usage?.completion_tokens || 0;
    const estimatedCost = promptTokens * 0.00001 + completionTokens * 0.00003; // GPT-4 pricing

    const result: GeneratedSOAPNote = {
      subjective: parsed.subjective || 'No subjective information documented.',
      objective: parsed.objective || 'No objective findings documented.',
      assessment: parsed.assessment || 'Assessment pending review.',
      plan: parsed.plan || 'Plan to be determined.',
      medicalNecessity: parsed.medicalNecessity,
      icdCodes: parsed.icdCodes || [],
      cptCodes: parsed.cptCodes || [],
      followUpRecommendation: parsed.followUpRecommendation,
      metadata: {
        transcriptDuration:
          input.segments.length > 0
            ? input.segments[input.segments.length - 1].endTime - input.segments[0].startTime
            : 0,
        wordCount: input.transcript.split(/\s+/).length,
        generatedAt: new Date(),
        model: response.model,
        promptTokens,
        completionTokens,
        estimatedCost,
      },
    };

    logger.info('SOAP note generated from transcript', {
      patientId: input.patientId,
      duration: `${(Date.now() - startTime) / 1000}s`,
      wordCount: result.metadata.wordCount,
    });

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to generate SOAP from transcript', { error: errorMessage });
    throw new Error(`SOAP generation failed: ${errorMessage}`);
  }
}

/**
 * Save generated SOAP note to database
 */
export async function saveScribeSOAPNote(
  patientId: number,
  providerId: number,
  soapNote: GeneratedSOAPNote,
  appointmentId?: number,
  sessionId?: string
): Promise<any> {
  try {
    const createdNote = await prisma.sOAPNote.create({
      data: {
        patientId,
        subjective: soapNote.subjective,
        objective: soapNote.objective,
        assessment: soapNote.assessment,
        plan: soapNote.plan,
        medicalNecessity: soapNote.medicalNecessity,
        sourceType: 'AI_GENERATED',
        generatedByAI: true,
        aiModelVersion: soapNote.metadata.model,
        status: 'DRAFT',
        promptTokens: soapNote.metadata.promptTokens,
        completionTokens: soapNote.metadata.completionTokens,
        estimatedCost: soapNote.metadata.estimatedCost,
      },
    });

    logger.info('Scribe SOAP note saved', {
      soapNoteId: createdNote.id,
      patientId,
      appointmentId,
    });

    return createdNote;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to save scribe SOAP note', { error: errorMessage });
    throw new Error(`Failed to save SOAP note: ${errorMessage}`);
  }
}

/**
 * Generate summary of conversation for quick review
 */
export async function generateConversationSummary(transcript: string): Promise<{
  summary: string;
  keyPoints: string[];
  actionItems: string[];
  concerns: string[];
}> {
  try {
    const modelToUse = process.env.OPENAI_MODEL || 'gpt-4-turbo-preview';
    const response = await openai.chat.completions.create({
      model: modelToUse,
      messages: [
        {
          role: 'system',
          content: `Analyze this medical consultation transcript and provide:
1. A brief 2-3 sentence summary
2. Key points discussed (bullet points)
3. Action items for the provider (things to do)
4. Any patient concerns that need follow-up

Return as JSON: { "summary": "string", "keyPoints": ["string"], "actionItems": ["string"], "concerns": ["string"] }`,
        },
        {
          role: 'user',
          content: transcript,
        },
      ],
      temperature: 0.3,
      ...getTokenLimitParam(modelToUse, 1000),
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI');
    }

    return JSON.parse(content);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to generate conversation summary', { error: errorMessage });
    throw error;
  }
}

/**
 * Extract medication changes from transcript
 */
export async function extractMedicationChanges(transcript: string): Promise<{
  newMedications: Array<{ name: string; dose: string; frequency: string; instructions: string }>;
  discontinuedMedications: string[];
  doseChanges: Array<{ name: string; oldDose: string; newDose: string }>;
  refills: string[];
}> {
  try {
    const modelToUse = process.env.OPENAI_MODEL || 'gpt-4-turbo-preview';
    const response = await openai.chat.completions.create({
      model: modelToUse,
      messages: [
        {
          role: 'system',
          content: `Extract all medication-related information from this medical consultation transcript.

Return as JSON:
{
  "newMedications": [{ "name": "string", "dose": "string", "frequency": "string", "instructions": "string" }],
  "discontinuedMedications": ["string"],
  "doseChanges": [{ "name": "string", "oldDose": "string", "newDose": "string" }],
  "refills": ["string"]
}

If no medication information is found, return empty arrays.`,
        },
        {
          role: 'user',
          content: transcript,
        },
      ],
      temperature: 0.2,
      ...getTokenLimitParam(modelToUse, 1000),
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI');
    }

    return JSON.parse(content);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to extract medication changes', { error: errorMessage });
    return {
      newMedications: [],
      discontinuedMedications: [],
      doseChanges: [],
      refills: [],
    };
  }
}

/**
 * Check transcript for red flags or urgent concerns
 */
export async function checkForRedFlags(transcript: string): Promise<{
  hasRedFlags: boolean;
  flags: Array<{ type: string; description: string; severity: 'low' | 'medium' | 'high' }>;
  recommendation: string;
}> {
  try {
    const modelToUse = process.env.OPENAI_MODEL || 'gpt-4-turbo-preview';
    const response = await openai.chat.completions.create({
      model: modelToUse,
      messages: [
        {
          role: 'system',
          content: `Analyze this medical consultation transcript for any red flags or urgent concerns that may require immediate attention.

Look for:
- Severe symptoms (chest pain, difficulty breathing, severe pain)
- Medication safety issues (allergies, interactions, overdose risk)
- Mental health concerns (suicidal ideation, severe depression)
- Signs of non-compliance that could be dangerous
- Symptoms requiring emergency care

Return as JSON:
{
  "hasRedFlags": boolean,
  "flags": [{ "type": "string", "description": "string", "severity": "low|medium|high" }],
  "recommendation": "string"
}`,
        },
        {
          role: 'user',
          content: transcript,
        },
      ],
      temperature: 0.1, // Very low temperature for safety-critical analysis
      ...getTokenLimitParam(modelToUse, 1000),
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI');
    }

    const result = JSON.parse(content);

    if (result.hasRedFlags) {
      logger.warn('Red flags detected in transcript', {
        flagCount: result.flags.length,
        highSeverityCount: result.flags.filter((f: any) => f.severity === 'high').length,
      });
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to check for red flags', { error: errorMessage });
    return {
      hasRedFlags: false,
      flags: [],
      recommendation: 'Unable to analyze transcript for red flags.',
    };
  }
}
