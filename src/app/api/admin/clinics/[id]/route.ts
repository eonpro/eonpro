import { NextRequest, NextResponse } from 'next/server';
import { logger } from '../../../../../lib/logger';
import { prisma } from '@/lib/db';
import { withAuth, AuthUser, canAccessClinic } from '@/lib/auth/middleware';

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function getHandler(request: NextRequest, user: AuthUser, context?: RouteContext) {
  try {
    const resolvedParams = await context!.params;
    const clinicId = parseInt(resolvedParams.id);

    if (isNaN(clinicId)) {
      return NextResponse.json({ error: 'Invalid clinic ID' }, { status: 400 });
    }

    if (user.role !== 'super_admin' && !canAccessClinic(user, clinicId)) {
      return NextResponse.json({ error: 'Access denied to this clinic' }, { status: 403 });
    }

    // Use explicit select for backwards compatibility with schema changes
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
        faviconUrl: true,
        customCss: true,
        patientIdPrefix: true,
        settings: true,
        features: true,
        integrations: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            patients: true,
            providers: true,
            users: true,
            orders: true,
            invoices: true,
          },
        },
      },
    });

    if (!clinic) {
      return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });
    }

    return NextResponse.json(clinic);
  } catch (error) {
    logger.error('Error fetching clinic:', error);
    return NextResponse.json({ error: 'Failed to fetch clinic' }, { status: 500 });
  }
}

async function patchHandler(request: NextRequest, user: AuthUser, context?: RouteContext) {
  try {
    const resolvedParams = await context!.params;
    const clinicId = parseInt(resolvedParams.id);
    const body = await request.json();

    if (isNaN(clinicId)) {
      return NextResponse.json({ error: 'Invalid clinic ID' }, { status: 400 });
    }

    if (user.role !== 'super_admin' && !canAccessClinic(user, clinicId)) {
      return NextResponse.json({ error: 'Access denied to this clinic' }, { status: 403 });
    }

    // Check if clinic exists (select only needed fields)
    const existing = await prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { id: true, subdomain: true },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });
    }

    // If subdomain is being changed, check if it's available
    if (body.subdomain && body.subdomain !== existing.subdomain) {
      const subdomainTaken = await prisma.clinic.findUnique({
        where: { subdomain: body.subdomain },
        select: { id: true },
      });

      if (subdomainTaken) {
        return NextResponse.json({ error: 'Subdomain already taken' }, { status: 409 });
      }
    }

    // Validate and clean patientIdPrefix if provided
    const patientIdPrefix =
      body.patientIdPrefix !== undefined
        ? body.patientIdPrefix
          ? body.patientIdPrefix
              .toUpperCase()
              .replace(/[^A-Z]/g, '')
              .slice(0, 5)
          : null
        : undefined;

    // Update the clinic (use explicit select for backwards compatibility)
    const updated = await prisma.clinic.update({
      where: { id: clinicId },
      data: {
        name: body.name,
        subdomain: body.subdomain,
        customDomain: body.customDomain,
        status: body.status,
        billingPlan: body.billingPlan,
        patientLimit: body.patientLimit,
        providerLimit: body.providerLimit,
        storageLimit: body.storageLimit,
        adminEmail: body.adminEmail,
        supportEmail: body.supportEmail,
        phone: body.phone,
        address: body.address,
        timezone: body.timezone,
        logoUrl: body.logoUrl,
        faviconUrl: body.faviconUrl,
        primaryColor: body.primaryColor,
        secondaryColor: body.secondaryColor,
        customCss: body.customCss,
        patientIdPrefix: patientIdPrefix,
        settings: body.settings,
        features: body.features,
        integrations: body.integrations,
      },
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
        faviconUrl: true,
        customCss: true,
        patientIdPrefix: true,
        settings: true,
        features: true,
        integrations: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            patients: true,
            providers: true,
            users: true,
            orders: true,
            invoices: true,
          },
        },
      },
    });

    // Create audit log
    await prisma.clinicAuditLog.create({
      data: {
        clinicId: clinicId,
        action: 'UPDATE',
        userId: user.id,
        details: {
          updatedBy: user.id,
          changes: body,
        },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    logger.error('Error updating clinic:', error);
    return NextResponse.json({ error: 'Failed to update clinic' }, { status: 500 });
  }
}

async function deleteHandler(request: NextRequest, user: AuthUser, context?: RouteContext) {
  try {
    if (user.role !== 'super_admin') {
      return NextResponse.json(
        { error: 'Forbidden - Super Admin access required for clinic deletion' },
        { status: 403 }
      );
    }

    const resolvedParams = await context!.params;
    const clinicId = parseInt(resolvedParams.id);

    if (isNaN(clinicId)) {
      return NextResponse.json({ error: 'Invalid clinic ID' }, { status: 400 });
    }

    const clinic = await prisma.clinic.findUnique({
      where: { id: clinicId },
      select: {
        id: true,
        name: true,
        subdomain: true,
        _count: {
          select: {
            patients: true,
            providers: true,
            users: true,
            orders: true,
          },
        },
      },
    });

    if (!clinic) {
      return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });
    }

    const hasData =
      clinic._count.patients > 0 ||
      clinic._count.providers > 0 ||
      clinic._count.users > 0 ||
      clinic._count.orders > 0;

    if (hasData) {
      return NextResponse.json(
        { error: 'Cannot delete clinic with existing data. Please remove all data first.' },
        { status: 409 }
      );
    }

    await prisma.clinicAuditLog.create({
      data: {
        clinicId: clinicId,
        action: 'DELETE',
        userId: user.id,
        details: {
          deletedBy: user.id,
          clinicName: clinic.name,
          subdomain: clinic.subdomain,
        },
      },
    });

    await prisma.clinic.delete({
      where: { id: clinicId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Error deleting clinic:', error);
    return NextResponse.json({ error: 'Failed to delete clinic' }, { status: 500 });
  }
}

export const GET = withAuth<RouteContext>(getHandler, { roles: ['super_admin', 'admin'] });
export const PATCH = withAuth<RouteContext>(patchHandler, { roles: ['super_admin', 'admin'] });
export const DELETE = withAuth<RouteContext>(deleteHandler, { roles: ['super_admin', 'admin'] });
