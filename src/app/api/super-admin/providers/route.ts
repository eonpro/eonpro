import { NextRequest, NextResponse } from 'next/server';
import { basePrisma as prisma } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { providerService } from '@/domains/provider';
import { logger } from '@/lib/logger';

/**
 * Middleware to check for Super Admin role
 */
function withSuperAdminAuth(handler: (req: NextRequest, user: AuthUser) => Promise<Response>) {
  return withAuth(handler, { roles: ['super_admin'] });
}

/**
 * GET /api/super-admin/providers
 * List all providers with clinic counts and search/filter
 */
export const GET = withSuperAdminAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search')?.trim().toLowerCase();
    const status = searchParams.get('status'); // 'assigned' | 'unassigned' | 'all'
    const providerStatus = searchParams.get('providerStatus'); // 'ACTIVE' | 'ARCHIVED' | 'SUSPENDED' | 'all'
    const clinicId = searchParams.get('clinicId');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');

    logger.info('[SUPER-ADMIN/PROVIDERS] Fetching providers', {
      userEmail: user.email,
      search,
      status,
      providerStatus,
      clinicId,
    });

    // Build where clause
    const whereConditions: any[] = [];

    // Provider status filter (ACTIVE, ARCHIVED, SUSPENDED)
    // Default to showing only ACTIVE providers unless explicitly set to 'all'
    if (providerStatus === 'ARCHIVED') {
      whereConditions.push({ status: 'ARCHIVED' });
    } else if (providerStatus === 'SUSPENDED') {
      whereConditions.push({ status: 'SUSPENDED' });
    } else if (providerStatus === 'ACTIVE') {
      whereConditions.push({ status: 'ACTIVE' });
    } else if (providerStatus !== 'all') {
      // Default: show only active providers
      whereConditions.push({ status: 'ACTIVE' });
    }

    // Search filter
    if (search) {
      whereConditions.push({
        OR: [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { npi: { contains: search } },
          { email: { contains: search, mode: 'insensitive' } },
        ],
      });
    }

    // Clinic filter
    if (clinicId) {
      whereConditions.push({
        OR: [
          { clinicId: parseInt(clinicId) },
          { providerClinics: { some: { clinicId: parseInt(clinicId), isActive: true } } },
        ],
      });
    }

    // Assignment status filter (assigned/unassigned)
    if (status === 'assigned') {
      whereConditions.push({
        OR: [{ clinicId: { not: null } }, { providerClinics: { some: { isActive: true } } }],
      });
    } else if (status === 'unassigned') {
      whereConditions.push({
        AND: [{ clinicId: null }, { providerClinics: { none: { isActive: true } } }],
      });
    }

    const where = whereConditions.length > 0 ? { AND: whereConditions } : {};

    // Get total count for pagination
    const totalCount = await prisma.provider.count({ where });

    // Fetch providers with clinic information
    const providers = await prisma.provider.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        npi: true,
        email: true,
        phone: true,
        titleLine: true,
        licenseState: true,
        licenseNumber: true,
        dea: true,
        clinicId: true,
        primaryClinicId: true,
        npiVerifiedAt: true,
        lastLogin: true,
        createdAt: true,
        updatedAt: true,
        status: true,
        archivedAt: true,
        archivedBy: true,
        clinic: {
          select: {
            id: true,
            name: true,
            subdomain: true,
          },
        },
        providerClinics: {
          where: { isActive: true },
          select: {
            id: true,
            clinicId: true,
            isPrimary: true,
            clinic: {
              select: {
                id: true,
                name: true,
                subdomain: true,
              },
            },
          },
        },
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        _count: {
          select: {
            orders: true,
            appointments: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });

    // Calculate clinic counts for each provider
    const providersWithStats = providers.map((provider: (typeof providers)[number]) => ({
      ...provider,
      clinicCount: provider.providerClinics.length || (provider.clinicId ? 1 : 0),
      hasLinkedUser: !!provider.user,
    }));

    logger.info('[SUPER-ADMIN/PROVIDERS] Found providers', {
      count: providers.length,
      totalCount,
    });

    return NextResponse.json({
      providers: providersWithStats,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
    });
  } catch (error: any) {
    logger.error('[SUPER-ADMIN/PROVIDERS] Error fetching providers:', error);
    return NextResponse.json(
      { error: 'Failed to fetch providers', details: error.message },
      { status: 500 }
    );
  }
});

/**
 * POST /api/super-admin/providers
 * Create a new provider (global, without clinic assignment)
 */
export const POST = withSuperAdminAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    const body = await req.json();

    logger.info('[SUPER-ADMIN/PROVIDERS] Creating provider', {
      userEmail: user.email,
      npi: body.npi,
    });

    // Use provider service with super_admin context
    const userContext = {
      id: user.id,
      email: user.email,
      role: 'super_admin' as const,
      clinicId: null, // No clinic context for global provider
    };

    // Allow clinicId to be null for global provider creation
    const providerData = {
      ...body,
      clinicId: body.clinicId || null, // Explicitly allow null
    };

    const provider = await providerService.createProvider(providerData, userContext);

    // If clinicIds array provided, assign to those clinics
    if (body.clinicIds && Array.isArray(body.clinicIds) && body.clinicIds.length > 0) {
      for (let i = 0; i < body.clinicIds.length; i++) {
        const cId = body.clinicIds[i];
        await providerService.assignToClinic(
          provider.id,
          cId,
          { isPrimary: i === 0 }, // First clinic is primary
          userContext
        );
      }
    }

    // Create audit log
    try {
      await prisma.providerAudit.create({
        data: {
          providerId: provider.id,
          actorEmail: user.email,
          action: 'SUPER_ADMIN_CREATE',
          diff: {
            createdBy: user.email,
            globalProvider: !body.clinicId,
            clinicIds: body.clinicIds || [],
          },
        },
      });
    } catch (auditError) {
      logger.warn('[SUPER-ADMIN/PROVIDERS] Failed to create audit log', { error: auditError });
    }

    logger.info('[SUPER-ADMIN/PROVIDERS] Provider created', {
      providerId: provider.id,
      npi: provider.npi,
    });

    return NextResponse.json({
      provider,
      message: 'Provider created successfully',
    });
  } catch (error: any) {
    logger.error('[SUPER-ADMIN/PROVIDERS] Error creating provider:', error);

    // Handle specific error types
    if (error.code === 'CONFLICT') {
      return NextResponse.json(
        { error: error.message || 'NPI already registered' },
        { status: 409 }
      );
    }

    if (error.code === 'VALIDATION_ERROR') {
      return NextResponse.json({ error: error.message, details: error.details }, { status: 400 });
    }

    return NextResponse.json(
      { error: error.message || 'Failed to create provider' },
      { status: 500 }
    );
  }
});
