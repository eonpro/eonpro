/**
 * Admin Competition Management API
 * 
 * GET  /api/admin/competitions - List all competitions for the clinic
 * POST /api/admin/competitions - Create a new competition
 * 
 * @security Admin role only (clinic-scoped)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';

// GET - List competitions
export const GET = withAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    const clinicId = user.clinicId;
    
    if (!clinicId) {
      return NextResponse.json({ error: 'No clinic context' }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Build where clause
    const where: any = { clinicId };
    if (status && ['SCHEDULED', 'ACTIVE', 'COMPLETED', 'CANCELLED'].includes(status)) {
      where.status = status;
    }

    // Get competitions with participant counts
    const [competitions, total] = await Promise.all([
      prisma.affiliateCompetition.findMany({
        where,
        include: {
          _count: {
            select: { entries: true }
          },
          entries: {
            take: 3,
            orderBy: { currentValue: 'desc' },
            include: {
              affiliate: {
                select: { displayName: true }
              }
            }
          }
        },
        orderBy: [
          { status: 'asc' }, // ACTIVE first
          { startDate: 'desc' }
        ],
        take: limit,
        skip: offset,
      }),
      prisma.affiliateCompetition.count({ where }),
    ]);

    // Format response
    const formattedCompetitions = competitions.map(comp => ({
      id: comp.id,
      name: comp.name,
      description: comp.description,
      metric: comp.metric,
      startDate: comp.startDate.toISOString(),
      endDate: comp.endDate.toISOString(),
      status: comp.status,
      prizeDescription: comp.prizeDescription,
      prizeValueCents: comp.prizeValueCents,
      minParticipants: comp.minParticipants,
      isPublic: comp.isPublic,
      participantCount: comp._count.entries,
      topParticipants: comp.entries.map(e => ({
        affiliateId: e.affiliateId,
        displayName: e.affiliate.displayName,
        currentValue: e.currentValue,
        rank: e.rank,
      })),
      createdAt: comp.createdAt.toISOString(),
    }));

    return NextResponse.json({
      competitions: formattedCompetitions,
      total,
      limit,
      offset,
    });

  } catch (error) {
    logger.error('[Admin Competitions] Error listing competitions', error);
    return NextResponse.json({ error: 'Failed to list competitions' }, { status: 500 });
  }
}, { roles: ['admin', 'super_admin'] });

// POST - Create competition
export const POST = withAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    const clinicId = user.clinicId;
    
    if (!clinicId) {
      return NextResponse.json({ error: 'No clinic context' }, { status: 400 });
    }

    const body = await req.json();
    const {
      name,
      description,
      metric,
      startDate,
      endDate,
      prizeDescription,
      prizeValueCents,
      minParticipants,
      isPublic,
      autoEnrollAll, // If true, enroll all active affiliates
    } = body;

    // Validation
    if (!name || !metric || !startDate || !endDate) {
      return NextResponse.json({ 
        error: 'Missing required fields: name, metric, startDate, endDate' 
      }, { status: 400 });
    }

    const validMetrics = ['CLICKS', 'CONVERSIONS', 'REVENUE', 'CONVERSION_RATE', 'NEW_CUSTOMERS'];
    if (!validMetrics.includes(metric)) {
      return NextResponse.json({ 
        error: `Invalid metric. Must be one of: ${validMetrics.join(', ')}` 
      }, { status: 400 });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (end <= start) {
      return NextResponse.json({ error: 'End date must be after start date' }, { status: 400 });
    }

    // Determine initial status
    const now = new Date();
    let status = 'SCHEDULED';
    if (start <= now && end > now) {
      status = 'ACTIVE';
    } else if (end <= now) {
      status = 'COMPLETED';
    }

    // Create competition
    const competition = await prisma.affiliateCompetition.create({
      data: {
        clinicId,
        name,
        description: description || null,
        metric,
        startDate: start,
        endDate: end,
        status,
        prizeDescription: prizeDescription || null,
        prizeValueCents: prizeValueCents || null,
        minParticipants: minParticipants || 0,
        isPublic: isPublic !== false,
      }
    });

    // Auto-enroll all active affiliates if requested
    if (autoEnrollAll) {
      const activeAffiliates = await prisma.affiliate.findMany({
        where: {
          clinicId,
          status: 'ACTIVE',
        },
        select: { id: true }
      });

      if (activeAffiliates.length > 0) {
        await prisma.affiliateCompetitionEntry.createMany({
          data: activeAffiliates.map(a => ({
            competitionId: competition.id,
            affiliateId: a.id,
            currentValue: 0,
          }))
        });
      }
    }

    logger.info('[Admin Competitions] Competition created', {
      competitionId: competition.id,
      name: competition.name,
      metric: competition.metric,
      createdBy: user.id,
    });

    return NextResponse.json({
      success: true,
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
        isPublic: competition.isPublic,
      }
    }, { status: 201 });

  } catch (error) {
    logger.error('[Admin Competitions] Error creating competition', error);
    return NextResponse.json({ error: 'Failed to create competition' }, { status: 500 });
  }
}, { roles: ['admin', 'super_admin'] });
