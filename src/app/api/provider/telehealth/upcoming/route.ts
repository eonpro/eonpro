/**
 * Provider Upcoming Telehealth Sessions API
 * 
 * Returns upcoming video consultations for the authenticated provider.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withProviderAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/db';
import { isZoomEnabled } from '@/lib/integrations/zoom/config';

// Telehealth session status (matches Prisma enum once generated)
type TelehealthSessionStatus = 'SCHEDULED' | 'WAITING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW' | 'TECHNICAL_ISSUES';

/**
 * GET /api/provider/telehealth/upcoming
 * Get upcoming telehealth sessions for the authenticated provider
 */
export const GET = withProviderAuth(
  async (req: NextRequest, user: AuthUser) => {
    try {
      // Get provider from user
      const provider = await prisma.provider.findFirst({
        where: {
          OR: [
            { email: user.email },
            { user: { id: user.id } }
          ]
        }
      });

      if (!provider) {
        return NextResponse.json(
          { error: 'Provider not found' },
          { status: 404 }
        );
      }

      // Get upcoming sessions (next 7 days)
      const now = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 7);

      const sessions = await prisma.telehealthSession.findMany({
        where: {
          providerId: provider.id,
          scheduledAt: {
            gte: now,
            lte: endDate,
          },
          status: {
            in: ['SCHEDULED', 'WAITING'] as TelehealthSessionStatus[]
          }
        },
        include: {
          patient: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            }
          },
          appointment: {
            select: {
              id: true,
              title: true,
              reason: true,
            }
          }
        },
        orderBy: { scheduledAt: 'asc' },
        take: 10,
      });

      // Also get count of all upcoming
      const totalCount = await prisma.telehealthSession.count({
        where: {
          providerId: provider.id,
          scheduledAt: { gte: now },
          status: {
            in: ['SCHEDULED', 'WAITING'] as TelehealthSessionStatus[]
          }
        }
      });

      return NextResponse.json({
        sessions: sessions.map((s: any) => ({
          id: s.id,
          topic: s.topic,
          scheduledAt: s.scheduledAt.toISOString(),
          duration: s.duration,
          status: s.status,
          joinUrl: s.hostUrl || s.joinUrl, // Providers use host URL
          patient: s.patient,
          appointment: s.appointment,
        })),
        totalCount,
        zoomEnabled: isZoomEnabled(),
      });
    } catch (error) {
      logger.error('Failed to fetch upcoming telehealth sessions', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return NextResponse.json(
        { error: 'Failed to fetch sessions' },
        { status: 500 }
      );
    }
  }
);
