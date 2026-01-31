/**
 * Admin Clinic Audit Logs API
 *
 * Provides access to clinic audit logs for HIPAA compliance and security monitoring.
 */

import { NextRequest, NextResponse } from 'next/server';
import { basePrisma as prisma } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';

/**
 * GET /api/admin/clinic/audit-logs
 * Get audit logs for the current clinic
 *
 * Query params:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 50, max: 100)
 * - action: Filter by action type
 * - userId: Filter by user ID
 * - startDate: Filter from date (ISO string)
 * - endDate: Filter to date (ISO string)
 */
export const GET = withAuth(async (request: NextRequest, user: AuthUser) => {
  try {
    if (!user.clinicId) {
      return NextResponse.json(
        { error: 'User is not associated with a clinic' },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50')));
    const action = searchParams.get('action');
    const userId = searchParams.get('userId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    // Build where clause
    const where: any = {
      clinicId: user.clinicId,
    };

    if (action) {
      where.action = action;
    }

    if (userId) {
      where.userId = parseInt(userId);
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate);
      }
      if (endDate) {
        where.createdAt.lte = new Date(endDate);
      }
    }

    // Get total count for pagination
    const total = await prisma.clinicAuditLog.count({ where });

    // Get logs
    const logs = await prisma.clinicAuditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        createdAt: true,
        action: true,
        details: true,
        ipAddress: true,
        userAgent: true,
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    // Get available action types for filtering
    const actionTypes = await prisma.clinicAuditLog.groupBy({
      by: ['action'],
      where: { clinicId: user.clinicId },
      _count: true,
    });

    return NextResponse.json({
      logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      actionTypes: actionTypes.map(a => ({
        action: a.action,
        count: a._count,
      })),
    });
  } catch (error) {
    logger.error('Error fetching audit logs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch audit logs' },
      { status: 500 }
    );
  }
}, { roles: ['admin', 'super_admin'] });

/**
 * POST /api/admin/clinic/audit-logs
 * Create a manual audit log entry (for admin actions not automatically logged)
 */
export const POST = withAuth(async (request: NextRequest, user: AuthUser) => {
  try {
    if (!user.clinicId) {
      return NextResponse.json(
        { error: 'User is not associated with a clinic' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { action, details } = body;

    if (!action) {
      return NextResponse.json(
        { error: 'Action is required' },
        { status: 400 }
      );
    }

    // Get IP and user agent from request
    const ipAddress = request.headers.get('x-forwarded-for') ||
                      request.headers.get('x-real-ip') ||
                      'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';

    const log = await prisma.clinicAuditLog.create({
      data: {
        clinicId: user.clinicId,
        action,
        userId: user.id,
        details: {
          ...details,
          createdBy: user.email,
        },
        ipAddress,
        userAgent,
      },
      select: {
        id: true,
        createdAt: true,
        action: true,
        details: true,
      },
    });

    return NextResponse.json({ log });
  } catch (error) {
    logger.error('Error creating audit log:', error);
    return NextResponse.json(
      { error: 'Failed to create audit log' },
      { status: 500 }
    );
  }
}, { roles: ['admin', 'super_admin'] });
