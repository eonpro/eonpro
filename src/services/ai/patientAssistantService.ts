/**
 * Patient-Facing AI Assistant Service
 * A specialized version of Becca AI for patient portal interactions
 *
 * Capabilities:
 * - Answer questions about their medications, dosing, and progress
 * - Provide personalized health tips based on their data
 * - Help with appointment scheduling questions
 * - Shipment tracking inquiries
 * - General wellness guidance
 *
 * Restrictions:
 * - Cannot provide medical diagnoses
 * - Cannot change prescriptions or dosing
 * - Must escalate urgent concerns to care team
 */

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface PatientChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: Date;
}

export interface PatientChatResponse {
  message: string;
  suggestions?: string[];
  shouldEscalate?: boolean;
  escalationReason?: string;
  relatedActions?: Array<{
    label: string;
    action: string;
    url?: string;
  }>;
}

export interface PatientInsight {
  id: string;
  type: 'tip' | 'reminder' | 'achievement' | 'alert' | 'encouragement';
  title: string;
  message: string;
  icon?: string;
  priority: 'low' | 'medium' | 'high';
  actionUrl?: string;
  actionLabel?: string;
  expiresAt?: Date;
}

// Keywords that should trigger escalation to care team
const ESCALATION_KEYWORDS = [
  'emergency',
  'urgent',
  'severe pain',
  'chest pain',
  'can\'t breathe',
  'breathing difficulty',
  'allergic reaction',
  'swelling',
  'vomiting blood',
  'suicidal',
  'self harm',
  'overdose',
  'pregnant',
  'heart attack',
  'stroke symptoms',
];

// System prompt for patient-facing AI
const PATIENT_SYSTEM_PROMPT = `You are Becca, a friendly and helpful AI health assistant for patients using a weight management program with GLP-1 medications (like Semaglutide or Tirzepatide).

Your role is to:
1. Answer questions about their medication schedule, dosing, and what to expect
2. Provide general wellness tips for weight management
3. Help them understand their progress and celebrate achievements
4. Guide them to the right resources and care team when needed
5. Remind them about hydration, nutrition, and exercise
6. Answer questions about their shipments and appointments

IMPORTANT GUIDELINES:
- Be warm, encouraging, and supportive
- Use simple language, avoid medical jargon
- Never provide medical diagnoses or change medications
- If they describe concerning symptoms, encourage them to contact their care team
- For urgent concerns, direct them to call 911 or go to the ER
- Keep responses concise (2-3 paragraphs max)
- Personalize responses using their name and data when available
- End responses with a helpful follow-up question or suggestion

THINGS YOU CANNOT DO:
- Diagnose conditions
- Prescribe or adjust medications
- Provide specific medical advice for their situation
- Access or share information about other patients

When you don't know something specific about their case, say so and suggest they reach out to their care team.`;

/**
 * Check if message contains escalation keywords
 */
function checkForEscalation(message: string): { shouldEscalate: boolean; reason?: string } {
  const lowercaseMessage = message.toLowerCase();

  for (const keyword of ESCALATION_KEYWORDS) {
    if (lowercaseMessage.includes(keyword)) {
      return {
        shouldEscalate: true,
        reason: `Patient mentioned: "${keyword}". This may require immediate attention.`,
      };
    }
  }

  return { shouldEscalate: false };
}

/**
 * Get patient context for AI
 */
async function getPatientContext(patientId: number): Promise<string> {
  try {
    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      select: {
        firstName: true,
        lastName: true,
        orders: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            primaryMedName: true,
            primaryMedStrength: true,
            status: true,
          },
        },
        weightLogs: {
          orderBy: { recordedAt: 'desc' },
          take: 5,
          select: {
            weight: true,
            recordedAt: true,
          },
        },
        appointments: {
          where: {
            startTime: { gte: new Date() },
          },
          orderBy: { startTime: 'asc' },
          take: 1,
          select: {
            startTime: true,
            type: true,
          },
        },
        medicationReminders: {
          where: { isActive: true },
          select: {
            dayOfWeek: true,
            timeOfDay: true,
          },
        },
      },
    });

    if (!patient) return '';

    const context: string[] = [];
    context.push(`Patient name: ${patient.firstName}`);

    if (patient.orders.length > 0) {
      const order = patient.orders[0];
      context.push(`Current medication: ${order.primaryMedName} ${order.primaryMedStrength || ''}`);
      context.push(`Order status: ${order.status}`);
    }

    if (patient.weightLogs.length > 0) {
      const latest = patient.weightLogs[0];
      context.push(`Latest weight: ${latest.weight} lbs (${new Date(latest.recordedAt).toLocaleDateString()})`);

      if (patient.weightLogs.length >= 2) {
        const first = patient.weightLogs[patient.weightLogs.length - 1];
        const change = first.weight - latest.weight;
        context.push(`Recent weight change: ${change > 0 ? '-' : '+'}${Math.abs(change).toFixed(1)} lbs`);
      }
    }

    if (patient.appointments.length > 0) {
      const apt = patient.appointments[0];
      context.push(`Next appointment: ${new Date(apt.startTime).toLocaleDateString()} (${apt.type})`);
    }

    if (patient.medicationReminders.length > 0) {
      context.push(`Has active medication reminders set up`);
    }

    return context.join('\n');
  } catch (error) {
    logger.error('Failed to get patient context:', error);
    return '';
  }
}

