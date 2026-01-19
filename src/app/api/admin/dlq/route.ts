/**
 * Dead Letter Queue Admin API
 * 
 * Endpoints for monitoring and managing the DLQ.
 * 
 * GET /api/admin/dlq - Get queue status and submissions
 * POST /api/admin/dlq/retry/:id - Manual retry a submission
 * DELETE /api/admin/dlq/:id - Remove a submission
 */

import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-options';
import { logger } from '@/lib/integrations/logging';
import {
  isDLQConfigured,
  getAllSubmissions,
  getQueueStats,
  removeSubmission,
  queueFailedSubmission,
} from '@/lib/queue/deadLetterQueue';

export async function GET(req: NextRequest) {
  // Check authentication
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check for admin role
  const user = session.user as { role?: string };
  if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
    return Response.json({ error: 'Admin access required' }, { status: 403 });
  }

  if (!isDLQConfigured()) {
    return Response.json({
      configured: false,
      message: 'Dead Letter Queue is not configured. Add UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN to environment variables.',
    });
  }

  try {
    const [stats, submissions] = await Promise.all([
      getQueueStats(),
      getAllSubmissions(),
    ]);

    // Categorize submissions
    const pending = submissions.filter(s => s.attemptCount < 10);
    const exhausted = submissions.filter(s => s.attemptCount >= 10);

    return Response.json({
      configured: true,
      stats,
      summary: {
        pending: pending.length,
        exhausted: exhausted.length,
        total: submissions.length,
      },
      submissions: {
        pending: pending.map(s => ({
          id: s.id,
          source: s.source,
          attemptCount: s.attemptCount,
          nextRetryAt: s.nextRetryAt,
          lastError: s.lastError.slice(0, 100),
          metadata: s.metadata,
          createdAt: s.createdAt,
        })),
        exhausted: exhausted.map(s => ({
          id: s.id,
          source: s.source,
          attemptCount: s.attemptCount,
          lastError: s.lastError.slice(0, 100),
          metadata: s.metadata,
          createdAt: s.createdAt,
        })),
      },
    });
  } catch (err) {
    logger.error('[DLQ Admin] Failed to get queue status:', err);
    return Response.json({
      error: 'Failed to retrieve queue status',
      details: err instanceof Error ? err.message : 'Unknown error',
    }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  // Check authentication
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = session.user as { role?: string };
  if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
    return Response.json({ error: 'Admin access required' }, { status: 403 });
  }

  if (!isDLQConfigured()) {
    return Response.json({ error: 'DLQ not configured' }, { status: 400 });
  }

  try {
    const body = await req.json();
    const { id } = body;

    if (!id) {
      return Response.json({ error: 'Submission ID required' }, { status: 400 });
    }

    const removed = await removeSubmission(id);
    
    if (removed) {
      logger.info(`[DLQ Admin] Removed submission ${id} by ${session.user.email}`);
      return Response.json({ success: true, message: `Removed submission ${id}` });
    } else {
      return Response.json({ error: 'Submission not found' }, { status: 404 });
    }
  } catch (err) {
    logger.error('[DLQ Admin] Failed to remove submission:', err);
    return Response.json({
      error: 'Failed to remove submission',
      details: err instanceof Error ? err.message : 'Unknown error',
    }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  // Check authentication
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = session.user as { role?: string };
  if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
    return Response.json({ error: 'Admin access required' }, { status: 403 });
  }

  if (!isDLQConfigured()) {
    return Response.json({ error: 'DLQ not configured' }, { status: 400 });
  }

  try {
    const body = await req.json();
    const { action, id, payload, source, error, metadata } = body;

    if (action === 'manual_queue') {
      // Manually queue a submission for testing
      if (!payload || !source) {
        return Response.json({ error: 'payload and source required' }, { status: 400 });
      }
      
      const queuedId = await queueFailedSubmission(
        payload,
        source,
        error || 'Manual queue',
        metadata
      );
      
      logger.info(`[DLQ Admin] Manually queued submission ${queuedId} by ${session.user.email}`);
      return Response.json({ success: true, id: queuedId });
    }

    if (action === 'trigger_retry') {
      // Trigger immediate retry of all ready submissions
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL;
      const cronSecret = process.env.CRON_SECRET;
      
      const response = await fetch(
        `https://${baseUrl?.replace(/^https?:\/\//, '')}/api/cron/process-eonpro-queue`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(cronSecret ? { 'Authorization': `Bearer ${cronSecret}` } : {}),
          },
        }
      );
      
      const result = await response.json();
      logger.info(`[DLQ Admin] Triggered manual retry by ${session.user.email}`, result);
      return Response.json(result);
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    logger.error('[DLQ Admin] Failed:', err);
    return Response.json({
      error: 'Operation failed',
      details: err instanceof Error ? err.message : 'Unknown error',
    }, { status: 500 });
  }
}
