import { NextRequest, NextResponse } from 'next/server';
import { prisma, runWithClinicContext } from '@/lib/db';
import { logger } from '@/lib/logger';
import { withAuth, AuthUser } from '@/lib/auth/middleware';

/**
 * GET /api/messages/conversations - Get patient message conversations for provider
 * Returns a list of patients with their latest message
 */
async function getHandler(request: NextRequest, user: AuthUser) {
  try {
    logger.api('GET', '/api/messages/conversations', {
      userId: user.id,
      userRole: user.role,
      clinicId: user.clinicId
    });

    const clinicId = user.role === 'super_admin' ? undefined : user.clinicId;

    const conversations = await runWithClinicContext(clinicId, async () => {
      // Get all patients with their latest chat message
      const patients = await prisma.patient.findMany({
        select: {
          id: true,
          firstName: true,
          lastName: true,
          chatMessages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              id: true,
              message: true,
              createdAt: true,
              isFromPatient: true,
              isRead: true,
            }
          },
          _count: {
            select: {
              chatMessages: {
                where: {
                  isFromPatient: true,
                  isRead: false
                }
              }
            }
          }
        },
        orderBy: {
          updatedAt: 'desc'
        },
        take: 100
      });

      // Filter to only patients with messages and transform
      type PatientWithMessages = typeof patients[number];
      return patients
        .filter((p: PatientWithMessages) => p.chatMessages.length > 0)
        .map((p: PatientWithMessages) => ({
          id: p.chatMessages[0]?.id || p.id,
          patientId: p.id,
          patientName: `${p.firstName} ${p.lastName}`.trim(),
          lastMessage: p.chatMessages[0]?.message || '',
          timestamp: p.chatMessages[0]?.createdAt 
            ? formatTimestamp(p.chatMessages[0].createdAt)
            : '',
          unread: p._count.chatMessages > 0,
          priority: 'normal' as const // Could be enhanced with priority logic
        }));
    });

    return NextResponse.json({
      ok: true,
      conversations
    });
  } catch (error) {
    logger.error('Error fetching conversations:', error);
    return NextResponse.json(
      { error: 'Failed to fetch conversations', conversations: [] },
      { status: 500 }
    );
  }
}

function formatTimestamp(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  
  if (days === 0) {
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  } else if (days === 1) {
    return 'Yesterday';
  } else if (days < 7) {
    return date.toLocaleDateString('en-US', { weekday: 'short' });
  } else {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
}

export const GET = withAuth(getHandler, {
  roles: ['super_admin', 'admin', 'provider']
});
