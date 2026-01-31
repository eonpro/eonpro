/**
 * Policy Management Service
 * 
 * Handles digital signatures for policy approvals (SOC 2 compliant)
 * 
 * Features:
 * - Executive policy approvals with digital signatures
 * - Employee policy acknowledgments
 * - Content hash verification (tamper detection)
 * - Full audit trail via HIPAA audit logging
 */

import { prisma } from '@/lib/prisma';
import { createHash } from 'crypto';
import { auditLog, AuditEventType } from '@/lib/audit/hipaa-audit';
import { NextRequest } from 'next/server';

// ============================================================================
// Types
// ============================================================================

export interface PolicyDefinition {
  policyId: string;
  title: string;
  version: string;
  effectiveDate: Date;
  content: string;
  approvalRoles: string[];
}

export interface ApprovalRequest {
  policyId: number;
  userId: number;
  userEmail: string;
  userName: string;
  userRole: string;
  approvalType: 'executive_approval' | 'ciso_approval' | 'compliance_approval';
  ipAddress: string;
  userAgent?: string;
}

export interface AcknowledgmentRequest {
  policyId: number;
  userId: number;
  userEmail: string;
  userName: string;
  userRole: string;
  clinicId?: number;
  ipAddress: string;
  userAgent?: string;
}

