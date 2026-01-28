import { z } from 'zod';
import { prisma } from '@/lib/db';
import { queryPatientData, type PatientQueryInput } from './openaiService';
import { logger } from '@/lib/logger';
import { Patient, Provider, Order } from '@/types/models';
import {
  detectQueryCategory,
  requiresMedicalDisclaimer,
  MEDICAL_DISCLAIMER,
  type QueryCategory,
} from './beccaKnowledgeBase';

/**
 * Strip markdown formatting from response text
 * Removes ##, **, *, _, etc. while preserving readable content
 */
function stripMarkdown(text: string): string {
  if (!text) return text;

  return text
    // Remove headers (# ## ### etc.)
    .replace(/^#{1,6}\s+/gm, '')
    // Remove bold/italic markers
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    // Remove markdown links [text](url) -> text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Remove inline code backticks
    .replace(/`([^`]+)`/g, '$1')
    // Remove horizontal rules
    .replace(/^---+$/gm, '')
    .replace(/^\*\*\*+$/gm, '')
    // Clean up multiple blank lines
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Becca AI Assistant Service
 * Handles intelligent querying of patient data, clinical knowledge, and conversation management
 *
 * Query Categories:
 * - patient_data: Queries about specific patients (requires database search)
 * - medication_info: Questions about GLP-1 medications, mechanisms, etc.
 * - dosing_protocol: Titration schedules, dose adjustments
 * - side_effects: Adverse effects, tolerability issues
 * - drug_interactions: Medication combinations, safety
 * - sig_help: Prescription directions/instructions
 * - soap_note_help: Documentation guidance, ICD-10 codes
 * - clinical_decision: Eligibility, contraindications, when to hold/stop
 * - platform_operations: System workflows, features
 * - general: Other queries
 */

// Input validation schemas
export const chatQuerySchema = z.object({
  query: z.string().min(1).max(1000),
  sessionId: z.string().optional(),
  userEmail: z.string().email(),
  patientId: z.number().optional(),
  // CRITICAL: clinicId is required for multi-tenant data isolation
  // This prevents data leakage between clinics (e.g., EonMeds vs WellMedR)
  clinicId: z.number({
    required_error: 'Clinic ID is required for data isolation',
    invalid_type_error: 'Clinic ID must be a number',
  }),
});

export const conversationHistorySchema = z.object({
  sessionId: z.string(),
  limit: z.number().default(10),
});

/**
 * Try to answer simple demographic queries directly from patient data
 * This avoids sending PHI to external AI services and provides instant, accurate responses
 */
function tryDirectAnswer(
  query: string,
  patientContext: any
): { answer: string; queryType: string } | null {
  // Only handle queries when we have a specific patient
  if (!patientContext || patientContext.type !== 'patient_found') {
    return null;
  }

  const queryLower = query.toLowerCase();
  const summary = patientContext.summary;
  const patient = patientContext.patient;

  if (!summary) return null;

  // Date of birth queries
  if (
    queryLower.includes('date of birth') ||
    queryLower.includes('birthday') ||
    queryLower.includes('dob') ||
    (queryLower.includes('when') && queryLower.includes('born'))
  ) {
    if (summary.dateOfBirth) {
      const ageText = summary.age ? ` (${summary.age} years old)` : '';
      return {
        answer: `${summary.name}'s date of birth is ${summary.dateOfBirth}${ageText}.`,
        queryType: 'demographics',
      };
    }
    return {
      answer: `I don't have the date of birth on file for ${summary.name}.`,
      queryType: 'demographics',
    };
  }

  // Age queries
  if (
    (queryLower.includes('how old') || queryLower.includes('age')) &&
    !queryLower.includes('medication') &&
    !queryLower.includes('prescription')
  ) {
    if (summary.age !== null && summary.age !== undefined) {
      return {
        answer: `${summary.name} is ${summary.age} years old.`,
        queryType: 'demographics',
      };
    }
    return {
      answer: `I don't have the age information on file for ${summary.name}.`,
      queryType: 'demographics',
    };
  }

  // Phone number queries
  if (queryLower.includes('phone') || queryLower.includes('call') || queryLower.includes('contact number')) {
    if (summary.phone) {
      return {
        answer: `${summary.name}'s phone number is ${summary.phone}.`,
        queryType: 'demographics',
      };
    }
    return {
      answer: `I don't have a phone number on file for ${summary.name}.`,
      queryType: 'demographics',
    };
  }

  // Email queries
  if (queryLower.includes('email')) {
    if (summary.email) {
      return {
        answer: `${summary.name}'s email address is ${summary.email}.`,
        queryType: 'demographics',
      };
    }
    return {
      answer: `I don't have an email address on file for ${summary.name}.`,
      queryType: 'demographics',
    };
  }

  // Address queries
  if (queryLower.includes('address') || (queryLower.includes('where') && queryLower.includes('live'))) {
    if (summary.address && summary.address.trim() !== ', ,') {
      return {
        answer: `${summary.name}'s address is ${summary.address}.`,
        queryType: 'demographics',
      };
    }
    return {
      answer: `I don't have an address on file for ${summary.name}.`,
      queryType: 'demographics',
    };
  }

  // Gender queries
  if (queryLower.includes('gender') || queryLower.includes('sex')) {
    if (summary.gender) {
      return {
        answer: `${summary.name}'s gender is ${summary.gender}.`,
        queryType: 'demographics',
      };
    }
    return {
      answer: `I don't have gender information on file for ${summary.name}.`,
      queryType: 'demographics',
    };
  }

  // General patient info/summary queries
  if (
    (queryLower.includes('tell me about') || queryLower.includes('information') || queryLower.includes('details')) &&
    !queryLower.includes('prescription') &&
    !queryLower.includes('order') &&
    !queryLower.includes('soap')
  ) {
    const parts: string[] = [];
    parts.push(`Here's the information I have for ${summary.name}:`);

    if (summary.dateOfBirth) {
      const ageText = summary.age ? ` (${summary.age} years old)` : '';
      parts.push(`- Date of Birth: ${summary.dateOfBirth}${ageText}`);
    }
    if (summary.gender) {
      parts.push(`- Gender: ${summary.gender}`);
    }
    if (summary.phone) {
      parts.push(`- Phone: ${summary.phone}`);
    }
    if (summary.email) {
      parts.push(`- Email: ${summary.email}`);
    }
    if (summary.address && summary.address.trim() !== ', ,') {
      parts.push(`- Address: ${summary.address}`);
    }
    if (summary.orderCount > 0) {
      parts.push(`- Orders: ${summary.orderCount}`);
    }
    if (summary.documentCount > 0) {
      parts.push(`- Documents: ${summary.documentCount}`);
    }

    return {
      answer: parts.join('\n'),
      queryType: 'demographics',
    };
  }

  // Not a simple demographic query - let AI handle it
  return null;
}

