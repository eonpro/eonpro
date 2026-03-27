/**
 * Patient Portal Symptom Checker — AI Assessment
 *
 * HIPAA: All patient context is anonymized via phi-anonymization before
 * being sent to OpenAI. No PHI (names, DOB, addresses) leaves the server
 * boundary. Only medication names, symptom descriptions, and anonymized
 * weight data are included in the AI prompt.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { withRateLimit, RATE_LIMIT_CONFIGS } from '@/lib/security/rate-limiter';
import { logPHIAccess } from '@/lib/audit/hipaa-audit';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/db';
import { anonymizeText } from '@/lib/security/phi-anonymization';
import OpenAI from 'openai';
import { z } from 'zod';

const assessSchema = z.object({
  symptoms: z.array(z.object({
    id: z.string(),
    name: z.string(),
    category: z.string(),
    severity: z.enum(['common', 'moderate', 'urgent', 'emergency']),
  })).min(1, 'Select at least one symptom'),
  bodyAreas: z.array(z.string()).min(1),
  duration: z.enum(['just-now', 'today', 'few-days', 'week', 'more-than-week', 'more-than-month']),
  severityLevel: z.enum(['mild', 'moderate', 'severe']),
  pattern: z.string().optional(),
  additionalNotes: z.string().max(500).optional(),
});

type UrgencyLevel = 'self-care' | 'monitor' | 'schedule-visit' | 'contact-team' | 'urgent-care' | 'emergency';

interface AssessmentResult {
  urgency: UrgencyLevel;
  title: string;
  summary: string;
  detailedAssessment: string;
  selfCareTips: string[];
  warningSignsToWatch: string[];
  actions: Array<{ label: string; url: string; type: 'primary' | 'secondary' }>;
  followUpTimeframe: string;
}

const SYMPTOM_ASSESSMENT_PROMPT = `You are a clinical triage AI assistant for a telehealth weight management clinic. Patients are typically on GLP-1 medications (Semaglutide or Tirzepatide).

Your role is to provide a structured symptom assessment. You are NOT diagnosing — you are triaging urgency and providing self-care guidance.

IMPORTANT RULES:
- Never diagnose specific conditions
- Always recommend professional follow-up for anything beyond mild/common side effects
- For ANY emergency symptoms, immediately flag as emergency
- Be empathetic, clear, and actionable
- Keep language at an 8th-grade reading level
- Reference GLP-1 medication context when relevant (these are common side effects)

Respond in this exact JSON format:
{
  "urgency": "self-care" | "monitor" | "schedule-visit" | "contact-team" | "urgent-care" | "emergency",
  "title": "Short 3-5 word title",
  "summary": "1-2 sentence summary of the assessment",
  "detailedAssessment": "2-3 paragraph detailed but accessible explanation of what might be happening and why, referencing their specific symptoms. Be warm and reassuring where appropriate.",
  "selfCareTips": ["Tip 1", "Tip 2", ...up to 5 specific, actionable tips],
  "warningSignsToWatch": ["Sign 1", "Sign 2", ...up to 4 warning signs that should prompt escalation],
  "followUpTimeframe": "e.g., 'within 24 hours', 'at your next appointment', 'immediately'"
}

URGENCY LEVELS:
- "emergency": Life-threatening — call 911 (severe allergic reaction, chest pain, difficulty breathing, thoughts of self-harm)
- "urgent-care": Needs same-day medical attention (severe persistent vomiting, signs of pancreatitis, spreading infection)
- "contact-team": Should speak with care team within 24-48h (moderate symptoms not improving, new concerning symptoms)
- "schedule-visit": Should discuss at next visit or schedule one within a week (persistent mild-moderate symptoms)
- "monitor": Track symptoms, likely will improve (common early side effects, mild and improving)
- "self-care": Manageable with home remedies (very common, mild side effects with clear self-care path)`;

async function getPatientMedicationContext(patientId: number): Promise<string> {
  try {
    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      select: {
        orders: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            primaryMedName: true,
            primaryMedStrength: true,
            status: true,
            createdAt: true,
          },
        },
        weightLogs: {
          orderBy: { recordedAt: 'desc' },
          take: 2,
          select: { weight: true, recordedAt: true },
        },
      },
    });

    if (!patient) return '';

    const context: string[] = [];

    if (patient.orders.length > 0) {
      const order = patient.orders[0];
      context.push(`Current medication: ${order.primaryMedName} ${order.primaryMedStrength || ''}`);
      const daysSinceStart = Math.floor(
        (Date.now() - new Date(order.createdAt).getTime()) / (1000 * 60 * 60 * 24)
      );
      context.push(`Time on current medication: ~${daysSinceStart} days`);
    }

    if (patient.weightLogs.length >= 2) {
      const change = patient.weightLogs[1].weight - patient.weightLogs[0].weight;
      context.push(`Recent weight trend: ${change > 0 ? 'losing' : change < 0 ? 'gaining' : 'stable'}`);
    }

    return anonymizeText(context.join('\n'));
  } catch (err) {
    logger.error('Failed to get medication context for symptom checker', {
      patientId,
      error: err instanceof Error ? err.message : 'Unknown',
    });
    return '';
  }
}

async function handler(req: NextRequest, user: AuthUser) {
  try {
    if (!user.patientId) {
      return NextResponse.json({ error: 'Patient account required' }, { status: 400 });
    }

    const body = await req.json();
    const parsed = assessSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { symptoms, bodyAreas, duration, severityLevel, pattern, additionalNotes } = parsed.data;

    // Fast-path: emergency symptoms skip AI entirely
    const hasEmergencySymptom = symptoms.some((s) => s.severity === 'emergency');
    if (hasEmergencySymptom) {
      const emergencyResult: AssessmentResult = {
        urgency: 'emergency',
        title: 'Seek Emergency Care Now',
        summary: 'Based on your symptoms, you need immediate emergency medical attention.',
        detailedAssessment:
          'One or more of the symptoms you selected requires immediate medical evaluation. ' +
          'Please do not delay — call 911 or have someone drive you to the nearest emergency room right away. ' +
          'Bring a list of your current medications with you. Your safety is the top priority.',
        selfCareTips: [
          'Call 911 or go to the nearest ER immediately',
          'Do not drive yourself',
          'Bring your medication list and dosing information',
          'Have someone stay with you until help arrives',
        ],
        warningSignsToWatch: [],
        actions: [
          { label: 'Call 911', url: 'tel:911', type: 'primary' },
          { label: 'Message Care Team', url: '/patient-portal/chat', type: 'secondary' },
        ],
        followUpTimeframe: 'immediately',
      };

      await logPHIAccess(req, user, 'SymptomCheck', String(user.patientId), user.patientId, {
        urgency: 'emergency',
        symptomCount: symptoms.length,
      });

      return NextResponse.json({ assessment: emergencyResult });
    }

    logger.info('Symptom checker assessment requested', {
      patientId: user.patientId,
      symptomCount: symptoms.length,
      bodyAreas,
      severityLevel,
    });

    const medicationContext = await getPatientMedicationContext(user.patientId);

    const userMessage = [
      `Body areas affected: ${bodyAreas.join(', ')}`,
      `Symptoms: ${symptoms.map((s) => `${s.name} (${s.category}, typically ${s.severity})`).join('; ')}`,
      `Duration: ${duration}`,
      `Self-reported severity: ${severityLevel}`,
      pattern ? `Pattern/timing: ${pattern}` : null,
      additionalNotes ? `Additional notes: ${anonymizeText(additionalNotes)}` : null,
      medicationContext ? `\nPatient medication context:\n${medicationContext}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYMPTOM_ASSESSMENT_PROMPT },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.3,
      max_tokens: 800,
      response_format: { type: 'json_object' },
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) {
      throw new Error('Empty response from AI');
    }

    let aiResult: Record<string, unknown>;
    try {
      aiResult = JSON.parse(raw);
    } catch {
      logger.error('Failed to parse AI symptom assessment JSON', { patientId: user.patientId });
      throw new Error('Invalid AI response format');
    }

    const urgency = (aiResult.urgency as UrgencyLevel) || 'contact-team';

    const actions: AssessmentResult['actions'] = [];
    switch (urgency) {
      case 'emergency':
        actions.push({ label: 'Call 911', url: 'tel:911', type: 'primary' });
        break;
      case 'urgent-care':
        actions.push({ label: 'Message Care Team Now', url: '/patient-portal/chat', type: 'primary' });
        actions.push({ label: 'Book Urgent Appointment', url: '/patient-portal/appointments', type: 'secondary' });
        break;
      case 'contact-team':
        actions.push({ label: 'Message Care Team', url: '/patient-portal/chat', type: 'primary' });
        actions.push({ label: 'Book Appointment', url: '/patient-portal/appointments', type: 'secondary' });
        break;
      case 'schedule-visit':
        actions.push({ label: 'Book Appointment', url: '/patient-portal/appointments', type: 'primary' });
        actions.push({ label: 'View Resources', url: '/patient-portal/resources', type: 'secondary' });
        break;
      case 'monitor':
        actions.push({ label: 'Log Symptoms', url: '/patient-portal/progress', type: 'primary' });
        actions.push({ label: 'Message Care Team', url: '/patient-portal/chat', type: 'secondary' });
        break;
      case 'self-care':
        actions.push({ label: 'View Wellness Resources', url: '/patient-portal/resources', type: 'primary' });
        actions.push({ label: 'Track Progress', url: '/patient-portal/progress', type: 'secondary' });
        break;
    }

    const assessment: AssessmentResult = {
      urgency,
      title: (aiResult.title as string) || 'Assessment Complete',
      summary: (aiResult.summary as string) || '',
      detailedAssessment: (aiResult.detailedAssessment as string) || '',
      selfCareTips: Array.isArray(aiResult.selfCareTips) ? (aiResult.selfCareTips as string[]).slice(0, 5) : [],
      warningSignsToWatch: Array.isArray(aiResult.warningSignsToWatch)
        ? (aiResult.warningSignsToWatch as string[]).slice(0, 4)
        : [],
      actions,
      followUpTimeframe: (aiResult.followUpTimeframe as string) || '',
    };

    await logPHIAccess(req, user, 'SymptomCheck', String(user.patientId), user.patientId, {
      urgency: assessment.urgency,
      symptomCount: symptoms.length,
    });

    return NextResponse.json({ assessment });
  } catch (error) {
    logger.error('Symptom checker assessment failed', {
      patientId: user.patientId,
      error: error instanceof Error ? error.message : 'Unknown',
    });

    return NextResponse.json(
      {
        error: 'Unable to complete assessment. Please try again or contact your care team directly.',
        fallback: true,
      },
      { status: 500 }
    );
  }
}

export const POST = withRateLimit(
  withAuth(handler, { roles: ['patient'] }),
  RATE_LIMIT_CONFIGS.ai
);