/**
 * Process a chat message from a patient
 */
export async function processPatientChat(
  patientId: number,
  message: string,
  conversationHistory: PatientChatMessage[] = []
): Promise<PatientChatResponse> {
  try {
    // Check for escalation keywords first
    const escalationCheck = checkForEscalation(message);

    if (escalationCheck.shouldEscalate) {
      return {
        message: `I'm concerned about what you've described. For your safety, please contact your care team right away, or if this is an emergency, call 911 or go to your nearest emergency room. Your health and safety are the top priority. 💙`,
        shouldEscalate: true,
        escalationReason: escalationCheck.reason,
        relatedActions: [
          { label: 'Message Care Team', action: 'message', url: '/patient-portal/chat' },
          { label: 'Call Emergency (911)', action: 'call', url: 'tel:911' },
        ],
      };
    }

    // Get patient context
    const patientContext = await getPatientContext(patientId);

    // Build messages array for OpenAI
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: PATIENT_SYSTEM_PROMPT },
    ];

    // Add patient context if available
    if (patientContext) {
      messages.push({
        role: 'system',
        content: `Current patient information:\n${patientContext}`,
      });
    }

    // Add conversation history (last 10 messages)
    const recentHistory = conversationHistory.slice(-10);
    for (const msg of recentHistory) {
      messages.push({
        role: msg.role,
        content: msg.content,
      });
    }

    // Add current message
    messages.push({ role: 'user', content: message });

    // Call OpenAI
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      temperature: 0.7,
      max_tokens: 500,
    });

    const assistantMessage = completion.choices[0]?.message?.content || 'I apologize, but I couldn\'t process your request. Please try again or contact your care team.';

    // Generate follow-up suggestions based on the conversation
    const suggestions = generateSuggestions(message, assistantMessage);

    // Generate related actions
    const relatedActions = generateRelatedActions(message);

    return {
      message: assistantMessage,
      suggestions,
      relatedActions,
    };
  } catch (error) {
    logger.error('Failed to process patient chat:', error);
    return {
      message: 'I\'m having trouble connecting right now. Please try again in a moment, or reach out to your care team directly if you need immediate assistance.',
      relatedActions: [
        { label: 'Message Care Team', action: 'message', url: '/patient-portal/chat' },
      ],
    };
  }
}

/**
 * Generate follow-up suggestions based on conversation
 */
function generateSuggestions(userMessage: string, _assistantResponse: string): string[] {
  const suggestions: string[] = [];
  const lowercaseMessage = userMessage.toLowerCase();

  if (lowercaseMessage.includes('weight') || lowercaseMessage.includes('progress')) {
    suggestions.push('How can I track my weight more effectively?');
    suggestions.push('What should I expect in the first month?');
  }

  if (lowercaseMessage.includes('dose') || lowercaseMessage.includes('injection')) {
    suggestions.push('What time is best to take my medication?');
    suggestions.push('How do I store my medication?');
  }

  if (lowercaseMessage.includes('side effect') || lowercaseMessage.includes('nausea')) {
    suggestions.push('What foods help with nausea?');
    suggestions.push('When should I be concerned about side effects?');
  }

  if (lowercaseMessage.includes('shipment') || lowercaseMessage.includes('order')) {
    suggestions.push('When will my next shipment arrive?');
    suggestions.push('How do I update my shipping address?');
  }

  // Default suggestions if none matched
  if (suggestions.length === 0) {
    suggestions.push('Tell me about my medication');
    suggestions.push('How is my progress?');
    suggestions.push('What wellness tips do you have?');
  }

  return suggestions.slice(0, 3);
}