/**
 * Calculate Levenshtein distance between two strings for fuzzy matching
 */
function levenshteinDistance(str1: string, str2: string): number {
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();
  const m = s1.length;
  const n = s2.length;

  // Create a 2D array to store distances
  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0));

  // Initialize base cases
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  // Fill the DP table
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }

  return dp[m][n];
}

/**
 * Calculate similarity score (0-1) between two strings
 */
function similarityScore(str1: string, str2: string): number {
  const distance = levenshteinDistance(str1, str2);
  const maxLen = Math.max(str1.length, str2.length);
  return maxLen === 0 ? 1 : 1 - distance / maxLen;
}

interface ScoredPatient {
  id: number;
  firstName: string | null;
  lastName: string | null;
  dob: string | null;
  email: string | null;
  score: number;
  firstNameScore: number;
  lastNameScore: number;
}

/**
 * Find patients with similar names using fuzzy matching
 */
async function findSimilarPatients(
  firstName: string,
  lastName: string,
  clinicId: number,
  limit: number = 5
): Promise<ScoredPatient[]> {
  // Get all patients from this clinic for fuzzy matching
  const allPatients = await prisma.patient.findMany({
    where: { clinicId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      dob: true,
      email: true,
    },
  });

  // Calculate similarity scores for each patient
  const scoredPatients: ScoredPatient[] = allPatients.map((patient: typeof allPatients[0]) => {
    const firstNameScore = similarityScore(firstName, patient.firstName || '');
    const lastNameScore = similarityScore(lastName, patient.lastName || '');
    // Also check if first/last names are swapped
    const swappedFirstScore = similarityScore(firstName, patient.lastName || '');
    const swappedLastScore = similarityScore(lastName, patient.firstName || '');

    const normalScore = (firstNameScore + lastNameScore) / 2;
    const swappedScore = (swappedFirstScore + swappedLastScore) / 2;
    const bestScore = Math.max(normalScore, swappedScore);

    return {
      ...patient,
      score: bestScore,
      firstNameScore,
      lastNameScore,
    };
  });

  // Filter to patients with reasonable similarity (> 0.4) and sort by score
  const similarPatients = scoredPatients
    .filter((p: ScoredPatient) => p.score > 0.4)
    .sort((a: ScoredPatient, b: ScoredPatient) => b.score - a.score)
    .slice(0, limit);

  return similarPatients;
}

