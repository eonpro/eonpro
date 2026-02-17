import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { basePrisma as prisma } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import bcrypt from 'bcryptjs';

/**
 * Middleware to check for Super Admin role
 */
function withSuperAdminAuth(
  handler: (
    req: NextRequest,
    user: AuthUser,
    params: { id: string; userId: string }
  ) => Promise<Response>
) {
  return async (req: NextRequest, context: { params: Promise<{ id: string; userId: string }> }) => {
    const params = await context.params;
    return withAuth((req: NextRequest, user: AuthUser) => handler(req, user, params), {
      roles: ['super_admin', 'super_admin'],
    })(req);
  };
}

/**
 * GET /api/super-admin/clinics/[id]/users/[userId]
 * Get a specific user
 */
export const GET = withSuperAdminAuth(
  async (req: NextRequest, user: AuthUser, params: { id: string; userId: string }) => {
    try {
      const clinicId = parseInt(params.id);
      const userId = parseInt(params.userId);

      if (isNaN(clinicId) || isNaN(userId)) {
        return NextResponse.json({ error: 'Invalid clinic or user ID' }, { status: 400 });
      }

      const clinicUser = await prisma.user.findFirst({
        where: {
          id: userId,
          clinicId,
        },
        select: {
          id: true,
          email: true,
          phone: true,
          firstName: true,
          lastName: true,
          role: true,
          status: true,
          createdAt: true,
          lastLogin: true,
        },
      });

      if (!clinicUser) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      return NextResponse.json({ user: clinicUser });
    } catch (error) {
      logger.error('Error fetching user', error instanceof Error ? error : undefined, {
        route: 'GET /api/super-admin/clinics/[id]/users/[userId]',
        userId: params.userId,
      });
      return NextResponse.json({ error: 'Failed to fetch user' }, { status: 500 });
    }
  }
);

/**
 * PUT /api/super-admin/clinics/[id]/users/[userId]
 * Update a user (including password reset and provider credentials)
 */
export const PUT = withSuperAdminAuth(
  async (req: NextRequest, user: AuthUser, params: { id: string; userId: string }) => {
    try {
      const clinicId = parseInt(params.id);
      const userId = parseInt(params.userId);

      if (isNaN(clinicId) || isNaN(userId)) {
        return NextResponse.json({ error: 'Invalid clinic or user ID' }, { status: 400 });
      }

      // Verify user belongs to this clinic (including multi-clinic via UserClinic)
      const existingUser = await prisma.user.findFirst({
        where: {
          id: userId,
          OR: [{ clinicId }, { userClinics: { some: { clinicId, isActive: true } } }],
        },
        include: { provider: true },
      });

      if (!existingUser) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      const body = await req.json();
      const {
        firstName,
        lastName,
        role,
        status,
        password,
        phone,
        // Provider credentials
        npi,
        deaNumber,
        licenseNumber,
        licenseState,
        specialty,
      } = body;

      // Build update data
      const updateData: any = {};
      if (firstName !== undefined) updateData.firstName = firstName;
      if (lastName !== undefined) updateData.lastName = lastName;
      if (role !== undefined) updateData.role = role;
      if (status !== undefined) updateData.status = status;
      if (phone !== undefined) updateData.phone = phone || null;

      // Handle password reset
      if (password) {
        if (password.length < 12) {
          return NextResponse.json(
            { error: 'Password must be at least 8 characters' },
            { status: 400 }
          );
        }
        updateData.passwordHash = await bcrypt.hash(password, 12);
        updateData.lastPasswordChange = new Date();
      }

      // Update user
      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: updateData,
        select: {
          id: true,
          email: true,
          phone: true,
          firstName: true,
          lastName: true,
          role: true,
          status: true,
          createdAt: true,
          lastLogin: true,
          providerId: true,
        },
      });

      // Handle provider credentials for PROVIDER role
      const effectiveRole = (role || existingUser.role)?.toLowerCase();
      if (effectiveRole === 'provider' && npi) {
        // Validate NPI format
        if (!/^\d{10}$/.test(npi)) {
          return NextResponse.json({ error: 'NPI must be exactly 10 digits' }, { status: 400 });
        }

        if (existingUser.provider) {
          // Update existing provider
          // Check if NPI is changing and already in use
          if (npi !== existingUser.provider.npi) {
            const npiInUse = await prisma.provider.findFirst({
              where: { npi, id: { not: existingUser.provider.id } },
            });
            if (npiInUse) {
              return NextResponse.json(
                { error: 'This NPI is already registered to another provider' },
                { status: 400 }
              );
            }
          }

          await prisma.provider.update({
            where: { id: existingUser.provider.id },
            data: {
              npi,
              dea: deaNumber || existingUser.provider.dea,
              licenseNumber: licenseNumber || existingUser.provider.licenseNumber,
              licenseState: licenseState || existingUser.provider.licenseState,
              titleLine: specialty || existingUser.provider.titleLine,
              firstName: firstName || existingUser.provider.firstName,
              lastName: lastName || existingUser.provider.lastName,
              // Make provider shared for multi-clinic support
              clinicId: null,
            },
          });
        } else {
          // Create new provider and link to user
          // Check if NPI is already in use
          const npiInUse = await prisma.provider.findFirst({
            where: { npi },
          });

          if (npiInUse) {
            // Link existing provider to this user if emails match
            if (npiInUse.email === existingUser.email) {
              await prisma.user.update({
                where: { id: userId },
                data: { providerId: npiInUse.id },
              });
              // Make provider shared
              await prisma.provider.update({
                where: { id: npiInUse.id },
                data: { clinicId: null },
              });
            } else {
              return NextResponse.json(
                { error: 'This NPI is already registered to another provider' },
                { status: 400 }
              );
            }
          } else {
            // Create new provider
            const newProvider = await prisma.provider.create({
              data: {
                email: existingUser.email,
                firstName: firstName || existingUser.firstName,
                lastName: lastName || existingUser.lastName,
                npi,
                dea: deaNumber || null,
                licenseNumber: licenseNumber || null,
                licenseState: licenseState || null,
                titleLine: specialty || null,
                clinicId: null, // Shared across clinics
              },
            });

            // Link provider to user
            await prisma.user.update({
              where: { id: userId },
              data: { providerId: newProvider.id },
            });
          }
        }
      }

      // Also update UserClinic role if it changed
      if (role) {
        await prisma.userClinic.updateMany({
          where: { userId, clinicId },
          data: { role: role.toUpperCase() },
        });
      }

      return NextResponse.json({
        user: updatedUser,
        message: password
          ? 'User updated and password reset successfully'
          : 'User updated successfully',
      });
    } catch (error) {
      logger.error('Error updating user', error instanceof Error ? error : undefined, {
        route: 'PUT /api/super-admin/clinics/[id]/users/[userId]',
        userId: params.userId,
      });
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Failed to update user' },
        { status: 500 }
      );
    }
  }
);

