/**
 * HIPAA Audit Log API
 * ====================
 * Query and export audit logs for compliance reporting.
 *
 * GET /api/admin/audit-logs - Query audit logs with filters
 * GET /api/admin/audit-logs?format=csv - Export as CSV
 * GET /api/admin/audit-logs?stats=true - Get statistics
 *
 * @security Requires super_admin or admin role
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import {
  queryAuditLogs,
  getAuditStats,
  generateAuditReport,
  AuditEventType,
} from '@/lib/audit/hipaa-audit';
import { logger } from '@/lib/logger';

export const GET = withAuth(
  async (req: NextRequest, user) => {
    try {
      const { searchParams } = new URL(req.url);

      // Parse query parameters
      const startDate = searchParams.get('startDate');
      const endDate = searchParams.get('endDate');
      const userId = searchParams.get('userId');
      const patientId = searchParams.get('patientId');
      const eventType = searchParams.get('eventType') as AuditEventType | null;
      const outcome = searchParams.get('outcome') as 'SUCCESS' | 'FAILURE' | null;
      const format = searchParams.get('format') || 'json';
      const stats = searchParams.get('stats') === 'true';
      const limit = parseInt(searchParams.get('limit') || '100', 10);
      const offset = parseInt(searchParams.get('offset') || '0', 10);

      // Clinic scoping: admins can only see their clinic's logs
      const clinicId =
        user.role === 'admin'
          ? user.clinicId
          : searchParams.get('clinicId')
            ? parseInt(searchParams.get('clinicId')!, 10)
            : undefined;

      // If stats requested, return statistics
      if (stats) {
        if (!startDate || !endDate) {
          return NextResponse.json(
            { error: 'startDate and endDate required for stats' },
            { status: 400 }
          );
        }

        const auditStats = await getAuditStats({
          clinicId,
          startDate: new Date(startDate),
          endDate: new Date(endDate),
        });

        return NextResponse.json({
          success: true,
          stats: auditStats,
          dateRange: { startDate, endDate },
          clinicId,
        });
      }

      // Build filters
      const filters = {
        userId: userId || undefined,
        patientId: patientId ? parseInt(patientId, 10) : undefined,
        clinicId,
        eventType: eventType || undefined,
        outcome: outcome || undefined,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        limit: Math.min(limit, 1000), // Cap at 1000
        offset,
      };

      // Query logs
      const logs = await queryAuditLogs(filters);

      // Format response based on requested format
      if (format === 'csv') {
        const report = await generateAuditReport(
          filters.startDate || new Date(0),
          filters.endDate || new Date(),
          'csv'
        );

        return new Response(report as string, {
          headers: {
            'Content-Type': 'text/csv',
            'Content-Disposition': `attachment; filename="audit-log-${new Date().toISOString().split('T')[0]}.csv"`,
          },
        });
      }

      // Log that audit logs were accessed (meta-audit)
      logger.api('AUDIT_LOGS_ACCESSED', 'GET /api/admin/audit-logs', {
        accessedBy: user.email,
        role: user.role,
        filters,
        resultCount: logs.length,
      });

      return NextResponse.json({
        success: true,
        logs,
        count: logs.length,
        filters,
        pagination: {
          limit: filters.limit,
          offset: filters.offset,
          hasMore: logs.length === filters.limit,
        },
      });
    } catch (error) {
      logger.error('Failed to query audit logs', error as Error);
      return NextResponse.json({ error: 'Failed to query audit logs' }, { status: 500 });
    }
  },
  { roles: ['super_admin', 'admin'] }
);