/**
 * Search for patient information based on natural language query
 * CRITICAL: All queries MUST be filtered by clinicId for multi-tenant isolation
 * This prevents data leakage between clinics (HIPAA compliance requirement)
 */
async function searchPatientData(query: string, clinicId: number, patientId?: number): Promise<any> {
  const queryLower = query.toLowerCase();

  // SECURITY: Log all AI queries for audit trail
  logger.info('[BeccaAI] Processing query with clinic isolation', {
    clinicId,
    patientId,
    queryType: 'search',
  });

  // Check for general platform statistics queries
  // SECURITY: Only count patients for the current clinic
  if (queryLower.includes('how many patient') || queryLower.includes('total patient') ||
      queryLower.includes('number of patient') || queryLower.includes('patient count')) {
    const totalPatients = await prisma.patient.count({
      where: { clinicId }, // CRITICAL: Filter by clinic
    });
    const recentPatients = await prisma.patient.findMany({
      where: { clinicId }, // CRITICAL: Filter by clinic
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        createdAt: true,
      },
    });
    return {
      statistics: {
        totalPatients,
        recentPatients,
      },
    };
  }

  // Extract potential patient name from query - more flexible pattern
  // Matches: "Italo Pignano", "for Italo Pignano", "about Jane Doe", etc.
  const namePatterns = [
    /(?:for|about|of|patient|named)\s+([A-Z][a-z]+)\s+([A-Z][a-z]+)/i,
    /what\s+is\s+([A-Z][a-z]+)\s+([A-Z][a-z]+)(?:'s|'s)/i,
    /([A-Z][a-z]+)\s+([A-Z][a-z]+)(?:'s|'s)\s+(?:date|birth|dob|prescription|tracking|age|address|phone|email|gender|information|info|details)/i,
    /(?:find|show|get|what is|what's)\s+([A-Z][a-z]+)\s+([A-Z][a-z]+)/i,
    /(?:^|\s)([A-Z][a-z]+)\s+([A-Z][a-z]+)(?:\s|$)/i, // Last resort: any two capitalized words
  ];

  let nameMatch = null;
  for (const pattern of namePatterns) {
    const match = query.match(pattern);
    if (match) {
      nameMatch = match;
      break;
    }
  }

  let targetPatient = null;

  if (patientId) {
    // Use specified patient - MUST verify clinic ownership
    targetPatient = await prisma.patient.findFirst({
      where: {
        id: patientId,
        clinicId, // CRITICAL: Ensure patient belongs to this clinic
      },
      include: {
        orders: {
          include: {
            rxs: true,
            events: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
        documents: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
        invoices: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
        soapNotes: {
          orderBy: { createdAt: 'desc' },
          take: 3,
        },
      },
    });

    // If patient exists but belongs to different clinic, don't expose that info
    if (!targetPatient) {
      logger.warn('[BeccaAI] Patient access denied - clinic mismatch or not found', {
        patientId,
        clinicId,
      });
    }
  } else if (nameMatch) {
    // Try to find patient by name - MUST filter by clinic
    const [, firstName, lastName] = nameMatch;

    // Try exact match first - SECURITY: Always include clinicId filter
    targetPatient = await prisma.patient.findFirst({
      where: {
        clinicId, // CRITICAL: Filter by clinic
        AND: [
          { firstName: { contains: firstName, mode: 'insensitive' } },
          { lastName: { contains: lastName, mode: 'insensitive' } },
        ],
      },
      include: {
        orders: {
          include: {
            rxs: true,
            events: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
        documents: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
        invoices: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
        soapNotes: {
          orderBy: { createdAt: 'desc' },
          take: 3,
        },
      },
    });

    // If no exact match, try partial match - SECURITY: Always include clinicId filter
    if (!targetPatient) {
      targetPatient = await prisma.patient.findFirst({
        where: {
          clinicId, // CRITICAL: Filter by clinic
          OR: [
            {
              AND: [
                { firstName: { contains: firstName, mode: 'insensitive' } },
                { lastName: { contains: lastName, mode: 'insensitive' } },
              ],
            },
            {
              AND: [
                { firstName: { startsWith: firstName, mode: 'insensitive' } },
                { lastName: { startsWith: lastName, mode: 'insensitive' } },
              ],
            },
          ],
        },
        include: {
          orders: {
            include: {
              rxs: true,
              events: true,
            },
            orderBy: { createdAt: 'desc' },
            take: 5,
          },
          documents: {
            orderBy: { createdAt: 'desc' },
            take: 5,
          },
          invoices: {
            orderBy: { createdAt: 'desc' },
            take: 5,
          },
          soapNotes: {
            orderBy: { createdAt: 'desc' },
            take: 3,
          },
        },
      });
    }
  }

  // If we found a specific patient by name, return their data
  if (targetPatient) {
    // Parse DOB if it's in MM/DD/YYYY format
    let age = null;
    let formattedDob = targetPatient.dob;
    if (targetPatient.dob) {
      try {
        // Try to parse MM/DD/YYYY format
        const dobParts = targetPatient.dob.split('/');
        if (dobParts.length === 3) {
          const month = parseInt(dobParts[0]) - 1; // JavaScript months are 0-indexed
          const day = parseInt(dobParts[1]);
          const year = parseInt(dobParts[2]);
          const dobDate = new Date(year, month, day);
          age = Math.floor((new Date().getTime() - dobDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25));
          formattedDob = dobDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        }
      } catch (e: any) {
    // @ts-ignore

        // If parsing fails, just use the original string
      }
    }

    return {
      type: 'patient_found',
      patient: targetPatient,
      summary: {
        name: `${targetPatient.firstName} ${targetPatient.lastName}`,
        dateOfBirth: formattedDob,
        age: age,
        gender: targetPatient.gender,
        phone: targetPatient.phone,
        email: targetPatient.email,
        address: `${targetPatient.address1}${targetPatient.address2 ? ' ' + targetPatient.address2 : ''}, ${targetPatient.city}, ${targetPatient.state} ${targetPatient.zip}`,
        orderCount: targetPatient.orders?.length || 0,
        documentCount: targetPatient.documents?.length || 0,
      },
    };
  }

  // If no specific patient found but searching by name
  // SECURITY: Only search within the current clinic
  if (nameMatch && !targetPatient) {
    const [, firstName, lastName] = nameMatch;

    // Use fuzzy matching to find similar patients
    const similarPatients = await findSimilarPatients(firstName, lastName, clinicId, 5);

    // If we have high-confidence matches, highlight the best one
    const bestMatch = similarPatients.length > 0 ? similarPatients[0] : null;
    const highConfidenceMatch = bestMatch && bestMatch.score > 0.8;

    // Build message based on whether we found similar patients
    let message: string;
    if (bestMatch) {
      message = `No exact match for "${firstName} ${lastName}", but found ${similarPatients.length} similar patient(s). Did you mean ${bestMatch.firstName} ${bestMatch.lastName}?`;
    } else {
      message = `No patient found with the name "${firstName} ${lastName}" in your clinic. Please check the spelling.`;
    }

    return {
      type: 'patient_not_found',
      searchedName: `${firstName} ${lastName}`,
      similarPatients: similarPatients.length > 0 ? similarPatients : undefined,
      highConfidenceMatch: highConfidenceMatch ? bestMatch : undefined,
      message,
      suggestions: similarPatients.map((p: ScoredPatient) => `${p.firstName} ${p.lastName}${p.dob ? ` (DOB: ${p.dob})` : ''}`),
    };
  }

  // Search by other criteria - SECURITY: All queries filtered by clinic
  if (queryLower.includes('tracking')) {
    // Search for recent orders with tracking - FILTER BY CLINIC
    const recentOrders = await prisma.order.findMany({
      where: {
        trackingNumber: { not: null },
        patient: { clinicId }, // CRITICAL: Filter by clinic through patient relation
      },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            clinicId: true,
          },
        },
        rxs: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    return {
      type: 'tracking_search',
      results: recentOrders,
    };
  }

  if (queryLower.includes('prescription') || queryLower.includes('medication')) {
    // Search for recent prescriptions - FILTER BY CLINIC
    const recentRx = await prisma.rx.findMany({
      where: {
        order: {
          patient: { clinicId }, // CRITICAL: Filter by clinic through relations
        },
      },
      include: {
        order: {
          include: {
            patient: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                clinicId: true,
              },
            },
          },
        },
      },
      orderBy: { id: 'desc' },
      take: 10,
    });

    return {
      type: 'prescription_search',
      results: recentRx,
    };
  }

  // Check for recent activity queries - SECURITY: All counts filtered by clinic
  if (queryLower.includes('recent') || queryLower.includes('today') || queryLower.includes('pending')) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [todayPatients, pendingOrders, recentIntakes] = await Promise.all([
      prisma.patient.count({
        where: {
          clinicId, // CRITICAL: Filter by clinic
          createdAt: { gte: today },
        },
      }),
      prisma.order.count({
        where: {
          status: 'PENDING',
          patient: { clinicId }, // CRITICAL: Filter by clinic
        },
      }),
      prisma.patientDocument.count({
        where: {
          clinicId, // CRITICAL: Filter by clinic
          createdAt: { gte: today },
          category: 'MEDICAL_INTAKE_FORM',
        },
      }),
    ]);

    return {
      type: 'activity_summary',
      todayPatients,
      pendingOrders,
      recentIntakes,
    };
  }

  // Default: return clinic-specific statistics
  // SECURITY: All counts filtered by clinic
  const [totalPatients, totalOrders, totalProviders] = await Promise.all([
    prisma.patient.count({
      where: { clinicId }, // CRITICAL: Filter by clinic
    }),
    prisma.order.count({
      where: { patient: { clinicId } }, // CRITICAL: Filter by clinic
    }),
    prisma.provider.count({
      where: {
        OR: [
          { clinicId }, // Direct clinic assignment
          { providerClinics: { some: { clinicId } } }, // Multi-clinic providers
        ],
      },
    }),
  ]);

  return {
    type: 'general_info',
    statistics: {
      totalPatients,
      totalOrders,
      totalProviders,
    },
  };
}

/**
 * Process a chat query and return an intelligent response
 * CRITICAL: clinicId is REQUIRED for multi-tenant data isolation
 * This ensures a provider can only access data for their own clinic
 */
export async function processAssistantQuery(
  query: string,
  userEmail: string,
  clinicId: number,
  sessionId?: string,
  patientId?: number
): Promise<{
  answer: string;
  sessionId: string;
  messageId: number;
  citations?: string[];
}> {
  // SECURITY: Log all AI queries with clinic context for audit trail
  logger.info('[BeccaAI] Processing assistant query', {
    userEmail,
    clinicId,
    patientId,
    hasSession: !!sessionId,
  });
  // Create or get conversation - SECURITY: Filter by clinicId
  let conversation;

  if (sessionId) {
    // CRITICAL: Only retrieve conversations for the user's clinic
    conversation = await prisma.aIConversation.findFirst({
      where: {
        sessionId,
        clinicId, // SECURITY: Ensure conversation belongs to this clinic
      },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });
  }

  if (!conversation) {
    // Create new conversation with clinic context for audit
    const newSessionId = sessionId || `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    conversation = await prisma.aIConversation.create({
      data: {
        sessionId: newSessionId,
        userEmail,
        clinicId, // CRITICAL: Store clinic for multi-tenant isolation
        patientId,
        isActive: true,
      },
      include: {
        messages: true,
      },
    });
  }

  // Store user message
  const userMessage = await prisma.aIMessage.create({
    data: {
      conversationId: conversation.id,
      role: 'user',
      content: query,
    },
  });

  try {
    // Detect query category to determine if we need patient data
    const queryCategory = detectQueryCategory(query);
    logger.debug('[BeccaAI] Query category detected', { queryCategory, query: query.substring(0, 50) });

    // Knowledge-based queries that don't require patient data lookup
    const knowledgeOnlyCategories: QueryCategory[] = [
      'medication_info',
      'dosing_protocol',
      'side_effects',
      'drug_interactions',
      'sig_help',
      'soap_note_help',
      'clinical_decision',
      'platform_operations',
    ];

    let patientContext: any = null;

    // Only search patient data if:
    // 1. Query is about patient data, OR
    // 2. A specific patientId was provided (user is on a patient's profile), OR
    // 3. Query is general but might need clinic statistics
    if (
      queryCategory === 'patient_data' ||
      queryCategory === 'general' ||
      patientId ||
      conversation.patientId
    ) {
      // Search for relevant patient data - CRITICAL: Pass clinicId for isolation
      patientContext = await searchPatientData(query, clinicId, patientId || conversation.patientId || undefined);

      // Check if this is a simple demographic query that can be answered directly
      // This avoids sending PHI to OpenAI and provides faster, more accurate responses
      const directAnswer = tryDirectAnswer(query, patientContext);
      if (directAnswer) {
        const startTime = Date.now();
        const responseTime = Date.now() - startTime;

        // Store assistant response
        const assistantMessage = await prisma.aIMessage.create({
          data: {
            conversationId: conversation.id,
            role: 'assistant',
            content: directAnswer.answer,
            queryType: directAnswer.queryType,
            confidence: 1.0, // Direct answers are always accurate
            responseTimeMs: responseTime,
          },
        });

        await prisma.aIConversation.update({
          where: { id: conversation.id },
          data: { lastMessageAt: new Date() },
        });

        return {
          answer: directAnswer.answer,
          sessionId: conversation.sessionId,
          messageId: assistantMessage.id,
        };
      }
    } else {
      // For knowledge-only queries, provide minimal context
      patientContext = {
        type: 'knowledge_query',
        category: queryCategory,
        message: 'This is a clinical/operational knowledge question. No patient data search was performed.',
      };
      logger.debug('[BeccaAI] Skipping patient data search for knowledge query', { queryCategory });
    }

    // Prepare conversation history for AI
    const conversationHistory = conversation.messages
      .reverse()
      .slice(-6) // Last 6 messages (3 exchanges)
      .map((msg: any) => ({
        role: msg.role,
        content: msg.content,
      }));

    // Query AI with context
    const startTime = Date.now();
    const aiResponse = await queryPatientData({
      query,
      patientContext,
      conversationHistory,
    });
    const responseTime = Date.now() - startTime;

    // Use detected query category for storage
    const queryType = queryCategory;

    // Strip any markdown formatting from the response
    let finalAnswer = stripMarkdown(aiResponse.answer);

    // Add medical disclaimer for clinical/medical queries (plain text version)
    if (requiresMedicalDisclaimer(queryCategory)) {
      // Only add disclaimer if it's not already present in the response
      if (!finalAnswer.includes('not medical advice')) {
        finalAnswer = `${finalAnswer}\n\nNote: For educational and informational purposes only. This is not medical advice. Always consult with a qualified healthcare provider for patient-specific decisions.`;
      }
    }

    // Store assistant response
    const assistantMessage = await prisma.aIMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'assistant',
        content: finalAnswer,
        queryType,
        confidence: aiResponse.confidence,
        citations: aiResponse.citations ? JSON.parse(JSON.stringify(aiResponse.citations)) : undefined,
        promptTokens: aiResponse.usage?.promptTokens,
        completionTokens: aiResponse.usage?.completionTokens,
        estimatedCost: aiResponse.usage?.estimatedCost,
        responseTimeMs: responseTime,
      },
    });

    // Update conversation last message time
    await prisma.aIConversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date() },
    });

    return {
      answer: finalAnswer,
      sessionId: conversation.sessionId,
      messageId: assistantMessage.id,
      citations: aiResponse.citations,
    };

  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error('[Assistant] Error processing query:', {
      error: errorMessage,
      query,
      patientId: patientId || conversation.patientId,
      userEmail,
      status: error.status,
      code: error.code,
    });

    // Store error message
    try {
      await prisma.aIMessage.create({
        data: {
          conversationId: conversation.id,
          role: 'assistant',
          content: 'I apologize, but I encountered an error processing your request. Please try again or contact support if the issue persists.',
          queryType: 'error',
        },
      });
    } catch (dbError: any) {
      logger.error('[Assistant] Failed to store error message:', dbError);
    }

    throw error;
  }
}

/**
 * Get conversation history
 * SECURITY: Filtered by clinicId for multi-tenant isolation
 */
export async function getConversationHistory(
  sessionId: string,
  clinicId: number,
  limit = 20
): Promise<any> {
  const conversation: any = await prisma.aIConversation.findFirst({
    where: {
      sessionId,
      clinicId, // CRITICAL: Filter by clinic
    },
    include: {
      messages: {
        orderBy: { createdAt: 'asc' },
        take: limit,
      },
      patient: true,
    },
  });

  if (!conversation) {
    throw new Error('Conversation not found');
  }

  return conversation;
}

/**
 * Get user's recent conversations
 * SECURITY: Filtered by clinicId for multi-tenant isolation
 */
export async function getUserConversations(
  userEmail: string,
  clinicId: number,
  limit = 10
): Promise<any[]> {
  const conversations = await prisma.aIConversation.findMany({
    where: {
      userEmail,
      clinicId, // CRITICAL: Filter by clinic
    },
    include: {
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
      patient: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
    },
    orderBy: { lastMessageAt: 'desc' },
    take: limit,
  });

  return conversations;
}

/**
 * End a conversation session
 * SECURITY: Filtered by clinicId to prevent cross-tenant manipulation
 */
export async function endConversation(sessionId: string, clinicId: number): Promise<void> {
  await prisma.aIConversation.updateMany({
    where: {
      sessionId,
      clinicId, // CRITICAL: Only end conversations for this clinic
    },
    data: { isActive: false },
  });
}

/**
 * Get usage statistics for monitoring
 */
export async function getAssistantUsageStats(
  startDate?: Date,
  endDate?: Date
): Promise<{
  totalMessages: number;
  totalCost: number;
  averageResponseTime: number;
  queryTypes: Record<string, number>;
}> {
  const where: any = {
    role: 'assistant',
  };

  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt.gte = startDate;
    if (endDate) where.createdAt.lte = endDate;
  }

  const messages = await prisma.aIMessage.findMany({
    where,
    select: {
      estimatedCost: true,
      responseTimeMs: true,
      queryType: true,
    },
  });

  const stats = {
    totalMessages: messages.length,
    totalCost: 0,
    averageResponseTime: 0,
    queryTypes: {} as Record<string, number>,
  };

  let totalResponseTime = 0;
  let responseCount = 0;

  messages.forEach((msg: any) => {
    if (msg.estimatedCost) stats.totalCost += msg.estimatedCost;
    if (msg.responseTimeMs) {
      totalResponseTime += msg.responseTimeMs;
      responseCount++;
    }
    if (msg.queryType) {
      stats.queryTypes[msg.queryType] = (stats.queryTypes[msg.queryType] || 0) + 1;
    }
  });

  if (responseCount > 0) {
    stats.averageResponseTime = Math.round(totalResponseTime / responseCount);
  }

  return stats;
}
