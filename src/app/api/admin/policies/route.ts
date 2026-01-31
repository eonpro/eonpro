/**
 * Policy Management API
 * 
 * GET  /api/admin/policies - List all policies with approval status
 * POST /api/admin/policies/approve - Approve a policy (digital signature)
 * 
 * SOC 2 Requirement: Digital signatures for policy approvals
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import {
  getAllPoliciesWithStatus,
  approvePolicy,
  generateComplianceReport,
  exportApprovalCertificate,
} from '@/lib/policies/policy-service';

/**
 * GET /api/admin/policies
 * Get all policies with approval status
 */
async function handleGet(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const format = searchParams.get('format');
    const policyId = searchParams.get('policyId');

    // Export approval certificate for specific policy
    if (format === 'certificate' && policyId) {
      const certificate = await exportApprovalCertificate(policyId);
      return NextResponse.json(certificate);
    }

    // Full compliance report
    if (format === 'report') {
      const report = await generateComplianceReport();
      return NextResponse.json(report);
    }

    // Default: list all policies
    const policies = await getAllPoliciesWithStatus();
    return NextResponse.json({ policies });
  } catch (error: unknown) {
    console.error('Error fetching policies:', error);
    
    // Check if it's a database table not found error
    const prismaError = error as { code?: string; meta?: { table?: string } };
    if (prismaError.code === 'P2021' || (error instanceof Error && error.message.includes('does not exist'))) {
      return NextResponse.json(
        { 
          error: 'Policy tables not initialized. Please run database migrations.',
          setup_required: true,
          instructions: 'Run: npx prisma db push && npx tsx scripts/seed-policies.ts'
        },
        { status: 503 }
      );
    }
    
    // Return error details for debugging
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    return NextResponse.json(
      { 
        error: 'Failed to fetch policies',
        message: errorMessage,
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/policies
 * Approve a policy (digital signature)
 */
async function handlePost(req: NextRequest, user: any) {
  const body = await req.json();
  const { policyId, approvalType } = body;

  if (!policyId || !approvalType) {
    return NextResponse.json(
      { error: 'policyId and approvalType are required' },
      { status: 400 }
    );
  }

  // Validate approval type
  const validTypes = ['executive_approval', 'ciso_approval', 'compliance_approval'];
  if (!validTypes.includes(approvalType)) {
    return NextResponse.json(
      { error: `Invalid approvalType. Must be one of: ${validTypes.join(', ')}` },
      { status: 400 }
    );
  }

  // Only super_admin can approve policies
  if (user.role !== 'super_admin') {
    return NextResponse.json(
      { error: 'Only super admins can approve policies' },
      { status: 403 }
    );
  }

  // Get client IP
  const forwarded = req.headers.get('x-forwarded-for');
  const ipAddress = forwarded?.split(',')[0] || req.headers.get('x-real-ip') || 'unknown';

  const result = await approvePolicy(
    {
      policyId,
      userId: user.id,
      userEmail: user.email,
      userName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
      userRole: user.role,
      approvalType,
      ipAddress,
      userAgent: req.headers.get('user-agent') || undefined,
    },
    req
  );

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    approvalId: result.approvalId,
    message: `Policy approved with ${approvalType}`,
  });
}

// Protected routes - super_admin only
export const GET = withAuth(handleGet, { roles: ['super_admin', 'admin'] });
export const POST = withAuth(handlePost, { roles: ['super_admin'] });
