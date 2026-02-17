import { NextRequest, NextResponse } from 'next/server';
import { basePrisma as prisma } from '@/lib/db';
import { withAuthParams, AuthUser } from '@/lib/auth/middleware-with-params';
import { logger } from '@/lib/logger';
import { UserRole } from '@prisma/client';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Middleware to check for Super Admin role
 */
function withSuperAdminAuth(
  handler: (req: NextRequest, user: AuthUser, params: { id: string }) => Promise<Response>
) {
  return withAuthParams<RouteContext>(
    async (req, user, context) => {
      const params = await context.params;
      return handler(req, user, params);
    },
    { roles: ['super_admin'] }
  );
}

/**
 * GET /api/super-admin/clinics/[id]
 * Get a single clinic by ID
 */
export const GET = withSuperAdminAuth(
  async (req: NextRequest, user: AuthUser, params: { id: string }) => {
    try {
      const clinicId = parseInt(params.id);

      if (isNaN(clinicId)) {
        return NextResponse.json({ error: 'Invalid clinic ID' }, { status: 400 });
      }

      // Note: Explicitly selecting fields for backwards compatibility
      // (buttonTextColor may not exist in production DB if migration hasn't run)
      const clinic = await prisma.clinic.findUnique({
        where: { id: clinicId },
        select: {
          id: true,
          name: true,
          subdomain: true,
          customDomain: true,
          status: true,
          adminEmail: true,
          supportEmail: true,
          phone: true,
          timezone: true,
          address: true,
          billingPlan: true,
          patientLimit: true,
          providerLimit: true,
          storageLimit: true,
          primaryColor: true,
          secondaryColor: true,
          accentColor: true,
          logoUrl: true,
          iconUrl: true,
          faviconUrl: true,
          customCss: true,
          settings: true,
          features: true,
          integrations: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              patients: true,
              users: true,
            },
          },
        },
      });

      if (!clinic) {
        return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });
      }

      // Count providers (users with role PROVIDER) for this clinic
      const providerCount = await prisma.user.count({
        where: {
          clinicId: clinic.id,
          role: UserRole.PROVIDER,
        },
      });

      // Add provider count to the response
      const clinicWithProviderCount = {
        ...clinic,
        _count: {
          ...clinic._count,
          providers: providerCount,
        },
      };

      return NextResponse.json({ clinic: clinicWithProviderCount });
    } catch (error) {
      logger.error('Error fetching clinic', error instanceof Error ? error : undefined, {
        route: 'GET /api/super-admin/clinics/[id]',
        clinicId: params.id,
      });
      return NextResponse.json(
        {
          error: 'Failed to fetch clinic',
          details: error instanceof Error ? error.message : String(error),
        },
        { status: 500 }
      );
    }
  }
);

/**
 * PUT /api/super-admin/clinics/[id]
 * Update a clinic
 */
export const PUT = withSuperAdminAuth(
  async (req: NextRequest, user: AuthUser, params: { id: string }) => {
    try {
      const clinicId = parseInt(params.id);

      if (isNaN(clinicId)) {
        return NextResponse.json({ error: 'Invalid clinic ID' }, { status: 400 });
      }

      const body = await req.json();
      const {
        name,
        subdomain,
        customDomain,
        adminEmail,
        supportEmail,
        phone,
        timezone,
        address,
        settings,
        features,
        billingPlan,
        patientLimit,
        providerLimit,
        storageLimit,
        primaryColor,
        secondaryColor,
        accentColor,
        buttonTextColor,
        logoUrl,
        iconUrl,
        faviconUrl,
        status,
      } = body;

      // Check if clinic exists and load current features for merge
      const existingClinic = await prisma.clinic.findUnique({
        where: { id: clinicId },
        select: { id: true, subdomain: true, features: true },
      });

      if (!existingClinic) {
        return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });
      }

      // Check if subdomain is taken by another clinic
      if (subdomain && subdomain !== existingClinic.subdomain) {
        const subdomainTaken = await prisma.clinic.findUnique({
          where: { subdomain },
          select: { id: true },
        });
        if (subdomainTaken) {
          return NextResponse.json({ error: 'Subdomain is already taken' }, { status: 400 });
        }
      }

      // Update the clinic
      const updatedClinic = await prisma.clinic.update({
        where: { id: clinicId },
        data: {
          ...(name && { name }),
          ...(subdomain && { subdomain }),
          ...(customDomain !== undefined && { customDomain: customDomain || null }),
          ...(adminEmail && { adminEmail }),
          ...(supportEmail !== undefined && { supportEmail: supportEmail || null }),
          ...(phone !== undefined && { phone: phone || null }),
          ...(timezone && { timezone }),
          ...(address !== undefined && { address: address || null }),
          ...(settings && { settings }),
          ...(features && {
            features: {
              ...((existingClinic.features as Record<string, unknown>) || {}),
              ...features,
            },
          }),
          ...(billingPlan && { billingPlan }),
          ...(patientLimit && { patientLimit }),
          ...(providerLimit && { providerLimit }),
          ...(storageLimit && { storageLimit }),
          ...(primaryColor && { primaryColor }),
          ...(secondaryColor && { secondaryColor }),
          ...(accentColor && { accentColor }),
          ...(buttonTextColor && { buttonTextColor }),
          ...(logoUrl !== undefined && { logoUrl: logoUrl || null }),
          ...(iconUrl !== undefined && { iconUrl: iconUrl || null }),
          ...(faviconUrl !== undefined && { faviconUrl: faviconUrl || null }),
          ...(status && { status }),
        },
      });

      // Create audit log (optional)
      try {
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
        });

        if (dbUser) {
          await prisma.clinicAuditLog.create({
            data: {
              clinicId: updatedClinic.id,
              action: 'UPDATE',
              userId: user.id,
              details: {
                updatedBy: user.id,
                changes: body,
              },
            },
          });
        }
      } catch (auditError) {
        logger.error('Failed to create audit log', auditError instanceof Error ? auditError : undefined);
      }

      return NextResponse.json({
        clinic: updatedClinic,
        message: 'Clinic updated successfully',
      });
    } catch (error: any) {
      logger.error('Error updating clinic', error instanceof Error ? error : undefined, {
        route: 'PATCH /api/super-admin/clinics/[id]',
        clinicId: params.id,
      });
      return NextResponse.json(
        { error: error.message || 'Failed to update clinic' },
        { status: 500 }
      );
    }
  }
);