/**
 * DELETE /api/super-admin/clinics/[id]/users/[userId]
 * Remove a user from a clinic
 */
export const DELETE = withSuperAdminAuth(
  async (req: NextRequest, user: AuthUser, params: { id: string; userId: string }) => {
    try {
      const clinicId = parseInt(params.id);
      const userId = parseInt(params.userId);

      if (isNaN(clinicId) || isNaN(userId)) {
        return NextResponse.json({ error: 'Invalid clinic or user ID' }, { status: 400 });
      }

      // Check if user is connected via UserClinic (multi-clinic) or primary clinicId
      const userClinicLink = await prisma.userClinic.findFirst({
        where: {
          userId,
          clinicId,
        },
      });

      const existingUser = await prisma.user.findFirst({
        where: {
          id: userId,
          OR: [
            { clinicId }, // Primary clinic
            { userClinics: { some: { clinicId, isActive: true } } }, // Multi-clinic
          ],
        },
        include: { provider: true },
      });

      if (!existingUser) {
        return NextResponse.json({ error: 'User not found in this clinic' }, { status: 404 });
      }

      // If user has multiple clinics, just remove from this clinic (don't delete user)
      const userClinicCount = await prisma.userClinic.count({
        where: { userId, isActive: true },
      });

      const isPrimaryClinic = existingUser.clinicId === clinicId;

      // If user belongs to multiple clinics and this isn't their only/primary clinic,
      // just remove the clinic association instead of deleting the user
      if (userClinicLink && (userClinicCount > 1 || !isPrimaryClinic)) {
        await prisma.userClinic.delete({
          where: { id: userClinicLink.id },
        });

        return NextResponse.json({
          message: 'User removed from clinic successfully',
        });
      }

      // Helper function to safely delete from a model
      const safeDeleteMany = async (tx: Prisma.TransactionClient, modelName: string, where: Prisma.InputJsonValue) => {
        try {
          const model = (tx as any)[modelName];
          if (model && typeof model.deleteMany === 'function') {
            await model.deleteMany({ where });
          }
        } catch (e: any) {
          logger.warn(`Could not delete from ${modelName}`, { message: (e as Error).message });
        }
      };

      // Helper function to safely update a model
      const safeUpdateMany = async (tx: Prisma.TransactionClient, modelName: string, where: Prisma.InputJsonValue, data: Prisma.InputJsonValue) => {
        try {
          const model = (tx as any)[modelName];
          if (model && typeof model.updateMany === 'function') {
            await model.updateMany({ where, data });
          }
        } catch (e: any) {
          logger.warn(`Could not update ${modelName}`, { message: (e as Error).message });
        }
      };

      // Delete all related records in a transaction
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        // ── Affiliate portal cleanup (must happen before user delete) ──
        const affiliate = await (tx as any).affiliate?.findUnique?.({ where: { userId }, select: { id: true } });
        if (affiliate) {
          const affId = affiliate.id;
          // Affiliate child records (order matters for FK constraints)
          await safeDeleteMany(tx, 'affiliateOtpCode', { affiliateId: affId });
          await safeDeleteMany(tx, 'affiliateCompetitionEntry', { affiliateId: affId });
          await safeDeleteMany(tx, 'affiliateCommissionEvent', { affiliateId: affId });
          await safeDeleteMany(tx, 'affiliatePlanAssignment', { affiliateId: affId });
          await safeDeleteMany(tx, 'affiliateRefCode', { affiliateId: affId });
          await safeDeleteMany(tx, 'affiliateTouch', { affiliateId: affId });
          await safeDeleteMany(tx, 'affiliateFraudAlert', { affiliateId: affId });
          await safeDeleteMany(tx, 'affiliateTaxDocument', { affiliateId: affId });
          await safeDeleteMany(tx, 'affiliatePayoutItem', { affiliateId: affId });
          await safeDeleteMany(tx, 'affiliatePayout', { affiliateId: affId });
          await safeDeleteMany(tx, 'affiliatePayoutMethod', { affiliateId: affId });
          // Unlink patients attributed to this affiliate
          await safeUpdateMany(tx, 'patient', { attributionAffiliateId: affId }, { attributionAffiliateId: null });
          // Unlink application if exists
          await safeUpdateMany(tx, 'affiliateApplication', { affiliateId: affId }, { affiliateId: null });
          // Delete the affiliate record itself
          await safeDeleteMany(tx, 'affiliate', { id: affId });
        }

        // ── Sessions & auth tokens ──
        await safeDeleteMany(tx, 'userSession', { userId });
        await safeDeleteMany(tx, 'passwordResetToken', { userId });
        await safeDeleteMany(tx, 'emailVerificationToken', { userId });

        // ── Audit logs ──
        await safeDeleteMany(tx, 'userAuditLog', { userId });
        await safeDeleteMany(tx, 'clinicAuditLog', { userId });
        await safeDeleteMany(tx, 'auditLog', { userId });
        await safeUpdateMany(tx, 'loginAudit', { userId }, { userId: null });

        // ── User clinic assignments ──
        await safeDeleteMany(tx, 'userClinic', { userId });

        // ── API keys and usage logs ──
        try {
          const apiKeys = (await (tx as any).apiKey?.findMany?.({ where: { userId }, select: { id: true } })) || [];
          for (const key of apiKeys) {
            await safeDeleteMany(tx, 'apiUsageLog', { apiKeyId: key.id });
          }
          await safeDeleteMany(tx, 'apiKey', { userId });
        } catch (e: any) {
          logger.warn('Could not delete API keys', { message: (e as Error).message });
        }

        // ── Ticket references (set to null to preserve ticket history) ──
        await safeUpdateMany(tx, 'ticket', { createdById: userId }, { createdById: null });
        await safeUpdateMany(tx, 'ticket', { assignedToId: userId }, { assignedToId: null });
        await safeUpdateMany(tx, 'ticket', { resolvedById: userId }, { resolvedById: null });
        await safeUpdateMany(tx, 'ticket', { ownerId: userId }, { ownerId: null });
        await safeUpdateMany(tx, 'ticket', { lastWorkedById: userId }, { lastWorkedById: null });
        await safeUpdateMany(tx, 'ticket', { lastReopenedById: userId }, { lastReopenedById: null });
        await safeUpdateMany(tx, 'ticket', { lockedById: userId }, { lockedById: null });
        await safeUpdateMany(tx, 'ticket', { closedById: userId }, { closedById: null });

        // ── Ticket child records ──
        await safeDeleteMany(tx, 'ticketAssignment', { assignedById: userId });
        await safeDeleteMany(tx, 'ticketAssignment', { assignedToId: userId });
        await safeDeleteMany(tx, 'ticketComment', { userId });
        await safeDeleteMany(tx, 'ticketStatusHistory', { changedById: userId });
        await safeDeleteMany(tx, 'ticketWorkLog', { userId });
        await safeDeleteMany(tx, 'ticketEscalation', { escalatedById: userId });
        await safeDeleteMany(tx, 'ticketEscalation', { escalatedToId: userId });
        await safeDeleteMany(tx, 'ticketTeamMember', { userId });
        await safeDeleteMany(tx, 'ticketWatcher', { userId });
        await safeDeleteMany(tx, 'ticketWatcher', { addedById: userId });
        await safeDeleteMany(tx, 'ticketRelation', { createdById: userId });
        await safeDeleteMany(tx, 'ticketAttachment', { uploadedById: userId });
        await safeDeleteMany(tx, 'ticketActivity', { userId });
        await safeDeleteMany(tx, 'ticketMerge', { mergedById: userId });
        await safeDeleteMany(tx, 'ticketMacro', { createdById: userId });
        await safeDeleteMany(tx, 'ticketTemplate', { createdById: userId });
        await safeDeleteMany(tx, 'ticketAutomationRule', { createdById: userId });
        await safeDeleteMany(tx, 'ticketSavedView', { userId });

        // ── Messaging ──
        await safeDeleteMany(tx, 'messageReaction', { userId });
        await safeDeleteMany(tx, 'internalMessage', { senderId: userId });
        await safeDeleteMany(tx, 'internalMessage', { recipientId: userId });

        // ── Notifications & email ──
        await safeDeleteMany(tx, 'notification', { userId });
        await safeDeleteMany(tx, 'userNotificationPreference', { userId });
        await safeDeleteMany(tx, 'emailLog', { userId });
        await safeDeleteMany(tx, 'scheduledEmail', { userId });

        // ── Appointments & care plans ──
        await safeUpdateMany(tx, 'appointment', { createdById: userId }, { createdById: null });
        await safeDeleteMany(tx, 'carePlanProgress', { recordedById: userId });
        await safeDeleteMany(tx, 'carePlanTemplate', { createdById: userId });

        // ── Sales rep assignments ──
        await safeDeleteMany(tx, 'patientSalesRepAssignment', { salesRepId: userId });
        await safeUpdateMany(tx, 'patientSalesRepAssignment', { assignedById: userId }, { assignedById: null });
        await safeUpdateMany(tx, 'patientSalesRepAssignment', { removedById: userId }, { removedById: null });

        // ── Financial reports ──
        await safeDeleteMany(tx, 'savedReport', { userId });
        await safeDeleteMany(tx, 'reportExport', { userId });

        // ── SOC 2 policy management ──
        await safeDeleteMany(tx, 'policyApproval', { userId });
        await safeDeleteMany(tx, 'policyAcknowledgment', { userId });

        // ── Settings & integrations (set to null) ──
        await safeUpdateMany(tx, 'systemSettings', { updatedById: userId }, { updatedById: null });
        await safeUpdateMany(tx, 'integration', { createdById: userId }, { createdById: null });

        // ── Intake templates ──
        await safeUpdateMany(tx, 'intakeFormTemplate', { createdById: userId }, { createdById: null });

        // ── Patient portal invites ──
        await safeUpdateMany(tx, 'patientPortalInvite', { createdById: userId }, { createdById: null });

        // ── Clinic invite codes ──
        await safeUpdateMany(tx, 'clinicInviteCode', { createdById: userId }, { createdById: null });

        // ── Provider relationship (unlink, keep record for audit) ──
        if (existingUser.providerId) {
          await tx.user.update({
            where: { id: userId },
            data: { providerId: null },
          });
        }

        // ── Influencer relationship (unlink) ──
        if ((existingUser as any).influencerId) {
          await tx.user.update({
            where: { id: userId },
            data: { influencerId: null },
          });
        }

        // ── Patient relationship (unlink) ──
        if ((existingUser as any).patientId) {
          await tx.user.update({
            where: { id: userId },
            data: { patientId: null },
          });
        }

        // ── Users created by this user (set to null) ──
        await safeUpdateMany(tx, 'user', { createdById: userId }, { createdById: null });

        // Finally delete the user
        await tx.user.delete({ where: { id: userId } });
      }, { timeout: 30000 });

      return NextResponse.json({
        message: 'User removed successfully',
      });
    } catch (error) {
      logger.error('Error removing user', error instanceof Error ? error : undefined, {
        route: 'DELETE /api/super-admin/clinics/[id]/users/[userId]',
        userId: params.userId,
      });
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Failed to remove user' },
        { status: 500 }
      );
    }
  }
);
