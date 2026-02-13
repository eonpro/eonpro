/**
 * Admin Competition Detail API
 *
 * GET    /api/admin/competitions/[id] - Get competition details with standings
 * PATCH  /api/admin/competitions/[id] - Update competition
 * DELETE /api/admin/competitions/[id] - Cancel competition
 *
 * @security Admin role only (clinic-scoped)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET - Get competition details with full standings
export const GET = withAuth(
  async (req: NextRequest, user: AuthUser, context?: RouteContext) => {
    try {
      const { id } = await context!.params;
      const competitionId = parseInt(id);

      if (isNaN(competitionId)) {
        return NextResponse.json({ error: 'Invalid competition ID' }, { status: 400 });
      }

      const clinicId = user.clinicId;
      if (!clinicId && user.role !== 'super_admin') {
        return NextResponse.json({ error: 'No clinic context' }, { status: 400 });
      }

      // Get competition with all entries
      const competition = await prisma.affiliateCompetition.findUnique({
        where: { id: competitionId },
        include: {
          entries: {
            orderBy: [{ rank: 'asc' }, { currentValue: 'desc' }],
            include: {
              affiliate: {
                select: {
                  id: true,
                  displayName: true,
                  leaderboardOptIn: true,
                  leaderboardAlias: true,
                },
              },
            },
          },
        },
      });

      if (!competition) {
        return NextResponse.json({ error: 'Competition not found' }, { status: 404 });
      }

      // Verify clinic access (unless super admin)
      if (user.role !== 'super_admin' && competition.clinicId !== clinicId) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }

      // Format standings
      const standings = competition.entries.map(
        (entry: (typeof competition.entries)[number], index: number) => ({
          rank: entry.rank || index + 1,
          affiliateId: entry.affiliateId,
          displayName: entry.affiliate.displayName,
          leaderboardAlias: entry.affiliate.leaderboardAlias,
          currentValue: entry.currentValue,
          formattedValue: formatMetricValue(competition.metric, entry.currentValue),
          updatedAt: entry.updatedAt.toISOString(),
        })
      );

      return NextResponse.json({
        competition: {
          id: competition.id,
          name: competition.name,
          description: competition.description,
          metric: competition.metric,
          startDate: competition.startDate.toISOString(),
          endDate: competition.endDate.toISOString(),
          status: competition.status,
          prizeDescription: competition.prizeDescription,
          prizeValueCents: competition.prizeValueCents,
          minParticipants: competition.minParticipants,
          isPublic: competition.isPublic,
          createdAt: competition.createdAt.toISOString(),
        },
        standings,
        participantCount: standings.length,
      });
    } catch (error) {
      logger.error('[Admin Competition] Error getting competition', error);
      return NextResponse.json({ error: 'Failed to get competition' }, { status: 500 });
    }
  },
  { roles: ['admin', 'super_admin'] }
);

// PATCH - Update competition
export const PATCH = withAuth(
  async (req: NextRequest, user: AuthUser, context?: RouteContext) => {
    try {
      const { id } = await context!.params;
      const competitionId = parseInt(id);

      if (isNaN(competitionId)) {
        return NextResponse.json({ error: 'Invalid competition ID' }, { status: 400 });
      }

      const clinicId = user.clinicId;
      if (!clinicId && user.role !== 'super_admin') {
        return NextResponse.json({ error: 'No clinic context' }, { status: 400 });
      }

      // Get existing competition
      const existing = await prisma.affiliateCompetition.findUnique({
        where: { id: competitionId },
      });

      if (!existing) {
        return NextResponse.json({ error: 'Competition not found' }, { status: 404 });
      }

      // Verify clinic access
      if (user.role !== 'super_admin' && existing.clinicId !== clinicId) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }

      const body = await req.json();
      const {
        name,
        description,
        startDate,
        endDate,
        status,
        prizeDescription,
        prizeValueCents,
        minParticipants,
        isPublic,
      } = body;

      // Build update data
      const updateData: any = {};

      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (prizeDescription !== undefined) updateData.prizeDescription = prizeDescription;
      if (prizeValueCents !== undefined) updateData.prizeValueCents = prizeValueCents;
      if (minParticipants !== undefined) updateData.minParticipants = minParticipants;
      if (isPublic !== undefined) updateData.isPublic = isPublic;

      // Handle date changes
      if (startDate) {
        updateData.startDate = new Date(startDate);
      }
      if (endDate) {
        updateData.endDate = new Date(endDate);
      }

      // Handle status changes
      if (status) {
        const validStatuses = ['SCHEDULED', 'ACTIVE', 'COMPLETED', 'CANCELLED'];
        if (!validStatuses.includes(status)) {
          return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
        }
        updateData.status = status;
      }

      // Update competition
      const updated = await prisma.affiliateCompetition.update({
        where: { id: competitionId },
        data: updateData,
      });

      logger.info('[Admin Competition] Competition updated', {
        competitionId,
        updatedBy: user.id,
        changes: Object.keys(updateData),
      });

      return NextResponse.json({
        success: true,
        competition: {
          id: updated.id,
          name: updated.name,
          description: updated.description,
          metric: updated.metric,
          startDate: updated.startDate.toISOString(),
          endDate: updated.endDate.toISOString(),
          status: updated.status,
          prizeDescription: updated.prizeDescription,
          prizeValueCents: updated.prizeValueCents,
          isPublic: updated.isPublic,
        },
      });
    } catch (error) {
      logger.error('[Admin Competition] Error updating competition', error);
      return NextResponse.json({ error: 'Failed to update competition' }, { status: 500 });
    }
  },
  { roles: ['admin', 'super_admin'] }
);

// DELETE - Cancel competition
export const DELETE = withAuth(
  async (req: NextRequest, user: AuthUser, context?: RouteContext) => {
    try {
      const { id } = await context!.params;
      const competitionId = parseInt(id);

      if (isNaN(competitionId)) {
        return NextResponse.json({ error: 'Invalid competition ID' }, { status: 400 });
      }

      const clinicId = user.clinicId;
      if (!clinicId && user.role !== 'super_admin') {
        return NextResponse.json({ error: 'No clinic context' }, { status: 400 });
      }

      // Get existing competition
      const existing = await prisma.affiliateCompetition.findUnique({
        where: { id: competitionId },
        include: { _count: { select: { entries: true } } },
      });

      if (!existing) {
        return NextResponse.json({ error: 'Competition not found' }, { status: 404 });
      }

      // Verify clinic access
      if (user.role !== 'super_admin' && existing.clinicId !== clinicId) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }

      // If competition has entries, soft-cancel instead of delete
      if (
        existing._count.entries > 0 ||
        existing.status === 'ACTIVE' ||
        existing.status === 'COMPLETED'
      ) {
        await prisma.affiliateCompetition.update({
          where: { id: competitionId },
          data: { status: 'CANCELLED' },
        });

        logger.info('[Admin Competition] Competition cancelled', {
          competitionId,
          cancelledBy: user.id,
        });

        return NextResponse.json({
          success: true,
          message: 'Competition cancelled',
          cancelled: true,
        });
      }

      // If scheduled with no entries, hard delete
      await prisma.affiliateCompetition.delete({
        where: { id: competitionId },
      });

      logger.info('[Admin Competition] Competition deleted', {
        competitionId,
        deletedBy: user.id,
      });

      return NextResponse.json({
        success: true,
        message: 'Competition deleted',
        deleted: true,
      });
    } catch (error) {
      logger.error('[Admin Competition] Error deleting competition', error);
      return NextResponse.json({ error: 'Failed to delete competition' }, { status: 500 });
    }
  },
  { roles: ['admin', 'super_admin'] }
);

// Helper to format metric values
function formatMetricValue(metric: string, value: number): string {
  switch (metric) {
    case 'CLICKS':
    case 'CONVERSIONS':
    case 'NEW_CUSTOMERS':
      return value.toLocaleString();
    case 'REVENUE':
      return `$${(value / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
    case 'CONVERSION_RATE':
      return `${(value / 100).toFixed(2)}%`; // Stored as basis points
    default:
      return value.toString();
  }
}