/**
 * DELETE /api/super-admin/clinics/[id]
 * Delete a clinic
 */
export const DELETE = withSuperAdminAuth(
  async (req: NextRequest, user: AuthUser, params: { id: string }) => {
    try {
      const clinicId = parseInt(params.id);

      if (isNaN(clinicId)) {
        return NextResponse.json({ error: 'Invalid clinic ID' }, { status: 400 });
      }

      // Check if clinic exists (select only needed fields for backwards compatibility)
      const existingClinic = await prisma.clinic.findUnique({
        where: { id: clinicId },
        select: { id: true, name: true },
      });

      if (!existingClinic) {
        return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });
      }

      // Delete all related records before deleting the clinic
      // Order matters - delete child records before parent records
      await prisma.$transaction(async (tx) => {
        // 1. Delete PatientCounter (unique per clinic)
        await tx.patientCounter.deleteMany({ where: { clinicId } });

        // 2. Delete ClinicAuditLog
        await tx.clinicAuditLog.deleteMany({ where: { clinicId } });

        // 3. Delete ClinicInviteCode
        await tx.clinicInviteCode.deleteMany({ where: { clinicId } });

        // 4. Delete SystemSettings for this clinic
        await tx.systemSettings.deleteMany({ where: { clinicId } });

        // 5. Delete Integrations and related
        const integrations = await tx.integration.findMany({
          where: { clinicId },
          select: { id: true },
        });
        for (const integration of integrations) {
          await tx.apiKey.deleteMany({ where: { integrationId: integration.id } });
          await tx.webhookConfig.deleteMany({ where: { integrationId: integration.id } });
          await tx.integrationLog.deleteMany({ where: { integrationId: integration.id } });
        }
        await tx.integration.deleteMany({ where: { clinicId } });

        // 6. Delete ApiKeys not tied to integrations
        await tx.apiKey.deleteMany({ where: { clinicId } });

        // 7. Delete WebhookConfigs and deliveries
        const webhooks = await tx.webhookConfig.findMany({
          where: { clinicId },
          select: { id: true },
        });
        for (const webhook of webhooks) {
          await tx.webhookDelivery.deleteMany({ where: { webhookId: webhook.id } });
        }
        await tx.webhookConfig.deleteMany({ where: { clinicId } });

        // 8. Delete WebhookLogs
        await tx.webhookLog.deleteMany({ where: { clinicId } });

        // Note: Patients and all patient-related data should be deleted first
        // For safety, we check if there are any patients
        const patientCount = await tx.patient.count({ where: { clinicId } });
        if (patientCount > 0) {
          throw new Error(
            `Cannot delete clinic with ${patientCount} patients. Delete all patients first.`
          );
        }

        // 9. Delete Providers
        await tx.provider.deleteMany({ where: { clinicId } });

        // 10. Delete Users associated with this clinic
        await tx.user.deleteMany({ where: { clinicId } });

        // 11. Finally delete the clinic
        await tx.clinic.delete({ where: { id: clinicId } });
      }, { timeout: 15000 });

      return NextResponse.json({
        message: 'Clinic deleted successfully',
      });
    } catch (error: any) {
      logger.error('Error deleting clinic', error instanceof Error ? error : undefined, {
        route: 'DELETE /api/super-admin/clinics/[id]',
        clinicId: params.id,
      });
      return NextResponse.json(
        { error: error.message || 'Failed to delete clinic' },
        { status: 500 }
      );
    }
  }
);