/**
 * Generate related actions based on message content
 */
function generateRelatedActions(message: string): Array<{ label: string; action: string; url?: string }> {
  const actions: Array<{ label: string; action: string; url?: string }> = [];
  const lowercaseMessage = message.toLowerCase();

  if (lowercaseMessage.includes('weight') || lowercaseMessage.includes('progress')) {
    actions.push({ label: 'Log My Weight', action: 'log_weight', url: '/patient-portal/progress' });
  }

  if (lowercaseMessage.includes('appointment') || lowercaseMessage.includes('schedule')) {
    actions.push({ label: 'Book Appointment', action: 'book', url: '/patient-portal/appointments' });
  }

  if (lowercaseMessage.includes('shipment') || lowercaseMessage.includes('order') || lowercaseMessage.includes('track')) {
    actions.push({ label: 'Track Shipment', action: 'track', url: '/patient-portal/shipments' });
  }

  if (lowercaseMessage.includes('medication') || lowercaseMessage.includes('dose') || lowercaseMessage.includes('medicine')) {
    actions.push({ label: 'View Medications', action: 'view', url: '/patient-portal/medications' });
  }

  return actions;
}

/**
 * Generate personalized insights for a patient
 */
export async function generatePatientInsights(patientId: number): Promise<PatientInsight[]> {
  const insights: PatientInsight[] = [];

  try {
    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      select: {
        firstName: true,
        weightLogs: {
          orderBy: { recordedAt: 'desc' },
          take: 30,
          select: { weight: true, recordedAt: true },
        },
        waterLogs: {
          where: { recordedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
          select: { amount: true },
        },
        exerciseLogs: {
          where: { recordedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
          select: { duration: true },
        },
        streaks: {
          select: { streakType: true, currentStreak: true },
        },
        orders: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { primaryMedName: true, createdAt: true },
        },
      },
    });

    if (!patient) return insights;

    // Weight progress insight
    if (patient.weightLogs.length >= 2) {
      const latest = patient.weightLogs[0];
      const oldest = patient.weightLogs[patient.weightLogs.length - 1];
      const totalLoss = oldest.weight - latest.weight;

      if (totalLoss > 0) {
        insights.push({
          id: 'weight_progress',
          type: 'achievement',
          title: `Amazing Progress, ${patient.firstName}!`,
          message: `You've lost ${totalLoss.toFixed(1)} lbs since you started. Keep up the great work!`,
          icon: 'trophy',
          priority: 'medium',
          actionUrl: '/patient-portal/progress',
          actionLabel: 'View Progress',
        });
      }

      // Check for recent weight gain
      if (patient.weightLogs.length >= 7) {
        const weekAgo = patient.weightLogs[6];
        const weekChange = weekAgo.weight - latest.weight;
        if (weekChange < -2) {
          insights.push({
            id: 'weight_check_in',
            type: 'tip',
            title: 'Let\'s Check In',
            message: 'Your weight has fluctuated a bit this week. That\'s normal! Consider logging your meals to identify patterns.',
            icon: 'info',
            priority: 'low',
          });
        }
      }
    } else {
      // Encourage weight logging
      insights.push({
        id: 'start_logging',
        type: 'reminder',
        title: 'Start Your Journey',
        message: 'Log your first weight to start tracking your progress!',
        icon: 'scale',
        priority: 'high',
        actionUrl: '/patient-portal/progress',
        actionLabel: 'Log Weight',
      });
    }

    // Hydration insight
    const totalWater = patient.waterLogs.reduce((sum: number, log: any) => sum + log.amount, 0);
    const avgDailyWater = totalWater / 7;
    if (avgDailyWater < 64) {
      insights.push({
        id: 'hydration_reminder',
        type: 'tip',
        title: 'Hydration Tip',
        message: 'Drinking enough water helps with medication effectiveness and reduces side effects. Aim for 64oz daily!',
        icon: 'droplet',
        priority: 'medium',
      });
    }

    // Exercise encouragement
    const totalExercise = patient.exerciseLogs.reduce((sum: number, log: any) => sum + log.duration, 0);
    if (totalExercise >= 150) {
      insights.push({
        id: 'exercise_achievement',
        type: 'achievement',
        title: 'Exercise Goal Met!',
        message: `You hit ${totalExercise} minutes of exercise this week. That's fantastic!`,
        icon: 'activity',
        priority: 'medium',
      });
    } else if (totalExercise > 0) {
      insights.push({
        id: 'exercise_progress',
        type: 'encouragement',
        title: 'Keep Moving!',
        message: `You've logged ${totalExercise} minutes of exercise. Just ${150 - totalExercise} more to hit your weekly goal!`,
        icon: 'activity',
        priority: 'low',
      });
    }

    // Streak insights
    const weightStreak = patient.streaks.find((s: { streakType: string }) => s.streakType === 'WEIGHT_LOG');
    if (weightStreak && weightStreak.currentStreak >= 7) {
      insights.push({
        id: 'streak_celebration',
        type: 'achievement',
        title: `${weightStreak.currentStreak}-Day Streak! 🔥`,
        message: 'Your consistency is paying off. Keep the momentum going!',
        icon: 'flame',
        priority: 'medium',
        actionUrl: '/patient-portal/achievements',
        actionLabel: 'View Achievements',
      });
    }

    // Medication tip for new patients
    if (patient.orders.length > 0) {
      const orderDate = new Date(patient.orders[0].createdAt);
      const daysSinceStart = Math.floor((Date.now() - orderDate.getTime()) / (1000 * 60 * 60 * 24));

      if (daysSinceStart <= 7) {
        insights.push({
          id: 'new_patient_tip',
          type: 'tip',
          title: 'First Week Tips',
          message: 'It\'s normal to experience mild nausea in the first week. Eating smaller meals and staying hydrated can help!',
          icon: 'info',
          priority: 'high',
        });
      } else if (daysSinceStart <= 30) {
        insights.push({
          id: 'first_month_tip',
          type: 'tip',
          title: 'You\'re Doing Great!',
          message: 'The first month is about adjusting. Focus on building healthy habits rather than the scale.',
          icon: 'heart',
          priority: 'medium',
        });
      }
    }

    // Sort by priority
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    insights.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    return insights.slice(0, 5); // Return top 5 insights
  } catch (error) {
    logger.error('Failed to generate patient insights:', error);
    return [];
  }
}