export interface PolicyApprovalStatus {
  policyId: string;
  title: string;
  version: string;
  status: string;
  requiredApprovals: string[];
  approvals: {
    type: string;
    approvedBy: string;
    approvedAt: Date;
  }[];
  isFullyApproved: boolean;
  acknowledgmentStats?: {
    total: number;
    acknowledged: number;
    pending: number;
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate SHA-256 hash of policy content for tamper detection
 */
export function hashPolicyContent(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Generate the legal signature statement
 */
export function generateSignatureStatement(
  approvalType: string,
  policyTitle: string,
  version: string
): string {
  const statements: Record<string, string> = {
    executive_approval: `I, as an authorized executive of this organization, hereby approve and adopt "${policyTitle}" (Version ${version}) as official company policy. I confirm that I have reviewed this policy and authorize its implementation effective immediately.`,
    ciso_approval: `I, as the Chief Information Security Officer, certify that "${policyTitle}" (Version ${version}) meets our security and compliance requirements. I approve this policy for implementation.`,
    compliance_approval: `I, as the Compliance Officer, confirm that "${policyTitle}" (Version ${version}) aligns with applicable regulatory requirements including HIPAA and SOC 2. I approve this policy.`,
    acknowledgment: `I acknowledge that I have read, understood, and agree to comply with "${policyTitle}" (Version ${version}). I understand that violation of this policy may result in disciplinary action.`,
  };

  return statements[approvalType] || statements.acknowledgment;
}

// ============================================================================
// Policy Management
// ============================================================================

/**
 * Create or update a policy in the system
 */
export async function upsertPolicy(policy: PolicyDefinition): Promise<number> {
  const contentHash = hashPolicyContent(policy.content);

  const result = await prisma.policy.upsert({
    where: { policyId: policy.policyId },
    create: {
      policyId: policy.policyId,
      title: policy.title,
      version: policy.version,
      effectiveDate: policy.effectiveDate,
      content: policy.content,
      contentHash,
      status: 'draft',
      requiresApproval: true,
      approvalRoles: policy.approvalRoles,
    },
    update: {
      title: policy.title,
      version: policy.version,
      effectiveDate: policy.effectiveDate,
      content: policy.content,
      contentHash,
      approvalRoles: policy.approvalRoles,
      updatedAt: new Date(),
    },
  });

  return result.id;
}

/**
 * Get all policies with their approval status
 */
export async function getAllPoliciesWithStatus(): Promise<PolicyApprovalStatus[]> {
  const policies = await prisma.policy.findMany({
    where: { status: { not: 'superseded' } },
    include: {
      PolicyApproval: {
        select: {
          approvalType: true,
          userName: true,
          approvedAt: true,
        },
      },
      _count: {
        select: { PolicyAcknowledgment: true },
      },
    },
    orderBy: { policyId: 'asc' },
  });

  // Get total users who need to acknowledge
  const totalUsers = await prisma.user.count({
    where: { status: 'active' },
  });

  return policies.map((policy) => {
    const requiredApprovals = ['executive_approval', 'ciso_approval'];
    const existingApprovalTypes = policy.PolicyApproval.map((a) => a.approvalType);
    const isFullyApproved = requiredApprovals.every((type) =>
      existingApprovalTypes.includes(type)
    );

    return {
      policyId: policy.policyId,
      title: policy.title,
      version: policy.version,
      status: policy.status,
      requiredApprovals,
      approvals: policy.PolicyApproval.map((a) => ({
        type: a.approvalType,
        approvedBy: a.userName,
        approvedAt: a.approvedAt,
      })),
      isFullyApproved,
      acknowledgmentStats: {
        total: totalUsers,
        acknowledged: policy._count.PolicyAcknowledgment,
        pending: totalUsers - policy._count.PolicyAcknowledgment,
      },
    };
  });
}

// ============================================================================
// Executive Approvals (Digital Signatures)
// ============================================================================

/**
 * Record an executive approval (digital signature)
 * 
 * This creates a legally binding digital signature with:
 * - Authenticated user identity
 * - Timestamp
 * - IP address and user agent
 * - Content hash at time of approval
 * - Explicit signature statement
 */
export async function approvePolicy(
  request: ApprovalRequest,
  httpRequest?: NextRequest
): Promise<{ success: boolean; approvalId?: number; error?: string }> {
  try {
    // Get the policy
    const policy = await prisma.policy.findUnique({
      where: { id: request.policyId },
    });

    if (!policy) {
      return { success: false, error: 'Policy not found' };
    }

    // Generate signature statement
    const signatureStatement = generateSignatureStatement(
      request.approvalType,
      policy.title,
      policy.version
    );

    // Create the approval record
    const approval = await prisma.policyApproval.create({
      data: {
        policyId: request.policyId,
        userId: request.userId,
        userEmail: request.userEmail,
        userName: request.userName,
        userRole: request.userRole,
        approvalType: request.approvalType,
        ipAddress: request.ipAddress,
        userAgent: request.userAgent,
        contentHashAtApproval: policy.contentHash,
        signatureStatement,
      },
    });

    // Check if policy is now fully approved
    const approvals = await prisma.policyApproval.findMany({
      where: { policyId: request.policyId },
    });

    const requiredApprovals = ['executive_approval', 'ciso_approval'];
    const existingTypes = approvals.map((a) => a.approvalType);
    const isFullyApproved = requiredApprovals.every((type) =>
      existingTypes.includes(type)
    );

    if (isFullyApproved) {
      await prisma.policy.update({
        where: { id: request.policyId },
        data: { status: 'active' },
      });
    }

    // Audit log
    await auditLog(httpRequest, {
      eventType: AuditEventType.SYSTEM_ACCESS,
      action: 'POLICY_APPROVED',
      resourceType: 'policy',
      resourceId: policy.policyId,
      userId: request.userId,
      userEmail: request.userEmail,
      outcome: 'SUCCESS',
      metadata: {
        policyTitle: policy.title,
        policyVersion: policy.version,
        approvalType: request.approvalType,
        contentHash: policy.contentHash,
        signatureStatement,
        ipAddress: request.ipAddress,
        fullyApproved: isFullyApproved,
      },
    });

    return { success: true, approvalId: approval.id };
  } catch (error: any) {
    if (error.code === 'P2002') {
      return { success: false, error: 'Policy already approved by this user' };
    }
    throw error;
  }
}

// ============================================================================
// Employee Acknowledgments
// ============================================================================

/**
 * Record an employee policy acknowledgment
 */
export async function acknowledgePolicy(
  request: AcknowledgmentRequest,
  httpRequest?: NextRequest
): Promise<{ success: boolean; acknowledgmentId?: number; error?: string }> {
  try {
    // Get the policy
    const policy = await prisma.policy.findUnique({
      where: { id: request.policyId },
    });

    if (!policy) {
      return { success: false, error: 'Policy not found' };
    }

    if (policy.status !== 'active') {
      return { success: false, error: 'Policy is not yet active' };
    }

    // Create the acknowledgment
    const acknowledgment = await prisma.policyAcknowledgment.create({
      data: {
        policyId: request.policyId,
        userId: request.userId,
        userEmail: request.userEmail,
        userName: request.userName,
        userRole: request.userRole,
        clinicId: request.clinicId,
        ipAddress: request.ipAddress,
        userAgent: request.userAgent,
        contentHashAtAcknowledgment: policy.contentHash,
      },
    });

    // Audit log
    await auditLog(httpRequest, {
      eventType: AuditEventType.SYSTEM_ACCESS,
      action: 'POLICY_ACKNOWLEDGED',
      resourceType: 'policy',
      resourceId: policy.policyId,
      userId: request.userId,
      userEmail: request.userEmail,
      outcome: 'SUCCESS',
      metadata: {
        policyTitle: policy.title,
        policyVersion: policy.version,
        contentHash: policy.contentHash,
        ipAddress: request.ipAddress,
      },
    });

    return { success: true, acknowledgmentId: acknowledgment.id };
  } catch (error: any) {
    if (error.code === 'P2002') {
      return { success: false, error: 'Policy already acknowledged' };
    }
    throw error;
  }
}

/**
 * Get pending policies for a user to acknowledge
 */
export async function getPendingAcknowledgments(
  userId: number
): Promise<{ policyId: string; title: string; version: string }[]> {
  const acknowledged = await prisma.policyAcknowledgment.findMany({
    where: { userId },
    select: { policyId: true },
  });

  const acknowledgedIds = acknowledged.map((a) => a.policyId);

  const pending = await prisma.policy.findMany({
    where: {
      status: 'active',
      id: { notIn: acknowledgedIds },
    },
    select: {
      policyId: true,
      title: true,
      version: true,
    },
  });

  return pending;
}

/**
 * Check if user has acknowledged all active policies
 */
export async function hasAcknowledgedAllPolicies(userId: number): Promise<boolean> {
  const pending = await getPendingAcknowledgments(userId);
  return pending.length === 0;
}

// ============================================================================
// Reporting
// ============================================================================

/**
 * Generate policy compliance report for auditors
 */
export async function generateComplianceReport(): Promise<{
  generatedAt: Date;
  policies: PolicyApprovalStatus[];
  acknowledgmentsByClinic: {
    clinicId: number;
    clinicName: string;
    acknowledged: number;
    total: number;
    percentage: number;
  }[];
  summary: {
    totalPolicies: number;
    fullyApproved: number;
    pendingApproval: number;
    overallAcknowledgmentRate: number;
  };
}> {
  const policies = await getAllPoliciesWithStatus();

  // Get acknowledgments by clinic
  const clinicStats = await prisma.$queryRaw<
    { clinicId: number; clinicName: string; acknowledged: number; total: number }[]
  >`
    SELECT 
      c.id as "clinicId",
      c.name as "clinicName",
      COUNT(DISTINCT pa."userId") as acknowledged,
      COUNT(DISTINCT u.id) as total
    FROM "Clinic" c
    LEFT JOIN "User" u ON u."clinicId" = c.id AND u.status = 'active'
    LEFT JOIN "PolicyAcknowledgment" pa ON pa."userId" = u.id
    GROUP BY c.id, c.name
  `;

  const acknowledgmentsByClinic = clinicStats.map((c) => ({
    ...c,
    acknowledged: Number(c.acknowledged),
    total: Number(c.total),
    percentage: c.total > 0 ? Math.round((Number(c.acknowledged) / Number(c.total)) * 100) : 0,
  }));

  const fullyApproved = policies.filter((p) => p.isFullyApproved).length;
  const totalAcknowledged = policies.reduce(
    (sum, p) => sum + (p.acknowledgmentStats?.acknowledged || 0),
    0
  );
  const totalRequired = policies.reduce(
    (sum, p) => sum + (p.acknowledgmentStats?.total || 0),
    0
  );

  return {
    generatedAt: new Date(),
    policies,
    acknowledgmentsByClinic,
    summary: {
      totalPolicies: policies.length,
      fullyApproved,
      pendingApproval: policies.length - fullyApproved,
      overallAcknowledgmentRate:
        totalRequired > 0 ? Math.round((totalAcknowledged / totalRequired) * 100) : 0,
    },
  };
}

/**
 * Export approval certificates for auditors
 */
export async function exportApprovalCertificate(policyId: string): Promise<{
  policy: {
    id: string;
    title: string;
    version: string;
    effectiveDate: Date;
    contentHash: string;
  };
  approvals: {
    approvalType: string;
    approvedBy: string;
    email: string;
    role: string;
    approvedAt: Date;
    ipAddress: string;
    signatureStatement: string;
    contentHashAtApproval: string;
  }[];
  integrityVerified: boolean;
}> {
  const policy = await prisma.policy.findUnique({
    where: { policyId },
    include: {
      PolicyApproval: true,
    },
  });

  if (!policy) {
    throw new Error('Policy not found');
  }

  // Verify content integrity
  const currentHash = hashPolicyContent(policy.content);
  const integrityVerified = policy.contentHash === currentHash;

  return {
    policy: {
      id: policy.policyId,
      title: policy.title,
      version: policy.version,
      effectiveDate: policy.effectiveDate,
      contentHash: policy.contentHash,
    },
    approvals: policy.PolicyApproval.map((a) => ({
      approvalType: a.approvalType,
      approvedBy: a.userName,
      email: a.userEmail,
      role: a.userRole,
      approvedAt: a.approvedAt,
      ipAddress: a.ipAddress,
      signatureStatement: a.signatureStatement,
      contentHashAtApproval: a.contentHashAtApproval,
    })),
    integrityVerified,
  };
}
