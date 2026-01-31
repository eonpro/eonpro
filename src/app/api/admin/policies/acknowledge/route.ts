/**
 * Policy Acknowledgment API
 * 
 * GET  /api/admin/policies/acknowledge - Get pending policies for current user
 * POST /api/admin/policies/acknowledge - Acknowledge a policy
 * 
 * SOC 2 Requirement: Employee policy acknowledgments
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import {
  getPendingAcknowledgments,
  acknowledgePolicy,
  hasAcknowledgedAllPolicies,
} from '@/lib/policies/policy-service';

/**
 * GET /api/admin/policies/acknowledge
 * Get policies pending acknowledgment for current user
 */
async function handleGet(req: NextRequest, user: any) {
  const pending = await getPendingAcknowledgments(user.id);
  const allAcknowledged = await hasAcknowledgedAllPolicies(user.id);

  return NextResponse.json({
    pending,
    allAcknowledged,
    count: pending.length,
  });
}

/**
 * POST /api/admin/policies/acknowledge
 * Acknowledge a policy
 */
async function handlePost(req: NextRequest, user: any) {
  const body = await req.json();
  const { policyId } = body;

  if (!policyId) {
    return NextResponse.json(
      { error: 'policyId is required' },
      { status: 400 }
    );
  }

  // Get client IP
  const forwarded = req.headers.get('x-forwarded-for');
  const ipAddress = forwarded?.split(',')[0] || req.headers.get('x-real-ip') || 'unknown';

  const result = await acknowledgePolicy(
    {
      policyId,
      userId: user.id,
      userEmail: user.email,
      userName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
      userRole: user.role,
      clinicId: user.clinicId,
      ipAddress,
      userAgent: req.headers.get('user-agent') || undefined,
    },
    req
  );

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  // Check if all policies are now acknowledged
  const allAcknowledged = await hasAcknowledgedAllPolicies(user.id);

  return NextResponse.json({
    success: true,
    acknowledgmentId: result.acknowledgmentId,
    allAcknowledged,
    message: 'Policy acknowledged successfully',
  });
}

// All authenticated users can acknowledge
export const GET = withAuth(handleGet);
export const POST = withAuth(handlePost);