/**
 * Generate a weekly summary for a patient
 */
export async function generateWeeklySummary(patientId: number): Promise<string> {
  try {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      select: {
        firstName: true,
        weightLogs: {
          where: { recordedAt: { gte: weekAgo } },
          orderBy: { recordedAt: 'asc' },
          select: { weight: true },
        },
        waterLogs: {
          where: { recordedAt: { gte: weekAgo } },
          select: { amount: true },
        },
        exerciseLogs: {
          where: { recordedAt: { gte: weekAgo } },
          select: { duration: true },
        },
        streaks: {
          select: { streakType: true, currentStreak: true },
        },
      },
    });

    if (!patient) return '';

    const summary: string[] = [];
    summary.push(`Weekly Summary for ${patient.firstName}`);
    summary.push('');

    // Weight
    if (patient.weightLogs.length >= 2) {
      const firstWeight = patient.weightLogs[0].weight;
      const lastWeight = patient.weightLogs[patient.weightLogs.length - 1].weight;
      const change = firstWeight - lastWeight;
      summary.push(`📊 Weight: ${change > 0 ? '-' : '+'}${Math.abs(change).toFixed(1)} lbs this week`);
    } else {
      summary.push('📊 Weight: Log more to see your trend!');
    }

    // Water
    const totalWaterSummary = patient.waterLogs.reduce((sum: number, log: any) => sum + log.amount, 0);
    const avgWater = Math.round(totalWaterSummary / 7);
    summary.push(`💧 Hydration: ${avgWater}oz average daily`);

    // Exercise
    const totalExerciseSummary = patient.exerciseLogs.reduce((sum: number, log: any) => sum + log.duration, 0);
    summary.push(`🏃 Exercise: ${totalExerciseSummary} minutes total`);

    // Best streak
    const bestStreak = patient.streaks.reduce(
      (best: { streakType: string; currentStreak: number } | null, streak: { streakType: string; currentStreak: number }) =>
        !best || streak.currentStreak > best.currentStreak ? streak : best,
      null
    );
    if (bestStreak) {
      summary.push(`🔥 Best streak: ${bestStreak.currentStreak} days (${bestStreak.streakType.replace('_', ' ').toLowerCase()})`);
    }

    summary.push('');
    summary.push('Keep up the great work! 💪');

    return summary.join('\n');
  } catch (error) {
    logger.error('Failed to generate weekly summary:', error);
    return '';
  }
}
