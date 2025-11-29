import { z } from 'zod';
import { prisma } from '@/lib/db';
import { queryPatientData, type PatientQueryInput } from './openaiService';
import { logger } from '@/lib/logger';
import { Patient, Provider, Order } from '@/types/models';

/**
 * Becca AI Assistant Service
 * Handles intelligent querying of patient data and conversation management
 */

// Input validation schemas
export const chatQuerySchema = z.object({
  query: z.string().min(1).max(1000),
  sessionId: z.string().optional(),
  userEmail: z.string().email(),
  patientId: z.number().optional(),
});

export const conversationHistorySchema = z.object({
  sessionId: z.string(),
  limit: z.number().default(10),
});

/**
 * Search for patient information based on natural language query
 */
async function searchPatientData(query: string, patientId?: number): Promise<any> {
  const queryLower = query.toLowerCase();
  
  // Check for general platform statistics queries
  if (queryLower.includes('how many patient') || queryLower.includes('total patient') || 
      queryLower.includes('number of patient') || queryLower.includes('patient count')) {
    const totalPatients = await prisma.patient.count();
    const recentPatients = await prisma.patient.findMany({
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
    // Use specified patient
    targetPatient = await prisma.patient.findUnique({
      where: { id: patientId },
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
  } else if (nameMatch) {
    // Try to find patient by name - more flexible search
    const [, firstName, lastName] = nameMatch;
    
    // Try exact match first - using contains for case-insensitive matching in SQLite
    targetPatient = await // @ts-ignore
    prisma.patient.findFirst({
      where: {
        AND: [
          { firstName: { contains: firstName } },
          { lastName: { contains: lastName } },
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
    
    // If no exact match, try partial match (SQLite is case-insensitive by default for LIKE queries)
    if (!targetPatient) {
      targetPatient = await // @ts-ignore
    prisma.patient.findFirst({
        where: {
          OR: [
            {
              AND: [
                { firstName: { contains: firstName } },
                { lastName: { contains: lastName } },
              ],
            },
            {
              AND: [
                { firstName: { startsWith: firstName } },
                { lastName: { startsWith: lastName } },
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
  if (nameMatch && !targetPatient) {
    const [, firstName, lastName] = nameMatch;
    
    // Try to find similar patients (SQLite is case-insensitive by default for LIKE queries)
    const similarPatients = await prisma.patient.findMany({
      where: {
        OR: [
          { firstName: { contains: firstName } },
          { lastName: { contains: lastName } },
          { firstName: { contains: lastName } },
          { lastName: { contains: firstName } },
        ],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        dob: true,
        email: true,
      },
      take: 5,
    });
    
    return {
      type: 'patient_not_found',
      searchedName: `${firstName} ${lastName}`,
      similarPatients: similarPatients.length > 0  ? similarPatients  : undefined,
      message: `No patient found with the exact name "${firstName} ${lastName}"`,
    };
  }
  
  // Search by other criteria
  if (queryLower.includes('tracking')) {
    // Search for recent orders with tracking
    const recentOrders = await prisma.order.findMany({
      where: {
        trackingNumber: { not: null },
      },
      include: {
        patient: true,
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
    // Search for recent prescriptions
    const recentRx = await prisma.rx.findMany({
      include: {
        order: {
          include: {
            patient: true,
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
  
  // Check for recent activity queries
  if (queryLower.includes('recent') || queryLower.includes('today') || queryLower.includes('pending')) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const [todayPatients, pendingOrders, recentIntakes] = await Promise.all([
      prisma.patient.count({
        where: {
          createdAt: { gte: today },
        },
      }),
      prisma.order.count({
        where: {
          status: 'PENDING',
        },
      }),
      prisma.patientDocument.count({
        where: {
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
  
  // Default: return general platform statistics
  const [totalPatients, totalOrders, totalProviders] = await Promise.all([
    prisma.patient.count(),
    prisma.order.count(),
    prisma.provider.count(),
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
 */
export async function processAssistantQuery(
  query: string,
  userEmail: string,
  sessionId?: string,
  patientId?: number
): Promise<{
  answer: string;
  sessionId: string;
  messageId: number;
  citations?: string[];
}> {
  // Create or get conversation
  let conversation;
  
  if (sessionId) {
    conversation = await prisma.aIConversation.findFirst({
      where: { sessionId },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });
  }
  
  if (!conversation) {
    // Create new conversation
    const newSessionId = sessionId || `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    conversation = await prisma.aIConversation.create({
      data: {
        sessionId: newSessionId,
        userEmail,
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
    // Search for relevant patient data
    const patientContext = await searchPatientData(query, patientId || conversation.patientId || undefined);
    
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
    
    // Determine query type
    let queryType = 'general';
    const queryLower = query.toLowerCase();
    if (queryLower.includes('tracking') || queryLower.includes('ship')) {
      queryType = 'tracking_info';
    } else if (queryLower.includes('prescription') || queryLower.includes('medication')) {
      queryType = 'prescription_info';
    } else if (queryLower.includes('birth') || queryLower.includes('dob') || queryLower.includes('age')) {
      queryType = 'demographics';
    } else if (queryLower.includes('soap') || queryLower.includes('note')) {
      queryType = 'clinical_notes';
    } else if (queryLower.includes('invoice') || queryLower.includes('payment') || queryLower.includes('bill')) {
      queryType = 'billing';
    }
    
    // Store assistant response
    const assistantMessage = await prisma.aIMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'assistant',
        content: aiResponse.answer,
        queryType,
        confidence: aiResponse.confidence,
        citations: aiResponse.citations  ? JSON.parse(JSON.stringify(aiResponse.citations))  : undefined,
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
      answer: aiResponse.answer,
      sessionId: conversation.sessionId,
      messageId: assistantMessage.id,
      citations: aiResponse.citations,
    };
    
  } catch (error: any) {
    // @ts-ignore
   
    logger.error('[Assistant] Error processing query:', error);
    
    // Store error message
    await prisma.aIMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'assistant',
        content: 'I apologize, but I encountered an error processing your request. Please try again or contact support if the issue persists.',
        queryType: 'error',
      },
    });
    
    throw error;
  }
}

/**
 * Get conversation history
 */
export async function getConversationHistory(
  sessionId: string,
  limit = 20
): Promise<any> {
  const conversation: any = await prisma.aIConversation.findFirst({
    where: { sessionId },
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
 */
export async function getUserConversations(
  userEmail: string,
  limit = 10
): Promise<any[]> {
  const conversations = await prisma.aIConversation.findMany({
    where: { userEmail },
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
 */
export async function endConversation(sessionId: string): Promise<void> {
  await prisma.aIConversation.updateMany({
    where: { sessionId },
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
