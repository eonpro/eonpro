/**
 * FEATURE FLAGS ADMIN API
 * =======================
 *
 * GET  /api/admin/feature-flags — List all flags with current status
 * POST /api/admin/feature-flags — Toggle a specific flag
 *
 * Requires super_admin authentication.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import {
  getAllFlags,
  setFeatureFlag,
  clearFlagCache,
  FeatureFlag,
  FLAG_METADATA,
} from '@/lib/feature-flags';
import { logger } from '@/lib/logger';
import { auditLog, AuditEventType } from '@/lib/audit/hipaa-audit';

async function handleGet(req: NextRequest, user: AuthUser) {
  if (user.role !== 'super_admin') {
    return NextResponse.json({ error: 'Super admin access required' }, { status: 403 });
  }

  const flags = await getAllFlags();

  return NextResponse.json({
    flags,
    totalFlags: flags.length,
    disabledCount: flags.filter((f) => !f.enabled).length,
    timestamp: new Date().toISOString(),
  });
}

async function handlePost(req: NextRequest, user: AuthUser) {
  if (user.role !== 'super_admin') {
    return NextResponse.json({ error: 'Super admin access required' }, { status: 403 });
  }

  const body = await req.json();
  const { flag, enabled } = body;

  // Validate flag name
  const validFlags = Object.values(FeatureFlag) as string[];
  if (!flag || !validFlags.includes(flag)) {
    return NextResponse.json(
      {
        error: 'Invalid flag name',
        validFlags,
      },
      { status: 400 }
    );
  }

  // Validate enabled is boolean
  if (typeof enabled !== 'boolean') {
    return NextResponse.json(
      { error: '`enabled` must be a boolean' },
      { status: 400 }
    );
  }

  const result = await setFeatureFlag(flag as FeatureFlag, enabled);

  if (!result.success) {
    return NextResponse.json(
      { error: 'Failed to update flag', details: result.error },
      { status: 500 }
    );
  }

  // Audit log the change
  const metadata = FLAG_METADATA[flag as FeatureFlag];
  logger.info('[FeatureFlags] Admin toggled flag', {
    flag,
    enabled,
    userId: user.id,
    userEmail: user.email,
  });

  try {
    await auditLog(req, {
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      eventType: AuditEventType.PERMISSION_CHANGE,
      resourceType: 'FeatureFlag',
      resourceId: flag,
      action: enabled ? 'ENABLE' : 'DISABLE',
      outcome: 'SUCCESS',
      metadata: {
        flag,
        enabled,
        description: metadata?.description,
        category: metadata?.category,
      },
    });
  } catch {
    // Don't fail the request if audit logging fails
  }

  // Clear cache so all instances pick up the change faster
  clearFlagCache();

  return NextResponse.json({
    success: true,
    flag,
    enabled,
    description: metadata?.description,
    timestamp: new Date().toISOString(),
  });
}

export const GET = withAuth(handleGet);
export const POST = withAuth(handlePost);
